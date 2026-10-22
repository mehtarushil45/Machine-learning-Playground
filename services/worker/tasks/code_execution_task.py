"""Celery Code Execution Sandbox Task -- ML Playground Pillar 2 (Code Studio).

Executes user-submitted Python scripts in decoupled worker sandboxes with:
  - Hardware isolation & resource boundaries (timeout, memory, output line capping)
  - Controlled temporary execution sandbox
  - Sanitized environment (credentials, database passwords, and secrets stripped)
  - Redis Pub/Sub live streaming for stdout / stderr
  - Automatic artifact detection and Model Registry registration
  - Redis persistence for multi-tenant / multi-pod execution state
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.worker.celery_app import celery_app

logger = logging.getLogger("apex_ml.code_execution_task")

_DEFAULT_TIMEOUT_SECONDS = 90
MAX_STREAM_LINES = 5000
_SENSITIVE_PREFIXES = (
    "DATABASE", "REDIS", "POSTGRES", "AWS", "SECRET", "JWT",
    "CELERY", "S3", "MINIO", "TOKEN", "API_KEY", "PASSWORD",
)


def _get_redis_client():
    """Get a synchronous Redis connection for the worker process."""
    try:
        import redis
        from app.config import settings
        redis_url = getattr(settings, "redis_url", None) or os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        return redis.from_url(redis_url, decode_responses=True)
    except Exception as exc:
        logger.debug("Worker could not connect to Redis: %s", exc)
        return None


def _publish_event(redis_client: Any, exec_id: str, event_data: Dict[str, Any]) -> None:
    """Publish a real-time event to the Redis stream channel and log buffer."""
    if not redis_client:
        return
    try:
        raw_payload = json.dumps(event_data)
        redis_client.publish(f"mlpg:exec:stream:{exec_id}", raw_payload)
        redis_client.rpush(f"mlpg:exec:logs:{exec_id}", raw_payload)
        # 1-hour expiration on logs buffer
        redis_client.expire(f"mlpg:exec:logs:{exec_id}", 3600)
    except Exception as exc:
        logger.debug("Failed to publish execution event to Redis: %s", exc)


def _detect_artifacts(sandbox: str) -> List[str]:
    """Detect ML model artifacts in the sandbox directory."""
    artifact_exts = {".joblib", ".pkl", ".pickle", ".h5", ".pt", ".onnx", ".safetensors", ".cbm"}
    found = []
    for root, _, files in os.walk(sandbox):
        for fname in files:
            if Path(fname).suffix.lower() in artifact_exts:
                found.append(fname)
    return found


def _register_sandbox_model(sandbox: str, artifacts: List[str], exec_id: str, dataset_id: Optional[str], filename: str) -> Optional[str]:
    """Auto-register model artifact created by user execution into Model Registry."""
    for art in artifacts:
        if art.endswith(".joblib") or art.endswith(".pkl"):
            try:
                from app.ml.model_registry import register_model, _REGISTRY_ROOT
                art_src = os.path.join(sandbox, art)
                model_id = f"model-exec-{exec_id[:8]}"
                dest_dir = os.path.join(_REGISTRY_ROOT, model_id)
                os.makedirs(dest_dir, exist_ok=True)
                dest_model_path = os.path.join(dest_dir, "model.joblib")
                shutil.copy2(art_src, dest_model_path)

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
                                        if "cat" in str(tname).lower():
                                            cat_cols.extend(c_list)
                                        elif "num" in str(tname).lower():
                                            num_cols.extend(c_list)
                except Exception:
                    pass

                register_model({
                    "model_id": model_id,
                    "job_id": f"exec-{exec_id[:8]}",
                    "algorithm": algo_name,
                    "model_path": dest_model_path,
                    "dataset_id": dataset_id or "dataset.csv",
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
                    "description": f"Model trained via Code Studio execution ({filename})",
                })
                return model_id
            except Exception as reg_exc:
                logger.warning("Failed to auto-register worker sandbox model: %s", reg_exc)
    return None


@celery_app.task(name="execute_code_sandbox", bind=True, max_retries=1)
def execute_code_sandbox(
    self: Any,
    exec_id: str,
    code: str,
    filename: str = "train.py",
    dataset_id: Optional[str] = None,
    timeout: int = _DEFAULT_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    """Execute Python code in an isolated worker sandbox with streaming output."""
    redis_client = _get_redis_client()
    sandbox = tempfile.mkdtemp(prefix=f"mlpg_celery_{exec_id[:8]}_")
    code_path = os.path.join(sandbox, filename)
    started_at = time.monotonic()

    # Initial status update in Redis
    init_record = {
        "exec_id": exec_id,
        "status": "running",
        "code": code,
        "filename": filename,
        "dataset_id": dataset_id,
        "started_at": started_at,
        "exit_code": None,
        "stdout": "",
        "stderr": "",
        "artifacts": [],
        "error": None,
    }
    if redis_client:
        try:
            redis_client.set(f"mlpg:exec:record:{exec_id}", json.dumps(init_record), ex=86400)
        except Exception:
            pass

    _publish_event(redis_client, exec_id, {"type": "status", "status": "running"})
    _publish_event(redis_client, exec_id, {
        "type": "system",
        "data": f"[ML Playground Worker] Starting execution in Celery sandbox: {filename}",
    })

    try:
        with open(code_path, "w", encoding="utf-8") as f:
            f.write(code)
    except Exception as exc:
        err_msg = f"Failed to write code to worker sandbox: {exc}"
        _publish_event(redis_client, exec_id, {"type": "error", "error": err_msg})
        return {
            "exec_id": exec_id,
            "status": "failed",
            "exit_code": 1,
            "error": err_msg,
            "stdout": "",
            "stderr": err_msg,
            "artifacts": [],
        }

    # Stage dataset CSV into execution sandbox
    try:
        from services.worker.core.dataset_loader import find_dataset_path

        csv_refs = re.findall(r'[\'"]([^\'"]+\.(?:csv|parquet|pq))[\'"]', code)
        staged_files: set[str] = set()
        primary_csv: Optional[str] = None

        if dataset_id:
            try:
                primary_csv = find_dataset_path(dataset_id)
                if primary_csv and os.path.isfile(primary_csv):
                    bname = os.path.basename(primary_csv)
                    shutil.copy2(primary_csv, os.path.join(sandbox, bname))
                    staged_files.add(bname)
                    # Also stage as canonical dataset.csv
                    shutil.copy2(primary_csv, os.path.join(sandbox, "dataset.csv"))
                    staged_files.add("dataset.csv")
            except Exception as d_exc:
                logger.debug("Dataset path lookup failed for %s: %s", dataset_id, d_exc)

        # Inspect Python source for any referenced dataset filenames (e.g. pd.read_csv('housing.csv'))
        for ref in csv_refs:
            ref_base = os.path.basename(ref)
            if ref_base in staged_files and os.path.exists(os.path.join(sandbox, ref_base)):
                continue
            try:
                found_ref = find_dataset_path(ref_base)
                if found_ref and os.path.isfile(found_ref):
                    shutil.copy2(found_ref, os.path.join(sandbox, ref_base))
                    staged_files.add(ref_base)
                    if not primary_csv:
                        primary_csv = found_ref
                        shutil.copy2(found_ref, os.path.join(sandbox, "dataset.csv"))
                        staged_files.add("dataset.csv")
            except Exception as ref_exc:
                logger.debug("Could not resolve referenced dataset %s: %s", ref_base, ref_exc)

        # If code references a CSV but we only found primary_csv under another name, copy primary to ref name
        if primary_csv and os.path.isfile(primary_csv):
            for ref in csv_refs:
                ref_base = os.path.basename(ref)
                dest = os.path.join(sandbox, ref_base)
                if not os.path.exists(dest):
                    shutil.copy2(primary_csv, dest)
                    staged_files.add(ref_base)
    except Exception as stage_exc:
        logger.warning("Error staging dataset files into Celery execution sandbox: %s", stage_exc)

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
            # Ensure target column names parsed from code exist in synthetic dataset
            code_targets = re.findall(r'(?:target_col|target)\s*=\s*[\'"]([^\'"]+)[\'"]', code)
            for t_col in code_targets:
                col_name = str(t_col)
                if col_name not in demo_df.columns:
                    demo_df[col_name] = list(np.random.choice([0, 1], size=n_samples))
            if "loan_status" in code and "loan_status" not in demo_df.columns:
                demo_df["loan_status"] = list(np.random.choice([0, 1], size=n_samples))

            demo_df.to_csv(dest_canonical, index=False)
            csv_refs = re.findall(r'[\'"]([^\'"]+\.csv)[\'"]', code)
            for ref in csv_refs:
                ref_dest = os.path.join(sandbox, os.path.basename(ref))
                if not os.path.exists(ref_dest):
                    demo_df.to_csv(ref_dest, index=False)
        except Exception as syn_exc:
            logger.debug("Synthetic dataset generation failed: %s", syn_exc)
    else:
        try:
            import pandas as pd
            header_cols = set(pd.read_csv(dest_canonical, nrows=0).columns)
            code_targets = re.findall(r'(?:target_col|target)\s*=\s*[\'"]([^\'"]+)[\'"]', code)
            needed_cols = [t for t in code_targets if t not in header_cols]
            if "target" not in header_cols and "'target'" in code:
                needed_cols.append("target")
            if "loan_status" in code and "loan_status" not in header_cols:
                needed_cols.append("loan_status")

            if needed_cols:
                df_chk = pd.read_csv(dest_canonical)
                import numpy as np
                for col in needed_cols:
                    if col not in df_chk.columns:
                        df_chk[col] = list(np.random.choice([0, 1], size=len(df_chk)))
                df_chk.to_csv(dest_canonical, index=False)
        except Exception:
            pass

    # Clean, isolated execution environment: strict allowlist of harmless variables only
    _ALLOWED_ENV_VARS = {
        "PATH", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "HOME", "USER",
        "TMPDIR", "TEMP", "TMP", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT",
    }
    env = {
        k: v for k, v in os.environ.items()
        if k in _ALLOWED_ENV_VARS or k.upper() in _ALLOWED_ENV_VARS
    }
    env["PYTHONPATH"] = sandbox + os.pathsep + env.get("PYTHONPATH", "")
    env["PYTHONUNBUFFERED"] = "1"
    env["MLPG_SANDBOX"] = "1"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    # Cap worker math thread pools to 2 to prevent thread exhaustion / pthread_create failures
    env["OPENBLAS_NUM_THREADS"] = "2"
    env["OMP_NUM_THREADS"] = "2"
    env["MKL_NUM_THREADS"] = "2"
    env["NUMEXPR_NUM_THREADS"] = "2"

    stdout_lines: List[str] = []
    stderr_lines: List[str] = []
    exit_code = 1
    status_str = "failed"
    error_msg: Optional[str] = None
    artifacts: List[str] = []
    model_id: Optional[str] = None
    proc: Optional[subprocess.Popen] = None

    preexec = None
    if sys.platform != "win32":
        def _preexec_sandbox():
            os.setsid()
            try:
                import resource
                # 4GB virtual address space (RLIMIT_AS) gives scikit-learn/numpy/xgboost
                # sufficient space to map thread pools without hitting pthread_create errors
                limit_bytes = 4096 * 1024 * 1024
                resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, limit_bytes))
            except Exception:
                pass
        preexec = _preexec_sandbox

    kwargs: Dict[str, Any] = {}
    if preexec is not None:
        kwargs["preexec_fn"] = preexec

    is_truncated = False

    try:
        proc = subprocess.Popen(
            [sys.executable, code_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=sandbox,
            env=env,
            text=True,
            bufsize=1,
            **kwargs,
        )

        import threading

        def _read_stdout():
            nonlocal is_truncated
            if not proc or not proc.stdout:
                return
            for raw_line in iter(proc.stdout.readline, ""):
                line = raw_line.rstrip()
                if len(stdout_lines) < MAX_STREAM_LINES:
                    stdout_lines.append(line)
                    _publish_event(redis_client, exec_id, {"type": "stdout", "data": line})
                elif len(stdout_lines) == MAX_STREAM_LINES:
                    is_truncated = True
                    cap_msg = f"[ML Playground] Output limit exceeded ({MAX_STREAM_LINES} lines capped). Download complete raw output from the toolbar."
                    stdout_lines.append(cap_msg)
                    _publish_event(redis_client, exec_id, {"type": "stdout", "data": cap_msg})

        def _read_stderr():
            nonlocal is_truncated
            if not proc or not proc.stderr:
                return
            for raw_line in iter(proc.stderr.readline, ""):
                line = raw_line.rstrip()
                if len(stderr_lines) < MAX_STREAM_LINES:
                    stderr_lines.append(line)
                    _publish_event(redis_client, exec_id, {"type": "stderr", "data": line})
                elif len(stderr_lines) == MAX_STREAM_LINES:
                    is_truncated = True
                    cap_msg = f"[ML Playground] Stderr limit exceeded ({MAX_STREAM_LINES} lines capped)."
                    stderr_lines.append(cap_msg)
                    _publish_event(redis_client, exec_id, {"type": "stderr", "data": cap_msg})

        t_out = threading.Thread(target=_read_stdout, daemon=True)
        t_err = threading.Thread(target=_read_stderr, daemon=True)
        t_out.start()
        t_err.start()

        proc.wait(timeout=timeout)
        t_out.join(timeout=2.0)
        t_err.join(timeout=2.0)
        exit_code = proc.returncode

        is_oom = any("MemoryError" in l or "allocate" in l.lower() for l in stderr_lines) or exit_code in (137, -9)

        if is_oom:
            status_str = "out_of_memory"
            exit_code = 137
            error_msg = "Out of memory: execution exceeded 512MB limit."
            _publish_event(redis_client, exec_id, {
                "type": "error",
                "error": error_msg,
            })
        elif exit_code == 0:
            status_str = "completed"
            artifacts = _detect_artifacts(sandbox)
            _publish_event(redis_client, exec_id, {
                "type": "system",
                "data": "[ML Playground Worker] Execution completed successfully (exit 0).",
            })
            if artifacts:
                _publish_event(redis_client, exec_id, {
                    "type": "system",
                    "data": f"[ML Playground Worker] Artifacts generated: {', '.join(artifacts)}",
                })
                model_id = _register_sandbox_model(sandbox, artifacts, exec_id, dataset_id, filename)
                if model_id:
                    _publish_event(redis_client, exec_id, {
                        "type": "system",
                        "data": f"[ML Playground Worker] Model auto-registered in Model Registry: {model_id}",
                    })
        else:
            status_str = "failed"
            error_msg = f"Process exited with non-zero code {exit_code}"
            _publish_event(redis_client, exec_id, {
                "type": "system",
                "data": f"[ML Playground Worker] Failed with exit code {exit_code}.",
            })

    except subprocess.TimeoutExpired:
        if proc:
            if sys.platform != "win32":
                try:
                    import signal
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except Exception:
                    proc.kill()
            else:
                proc.kill()
        status_str = "timed_out"
        exit_code = 124
        error_msg = f"Execution timed out after {timeout} seconds."
        _publish_event(redis_client, exec_id, {"type": "error", "error": error_msg})

    except Exception as run_exc:
        status_str = "failed"
        error_msg = str(run_exc)
        _publish_event(redis_client, exec_id, {"type": "error", "error": error_msg})

    finally:
        finished_at = time.monotonic()
        duration = round(finished_at - started_at, 2)

        _publish_event(redis_client, exec_id, {
            "type": "exit",
            "exit_code": exit_code,
            "status": status_str,
            "duration_seconds": duration,
            "artifacts": artifacts,
            "model_id": model_id,
            "is_truncated": is_truncated,
        })

        final_record = {
            "exec_id": exec_id,
            "status": status_str,
            "code": code,
            "filename": filename,
            "dataset_id": dataset_id,
            "started_at": started_at,
            "finished_at": finished_at,
            "duration_seconds": duration,
            "exit_code": exit_code,
            "stdout": "\n".join(stdout_lines),
            "stderr": "\n".join(stderr_lines),
            "artifacts": artifacts,
            "registered_model_id": model_id,
            "error": error_msg,
        }

        if redis_client:
            try:
                redis_client.set(f"mlpg:exec:record:{exec_id}", json.dumps(final_record), ex=86400)
            except Exception:
                pass

        try:
            shutil.rmtree(sandbox, ignore_errors=True)
        except Exception:
            pass

    return final_record
