"""Contract tests for every published training algorithm."""

from __future__ import annotations

import numpy as np
import pytest
from sklearn.datasets import make_classification, make_regression

from app.ml.algorithm_factory import ALGORITHM_REGISTRY, get_algorithm


@pytest.mark.parametrize(
    "key,definition",
    list(ALGORITHM_REGISTRY.items()),
    ids=list(ALGORITHM_REGISTRY),
)
def test_registered_algorithm_fits_and_predicts(key, definition):
    """Every option returned to the UI must train and predict successfully."""
    if definition.task_type == "classification":
        features, target = make_classification(
            n_samples=48,
            n_features=6,
            n_informative=4,
            n_redundant=0,
            random_state=42,
        )
    else:
        features, target = make_regression(
            n_samples=48,
            n_features=6,
            n_informative=4,
            noise=0.1,
            random_state=42,
        )

    estimator = get_algorithm(key, task_type=definition.task_type, random_state=42)
    predictions = estimator.fit(features, target).predict(features[:7])

    assert type(estimator).__name__
    assert isinstance(predictions, np.ndarray)
    assert predictions.shape == (7,)


def test_algorithm_rejects_a_target_task_mismatch():
    with pytest.raises(ValueError, match="classification algorithm"):
        get_algorithm("random_forest_classifier", task_type="regression")
