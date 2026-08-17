"""Deterministic recommendation cache-key generator.

Computes a canonical SHA-256 fingerprint representing the exact dataset state,
target variable, selected features, task definition, metric, split policy,
cross-validation folds, random seed, user constraints, and engine versions.

Semantically identical requests produce identical cache keys regardless of
dictionary key insertion order or feature column order. Any change to data,
target, features, constraints, or engine versions yields a distinct cache key.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Optional, Sequence

from app.config import settings


def normalize_cache_payload(
    dataset_content_hash: str,
    target_column: str,
    feature_columns: Optional[Sequence[str]] = None,
    task_type: str = "classification",
    metric: Optional[str] = None,
    split_strategy: str = "stratified_k_fold",
    train_test_split: float = 0.8,
    cv_folds: int = 5,
    random_seed: int = 42,
    max_training_seconds: Optional[int] = 120,
    prefer_interpretable: bool = False,
    engine_version: Optional[str] = None,
    registry_version: Optional[str] = None,
    preprocessor_version: Optional[str] = None,
    resource_policy_version: str = "1.0.0",
) -> dict[str, Any]:
    """Assemble a canonical normalized dictionary of all configuration parameters.

    Documented Exclusions:
      - Client IP, user agent, transient session tokens, and request timestamps
        are deliberately excluded because they do not alter the mathematical,
        algorithmic, or data-driven recommendation output.
    """
    clean_target = str(target_column).strip()
    clean_features: list[str] = []
    if feature_columns is not None:
        clean_features = sorted({str(c).strip() for c in feature_columns if str(c).strip() and str(c).strip() != clean_target})

    norm_split = round(float(train_test_split), 4) if train_test_split is not None else 0.8
    norm_metric = str(metric).strip().lower() if metric else "auto"

    return {
        "engine_version": str(engine_version or settings.recommendation_engine_version),
        "registry_version": str(registry_version or settings.algorithm_registry_version),
        "preprocessor_version": str(preprocessor_version or settings.preprocessor_version),
        "resource_policy_version": str(resource_policy_version),
        "dataset_content_hash": str(dataset_content_hash).strip(),
        "target_column": clean_target,
        "feature_columns": clean_features,
        "task_type": str(task_type).strip().lower(),
        "metric": norm_metric,
        "split_strategy": str(split_strategy).strip().lower(),
        "train_test_split": norm_split,
        "cv_folds": int(cv_folds),
        "random_seed": int(random_seed),
        "max_training_seconds": int(max_training_seconds) if max_training_seconds is not None else None,
        "prefer_interpretable": bool(prefer_interpretable),
    }


def compute_recommendation_cache_key(
    dataset_content_hash: str,
    target_column: str,
    feature_columns: Optional[Sequence[str]] = None,
    task_type: str = "classification",
    metric: Optional[str] = None,
    split_strategy: str = "stratified_k_fold",
    train_test_split: float = 0.8,
    cv_folds: int = 5,
    random_seed: int = 42,
    max_training_seconds: Optional[int] = 120,
    prefer_interpretable: bool = False,
    engine_version: Optional[str] = None,
    registry_version: Optional[str] = None,
    preprocessor_version: Optional[str] = None,
    resource_policy_version: str = "1.0.0",
) -> str:
    """Generate a deterministic 64-character SHA-256 hexadecimal cache key."""
    payload = normalize_cache_payload(
        dataset_content_hash=dataset_content_hash,
        target_column=target_column,
        feature_columns=feature_columns,
        task_type=task_type,
        metric=metric,
        split_strategy=split_strategy,
        train_test_split=train_test_split,
        cv_folds=cv_folds,
        random_seed=random_seed,
        max_training_seconds=max_training_seconds,
        prefer_interpretable=prefer_interpretable,
        engine_version=engine_version,
        registry_version=registry_version,
        preprocessor_version=preprocessor_version,
        resource_policy_version=resource_policy_version,
    )

    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
