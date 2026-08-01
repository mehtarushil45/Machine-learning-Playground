"""Model Version Registry — Sprint 4 Module 4.6, extended Sprint 5A Part 1.

Filesystem-only model registry.  No database required.

Storage layout (relative to services/api/uploads/models/):
  registry/
    index.json          — master index of all registered model versions
    <model_id>/
        metadata.json   — full model metadata

Model lifecycle states:
  ACTIVE     — model is deployed / selected for use
  ARCHIVED   — model is preserved but not active
  DEPRECATED — model is marked obsolete (not deleted)

Sprint 4 Public API (unchanged):
  register_model(record)                         -> str (model_id)
  get_latest_model(algorithm, dataset_id)        -> dict | None
  list_versions(algorithm, dataset_id)           -> List[dict]
  get_model_by_id(model_id)                      -> dict | None

Sprint 5A Extensions:
  archive_model(model_id, reason)                -> dict
  restore_model(model_id)                        -> dict
  delete_model(model_id)                         -> bool
  promote_model(model_id)                        -> dict
  demote_model(model_id, new_status)             -> dict
  get_active_model(algorithm, dataset_id)        -> dict | None
  list_models(status, algorithm, dataset_id,
              problem_type, tags, limit, offset)  -> List[dict]
  list_archived_models(algorithm, dataset_id)    -> List[dict]
  latest_version(algorithm, dataset_id)          -> dict | None
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("apex_ml.model_registry")

# ---------------------------------------------------------------------------
# Storage constants
# ---------------------------------------------------------------------------
_REGISTRY_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "models", "registry")
)
_INDEX_PATH = os.path.join(_REGISTRY_ROOT, "index.json")

# Allowed lifecycle states
_VALID_STATUSES = {"ACTIVE", "ARCHIVED", "DEPRECATED"}


# ---------------------------------------------------------------------------
# Internal I/O helpers
# ---------------------------------------------------------------------------

def _ensure_registry_dirs() -> None:
    os.makedirs(_REGISTRY_ROOT, exist_ok=True)


def _load_index() -> List[Dict[str, Any]]:
    if not os.path.exists(_INDEX_PATH):
        return []
    try:
        with open(_INDEX_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.error("Failed to read registry index: %s", exc)
        return []


def _save_index(records: List[Dict[str, Any]]) -> None:
    _ensure_registry_dirs()
    tmp_path = _INDEX_PATH + ".tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as fh:
            json.dump(records, fh, indent=2, default=str)
        os.replace(tmp_path, _INDEX_PATH)
    except Exception as exc:
        logger.error("Failed to write registry index: %s", exc)
        raise


def _model_dir(model_id: str) -> str:
    return os.path.join(_REGISTRY_ROOT, model_id)


def _metadata_path(model_id: str) -> str:
    return os.path.join(_model_dir(model_id), "metadata.json")


def _read_metadata(model_id: str) -> Optional[Dict[str, Any]]:
    path = _metadata_path(model_id)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.error("Failed to read metadata for %s: %s", model_id, exc)
        return None


def _write_metadata(model_id: str, data: Dict[str, Any]) -> None:
    path = _metadata_path(model_id)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, default=str)
    os.replace(tmp_path, path)


def _update_index_entry(model_id: str, updates: Dict[str, Any]) -> None:
    """Patch a single entry in the index without reloading all metadata."""
    index = _load_index()
    for i, entry in enumerate(index):
        if entry.get("model_id") == model_id:
            index[i] = {**entry, **updates}
            break
    _save_index(index)


# ---------------------------------------------------------------------------
# Sprint 4 Public API — UNCHANGED SIGNATURES
# ---------------------------------------------------------------------------

def register_model(record: Dict[str, Any]) -> str:
    """Register a new model version and return its model_id.

    Accepts the same record dict as Sprint 4.  Adds 'status': 'ACTIVE'
    and the full enriched metadata fields if not already present.

    Returns:
        model_id string.
    """
    _ensure_registry_dirs()

    model_id: str = record.get("model_id") or f"model-{record.get('job_id', '')[:8]}"

    # Build full metadata with Sprint 5A lifecycle fields
    full_record: Dict[str, Any] = {
        # Sprint 4 core fields
        "model_id": model_id,
        "job_id": record.get("job_id"),
        "experiment_id": record.get("experiment_id"),
        "algorithm": record.get("algorithm", "Unknown"),
        "dataset_id": record.get("dataset_id", ""),
        "problem_type": record.get("problem_type", ""),
        "model_version": record.get("model_version", ""),
        "dataset_version": record.get("dataset_version", ""),
        "model_path": record.get("model_path", ""),
        "metrics": record.get("metrics", {}),
        "best_params": record.get("best_params", {}),
        "pipeline_hash": record.get("pipeline_hash", ""),
        "training_timestamp": record.get("training_timestamp", ""),
        "registered_at": datetime.now(timezone.utc).isoformat(),
        # Sprint 5A lifecycle fields
        "version": record.get("model_version") or record.get("version", "v1.0.0"),
        "status": record.get("status", "ACTIVE"),
        "owner": record.get("owner", "system"),
        "description": record.get("description", ""),
        "tags": record.get("tags", []),
        "accuracy": _extract_metric(record.get("metrics", {}), "accuracy"),
        "f1": _extract_metric(record.get("metrics", {}), "f1_score"),
        "auc": _extract_metric(record.get("metrics", {}), "roc_auc"),
        "promoted_at": None,
        "archived_at": None,
        "archive_reason": None,
        "deprecated_at": None,
    }

    # Merge any extra caller-provided fields (non-destructively)
    for k, v in record.items():
        if k not in full_record:
            full_record[k] = v

    model_meta_dir = _model_dir(model_id)
    os.makedirs(model_meta_dir, exist_ok=True)
    _write_metadata(model_id, full_record)

    # Index summary
    index = _load_index()
    # Remove any prior entry with same model_id (re-registration)
    index = [e for e in index if e.get("model_id") != model_id]
    index.append(_build_index_summary(full_record))
    _save_index(index)

    logger.info(
        "Registered model %s (algorithm=%s, status=%s).",
        model_id,
        full_record["algorithm"],
        full_record["status"],
    )
    return model_id


def get_latest_model(
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Return the most recently registered model matching the filters.

    Sprint 4 callers: unchanged signature.
    """
    index = _load_index()
    filtered = _apply_filters(index, algorithm=algorithm, dataset_id=dataset_id)
    if not filtered:
        return None
    latest = sorted(filtered, key=lambda r: r.get("registered_at", ""), reverse=True)[0]
    return _read_metadata(latest["model_id"]) or latest


def list_versions(
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return all registered model summaries matching the filters.

    Sprint 4 callers: unchanged signature.
    """
    index = _load_index()
    filtered = _apply_filters(index, algorithm=algorithm, dataset_id=dataset_id)
    return sorted(filtered, key=lambda r: r.get("registered_at", ""), reverse=True)


def get_model_by_id(model_id: str) -> Optional[Dict[str, Any]]:
    """Return the full metadata for a specific model_id, or None.

    Sprint 4 callers: unchanged signature.
    """
    return _read_metadata(model_id)


# ---------------------------------------------------------------------------
# Sprint 5A Lifecycle API
# ---------------------------------------------------------------------------

def archive_model(model_id: str, reason: str = "") -> Dict[str, Any]:
    """Transition a model to ARCHIVED status.

    Args:
        model_id: Model to archive.
        reason:   Human-readable reason for archiving (stored in metadata).

    Returns:
        Updated metadata dict.

    Raises:
        KeyError: If model_id does not exist.
        ValueError: If model is already ARCHIVED or DEPRECATED.
    """
    meta = _get_model_or_raise(model_id)
    current = meta.get("status", "ACTIVE")
    if current in ("ARCHIVED", "DEPRECATED"):
        raise ValueError(
            f"Model '{model_id}' is already {current} and cannot be archived again."
        )
    now = datetime.now(timezone.utc).isoformat()
    meta["status"] = "ARCHIVED"
    meta["archived_at"] = now
    meta["archive_reason"] = reason
    _write_metadata(model_id, meta)
    _update_index_entry(model_id, {"status": "ARCHIVED", "archived_at": now})
    logger.info("Archived model %s. Reason: %s", model_id, reason)
    return meta


def restore_model(model_id: str) -> Dict[str, Any]:
    """Restore an ARCHIVED model back to ACTIVE status.

    Args:
        model_id: Model to restore.

    Returns:
        Updated metadata dict.

    Raises:
        KeyError: If model_id does not exist.
        ValueError: If model is not ARCHIVED.
    """
    meta = _get_model_or_raise(model_id)
    if meta.get("status") != "ARCHIVED":
        raise ValueError(
            f"Model '{model_id}' is not ARCHIVED (current status={meta.get('status')})."
        )
    meta["status"] = "ACTIVE"
    meta["archived_at"] = None
    meta["archive_reason"] = None
    _write_metadata(model_id, meta)
    _update_index_entry(model_id, {"status": "ACTIVE", "archived_at": None})
    logger.info("Restored model %s to ACTIVE.", model_id)
    return meta


def delete_model(model_id: str) -> bool:
    """Permanently delete a model's registry entry and metadata file.

    The .joblib binary is NOT deleted here — use artifact_manager for that.
    Only ARCHIVED or DEPRECATED models may be deleted to prevent accidental
    removal of active models.

    Args:
        model_id: Model to delete.

    Returns:
        True if deleted, False if model not found.

    Raises:
        ValueError: If model status is ACTIVE.
    """
    meta = _read_metadata(model_id)
    if meta is None:
        logger.warning("delete_model: model %s not found.", model_id)
        return False

    status = meta.get("status", "ACTIVE")
    if status == "ACTIVE":
        raise ValueError(
            f"Cannot delete ACTIVE model '{model_id}'. Archive it first."
        )

    # Remove metadata file and directory
    import shutil
    model_d = _model_dir(model_id)
    if os.path.exists(model_d):
        shutil.rmtree(model_d, ignore_errors=True)

    # Remove from index
    index = _load_index()
    index = [e for e in index if e.get("model_id") != model_id]
    _save_index(index)

    logger.info("Deleted model %s from registry.", model_id)
    return True


def promote_model(model_id: str) -> Dict[str, Any]:
    """Mark a model as the promoted (canonical) ACTIVE model.

    All other ACTIVE models for the same algorithm+dataset_id are
    automatically demoted to ARCHIVED to maintain a single promoted model
    per algorithm/dataset combination.

    Args:
        model_id: Model to promote.

    Returns:
        Updated metadata dict of the promoted model.

    Raises:
        KeyError: If model_id does not exist.
    """
    meta = _get_model_or_raise(model_id)
    algorithm = meta.get("algorithm")
    dataset_id = meta.get("dataset_id")
    now = datetime.now(timezone.utc).isoformat()

    # Demote all other ACTIVE models for same algo+dataset
    index = _load_index()
    for entry in index:
        if (
            entry.get("model_id") != model_id
            and entry.get("algorithm") == algorithm
            and entry.get("dataset_id") == dataset_id
            and entry.get("status") == "ACTIVE"
        ):
            other = _read_metadata(entry["model_id"])
            if other:
                other["status"] = "ARCHIVED"
                other["archived_at"] = now
                other["archive_reason"] = f"Auto-demoted: model {model_id} was promoted."
                _write_metadata(entry["model_id"], other)
                entry["status"] = "ARCHIVED"
                entry["archived_at"] = now

    # Promote the target
    meta["status"] = "ACTIVE"
    meta["promoted_at"] = now
    _write_metadata(model_id, meta)

    # Patch index entry
    for entry in index:
        if entry.get("model_id") == model_id:
            entry["status"] = "ACTIVE"
            entry["promoted_at"] = now
            break
    _save_index(index)

    logger.info("Promoted model %s.", model_id)
    return meta


def demote_model(
    model_id: str,
    new_status: str = "ARCHIVED",
) -> Dict[str, Any]:
    """Transition a model to ARCHIVED or DEPRECATED.

    Args:
        model_id:   Model to demote.
        new_status: Target status — "ARCHIVED" or "DEPRECATED".

    Returns:
        Updated metadata dict.

    Raises:
        KeyError: If model_id does not exist.
        ValueError: If new_status is not valid.
    """
    if new_status not in ("ARCHIVED", "DEPRECATED"):
        raise ValueError(
            f"new_status must be 'ARCHIVED' or 'DEPRECATED', got '{new_status}'."
        )
    meta = _get_model_or_raise(model_id)
    now = datetime.now(timezone.utc).isoformat()
    meta["status"] = new_status
    if new_status == "DEPRECATED":
        meta["deprecated_at"] = now
    else:
        meta["archived_at"] = now
    _write_metadata(model_id, meta)
    _update_index_entry(model_id, {"status": new_status})
    logger.info("Demoted model %s to %s.", model_id, new_status)
    return meta


def get_active_model(
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Return the most recently promoted ACTIVE model matching the filters.

    Args:
        algorithm:  Optional algorithm name filter.
        dataset_id: Optional dataset_id filter.

    Returns:
        Full metadata dict of the active model, or None.
    """
    index = _load_index()
    active = [e for e in index if e.get("status") == "ACTIVE"]
    filtered = _apply_filters(active, algorithm=algorithm, dataset_id=dataset_id)
    if not filtered:
        return None
    # Prefer most recently promoted; fall back to most recently registered
    latest = sorted(
        filtered,
        key=lambda r: (r.get("promoted_at") or r.get("registered_at") or ""),
        reverse=True,
    )[0]
    return _read_metadata(latest["model_id"]) or latest


def list_models(
    status: Optional[str] = None,
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
    problem_type: Optional[str] = None,
    tags: Optional[List[str]] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """Return model index summaries with rich filtering.

    Args:
        status:       Filter by lifecycle status ("ACTIVE"/"ARCHIVED"/"DEPRECATED").
        algorithm:    Case-insensitive algorithm filter.
        dataset_id:   Exact dataset_id filter.
        problem_type: Case-insensitive problem type filter.
        tags:         List of tags — model must have ALL of them.
        limit:        Max results.
        offset:       Pagination offset.

    Returns:
        List of index summary dicts, newest first.
    """
    index = _load_index()
    results = index

    if status:
        s = status.upper()
        results = [r for r in results if r.get("status", "ACTIVE").upper() == s]

    if algorithm:
        al = algorithm.strip().lower()
        results = [r for r in results if r.get("algorithm", "").lower() == al]

    if dataset_id:
        results = [r for r in results if r.get("dataset_id") == dataset_id]

    if problem_type:
        pt = problem_type.strip().lower()
        results = [r for r in results if r.get("problem_type", "").lower() == pt]

    if tags:
        for tag in tags:
            results = [r for r in results if tag in (r.get("tags") or [])]

    results = sorted(results, key=lambda r: r.get("registered_at", ""), reverse=True)
    return results[offset: offset + limit]


def list_archived_models(
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return all ARCHIVED model summaries, newest first.

    Args:
        algorithm:  Optional filter.
        dataset_id: Optional filter.

    Returns:
        List of index summary dicts.
    """
    return list_models(status="ARCHIVED", algorithm=algorithm, dataset_id=dataset_id)


def latest_version(
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Return the full metadata of the most recently registered model.

    Considers ALL statuses (not just ACTIVE).  Use get_active_model() if
    you want only the deployed model.

    Args:
        algorithm:  Optional filter.
        dataset_id: Optional filter.

    Returns:
        Full metadata dict, or None.
    """
    return get_latest_model(algorithm=algorithm, dataset_id=dataset_id)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _get_model_or_raise(model_id: str) -> Dict[str, Any]:
    meta = _read_metadata(model_id)
    if meta is None:
        raise KeyError(f"Model '{model_id}' not found in registry.")
    return meta


def _apply_filters(
    index: List[Dict[str, Any]],
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    result = index
    if algorithm:
        al = algorithm.strip().lower()
        result = [r for r in result if r.get("algorithm", "").lower() == al]
    if dataset_id:
        result = [r for r in result if r.get("dataset_id") == dataset_id]
    return result


def _metrics_summary(metrics: Dict[str, Any]) -> Dict[str, Any]:
    """Extract scalar metric values into a flat summary dict."""
    return {
        k: round(float(v), 6) if isinstance(v, (int, float)) and v is not None else v
        for k, v in metrics.items()
        if isinstance(v, (int, float, type(None)))
    }


def _extract_metric(metrics: Dict[str, Any], key: str) -> Optional[float]:
    val = metrics.get(key)
    if isinstance(val, (int, float)):
        return round(float(val), 6)
    return None


def _build_index_summary(full_record: Dict[str, Any]) -> Dict[str, Any]:
    """Build a lightweight index entry from full metadata."""
    return {
        "model_id": full_record.get("model_id"),
        "job_id": full_record.get("job_id"),
        "experiment_id": full_record.get("experiment_id"),
        "algorithm": full_record.get("algorithm"),
        "dataset_id": full_record.get("dataset_id"),
        "problem_type": full_record.get("problem_type"),
        "model_version": full_record.get("model_version"),
        "version": full_record.get("version"),
        "model_path": full_record.get("model_path"),
        "registered_at": full_record.get("registered_at"),
        "status": full_record.get("status", "ACTIVE"),
        "owner": full_record.get("owner", "system"),
        "tags": full_record.get("tags", []),
        "promoted_at": full_record.get("promoted_at"),
        "archived_at": full_record.get("archived_at"),
        "metrics_summary": _metrics_summary(full_record.get("metrics", {})),
        "accuracy": full_record.get("accuracy"),
        "f1": full_record.get("f1"),
        "auc": full_record.get("auc"),
    }
