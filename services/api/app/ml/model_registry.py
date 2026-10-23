"""Model Version Registry — Sprint 4 Module 4.6, extended V5A.

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


def _find_sidecar_metadata(identifier: str) -> Optional[Dict[str, Any]]:
    _models_dir = os.path.abspath(os.path.join(_REGISTRY_ROOT, ".."))
    if not os.path.exists(_models_dir):
        return None
    prefix = identifier[6:] if identifier.startswith("model-") else identifier
    try:
        for fname in os.listdir(_models_dir):
            if fname.endswith("_metadata.json"):
                if fname.startswith(prefix) or prefix in fname:
                    try:
                        with open(os.path.join(_models_dir, fname), "r", encoding="utf-8") as fh:
                            content = json.load(fh)
                        if (
                            content.get("model_id") == identifier
                            or content.get("job_id") == identifier
                            or fname.startswith(prefix)
                        ):
                            return content
                    except Exception:
                        continue
    except Exception as exc:
        logger.warning("Error reading sidecar metadata in %s: %s", _models_dir, exc)
    return None


def _get_redis_sync():
    """Get a synchronous Redis connection for cross-tier registry synchronization."""
    try:
        import redis
        from app.config import settings
        r_url = getattr(settings, "redis_url", None) or os.getenv("REDIS_URL", "redis://localhost:6379/0")
        return redis.from_url(r_url, decode_responses=True, socket_timeout=2.0)
    except Exception:
        return None


def resolve_model_binary_path(
    path_str: Optional[str],
    model_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> Optional[str]:
    """Resolve a model binary (.joblib) path across Docker container and host runtime paths."""
    if path_str and os.path.exists(path_str):
        return os.path.abspath(path_str)

    _models_dir = os.path.abspath(os.path.join(_REGISTRY_ROOT, ".."))
    _uploads_dir = os.path.abspath(os.path.join(_models_dir, ".."))

    if path_str:
        norm = path_str.replace("\\", "/")
        if "/uploads/" in norm:
            rel = norm.split("/uploads/", 1)[1]
            candidate = os.path.abspath(os.path.join(_uploads_dir, rel))
            if os.path.exists(candidate):
                return candidate

        fname = os.path.basename(norm)
        if fname:
            candidate = os.path.abspath(os.path.join(_models_dir, fname))
            if os.path.exists(candidate):
                return candidate

    prefixes: list[str] = []
    if job_id:
        prefixes.append(job_id.strip())
    if model_id:
        m_clean = model_id.strip()
        if m_clean.startswith("model-"):
            prefixes.append(m_clean[6:])
        prefixes.append(m_clean)

    if model_id:
        m_clean = model_id.strip()
        reg_file = os.path.join(_REGISTRY_ROOT, m_clean, "model.joblib")
        if os.path.exists(reg_file):
            return os.path.abspath(reg_file)

    if job_id:
        j_clean = job_id.strip()
        reg_file = os.path.join(_REGISTRY_ROOT, f"model-exec-{j_clean[:8]}", "model.joblib")
        if os.path.exists(reg_file):
            return os.path.abspath(reg_file)

    if os.path.exists(_models_dir):
        try:
            for fname in os.listdir(_models_dir):
                if fname.endswith((".joblib", ".pkl")):
                    for p in prefixes:
                        if p and (fname.startswith(p) or p in fname):
                            candidate = os.path.abspath(os.path.join(_models_dir, fname))
                            if os.path.exists(candidate):
                                return candidate
        except Exception as exc:
            logger.warning("Error searching models directory for %s/%s: %s", model_id, job_id, exc)

    # Redis binary cache fallback
    r = _get_redis_sync()
    if r:
        try:
            import base64
            keys_to_try = []
            if model_id:
                keys_to_try.extend([f"mlpg:model:binary:{model_id}", f"mlpg:model:binary:{model_id.replace('model-', '')}"])
            if job_id:
                keys_to_try.extend([f"mlpg:model:binary:{job_id}", f"mlpg:model:binary:exec-{job_id[:8]}", f"mlpg:model:binary:{job_id[:8]}"])

            for rk in keys_to_try:
                b64_val = r.get(rk)
                if b64_val:
                    m_name = model_id if model_id else (f"model-exec-{job_id[:8]}" if job_id else "unknown_model")
                    target_dir = os.path.join(_REGISTRY_ROOT, m_name)
                    os.makedirs(target_dir, exist_ok=True)
                    out_path = os.path.join(target_dir, "model.joblib")
                    with open(out_path, "wb") as bf:
                        bf.write(base64.b64decode(b64_val))
                    logger.info("Restored model binary from Redis key %s to %s", rk, out_path)
                    return os.path.abspath(out_path)
        except Exception as r_err:
            logger.debug("Redis binary resolution failed: %s", r_err)

    return None


def _read_metadata(model_id: str) -> Optional[Dict[str, Any]]:
    path = _metadata_path(model_id)
    data: Optional[Dict[str, Any]] = None
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as exc:
            logger.error("Failed to read metadata for %s: %s", model_id, exc)

    if not data:
        sidecar = _find_sidecar_metadata(model_id)
        if sidecar:
            try:
                register_model(sidecar)
                if os.path.exists(path):
                    with open(path, "r", encoding="utf-8") as fh:
                        data = json.load(fh)
                else:
                    data = sidecar
            except Exception as exc:
                logger.warning("Auto-registration of sidecar failed for %s: %s", model_id, exc)
                data = sidecar

    # Redis metadata and execution record self-healing fallback
    if not data:
        r = _get_redis_sync()
        if r:
            try:
                cached_json = r.get(f"mlpg:registry:model:{model_id}")
                if not cached_json and model_id.startswith("model-"):
                    cached_json = r.get(f"mlpg:registry:model:{model_id[6:]}")
                if cached_json:
                    try:
                        parsed = json.loads(cached_json)
                        register_model(parsed)
                        data = parsed
                    except Exception:
                        pass

                if not data and (model_id.startswith("model-exec-") or "exec-" in model_id):
                    prefix = model_id.replace("model-exec-", "").replace("exec-", "")[:8]
                    rec_raw = r.get(f"mlpg:exec:record:{prefix}") or r.get(f"mlpg:exec:model:{model_id}")
                    if not rec_raw:
                        match_keys = r.keys(f"mlpg:exec:record:*{prefix}*")
                        if match_keys:
                            rec_raw = r.get(match_keys[0])

                    if rec_raw:
                        rec_data = json.loads(rec_raw)
                        meta_dict = {
                            "model_id": model_id,
                            "job_id": f"exec-{prefix}",
                            "algorithm": "Code Studio Pipeline",
                            "model_path": os.path.join(_model_dir(model_id), "model.joblib"),
                            "dataset_id": rec_data.get("dataset_id") or "dataset.csv",
                            "problem_type": "classification",
                            "feature_columns": [],
                            "status": "ACTIVE",
                            "owner": "code-studio",
                            "description": f"Model from Code Studio execution ({rec_data.get('filename', 'train.py')})",
                        }
                        if rec_data.get("model_metadata") and isinstance(rec_data["model_metadata"], dict):
                            meta_dict.update(rec_data["model_metadata"])
                        register_model(meta_dict)
                        data = meta_dict
            except Exception as redis_err:
                logger.warning("Error fetching metadata from Redis for %s: %s", model_id, redis_err)

    if data:
        raw_path = str(data["model_path"]) if data.get("model_path") is not None else None
        m_id_val = str(data["model_id"]) if data.get("model_id") is not None else None
        j_id_val = str(data["job_id"]) if data.get("job_id") is not None else None
        resolved = resolve_model_binary_path(raw_path, model_id=m_id_val, job_id=j_id_val)
        if resolved and resolved != raw_path:
            data["model_path"] = resolved

    return data


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
        "model_id":           model_id,
        "job_id":             record.get("job_id"),
        "experiment_id":      record.get("experiment_id"),
        "algorithm":          record.get("algorithm", "Unknown"),
        "dataset_id":         record.get("dataset_id", ""),
        "problem_type":       record.get("problem_type", ""),
        "model_version":      record.get("model_version", ""),
        "dataset_version":    record.get("dataset_version", ""),
        "model_path":         record.get("model_path", ""),
        "metrics":            record.get("metrics", {}),
        "best_params":        record.get("best_params", {}),
        "pipeline_hash":      record.get("pipeline_hash", ""),
        "training_timestamp": record.get("training_timestamp", ""),
        "registered_at":      datetime.now(timezone.utc).isoformat(),
        # Sprint 5A lifecycle fields
        "version":     record.get("model_version") or record.get("version", "v1.0.0"),
        "status":      record.get("status", "ACTIVE"),
        "owner":       record.get("owner", "system"),
        "description": record.get("description", ""),
        "tags":        record.get("tags", []),
        "accuracy":    _extract_metric(record.get("metrics", {}), "accuracy"),
        "f1":          _extract_metric(record.get("metrics", {}), "f1_score"),
        "auc":         _extract_metric(record.get("metrics", {}), "roc_auc"),
        "promoted_at":    None,
        "archived_at":    None,
        "archive_reason": None,
        "deprecated_at":  None,
        # V5A: Semantic versioning + Model Family
        "semantic_version": record.get("semantic_version", ""),
        "model_family":     record.get("model_family", ""),
        # V5A: Embedded lineage reference (full record in lineage store)
        "lineage": record.get("lineage", {}),
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


def get_model_by_job_id(job_id: str) -> Optional[Dict[str, Any]]:
    """Return full metadata for the model registered from job_id, or None."""
    index = _load_index()
    for entry in index:
        if entry.get("job_id") == job_id:
            return _read_metadata(entry.get("model_id", "")) or entry
    sidecar = _find_sidecar_metadata(job_id)
    if sidecar:
        try:
            mid = register_model(sidecar)
            return _read_metadata(mid) or sidecar
        except Exception as exc:
            logger.warning("Failed to auto-register sidecar for job %s: %s", job_id, exc)
            return sidecar
    return None


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
        "model_id":        full_record.get("model_id"),
        "job_id":          full_record.get("job_id"),
        "experiment_id":   full_record.get("experiment_id"),
        "algorithm":       full_record.get("algorithm"),
        "dataset_id":      full_record.get("dataset_id"),
        "problem_type":    full_record.get("problem_type"),
        "model_version":   full_record.get("model_version"),
        "version":         full_record.get("version"),
        # V5A semantic versioning
        "semantic_version": full_record.get("semantic_version", ""),
        "model_family":     full_record.get("model_family", ""),
        "model_path":      full_record.get("model_path"),
        "registered_at":   full_record.get("registered_at"),
        "status":          full_record.get("status", "ACTIVE"),
        "owner":           full_record.get("owner", "system"),
        "tags":            full_record.get("tags", []),
        "promoted_at":     full_record.get("promoted_at"),
        "archived_at":     full_record.get("archived_at"),
        "metrics_summary": _metrics_summary(full_record.get("metrics", {})),
        "accuracy":        full_record.get("accuracy"),
        "f1":              full_record.get("f1"),
        "auc":             full_record.get("auc"),
    }
