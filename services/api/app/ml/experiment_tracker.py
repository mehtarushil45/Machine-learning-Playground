"""Experiment Tracker — Sprint 4 Module 4.7, extended Sprint 5A Part 2.

Stores complete experiment records (report + config + artifacts) on the
filesystem as JSON and provides retrieval functions.

Storage layout (relative to services/api/uploads/experiments/):
  <experiment_id>/
    experiment.json   — metadata stub
    config.json       — training configuration snapshot
    report.json       — training report (from training_report.py)

Sprint 4 Public API (unchanged):
  start_experiment(job_id, config)                     -> str
  save_experiment(experiment_id, report, model_id, model_path) -> None
  get_experiment(experiment_id)                        -> dict | None
  list_experiments(limit)                              -> List[dict]

Sprint 5A Extensions:
  search_experiments(query)                            -> List[dict]
  filter_experiments(status, algorithm, dataset_id,
                     problem_type, min_score, max_score,
                     from_date, to_date, tags)          -> List[dict]
  sort_experiments(experiments, sort_by, ascending)    -> List[dict]
  load_experiment(experiment_id)                       -> dict | None
  delete_experiment(experiment_id)                     -> bool
  list_recent(n)                                       -> List[dict]
  list_by_dataset(dataset_id, limit)                   -> List[dict]
  list_by_algorithm(algorithm, limit)                  -> List[dict]
  list_by_problem(problem_type, limit)                 -> List[dict]
"""

from __future__ import annotations

import json
import logging
import os
import shutil
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

logger = logging.getLogger("apex_ml.experiment_tracker")

# ---------------------------------------------------------------------------
# Storage root
# ---------------------------------------------------------------------------
_EXPERIMENTS_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "experiments")
)


# ---------------------------------------------------------------------------
# Internal I/O helpers
# ---------------------------------------------------------------------------

def _experiment_dir(experiment_id: str) -> str:
    return os.path.join(_EXPERIMENTS_ROOT, experiment_id)


def _write_json_atomic(path: str, data: Dict[str, Any]) -> None:
    """Write JSON atomically via tmp file + rename."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, default=str)
    os.replace(tmp_path, path)


def _read_json(path: str) -> Optional[Dict[str, Any]]:
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.error("Failed to read %s: %s", path, exc)
        return None


def _load_all_stubs() -> List[Dict[str, Any]]:
    """Scan the experiments directory and return all stub dicts."""
    if not os.path.exists(_EXPERIMENTS_ROOT):
        return []
    summaries: List[Dict[str, Any]] = []
    try:
        for entry in os.scandir(_EXPERIMENTS_ROOT):
            if entry.is_dir():
                stub = _read_json(os.path.join(entry.path, "experiment.json"))
                if stub:
                    summaries.append(stub)
    except Exception as exc:
        logger.error("Failed to scan experiments directory: %s", exc)
    return summaries


# ---------------------------------------------------------------------------
# Sprint 4 Public API — UNCHANGED SIGNATURES
# ---------------------------------------------------------------------------

def start_experiment(
    job_id: str,
    config: Dict[str, Any],
) -> str:
    """Create a new experiment stub and return its experiment_id."""
    experiment_id = str(uuid.uuid4())
    exp_dir = _experiment_dir(experiment_id)
    os.makedirs(exp_dir, exist_ok=True)

    stub: Dict[str, Any] = {
        "experiment_id": experiment_id,
        "job_id": job_id,
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "algorithm": config.get("algorithm", "Unknown"),
        "dataset_id": config.get("dataset_id", ""),
        "problem_type": None,
        "model_id": None,
        "model_path": None,
        "metrics_summary": {},
        "tags": config.get("tags", []),
    }

    _write_json_atomic(os.path.join(exp_dir, "experiment.json"), stub)
    _write_json_atomic(os.path.join(exp_dir, "config.json"), config)

    logger.info("Started experiment %s for job %s.", experiment_id, job_id)
    return experiment_id


def save_experiment(
    experiment_id: str,
    report: Dict[str, Any],
    model_id: str,
    model_path: str,
) -> None:
    """Update experiment stub with full report and mark as completed."""
    exp_dir = _experiment_dir(experiment_id)
    os.makedirs(exp_dir, exist_ok=True)

    _write_json_atomic(os.path.join(exp_dir, "report.json"), report)

    stub_path = os.path.join(exp_dir, "experiment.json")
    stub = _read_json(stub_path) or {}

    stub.update(
        {
            "experiment_id": experiment_id,
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "problem_type": report.get("problem_type"),
            "model_id": model_id,
            "model_path": model_path,
            "model_version": report.get("model_version"),
            "dataset_version": report.get("dataset_version"),
            "pipeline_hash": report.get("pipeline_hash"),
            "training_duration_seconds": report.get("training_duration_seconds"),
            "metrics_summary": _build_metrics_summary(report.get("metrics", {})),
            "cv_mean_score": _extract_cv_mean(report.get("cross_validation")),
            "hyperparameters": report.get("hyperparameters", {}),
            "top_features": _top_n_features(report.get("feature_importance", []), n=5),
        }
    )

    _write_json_atomic(stub_path, stub)
    logger.info("Saved experiment %s (model=%s).", experiment_id, model_id)


def get_experiment(experiment_id: str) -> Optional[Dict[str, Any]]:
    """Return the full experiment record including the training report."""
    exp_dir = _experiment_dir(experiment_id)
    stub = _read_json(os.path.join(exp_dir, "experiment.json"))
    if stub is None:
        return None
    stub["report"] = _read_json(os.path.join(exp_dir, "report.json"))
    stub["config"] = _read_json(os.path.join(exp_dir, "config.json"))
    return stub


def list_experiments(limit: int = 50) -> List[Dict[str, Any]]:
    """Return experiment summaries sorted newest-first."""
    stubs = _load_all_stubs()
    stubs.sort(key=lambda s: s.get("started_at", ""), reverse=True)
    return stubs[:limit]


# ---------------------------------------------------------------------------
# Sprint 5A Extensions
# ---------------------------------------------------------------------------

def search_experiments(query: str) -> List[Dict[str, Any]]:
    """Full-text search across algorithm, dataset_id, problem_type, job_id, status.

    Args:
        query: Case-insensitive substring to search for.

    Returns:
        List of matching experiment stubs, newest first.
    """
    if not query:
        return list_experiments()

    q = query.strip().lower()
    stubs = _load_all_stubs()
    _SEARCH_FIELDS = ("experiment_id", "job_id", "algorithm", "dataset_id",
                      "problem_type", "status", "model_id", "model_version")
    matched = []
    for stub in stubs:
        for field in _SEARCH_FIELDS:
            val = str(stub.get(field) or "").lower()
            if q in val:
                matched.append(stub)
                break

    matched.sort(key=lambda s: s.get("started_at", ""), reverse=True)
    return matched


def filter_experiments(
    status: Optional[str] = None,
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
    problem_type: Optional[str] = None,
    min_score: Optional[float] = None,
    max_score: Optional[float] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    tags: Optional[List[str]] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """Filter experiments by multiple criteria.

    All parameters are optional and are AND-combined.

    Args:
        status:       "running", "completed", "failed", etc.
        algorithm:    Case-insensitive algorithm name.
        dataset_id:   Exact match on dataset_id.
        problem_type: Case-insensitive problem type.
        min_score:    Minimum cv_mean_score (or best available metric).
        max_score:    Maximum cv_mean_score.
        from_date:    ISO-8601 started_at lower bound (inclusive).
        to_date:      ISO-8601 started_at upper bound (inclusive).
        tags:         All supplied tags must be present on the experiment.
        limit:        Page size.
        offset:       Page offset.

    Returns:
        Filtered and paginated experiment stubs, newest first.
    """
    stubs = _load_all_stubs()

    if status:
        stubs = [s for s in stubs if (s.get("status") or "").lower() == status.lower()]

    if algorithm:
        al = algorithm.strip().lower()
        stubs = [s for s in stubs if (s.get("algorithm") or "").lower() == al]

    if dataset_id:
        stubs = [s for s in stubs if s.get("dataset_id") == dataset_id]

    if problem_type:
        pt = problem_type.strip().lower()
        stubs = [s for s in stubs if (s.get("problem_type") or "").lower() == pt]

    if min_score is not None:
        stubs = [s for s in stubs if _primary_score(s) is not None and _primary_score(s) >= min_score]

    if max_score is not None:
        stubs = [s for s in stubs if _primary_score(s) is not None and _primary_score(s) <= max_score]

    if from_date:
        stubs = [s for s in stubs if (s.get("started_at") or "") >= from_date]

    if to_date:
        stubs = [s for s in stubs if (s.get("started_at") or "") <= to_date]

    if tags:
        for tag in tags:
            stubs = [s for s in stubs if tag in (s.get("tags") or [])]

    stubs.sort(key=lambda s: s.get("started_at", ""), reverse=True)
    return stubs[offset: offset + limit]


def sort_experiments(
    experiments: List[Dict[str, Any]],
    sort_by: str = "started_at",
    ascending: bool = False,
) -> List[Dict[str, Any]]:
    """Sort an experiment list by a specified field.

    Args:
        experiments: Any list of experiment stub dicts.
        sort_by:     Field name to sort by. Supports dotted paths for nested
                     fields, e.g. "metrics_summary.accuracy".
        ascending:   If True, sort ascending; else descending.

    Returns:
        Sorted copy of the list.
    """
    def _key(stub: Dict[str, Any]) -> Any:
        parts = sort_by.split(".")
        val: Any = stub
        for part in parts:
            if isinstance(val, dict):
                val = val.get(part)
            else:
                return None if not ascending else ""
        # None sorts last regardless of direction
        if val is None:
            return ("" if ascending else "\xff\xff")
        return val

    return sorted(experiments, key=_key, reverse=not ascending)


def load_experiment(experiment_id: str) -> Optional[Dict[str, Any]]:
    """Alias for get_experiment() — explicit name for clarity in 5A callers."""
    return get_experiment(experiment_id)


def delete_experiment(experiment_id: str) -> bool:
    """Permanently delete an experiment directory.

    Only FAILED or completed experiments may be deleted.  Running
    experiments are not deleted to prevent data loss.

    Args:
        experiment_id: Experiment to delete.

    Returns:
        True if deleted, False if not found.

    Raises:
        ValueError: If the experiment is still running.
    """
    exp_dir = _experiment_dir(experiment_id)
    if not os.path.exists(exp_dir):
        return False

    stub = _read_json(os.path.join(exp_dir, "experiment.json"))
    if stub and stub.get("status") == "running":
        raise ValueError(
            f"Cannot delete running experiment '{experiment_id}'. "
            "Wait for it to complete or fail first."
        )

    shutil.rmtree(exp_dir, ignore_errors=True)
    logger.info("Deleted experiment %s.", experiment_id)
    return True


def list_recent(n: int = 10) -> List[Dict[str, Any]]:
    """Return the N most recently started experiments.

    Args:
        n: How many experiments to return.

    Returns:
        List of experiment stubs, newest first.
    """
    return list_experiments(limit=n)


def list_by_dataset(dataset_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return experiments filtered by dataset_id, newest first.

    Args:
        dataset_id: Dataset identifier to filter on.
        limit:      Max number of results.

    Returns:
        List of experiment stubs.
    """
    return filter_experiments(dataset_id=dataset_id, limit=limit)


def list_by_algorithm(algorithm: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return experiments filtered by algorithm name, newest first.

    Args:
        algorithm: Algorithm name (case-insensitive).
        limit:     Max number of results.

    Returns:
        List of experiment stubs.
    """
    return filter_experiments(algorithm=algorithm, limit=limit)


def list_by_problem(problem_type: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return experiments filtered by problem type, newest first.

    Args:
        problem_type: Problem type string (case-insensitive).
        limit:        Max number of results.

    Returns:
        List of experiment stubs.
    """
    return filter_experiments(problem_type=problem_type, limit=limit)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _build_metrics_summary(metrics: Dict[str, Any]) -> Dict[str, Any]:
    return {
        k: round(float(v), 6)
        for k, v in metrics.items()
        if isinstance(v, (int, float)) and v is not None
    }


def _extract_cv_mean(cv: Optional[Dict[str, Any]]) -> Optional[float]:
    if cv is None:
        return None
    val = cv.get("mean_score")
    return round(float(val), 6) if isinstance(val, (int, float)) else None


def _top_n_features(
    importance_list: List[Dict[str, Any]], n: int = 5
) -> List[str]:
    sorted_list = sorted(
        importance_list, key=lambda x: x.get("rank", 9999)
    )
    return [entry["feature"] for entry in sorted_list[:n]]


def _primary_score(stub: Dict[str, Any]) -> Optional[float]:
    """Extract the best available scalar score from an experiment stub."""
    # Prefer CV mean score, then accuracy, then first metric
    cv = stub.get("cv_mean_score")
    if isinstance(cv, (int, float)):
        return float(cv)
    ms = stub.get("metrics_summary", {})
    for key in ("accuracy", "f1_score", "r2_score", "roc_auc"):
        val = ms.get(key)
        if isinstance(val, (int, float)):
            return float(val)
    return None
