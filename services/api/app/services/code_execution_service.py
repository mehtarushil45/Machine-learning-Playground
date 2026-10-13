"""Code Execution Service -- ML Playground Code Studio.

Runs user-submitted Python scripts in an isolated subprocess with:
  - Configurable timeout (default 90 s)
  - Controlled working directory (temp sandbox)
  - stdout / stderr capture
  - SSE-compatible streaming via async queue
  - SIGTERM + SIGKILL process stop
  - Automatic artifact detection (joblib, pkl, h5, onnx)
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

import logging
import re
import shutil

logger = logging.getLogger("apex_ml.code_execution")

_DEFAULT_TIMEOUT_SECONDS = 90

# Global in-memory store  {exec_id -> ExecutionRecord}
_EXECUTIONS: Dict[str, "ExecutionRecord"] = {}


def is_redis_available(host: Optional[str] = None, port: Optional[int] = None, timeout: float = 0.5) -> bool:
    """Check if Redis broker is available for Celery / PubSub."""
    if os.environ.get("USE_CELERY", "").lower() in ("false", "0", "no"):
        return False
    try:
        if host is None or port is None:
            from urllib.parse import urlparse
            from app.config import settings
            parsed = urlparse(settings.redis_url)
            host = host or parsed.hostname or "localhost"
            port = port or parsed.port or 6379
        import socket
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


@dataclass
class ExecutionRecord:
    exec_id:             str
    status:              str          # queued | running | completed | failed | cancelled | timed_out | out_of_memory
    code:                str
    dataset_id:          Optional[str]
    filename:            str
    project_id:          Optional[str]     = "default_project"
    started_at:          Optional[float]   = None
    finished_at:         Optional[float]   = None
    exit_code:           Optional[int]     = None
    stdout:              str               = ""
    stderr:              str               = ""
    artifacts:           List[str]         = field(default_factory=list)
    registered_model_id: Optional[str]     = None
    error:               Optional[str]     = None
    is_celery:           bool              = False
    queue_position:      Optional[int]     = None
    timeout:             int               = _DEFAULT_TIMEOUT_SECONDS
    memory_limit_mb:     int               = 512
    is_truncated:        bool              = False
    raw_output:          str               = ""
    extra_env:           Dict[str, str]    = field(default_factory=dict)
    _queue:              "asyncio.Queue[Optional[str]]" = field(default_factory=asyncio.Queue)
    _process:            Optional[asyncio.subprocess.Process] = None
    _sandbox:            Optional[str]     = None


# Concurrency tracking per project / user
_ACTIVE_PROJECT_RUNS: Dict[str, str] = {}  # project_id -> exec_id
_PROJECT_QUEUES: Dict[str, List[str]] = {}  # project_id -> list of waiting exec_ids


async def _kill_process_tree(proc: Optional[asyncio.subprocess.Process], sig: int = 15) -> None:
    """Recursively kill a process and its child processes across platforms."""
    if proc is None:
        return
    pid = proc.pid
    if sys.platform != "win32":
        try:
            import signal
            pgid = os.getpgid(pid)
            os.killpg(pgid, sig)
        except ProcessLookupError:
            pass
        except Exception:
            try:
                proc.send_signal(sig)
            except Exception:
                pass
    else:
        try:
            import subprocess
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True,
                timeout=3,
                check=False,
            )
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass


def _finish_project_execution(project_id: str, finished_exec_id: str) -> None:
    """Release active project execution slot and auto-dispatch next queued run."""
    if _ACTIVE_PROJECT_RUNS.get(project_id) == finished_exec_id:
        _ACTIVE_PROJECT_RUNS.pop(project_id, None)

    q = _PROJECT_QUEUES.get(project_id, [])
    while q:
        next_id = q.pop(0)
        next_rec = _EXECUTIONS.get(next_id)
        if next_rec and next_rec.status == "queued":
            _ACTIVE_PROJECT_RUNS[project_id] = next_id
            next_rec.queue_position = None
            next_rec.status = "running"
            logger.info("Dequeued and starting execution %s for project %s", next_id, project_id)
            asyncio.create_task(_run_execution(next_rec, timeout=next_rec.timeout, extra_env=next_rec.extra_env))
            break


def _detect_artifacts(sandbox: str) -> List[str]:
    artifact_exts = {".joblib", ".pkl", ".pickle", ".h5", ".pt", ".onnx", ".safetensors", ".cbm"}
    found = []
    for root, _, files in os.walk(sandbox):
        for fname in files:
            if Path(fname).suffix.lower() in artifact_exts:
                found.append(fname)
    return found


MAX_STREAM_LINES = 5000

async def _stream_output(
    stream: Optional[asyncio.StreamReader],
    buffer: List[str],
    queue: "asyncio.Queue[Optional[str]]",
    rec: Optional["ExecutionRecord"] = None,
    prefix: str = "",
) -> None:
    if stream is None:
        return
    try:
        async for raw_line in stream:
            if len(buffer) >= MAX_STREAM_LINES:
                if rec is not None:
                    rec.is_truncated = True
                warning_msg = f"{prefix}[ML Playground] Output limit exceeded ({MAX_STREAM_LINES} lines capped). Download complete raw output from the toolbar."
                buffer.append(warning_msg)
                await queue.put(warning_msg)
                break
            line = raw_line.decode("utf-8", errors="replace").rstrip()
            tagged = f"{prefix}{line}" if prefix else line
            buffer.append(tagged)
            await queue.put(tagged)
    except (asyncio.CancelledError, Exception):
        pass


async def start_execution(
    *,
    code: str,
    dataset_id: Optional[str] = None,
    filename: str = "train.py",
    project_id: Optional[str] = "default_project",
    timeout: int = _DEFAULT_TIMEOUT_SECONDS,
    memory_limit_mb: int = 512,
    extra_env: Optional[Dict[str, str]] = None,
    prefer_celery: Optional[bool] = None,
) -> ExecutionRecord:
    exec_id = str(uuid.uuid4())
    proj_key = project_id or "default_project"

    active_id = _ACTIVE_PROJECT_RUNS.get(proj_key)
    if active_id:
        active_rec = _EXECUTIONS.get(active_id)
        if active_rec and active_rec.status not in ("running", "queued"):
            _ACTIVE_PROJECT_RUNS.pop(proj_key, None)
            active_id = None

    rec = ExecutionRecord(
        exec_id=exec_id,
        status="queued",
        code=code,
        dataset_id=dataset_id,
        filename=filename,
        project_id=proj_key,
        timeout=timeout,
        memory_limit_mb=memory_limit_mb,
        extra_env=extra_env or {},
    )
    _EXECUTIONS[exec_id] = rec

    if active_id:
        q = _PROJECT_QUEUES.setdefault(proj_key, [])
        q.append(exec_id)
        rec.queue_position = len(q)
        rec.status = "queued"
        logger.info("Queued execution %s at position %d for project %s", exec_id, rec.queue_position, proj_key)
        return rec

    _ACTIVE_PROJECT_RUNS[proj_key] = exec_id

    # Check Celery dispatch availability
    should_use_celery = prefer_celery if prefer_celery is not None else (
        os.environ.get("USE_CELERY", "1").lower() not in ("false", "0", "no") and is_redis_available()
    )

    if should_use_celery:
        try:
            from services.worker.tasks.code_execution_task import execute_code_sandbox
            rec.is_celery = True
            rec.status = "running"
            execute_code_sandbox.delay(
                exec_id=exec_id,
                code=code,
                filename=filename,
                dataset_id=dataset_id,
                timeout=timeout,
            )
            logger.info("Dispatched code execution %s to Celery worker sandbox.", exec_id)
            return rec
        except Exception as exc:
            logger.warning("Celery dispatch failed: %s. Falling back to local execution sandbox.", exc)
            rec.is_celery = False

    asyncio.create_task(_run_execution(rec, timeout=timeout, extra_env=extra_env or {}))
    return rec


async def _run_execution(
    rec: ExecutionRecord,
    *,
    timeout: int,
    extra_env: Dict[str, str],
) -> None:
    sandbox = tempfile.mkdtemp(prefix="mlpg_exec_")
    rec._sandbox = sandbox
    rec.status = "running"
    rec.started_at = time.monotonic()

    code_path = os.path.join(sandbox, rec.filename)
    try:
        with open(code_path, "w", encoding="utf-8") as f:
            f.write(rec.code)
    except Exception as exc:
        rec.status = "failed"
        rec.error = f"Failed to write code to sandbox: {exc}"
        rec.finished_at = time.monotonic()
        await rec._queue.put(f"[ERROR] {rec.error}")
        await rec._queue.put(None)
        return

    # Stage workspace files and folders into execution sandbox
    if rec.project_id:
        try:
            from app.services.workspace_filesystem_service import get_project_workspace_root
            ws_root = get_project_workspace_root(rec.project_id)
            for item in ws_root.iterdir():
                if item.name == "outputs" or item.name.startswith("."):
                    continue
                dest_item = os.path.join(sandbox, item.name)
                if item.is_dir() and not os.path.exists(dest_item):
                    shutil.copytree(item, dest_item)
                elif item.is_file() and not os.path.exists(dest_item):
                    shutil.copy2(item, dest_item)
        except Exception as ws_err:
            logger.debug("Workspace staging error: %s", ws_err)

    # Ensure outputs directory exists in sandbox
    os.makedirs(os.path.join(sandbox, "outputs"), exist_ok=True)

    # Stage dataset CSV into execution sandbox so pd.read_csv resolves correctly
    try:
        from services.worker.core.dataset_loader import find_dataset_path, UPLOADS_DIR

        src_csv: Optional[str] = None
        if rec.dataset_id:
            try:
                src_csv = find_dataset_path(rec.dataset_id)
            except Exception as d_exc:
                logger.debug("Dataset path lookup failed for %s: %s", rec.dataset_id, d_exc)

        # Inspect Python source for referenced CSV filenames (e.g. pd.read_csv('housing.csv'))
        csv_refs = re.findall(r'[\'"]([^\'"]+\.csv)[\'"]', rec.code)

        if not src_csv and csv_refs and os.path.exists(UPLOADS_DIR):
            for ref in csv_refs:
                ref_base = os.path.basename(ref)
                cand = os.path.join(UPLOADS_DIR, ref_base)
                if os.path.isfile(cand):
                    src_csv = cand
                    break
                for fname in os.listdir(UPLOADS_DIR):
                    if fname.endswith(".csv") and (ref_base in fname or fname in ref_base):
                        src_csv = os.path.join(UPLOADS_DIR, fname)
                        break
                if src_csv:
                    break

        if src_csv and os.path.isfile(src_csv):
            base_name = os.path.basename(src_csv)
            dest_base = os.path.join(sandbox, base_name)
            if not os.path.exists(dest_base):
                shutil.copy2(src_csv, dest_base)

            # Ensure generic 'dataset.csv' fallback exists
            dest_canonical = os.path.join(sandbox, "dataset.csv")
            if not os.path.exists(dest_canonical):
                shutil.copy2(src_csv, dest_canonical)

            # Ensure all CSV names referenced in code are present
            for ref in csv_refs:
                ref_name = os.path.basename(ref)
                ref_dest = os.path.join(sandbox, ref_name)
                if not os.path.exists(ref_dest):
                    shutil.copy2(src_csv, ref_dest)
    except Exception as stage_exc:
        logger.warning("Error staging dataset files into execution sandbox: %s", stage_exc)

    # Ensure canonical dataset.csv exists in the sandbox (synthesize if not present)
    dest_canonical = os.path.join(sandbox, "dataset.csv")
    if not os.path.exists(dest_canonical):
        try:
            import numpy as np
            import pandas as pd
            np.random.seed(42)
            n_samples = 120
            demo_df = pd.DataFrame({
                "feature_0": np.random.randn(n_samples),
                "feature_1": np.random.randn(n_samples) * 2 + 1,
                "f1": np.random.randn(n_samples),
                "f2": np.random.randn(n_samples),
                "f3": np.random.randn(n_samples),
                "age": np.random.randint(20, 65, size=n_samples),
                "income": np.random.randint(30000, 120000, size=n_samples),
                "category": np.random.choice(["A", "B", "C"], size=n_samples),
                "target": np.random.choice([0, 1], size=n_samples),
            })
            demo_df.to_csv(dest_canonical, index=False)
            csv_refs = re.findall(r'[\'"]([^\'"]+\.csv)[\'"]', rec.code)
            for ref in csv_refs:
                ref_dest = os.path.join(sandbox, os.path.basename(ref))
                if not os.path.exists(ref_dest):
                    demo_df.to_csv(ref_dest, index=False)
        except Exception as syn_exc:
            logger.debug("Local synthetic dataset generation failed: %s", syn_exc)
    else:
        try:
            import pandas as pd
            df_chk = pd.read_csv(dest_canonical)
            if "target" not in df_chk.columns and "'target'" in rec.code:
                import numpy as np
                df_chk["target"] = list(np.random.choice([0, 1], size=len(df_chk)))
                df_chk.to_csv(dest_canonical, index=False)
        except Exception:
            pass

    # Clean, isolated execution environment: strip database credentials, tokens, secrets
    _SENSITIVE_PREFIXES = ("DATABASE", "REDIS", "POSTGRES", "AWS", "SECRET", "JWT", "CELERY", "S3", "MINIO", "TOKEN", "API_KEY", "PASSWORD")
    env = {
        k: v for k, v in os.environ.items()
        if not any(k.upper().startswith(p) for p in _SENSITIVE_PREFIXES)
    }
    env.update(extra_env)
    env["PYTHONPATH"] = sandbox + os.pathsep + env.get("PYTHONPATH", "")
    env["PYTHONUNBUFFERED"] = "1"
    env["MLPG_SANDBOX"] = "1"
    env["PYTHONDONTWRITEBYTECODE"] = "1"

    stdout_lines: List[str] = []
    stderr_lines: List[str] = []

    try:
        preexec = None
        if sys.platform != "win32":
            def _preexec_sandbox():
                os.setsid()
                try:
                    import resource
                    limit_bytes = rec.memory_limit_mb * 1024 * 1024
                    resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, limit_bytes))
                except Exception:
                    pass
            preexec = _preexec_sandbox

        kwargs: Dict[str, Any] = {}
        if preexec is not None:
            kwargs["preexec_fn"] = preexec

        proc = await asyncio.create_subprocess_exec(
            sys.executable, code_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=sandbox,
            env=env,
            **kwargs,
        )
        rec._process = proc
        await rec._queue.put(f"[ML Playground] Starting: {rec.filename}")

        stream_tasks = []
        if proc.stdout is not None:
            stream_tasks.append(_stream_output(proc.stdout, stdout_lines, rec._queue, rec=rec))
        if proc.stderr is not None:
            stream_tasks.append(_stream_output(proc.stderr, stderr_lines, rec._queue, rec=rec, prefix="[stderr] "))
        stream_tasks.append(proc.wait())

        await asyncio.wait_for(
            asyncio.gather(*stream_tasks),
            timeout=timeout,
        )

        rec.exit_code = proc.returncode
        rec.stdout = "\n".join(stdout_lines)
        rec.stderr = "\n".join(stderr_lines)

        is_oom = any("MemoryError" in l or "allocate" in l.lower() for l in stderr_lines) or proc.returncode in (137, -9)

        if is_oom:
            rec.status = "out_of_memory"
            rec.exit_code = 137
            rec.error = f"Out of memory: execution exceeded limit of {rec.memory_limit_mb}MB."
            await rec._queue.put(f"[ML Playground] OUT OF MEMORY: Exceeded {rec.memory_limit_mb}MB limit.")
        elif proc.returncode == 0:
            rec.status = "completed"
            rec.artifacts = _detect_artifacts(sandbox)
            await rec._queue.put("[ML Playground] Completed (exit 0).")
            if rec.artifacts:
                await rec._queue.put(f"[ML Playground] Artifacts: {', '.join(rec.artifacts)}")
                for art in rec.artifacts:
                    if art.endswith(".joblib") or art.endswith(".pkl"):
                        try:
                            from app.ml.model_registry import register_model, _REGISTRY_ROOT
                            art_src = os.path.join(sandbox, art)
                            model_id = f"model-exec-{rec.exec_id[:8]}"
                            dest_dir = os.path.join(_REGISTRY_ROOT, model_id)
                            os.makedirs(dest_dir, exist_ok=True)
                            dest_model_path = os.path.join(dest_dir, "model.joblib")
                            shutil.copy2(art_src, dest_model_path)

                            # Introspect trained pipeline
                            algo_name = "Code Studio Pipeline"
                            feat_cols: List[str] = []
                            cat_cols: List[str] = []
                            num_cols: List[str] = []
                            try:
                                import joblib
                                pipe = joblib.load(art_src)
                                if hasattr(pipe, "named_steps"):
                                    for step_key in ("estimator", "classifier", "regressor"):
                                        if step_key in pipe.named_steps:
                                            algo_name = type(pipe.named_steps[step_key]).__name__
                                            break
                                    if "preprocessor" in pipe.named_steps:
                                        prep = pipe.named_steps["preprocessor"]
                                        trans_list = getattr(prep, "transformers_", None) or getattr(prep, "transformers", None)
                                        if trans_list:
                                            for tname, _, cols in trans_list:
                                                if isinstance(cols, (list, tuple, set)):
                                                    c_list = [str(c) for c in cols]
                                                    feat_cols.extend(c_list)
                                                    if tname in ("categorical", "cat", "boolean") or "cat" in str(tname).lower():
                                                        cat_cols.extend(c_list)
                                                    elif tname in ("numeric", "num") or "num" in str(tname).lower():
                                                        num_cols.extend(c_list)
                            except Exception:
                                pass

                            register_model({
                                "model_id": model_id,
                                "job_id": f"exec-{rec.exec_id[:8]}",
                                "algorithm": algo_name,
                                "model_path": dest_model_path,
                                "dataset_id": rec.dataset_id or "dataset.csv",
                                "problem_type": "classification" if "classifier" in algo_name.lower() or "forest" in algo_name.lower() else "regression",
                                "feature_columns": feat_cols,
                                "categorical_columns": cat_cols,
                                "numeric_columns": num_cols,
                                "lineage": {
                                    "feature_columns": feat_cols,
                                    "categorical_columns": cat_cols,
                                    "numeric_columns": num_cols,
                                    "lineage_id": f"lin-{rec.exec_id[:8]}",
                                },
                                "target_column": "target",
                                "status": "ACTIVE",
                                "owner": "code-studio",
                                "description": f"Model trained via Code Studio execution ({rec.filename})",
                            })
                            rec.registered_model_id = model_id
                            await rec._queue.put(f"[ML Playground] Model registered in Model Registry: {model_id}")
                            break
                        except Exception as reg_exc:
                            logger.warning("Failed to auto-register code execution model: %s", reg_exc)

            # Sync generated outputs and artifacts back to project workspace outputs directory
            if rec.project_id:
                try:
                    from app.services.workspace_filesystem_service import get_project_workspace_root
                    ws_root = get_project_workspace_root(rec.project_id)
                    ws_outputs = ws_root / "outputs"
                    os.makedirs(ws_outputs, exist_ok=True)

                    sandbox_outputs = os.path.join(sandbox, "outputs")
                    if os.path.isdir(sandbox_outputs):
                        for f in os.listdir(sandbox_outputs):
                            src_f = os.path.join(sandbox_outputs, f)
                            if os.path.isfile(src_f):
                                shutil.copy2(src_f, ws_outputs / f)

                    for art in (rec.artifacts or []):
                        art_src = os.path.join(sandbox, art)
                        if os.path.isfile(art_src):
                            shutil.copy2(art_src, ws_outputs / art)
                except Exception as sync_back_err:
                    logger.debug("Artifact sync-back error: %s", sync_back_err)
        else:
            rec.status = "failed"
            await rec._queue.put(f"[ML Playground] Failed (exit {proc.returncode}).")

    except asyncio.TimeoutError:
        rec.status = "timed_out"
        rec.exit_code = 124
        rec.error = f"Execution timed out after {timeout}s."
        await rec._queue.put(f"[ML Playground] TIMEOUT after {timeout}s.")
        try:
            if rec._process:
                await _kill_process_tree(rec._process, 9)
        except Exception:
            pass

    except Exception as exc:
        rec.status = "failed"
        rec.error = str(exc)
        await rec._queue.put(f"[ML Playground] Error: {exc}")

    finally:
        rec.finished_at = time.monotonic()
        rec.raw_output = rec.stdout + ("\n" + rec.stderr if rec.stderr else "")
        await rec._queue.put(None)
        _finish_project_execution(rec.project_id or "default_project", rec.exec_id)


async def stop_execution(exec_id: str) -> bool:
    rec = get_execution(exec_id)
    if rec is None:
        return False
    proj_key = rec.project_id or "default_project"

    # If currently queued, remove from queue
    if rec.status == "queued" and proj_key in _PROJECT_QUEUES:
        if exec_id in _PROJECT_QUEUES[proj_key]:
            _PROJECT_QUEUES[proj_key].remove(exec_id)
        rec.status = "cancelled"
        rec.exit_code = 130
        await rec._queue.put("[ML Playground] Cancelled while in queue.")
        await rec._queue.put(None)
        _finish_project_execution(proj_key, exec_id)
        return True

    # If local process running
    if rec._process is not None:
        try:
            await _kill_process_tree(rec._process, 15)
            try:
                await asyncio.wait_for(rec._process.wait(), timeout=2)
            except asyncio.TimeoutError:
                await _kill_process_tree(rec._process, 9)
            rec.status = "cancelled"
            rec.exit_code = 130
            await rec._queue.put("[ML Playground] Stopped by user.")
            await rec._queue.put(None)
            _finish_project_execution(proj_key, exec_id)
            return True
        except Exception:
            return False

    # Publish stop event to Redis if Celery/Redis
    try:
        from app.redis_client import get_redis
        redis_client = await get_redis()
        import json
        stop_evt = json.dumps({"type": "system", "data": "[ML Playground] Execution stopped by user."})
        await redis_client.publish(f"mlpg:exec:stream:{exec_id}", stop_evt)
        await redis_client.rpush(f"mlpg:exec:logs:{exec_id}", stop_evt)
        rec.status = "cancelled"
        rec.exit_code = 130
        _finish_project_execution(proj_key, exec_id)
        return True
    except Exception:
        return False


async def stream_execution_events(exec_id: str) -> AsyncGenerator[Dict[str, Any], None]:
    """Yield parsed execution event dicts from Redis pub/sub or in-memory queue."""
    import json
    rec = get_execution(exec_id)
    if rec is None:
        yield {"type": "error", "error": f"Execution {exec_id} not found."}
        return

    # If currently queued, emit queued event first
    if rec.status == "queued":
        yield {
            "type": "queued",
            "position": rec.queue_position or 1,
            "exec_id": exec_id,
        }

    # 1. Attempt Redis pub/sub streaming if available
    try:
        from app.redis_client import get_redis
        redis_client = await get_redis()

        # Subscribe to real-time pubsub stream FIRST so no events are lost
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(f"mlpg:exec:stream:{exec_id}")
        replayed_count = 0
        terminal_seen = False

        try:
            # Replay any buffered logs already published before subscription
            logs = await redis_client.lrange(f"mlpg:exec:logs:{exec_id}", 0, -1)
            replayed_count = len(logs)
            for raw in logs:
                try:
                    event = json.loads(raw)
                    yield event
                    if event.get("type") in ("exit", "error"):
                        terminal_seen = True
                        break
                except Exception:
                    pass

            if terminal_seen:
                return

            idle_ticks = 0
            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
                if msg and msg.get("type") == "message":
                    idle_ticks = 0
                    raw_data = msg.get("data")
                    if raw_data:
                        try:
                            event = json.loads(raw_data)
                            yield event
                            if event.get("type") in ("exit", "error"):
                                break
                        except Exception:
                            pass
                else:
                    idle_ticks += 1
                    # Check if execution finished in redis record asynchronously
                    try:
                        raw_rec = await redis_client.get(f"mlpg:exec:record:{exec_id}")
                        if raw_rec:
                            rec_data = json.loads(raw_rec)
                            st = rec_data.get("status")
                            if st in ("completed", "failed", "stopped", "cancelled", "timed_out", "out_of_memory"):
                                # If completed, replay any remaining logs from buffer before exit
                                latest_logs = await redis_client.lrange(f"mlpg:exec:logs:{exec_id}", replayed_count, -1)
                                for r_raw in latest_logs:
                                    try:
                                        r_evt = json.loads(r_raw)
                                        if r_evt.get("type") not in ("exit", "error"):
                                            yield r_evt
                                    except Exception:
                                        pass
                                yield {
                                    "type": "exit",
                                    "exit_code": rec_data.get("exit_code"),
                                    "status": st,
                                    "duration_seconds": rec_data.get("duration_seconds"),
                                    "artifacts": rec_data.get("artifacts", []),
                                    "model_id": rec_data.get("registered_model_id"),
                                    "is_truncated": rec_data.get("is_truncated", False),
                                }
                                break
                    except Exception:
                        pass

                    if idle_ticks % 4 == 0:
                        yield {"type": "heartbeat"}
                    if idle_ticks >= 180:  # 90 seconds timeout without messages
                        break
        finally:
            await pubsub.unsubscribe(f"mlpg:exec:stream:{exec_id}")
            await pubsub.close()
        return
    except Exception as exc:
        logger.debug("Redis stream unavailable, falling back to local queue: %s", exc)

    # 2. Local fallback via in-memory queue
    while True:
        try:
            line = await asyncio.wait_for(rec._queue.get(), timeout=30)
        except asyncio.TimeoutError:
            yield {"type": "heartbeat"}
            if rec.status not in ("queued", "running"):
                break
            continue

        if line is None:
            duration = None
            if rec.started_at and rec.finished_at:
                duration = round(rec.finished_at - rec.started_at, 2)
            yield {
                "type": "exit",
                "exit_code": rec.exit_code,
                "status": rec.status,
                "duration_seconds": duration,
                "artifacts": rec.artifacts,
                "model_id": rec.registered_model_id,
                "is_truncated": rec.is_truncated,
            }
            break

        if line.startswith("[stderr] "):
            yield {"type": "stderr", "data": line[9:]}
        elif line.startswith("[ML Playground]"):
            yield {"type": "system", "data": line}
        elif line.startswith("[ERROR]") or line.startswith("[Error]"):
            yield {"type": "error", "error": line}
        else:
            yield {"type": "stdout", "data": line}


async def stream_execution(exec_id: str) -> AsyncGenerator[str, None]:
    import json as _json
    async for event in stream_execution_events(exec_id):
        yield f"data: {_json.dumps(event)}\n\n"


def get_execution(exec_id: str) -> Optional[ExecutionRecord]:
    rec = _EXECUTIONS.get(exec_id)
    # Check Redis for record if available
    try:
        import json
        import redis
        from app.config import settings
        r = redis.from_url(settings.redis_url, decode_responses=True, socket_timeout=0.5)
        raw = r.get(f"mlpg:exec:record:{exec_id}")
        if raw:
            data = json.loads(raw)
            if rec is None:
                rec = ExecutionRecord(
                    exec_id=exec_id,
                    status=data.get("status", "unknown"),
                    code=data.get("code", ""),
                    dataset_id=data.get("dataset_id"),
                    filename=data.get("filename", "train.py"),
                )
                _EXECUTIONS[exec_id] = rec
            rec.status = data.get("status", rec.status)
            rec.started_at = data.get("started_at", rec.started_at)
            rec.finished_at = data.get("finished_at", rec.finished_at)
            rec.exit_code = data.get("exit_code", rec.exit_code)
            rec.stdout = data.get("stdout", rec.stdout)
            rec.stderr = data.get("stderr", rec.stderr)
            rec.artifacts = data.get("artifacts", rec.artifacts)
            rec.registered_model_id = data.get("registered_model_id", rec.registered_model_id)
            rec.error = data.get("error", rec.error)
    except Exception:
        pass
    return rec


def list_executions() -> List[Dict[str, Any]]:
    result = []
    for rec in _EXECUTIONS.values():
        duration = None
        if rec.started_at and rec.finished_at:
            duration = round(rec.finished_at - rec.started_at, 2)
        result.append({
            "exec_id": rec.exec_id,
            "filename": rec.filename,
            "status": rec.status,
            "exit_code": rec.exit_code,
            "artifacts": rec.artifacts,
            "duration_seconds": duration,
            "error": rec.error,
            "dataset_id": rec.dataset_id,
        })
    return result
