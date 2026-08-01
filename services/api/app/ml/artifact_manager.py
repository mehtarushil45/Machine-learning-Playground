"""Artifact Manager — Sprint 5A Part 5.

Manages all ML training artefacts produced by the platform:
  - trained model binaries (.joblib)
  - training reports (report.json)
  - metrics summaries
  - confusion matrices (stored as part of report)
  - feature importance lists (stored as part of report)
  - experiment JSON files

Provides:
  save_artifact(data, artifact_type, model_id, experiment_id)  → path
  load_artifact(artifact_type, model_id, experiment_id)        → Any
  delete_artifact(artifact_type, model_id, experiment_id)      → bool
  cleanup_orphaned_artifacts(dry_run)                          → CleanupReport
  validate_artifact(artifact_type, model_id, experiment_id)    → ValidationResult
  list_artifacts(model_id, experiment_id)                      → ArtifactManifest

Design decisions:
- Artifacts are stored relative to existing directory conventions
  established in Sprint 4 (uploads/models/, uploads/experiments/).
  No new directories are invented — this module is a management
  layer above existing filesystem structure.
- load_artifact() for 'model' returns the raw joblib binary path (not
  the loaded object) to keep the artifact manager free of sklearn
  dependencies.  The caller is responsible for loading with joblib.
- cleanup_orphaned_artifacts() cross-references the model registry index
  and experiment directory; any .joblib or report.json with no
  corresponding registry/experiment entry is reported as orphaned.
- All public functions return plain dicts (JSON-serialisable).
"""

from __future__ import annotations

import json
import logging
import os
import shutil
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("apex_ml.artifact_manager")

# ---------------------------------------------------------------------------
# Base paths (mirrors Sprint 4 conventions exactly)
# ---------------------------------------------------------------------------
_API_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
_MODELS_DIR = os.path.join(_API_ROOT, "uploads", "models")
_REGISTRY_DIR = os.path.join(_MODELS_DIR, "registry")
_EXPERIMENTS_DIR = os.path.join(_API_ROOT, "uploads", "experiments")

# ---------------------------------------------------------------------------
# Artifact type definitions
# ---------------------------------------------------------------------------
_ARTIFACT_TYPES = {
    "model":          ".joblib",
    "report":         "report.json",
    "metrics":        "metrics.json",
    "config":         "config.json",
    "experiment":     "experiment.json",
    "feature_importance": "feature_importance.json",
    "confusion_matrix":   "confusion_matrix.json",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def save_artifact(
    data: Any,
    artifact_type: str,
    model_id: Optional[str] = None,
    experiment_id: Optional[str] = None,
) -> str:
    """Persist an artifact to the filesystem.

    Supports JSON-serialisable data (dict / list).  Binary model files
    should be saved via services.worker.core.serialization.save_trained_model —
    this function handles supplementary JSON artifacts only.

    Args:
        data:           JSON-serialisable Python object.
        artifact_type:  One of _ARTIFACT_TYPES.
        model_id:       If set, artifact is stored under the model directory.
        experiment_id:  If set, artifact is stored under the experiment directory.

    Returns:
        Absolute path of the saved artifact.

    Raises:
        ValueError: If artifact_type is unsupported or neither model_id nor
                    experiment_id is provided.
        TypeError:  If data is not JSON-serialisable.
    """
    if artifact_type not in _ARTIFACT_TYPES:
        raise ValueError(
            f"Unknown artifact_type '{artifact_type}'. "
            f"Supported: {sorted(_ARTIFACT_TYPES)}"
        )
    if model_id is None and experiment_id is None:
        raise ValueError("At least one of model_id or experiment_id must be provided.")

    target_dir = _resolve_dir(artifact_type, model_id, experiment_id)
    os.makedirs(target_dir, exist_ok=True)

    filename = _ARTIFACT_TYPES[artifact_type]
    if not filename.endswith(".json"):
        raise ValueError(
            f"save_artifact() only supports JSON artifacts. "
            f"Model binaries must be saved via save_trained_model()."
        )

    path = os.path.join(target_dir, filename)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, default=str)
    os.replace(tmp, path)

    logger.info("Saved artifact '%s' → %s", artifact_type, path)
    return path


def load_artifact(
    artifact_type: str,
    model_id: Optional[str] = None,
    experiment_id: Optional[str] = None,
) -> Optional[Any]:
    """Load an artifact from the filesystem.

    For 'model' artifact_type, returns the file path string rather than
    loading the binary (caller uses joblib.load()).

    Args:
        artifact_type:  One of _ARTIFACT_TYPES.
        model_id:       Model context.
        experiment_id:  Experiment context.

    Returns:
        Parsed JSON object, or file path string for binary artifacts, or
        None if not found.
    """
    if artifact_type not in _ARTIFACT_TYPES:
        logger.warning("Unknown artifact_type '%s'.", artifact_type)
        return None

    target_dir = _resolve_dir(artifact_type, model_id, experiment_id)
    filename = _ARTIFACT_TYPES[artifact_type]
    path = os.path.join(target_dir, filename)

    if artifact_type == "model":
        # For model binaries, locate the .joblib from registry metadata
        return _locate_model_binary(model_id)

    if not os.path.exists(path):
        return None

    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.error("Failed to load artifact %s: %s", path, exc)
        return None


def delete_artifact(
    artifact_type: str,
    model_id: Optional[str] = None,
    experiment_id: Optional[str] = None,
    delete_model_binary: bool = False,
) -> bool:
    """Delete a specific artifact file.

    Args:
        artifact_type:        Artifact to delete.
        model_id:             Model context.
        experiment_id:        Experiment context.
        delete_model_binary:  If True and artifact_type='model', also deletes
                              the .joblib binary (IRREVERSIBLE).

    Returns:
        True if deletion occurred, False if file not found.
    """
    if artifact_type not in _ARTIFACT_TYPES:
        return False

    if artifact_type == "model" and delete_model_binary:
        return _delete_model_binary(model_id)

    target_dir = _resolve_dir(artifact_type, model_id, experiment_id)
    path = os.path.join(target_dir, _ARTIFACT_TYPES[artifact_type])

    if not os.path.exists(path):
        return False

    os.remove(path)
    logger.info("Deleted artifact %s.", path)
    return True


def cleanup_orphaned_artifacts(dry_run: bool = True) -> Dict[str, Any]:
    """Find and optionally remove artifacts not referenced by any registry/experiment entry.

    Args:
        dry_run: If True (default), report without deleting.

    Returns:
        CleanupReport dict with:
            dry_run                 — bool
            orphaned_model_binaries — list of paths
            orphaned_metadata_dirs  — list of paths
            total_freed_bytes       — int (0 for dry_run)
            deleted_paths           — list (empty for dry_run)
    """
    orphaned_binaries: List[str] = []
    orphaned_dirs: List[str] = []
    total_bytes = 0
    deleted: List[str] = []

    # ── Known model IDs from registry index ──────────────────────────────────
    known_model_ids: set = _known_registry_model_ids()

    # ── Scan models directory for .joblib files ───────────────────────────────
    if os.path.exists(_MODELS_DIR):
        for fname in os.listdir(_MODELS_DIR):
            if fname.endswith(".joblib"):
                full_path = os.path.join(_MODELS_DIR, fname)
                # Check if the job_id prefix matches any known model
                # Naming convention: <job_id>_<algo>.joblib
                job_prefix = fname.split("_")[0] if "_" in fname else fname
                if not any(job_prefix in mid for mid in known_model_ids):
                    size = _safe_size(full_path)
                    orphaned_binaries.append(full_path)
                    if not dry_run:
                        os.remove(full_path)
                        deleted.append(full_path)
                        total_bytes += size

    # ── Scan registry dirs for model dirs with no index entry ─────────────────
    if os.path.exists(_REGISTRY_DIR):
        for entry in os.scandir(_REGISTRY_DIR):
            if entry.is_dir() and entry.name not in known_model_ids:
                orphaned_dirs.append(entry.path)
                if not dry_run:
                    dir_size = _dir_size(entry.path)
                    shutil.rmtree(entry.path, ignore_errors=True)
                    deleted.append(entry.path)
                    total_bytes += dir_size

    # ── Scan experiment dirs for those with no experiment.json ────────────────
    if os.path.exists(_EXPERIMENTS_DIR):
        for entry in os.scandir(_EXPERIMENTS_DIR):
            if entry.is_dir():
                exp_json = os.path.join(entry.path, "experiment.json")
                if not os.path.exists(exp_json):
                    orphaned_dirs.append(entry.path)
                    if not dry_run:
                        dir_size = _dir_size(entry.path)
                        shutil.rmtree(entry.path, ignore_errors=True)
                        deleted.append(entry.path)
                        total_bytes += dir_size

    return {
        "dry_run": dry_run,
        "orphaned_model_binaries": orphaned_binaries,
        "orphaned_metadata_dirs": orphaned_dirs,
        "total_orphaned": len(orphaned_binaries) + len(orphaned_dirs),
        "total_freed_bytes": total_bytes if not dry_run else 0,
        "deleted_paths": deleted,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }


def validate_artifact(
    artifact_type: str,
    model_id: Optional[str] = None,
    experiment_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Validate that an artifact exists and is well-formed.

    Args:
        artifact_type: Artifact to validate.
        model_id:      Model context.
        experiment_id: Experiment context.

    Returns:
        ValidationResult dict:
            valid     — bool
            path      — str or None
            exists    — bool
            readable  — bool
            errors    — List[str]
    """
    errors: List[str] = []

    if artifact_type not in _ARTIFACT_TYPES:
        return {
            "valid": False,
            "path": None,
            "exists": False,
            "readable": False,
            "errors": [f"Unknown artifact_type '{artifact_type}'."],
        }

    if artifact_type == "model":
        path = _locate_model_binary(model_id)
        if path is None:
            return {
                "valid": False,
                "path": None,
                "exists": False,
                "readable": False,
                "errors": [f"Model binary not found for model_id='{model_id}'."],
            }
        exists = os.path.exists(path)
        readable = exists and os.path.getsize(path) > 0
        if not exists:
            errors.append(f"Binary file missing: {path}")
        elif not readable:
            errors.append(f"Binary file is empty: {path}")
        return {
            "valid": len(errors) == 0,
            "path": path,
            "exists": exists,
            "readable": readable,
            "errors": errors,
        }

    target_dir = _resolve_dir(artifact_type, model_id, experiment_id)
    path = os.path.join(target_dir, _ARTIFACT_TYPES[artifact_type])
    exists = os.path.exists(path)

    if not exists:
        errors.append(f"Artifact file not found: {path}")
        return {
            "valid": False,
            "path": path,
            "exists": False,
            "readable": False,
            "errors": errors,
        }

    readable = False
    try:
        with open(path, "r", encoding="utf-8") as fh:
            json.load(fh)
        readable = True
    except Exception as exc:
        errors.append(f"JSON parse error: {exc}")

    return {
        "valid": len(errors) == 0,
        "path": path,
        "exists": True,
        "readable": readable,
        "errors": errors,
    }


def list_artifacts(
    model_id: Optional[str] = None,
    experiment_id: Optional[str] = None,
) -> Dict[str, Any]:
    """List all artifacts present for a model or experiment.

    Args:
        model_id:      If set, list artifacts in the model registry directory.
        experiment_id: If set, list artifacts in the experiment directory.

    Returns:
        ArtifactManifest dict:
            model_id      — str or None
            experiment_id — str or None
            artifacts     — list of {type, path, size_bytes, exists}
    """
    artifacts: List[Dict[str, Any]] = []

    # Model registry artifacts
    if model_id:
        reg_dir = os.path.join(_REGISTRY_DIR, model_id)
        for fname in ("metadata.json",):
            p = os.path.join(reg_dir, fname)
            artifacts.append(
                {
                    "type": "metadata",
                    "path": p,
                    "size_bytes": _safe_size(p),
                    "exists": os.path.exists(p),
                }
            )
        # Model binary
        binary = _locate_model_binary(model_id)
        if binary:
            artifacts.append(
                {
                    "type": "model",
                    "path": binary,
                    "size_bytes": _safe_size(binary),
                    "exists": os.path.exists(binary),
                }
            )

    # Experiment artifacts
    if experiment_id:
        exp_dir = os.path.join(_EXPERIMENTS_DIR, experiment_id)
        for art_type, filename in _ARTIFACT_TYPES.items():
            if art_type == "model":
                continue
            p = os.path.join(exp_dir, filename)
            if os.path.exists(p) or art_type in ("experiment", "config", "report"):
                artifacts.append(
                    {
                        "type": art_type,
                        "path": p,
                        "size_bytes": _safe_size(p),
                        "exists": os.path.exists(p),
                    }
                )

    return {
        "model_id": model_id,
        "experiment_id": experiment_id,
        "artifact_count": len(artifacts),
        "artifacts": artifacts,
    }


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _resolve_dir(
    artifact_type: str,
    model_id: Optional[str],
    experiment_id: Optional[str],
) -> str:
    """Return the directory where this artifact should be stored."""
    if artifact_type in ("experiment", "config", "report",
                          "feature_importance", "confusion_matrix", "metrics"):
        if experiment_id:
            return os.path.join(_EXPERIMENTS_DIR, experiment_id)
    # Metadata lives in model registry directory
    if model_id:
        return os.path.join(_REGISTRY_DIR, model_id)
    if experiment_id:
        return os.path.join(_EXPERIMENTS_DIR, experiment_id)
    raise ValueError("Cannot resolve directory without model_id or experiment_id.")


def _locate_model_binary(model_id: Optional[str]) -> Optional[str]:
    """Find the .joblib binary path via registry metadata."""
    if model_id is None:
        return None
    meta_path = os.path.join(_REGISTRY_DIR, model_id, "metadata.json")
    if not os.path.exists(meta_path):
        return None
    try:
        with open(meta_path, "r", encoding="utf-8") as fh:
            meta = json.load(fh)
        return meta.get("model_path")
    except Exception:
        return None


def _delete_model_binary(model_id: Optional[str]) -> bool:
    path = _locate_model_binary(model_id)
    if path is None or not os.path.exists(path):
        return False
    os.remove(path)
    logger.warning("Deleted model binary: %s", path)
    return True


def _known_registry_model_ids() -> set:
    index_path = os.path.join(_REGISTRY_DIR, "index.json")
    if not os.path.exists(index_path):
        return set()
    try:
        with open(index_path, "r", encoding="utf-8") as fh:
            index = json.load(fh)
        return {e.get("model_id") for e in index if e.get("model_id")}
    except Exception:
        return set()


def _safe_size(path: str) -> int:
    try:
        return os.path.getsize(path)
    except OSError:
        return 0


def _dir_size(path: str) -> int:
    total = 0
    for dirpath, _, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            total += _safe_size(fp)
    return total
