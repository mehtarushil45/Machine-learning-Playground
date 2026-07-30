"""Evaluation Metrics Service.

Computes production-grade evaluation metrics for Classification and Regression models.
"""

from typing import Any, Dict, Optional

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)


def evaluate_classification(
    y_true: Any, y_pred: Any, y_prob: Optional[Any] = None
) -> Dict[str, Optional[float]]:
    """Compute classification evaluation metrics."""
    acc = float(accuracy_score(y_true, y_pred))
    prec = float(precision_score(y_true, y_pred, average="weighted", zero_division=0))
    rec = float(recall_score(y_true, y_pred, average="weighted", zero_division=0))
    f1 = float(f1_score(y_true, y_pred, average="weighted", zero_division=0))

    roc_auc: Optional[float] = None
    if y_prob is not None:
        try:
            # Binary classification ROC AUC check
            unique_classes = np.unique(y_true)
            if len(unique_classes) == 2:
                if y_prob.ndim == 2:
                    y_prob_score = y_prob[:, 1]
                else:
                    y_prob_score = y_prob
                roc_auc = float(roc_auc_score(y_true, y_prob_score))
        except Exception:
            roc_auc = None

    return {
        "accuracy": round(acc, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1_score": round(f1, 4),
        "roc_auc": round(roc_auc, 4) if roc_auc is not None else None,
    }


def evaluate_regression(y_true: Any, y_pred: Any) -> Dict[str, float]:
    """Compute regression evaluation metrics."""
    mae = float(mean_absolute_error(y_true, y_pred))
    mse = float(mean_squared_error(y_true, y_pred))
    rmse = float(np.sqrt(mse))
    r2 = float(r2_score(y_true, y_pred))

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "r2_score": round(r2, 4),
    }


def compute_metrics(
    is_classification: bool, y_true: Any, y_pred: Any, y_prob: Optional[Any] = None
) -> Dict[str, Any]:
    """Universal metric computer router."""
    if is_classification:
        return evaluate_classification(y_true, y_pred, y_prob)
    return evaluate_regression(y_true, y_pred)
