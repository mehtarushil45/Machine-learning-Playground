"""Dataset Loader & Preprocessing Pipeline.

Loads CSV dataset, constructs scikit-learn ColumnTransformers and Pipelines,
and performs train/test splits.
"""

import os
from typing import Any, List, Tuple

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

UPLOADS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "api", "uploads")
)


def find_dataset_path(dataset_id: str) -> str:
    """Find CSV file path in uploads directory corresponding to dataset_id.

    Searches both the root upload directory and organisation-scoped subdirectories.

    Raises:
        FileNotFoundError: If no matching CSV dataset file is found for dataset_id.
    """
    if os.path.exists(dataset_id) and dataset_id.endswith(".csv"):
        return dataset_id

    if os.path.exists(UPLOADS_DIR):
        # 1. Search root upload directory
        for fname in os.listdir(UPLOADS_DIR):
            fpath = os.path.join(UPLOADS_DIR, fname)
            if os.path.isfile(fpath) and (dataset_id in fname and fname.endswith(".csv")):
                return fpath
            # 2. Search organisation-scoped subdirectories
            if os.path.isdir(fpath):
                for sub_fname in os.listdir(fpath):
                    if dataset_id in sub_fname and sub_fname.endswith(".csv"):
                        return os.path.join(fpath, sub_fname)

    raise FileNotFoundError(
        f"No dataset file found for dataset_id='{dataset_id}'. "
        "Please upload a valid CSV dataset before training."
    )


def load_and_preprocess_dataset(
    dataset_id: str,
    target_column: str,
    feature_columns: List[str],
    test_ratio: float = 0.2,
    random_seed: int = 42,
    use_scaling: bool = True,
) -> Tuple[Any, Any, Any, Any, ColumnTransformer, bool]:
    """Load dataset CSV, build preprocessing transformers, and return train/test splits.

    Raises:
        FileNotFoundError: If no matching CSV dataset file is found for dataset_id.
    """
    file_path = find_dataset_path(dataset_id)
    df = pd.read_csv(file_path)

    # Validate target and feature presence
    available_features = [col for col in feature_columns if col in df.columns]
    if not available_features:
        available_features = [col for col in df.columns if col != target_column]

    if target_column not in df.columns:
        target_column = df.columns[-1]

    X = df[available_features]
    y_raw = df[target_column]

    # Determine task type (Classification vs Regression)
    is_classification = False
    if y_raw.dtype == object or str(y_raw.dtype).startswith("cat") or len(np.unique(y_raw)) <= 5:
        is_classification = True

    if is_classification:
        y = y_raw.astype(str)
    else:
        y = pd.to_numeric(y_raw, errors="coerce").fillna(0.0)

    # Detect feature types
    numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = X.select_dtypes(include=["object", "category", "bool"]).columns.tolist()

    transformers = []
    if numeric_cols:
        num_steps: List[Tuple[str, Any]] = [("imputer", SimpleImputer(strategy="median"))]
        if use_scaling:
            num_steps.append(("scaler", StandardScaler()))
        transformers.append(("num", Pipeline(num_steps), numeric_cols))

    if categorical_cols:
        cat_steps: List[Tuple[str, Any]] = [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
        transformers.append(("cat", Pipeline(cat_steps), categorical_cols))

    preprocessor = ColumnTransformer(transformers=transformers)

    # Perform train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_ratio, random_state=random_seed
    )

    return X_train, X_test, y_train, y_test, preprocessor, is_classification
