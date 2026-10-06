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


@dataclass
class ExecutionRecord:
    exec_id:     str
    status:      str          # queued | running | completed | failed | stopped
    code:        str
    dataset_id:  Optional[str]
    filename:    str
    started_at:  Optional[float]   = None
    finished_at: Optional[float]   = None
    exit_code:   Optional[int]     = None
    stdout:      str               = ""
    stderr:      str               = ""
    artifacts:           List[str]         = field(default_factory=list)
    registered_model_id: Optional[str]     = None
    error:               Optional[str]     = None
    _queue:              "asyncio.Queue[Optional[str]]" = field(default_factory=asyncio.Queue)
    _process:            Optional[asyncio.subprocess.Process] = None
    _sandbox:            Optional[str]     = None


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
    prefix: str = "",
) -> None:
    if stream is None:
        return
    try:
        async for raw_line in stream:
            if len(buffer) >= MAX_STREAM_LINES:
                warning_msg = f"{prefix}[ML Playground] Output limit exceeded ({MAX_STREAM_LINES} lines capped)."
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
    timeout: int = _DEFAULT_TIMEOUT_SECONDS,
    extra_env: Optional[Dict[str, str]] = None,
) -> ExecutionRecord:
    exec_id = str(uuid.uuid4())
    rec = ExecutionRecord(
        exec_id=exec_id,
        status="queued",
        code=code,
        dataset_id=dataset_id,
        filename=filename,
    )
    _EXECUTIONS[exec_id] = rec
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
        proc = await asyncio.create_subprocess_exec(
            sys.executable, code_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=sandbox,
            env=env,
        )
        rec._process = proc
        await rec._queue.put(f"[ML Playground] Starting: {rec.filename}")

        stream_tasks = []
        if proc.stdout is not None:
            stream_tasks.append(_stream_output(proc.stdout, stdout_lines, rec._queue))
        if proc.stderr is not None:
            stream_tasks.append(_stream_output(proc.stderr, stderr_lines, rec._queue, prefix="[stderr] "))
        stream_tasks.append(proc.wait())

        await asyncio.wait_for(
            asyncio.gather(*stream_tasks),
            timeout=timeout,
        )

        rec.exit_code = proc.returncode
        rec.stdout = "\n".join(stdout_lines)
        rec.stderr = "\n".join(stderr_lines)

        if proc.returncode == 0:
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
        else:
            rec.status = "failed"
            await rec._queue.put(f"[ML Playground] Failed (exit {proc.returncode}).")

    except asyncio.TimeoutError:
        rec.status = "failed"
        rec.error = f"Execution timed out after {timeout}s."
        await rec._queue.put(f"[ML Playground] TIMEOUT after {timeout}s.")
        try:
            if rec._process:
                rec._process.kill()
        except Exception:
            pass

    except Exception as exc:
        rec.status = "failed"
        rec.error = str(exc)
        await rec._queue.put(f"[ML Playground] Error: {exc}")

    finally:
        rec.finished_at = time.monotonic()
        await rec._queue.put(None)


async def stop_execution(exec_id: str) -> bool:
    rec = _EXECUTIONS.get(exec_id)
    if rec is None or rec._process is None:
        return False
    try:
        rec._process.terminate()
        try:
            await asyncio.wait_for(rec._process.wait(), timeout=3)
        except asyncio.TimeoutError:
            rec._process.kill()
        rec.status = "stopped"
        await rec._queue.put("[ML Playground] Stopped by user.")
        await rec._queue.put(None)
        return True
    except Exception:
        return False


async def stream_execution(exec_id: str) -> AsyncGenerator[str, None]:
    import json as _json
    rec = _EXECUTIONS.get(exec_id)
    if rec is None:
        payload = _json.dumps({"type": "error", "error": f"Execution {exec_id} not found."})
        yield f"data: {payload}\n\n"
        return

    while True:
        try:
            line = await asyncio.wait_for(rec._queue.get(), timeout=30)
        except asyncio.TimeoutError:
            yield f"data: {_json.dumps({'type': 'heartbeat'})}\n\n"
            if rec.status not in ("queued", "running"):
                break
            continue

        if line is None:
            # Compute duration for the exit event
            duration = None
            if rec.started_at and rec.finished_at:
                duration = round(rec.finished_at - rec.started_at, 2)
            payload = _json.dumps({
                "type": "exit",
                "exit_code": rec.exit_code,
                "status": rec.status,
                "duration_seconds": duration,
                "artifacts": rec.artifacts,
                "model_id": rec.registered_model_id,
            })
            yield f"data: {payload}\n\n"
            break

        # Classify the line type based on prefix
        if line.startswith("[stderr] "):
            payload = _json.dumps({"type": "stderr", "data": line[9:]})
        elif line.startswith("[ML Playground]"):
            payload = _json.dumps({"type": "system", "data": line})
        elif line.startswith("[ERROR]") or line.startswith("[Error]"):
            payload = _json.dumps({"type": "error", "error": line})
        else:
            payload = _json.dumps({"type": "stdout", "data": line})
        yield f"data: {payload}\n\n"


def get_execution(exec_id: str) -> Optional[ExecutionRecord]:
    return _EXECUTIONS.get(exec_id)


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
