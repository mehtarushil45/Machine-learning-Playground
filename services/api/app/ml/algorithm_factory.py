"""Canonical training-algorithm registry.

This module is the sole place where ML Playground creates estimators for
training.  Each entry explicitly declares its task type so a regression model
can never be selected for a classification target (or vice versa) by accident.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Literal, Mapping

from lightgbm import LGBMClassifier, LGBMRegressor
from sklearn.base import BaseEstimator
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import (
    Lasso,
    LinearRegression,
    LogisticRegression,
    Ridge,
    RidgeClassifier,
)
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.svm import SVC, SVR
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from xgboost import XGBClassifier, XGBRegressor

TaskType = Literal["classification", "regression"]
EstimatorFactory = Callable[[int], BaseEstimator]


class AlgorithmConfigurationError(ValueError):
    """Raised when a requested algorithm key is not part of the public registry."""


class AlgorithmTaskMismatchError(ValueError):
    """Raised when an algorithm is incompatible with the detected target task."""


@dataclass(frozen=True)
class AlgorithmDefinition:
    """One selectable algorithm and its real estimator constructor."""

    key: str
    display_name: str
    task_type: TaskType
    factory: EstimatorFactory


ALGORITHM_REGISTRY: Mapping[str, AlgorithmDefinition] = {
    "random_forest_classifier": AlgorithmDefinition(
        "random_forest_classifier", "Random Forest Classifier", "classification",
        lambda seed: RandomForestClassifier(n_estimators=200, random_state=seed, n_jobs=-1),
    ),
    "logistic_regression": AlgorithmDefinition(
        "logistic_regression", "Logistic Regression", "classification",
        lambda seed: LogisticRegression(max_iter=1_000, random_state=seed),
    ),
    "decision_tree_classifier": AlgorithmDefinition(
        "decision_tree_classifier", "Decision Tree Classifier", "classification",
        lambda seed: DecisionTreeClassifier(random_state=seed),
    ),
    "k_nearest_neighbors_classifier": AlgorithmDefinition(
        "k_nearest_neighbors_classifier", "K-Nearest Neighbors Classifier", "classification",
        lambda _seed: KNeighborsClassifier(n_neighbors=5),
    ),
    "support_vector_classifier": AlgorithmDefinition(
        "support_vector_classifier", "Support Vector Classifier (SVC)", "classification",
        lambda seed: CalibratedClassifierCV(SVC(random_state=seed), ensemble=False),
    ),
    "gradient_boosting_classifier": AlgorithmDefinition(
        "gradient_boosting_classifier", "Gradient Boosting Classifier", "classification",
        lambda seed: GradientBoostingClassifier(random_state=seed),
    ),
    "xgboost_classifier": AlgorithmDefinition(
        "xgboost_classifier", "XGBoost Classifier", "classification",
        lambda seed: XGBClassifier(
            n_estimators=200, learning_rate=0.05, max_depth=6, random_state=seed,
            eval_metric="logloss", n_jobs=1,
        ),
    ),
    "lightgbm_classifier": AlgorithmDefinition(
        "lightgbm_classifier", "LightGBM Classifier", "classification",
        lambda seed: LGBMClassifier(
            n_estimators=200, learning_rate=0.05, random_state=seed, n_jobs=1, verbosity=-1,
        ),
    ),
    "gaussian_nb": AlgorithmDefinition(
        "gaussian_nb", "Naive Bayes (GaussianNB)", "classification",
        lambda _seed: GaussianNB(),
    ),
    "ridge_classifier": AlgorithmDefinition(
        "ridge_classifier", "Ridge Classifier", "classification",
        lambda seed: RidgeClassifier(random_state=seed),
    ),
    "random_forest_regressor": AlgorithmDefinition(
        "random_forest_regressor", "Random Forest Regressor", "regression",
        lambda seed: RandomForestRegressor(n_estimators=200, random_state=seed, n_jobs=-1),
    ),
    "linear_regression": AlgorithmDefinition(
        "linear_regression", "Linear Regression", "regression",
        lambda _seed: LinearRegression(),
    ),
    "decision_tree_regressor": AlgorithmDefinition(
        "decision_tree_regressor", "Decision Tree Regressor", "regression",
        lambda seed: DecisionTreeRegressor(random_state=seed),
    ),
    "k_nearest_neighbors_regressor": AlgorithmDefinition(
        "k_nearest_neighbors_regressor", "K-Nearest Neighbors Regressor", "regression",
        lambda _seed: KNeighborsRegressor(n_neighbors=5),
    ),
    "support_vector_regressor": AlgorithmDefinition(
        "support_vector_regressor", "Support Vector Regressor (SVR)", "regression",
        lambda _seed: SVR(),
    ),
    "gradient_boosting_regressor": AlgorithmDefinition(
        "gradient_boosting_regressor", "Gradient Boosting Regressor", "regression",
        lambda seed: GradientBoostingRegressor(random_state=seed),
    ),
    "xgboost_regressor": AlgorithmDefinition(
        "xgboost_regressor", "XGBoost Regressor", "regression",
        lambda seed: XGBRegressor(
            n_estimators=200, learning_rate=0.05, max_depth=6, random_state=seed, n_jobs=1,
        ),
    ),
    "lightgbm_regressor": AlgorithmDefinition(
        "lightgbm_regressor", "LightGBM Regressor", "regression",
        lambda seed: LGBMRegressor(
            n_estimators=200, learning_rate=0.05, random_state=seed, n_jobs=1, verbosity=-1,
        ),
    ),
    "ridge_regressor": AlgorithmDefinition(
        "ridge_regressor", "Ridge Regressor", "regression",
        lambda seed: Ridge(random_state=seed),
    ),
    "lasso_regressor": AlgorithmDefinition(
        "lasso_regressor", "Lasso Regressor", "regression",
        lambda seed: Lasso(random_state=seed),
    ),
}


def get_algorithm(key: str, task_type: TaskType, random_state: int = 42) -> BaseEstimator:
    """Create the exact estimator registered for *key* after task validation."""
    definition = ALGORITHM_REGISTRY.get(key)
    if definition is None:
        raise AlgorithmConfigurationError(
            f"Unknown algorithm '{key}'. Select one of the published training options."
        )
    if definition.task_type != task_type:
        raise AlgorithmTaskMismatchError(
            f"'{definition.display_name}' is a {definition.task_type} algorithm, but the "
            f"selected target requires {task_type}. Choose a compatible algorithm."
        )
    return definition.factory(random_state)
