"""Model Serialization Service.

Serializes scikit-learn model pipelines using joblib and writes metadata JSON files.
"""

from datetime import datetime, timezone
import json
import os
import re
from typing import Any, Dict

import joblib

MODELS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "api", "uploads", "models")
)


def ensure_models_dir() -> str:
    """Ensure destination directory for serialized models exists."""
    os.makedirs(MODELS_DIR, exist_ok=True)
    return MODELS_DIR


def save_trained_model(
    job_id: str,
    dataset_id: str,
    algorithm: str,
    model_pipeline: Any,
    metrics: Dict[str, Any],
    feature_columns: list[str],
    target_column: str,
) -> Dict[str, Any]:
    """Serialize model pipeline to joblib binary file and write metadata JSON file."""
    output_dir = ensure_models_dir()
    algo_clean = re.sub(r"[^\w\.-]", "_", algorithm.strip().lower())

    filename = f"{job_id}_{algo_clean}.joblib"
    model_path = os.path.join(output_dir, filename)

    # 1. Save binary model pipeline
    joblib.dump(model_pipeline, model_path)

    # 2. Prepare metadata
    created_at = datetime.now(timezone.utc).isoformat()
    metadata: Dict[str, Any] = {
        "model_id": f"model-{job_id[:8]}",
        "job_id": job_id,
        "dataset_id": dataset_id,
        "algorithm": algorithm,
        "target_column": target_column,
        "feature_columns": feature_columns,
        "created_at": created_at,
        "filename": filename,
        "metrics": metrics,
        "model_path": model_path,
    }

    metadata_path = os.path.join(output_dir, f"{job_id}_metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return metadata
