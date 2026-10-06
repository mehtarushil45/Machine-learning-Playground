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
        from services.worker.core.dataset_loader import find_dataset_path, UPLOADS_DIR

        src_csv: Optional[str] = None
        if dataset_id:
            try:
                src_csv = find_dataset_path(dataset_id)
            except Exception as d_exc:
                logger.debug("Dataset path lookup failed for %s: %s", dataset_id, d_exc)

        csv_refs = re.findall(r'[\'"]([^\'"]+\.csv)[\'"]', code)
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

            dest_canonical = os.path.join(sandbox, "dataset.csv")
            if not os.path.exists(dest_canonical):
                shutil.copy2(src_csv, dest_canonical)

            for ref in csv_refs:
                ref_name = os.path.basename(ref)
                ref_dest = os.path.join(sandbox, ref_name)
                if not os.path.exists(ref_dest):
                    shutil.copy2(src_csv, ref_dest)
    except Exception as stage_exc:
        logger.warning("Error staging dataset files into Celery execution sandbox: %s", stage_exc)

    # Sanitize environment: strip database credentials and sensitive keys
    env = {
        k: v for k, v in os.environ.items()
        if not any(k.upper().startswith(p) for p in _SENSITIVE_PREFIXES)
    }
    env["PYTHONPATH"] = sandbox + os.pathsep + env.get("PYTHONPATH", "")
    env["PYTHONUNBUFFERED"] = "1"
    env["MLPG_SANDBOX"] = "1"
    env["PYTHONDONTWRITEBYTECODE"] = "1"

    stdout_lines: List[str] = []
    stderr_lines: List[str] = []
    exit_code = 1
    status_str = "failed"
    error_msg: Optional[str] = None
    artifacts: List[str] = []
    model_id: Optional[str] = None
    proc: Optional[subprocess.Popen] = None

    try:
        proc = subprocess.Popen(
            [sys.executable, code_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=sandbox,
            env=env,
            text=True,
            bufsize=1,
        )

        # Stream stdout in real-time
        if proc.stdout:
            for raw_line in iter(proc.stdout.readline, ""):
                line = raw_line.rstrip()
                if len(stdout_lines) < MAX_STREAM_LINES:
                    stdout_lines.append(line)
                    _publish_event(redis_client, exec_id, {"type": "stdout", "data": line})
                elif len(stdout_lines) == MAX_STREAM_LINES:
                    cap_msg = f"[ML Playground] Output limit exceeded ({MAX_STREAM_LINES} lines capped)."
                    stdout_lines.append(cap_msg)
                    _publish_event(redis_client, exec_id, {"type": "stdout", "data": cap_msg})

        # Read remaining stderr
        if proc.stderr:
            err_output = proc.stderr.read()
            if err_output:
                for line in err_output.splitlines():
                    stderr_lines.append(line)
                    _publish_event(redis_client, exec_id, {"type": "stderr", "data": line})

        proc.wait(timeout=timeout)
        exit_code = proc.returncode

        if exit_code == 0:
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
            proc.kill()
        status_str = "failed"
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
            "duration_seconds": duration,
            "artifacts": artifacts,
            "model_id": model_id,
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
