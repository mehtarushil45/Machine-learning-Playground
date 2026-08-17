"""Canonical training-algorithm registry and catalog.

This module is the single source of truth for all ML algorithms in the platform.
Each entry explicitly declares its task type, algorithmic category, capability
flags, expected computational cost, default hyperparameters, resource constraints,
and runtime dependency availability.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import importlib.util
import logging
from typing import Any, Callable, Literal, Mapping

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

logger = logging.getLogger("apex_ml.algorithm_factory")

TaskType = Literal["classification", "regression"]
AlgorithmCategory = Literal["baseline", "linear", "tree", "boosting", "distance", "kernel", "naive_bayes"]
CostTier = Literal["low", "medium", "high"]
RecommendationTier = Literal["screening_default", "verification_only", "manual_only"]
EstimatorFactory = Callable[[int], BaseEstimator]


class AlgorithmConfigurationError(ValueError):
    """Raised when a requested algorithm key is unknown or unavailable."""


class AlgorithmTaskMismatchError(ValueError):
    """Raised when an algorithm is incompatible with the detected target task."""


def is_package_available(package_name: str) -> bool:
    """Check if an optional package is importable in the current environment."""
    try:
        spec = importlib.util.find_spec(package_name)
        return spec is not None
    except Exception:
        return False


def _create_xgboost_classifier(seed: int) -> BaseEstimator:
    if not is_package_available("xgboost"):
        raise AlgorithmConfigurationError(
            "XGBoost is not installed in the environment. Install 'xgboost' to use this algorithm."
        )
    from xgboost import XGBClassifier

    return XGBClassifier(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=6,
        random_state=seed,
        eval_metric="logloss",
        n_jobs=1,
    )


def _create_xgboost_regressor(seed: int) -> BaseEstimator:
    if not is_package_available("xgboost"):
        raise AlgorithmConfigurationError(
            "XGBoost is not installed in the environment. Install 'xgboost' to use this algorithm."
        )
    from xgboost import XGBRegressor

    return XGBRegressor(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=6,
        random_state=seed,
        n_jobs=1,
    )


def _create_lightgbm_classifier(seed: int) -> BaseEstimator:
    if not is_package_available("lightgbm"):
        raise AlgorithmConfigurationError(
            "LightGBM is not installed in the environment. Install 'lightgbm' to use this algorithm."
        )
    from lightgbm import LGBMClassifier

    return LGBMClassifier(
        n_estimators=200,
        learning_rate=0.05,
        random_state=seed,
        n_jobs=1,
        verbosity=-1,
    )


def _create_lightgbm_regressor(seed: int) -> BaseEstimator:
    if not is_package_available("lightgbm"):
        raise AlgorithmConfigurationError(
            "LightGBM is not installed in the environment. Install 'lightgbm' to use this algorithm."
        )
    from lightgbm import LGBMRegressor

    return LGBMRegressor(
        n_estimators=200,
        learning_rate=0.05,
        random_state=seed,
        n_jobs=1,
        verbosity=-1,
    )


@dataclass(frozen=True)
class AlgorithmDefinition:
    """One selectable algorithm with real estimator constructor and catalog metadata."""

    key: str
    display_name: str
    task_type: TaskType
    factory: EstimatorFactory
    category: AlgorithmCategory = "tree"
    supports_sparse_input: bool = True
    supports_missing_values: bool = False
    supports_multiclass: bool = True
    expected_cost: CostTier = "medium"
    default_hyperparameters: dict[str, Any] = field(default_factory=dict)
    recommendation_tier: RecommendationTier = "screening_default"
    max_safe_rows: int | None = None
    dependency_package: str | None = None

    @property
    def id(self) -> str:
        """Alias for key to support standard API naming conventions."""
        return self.key


ALGORITHM_REGISTRY: Mapping[str, AlgorithmDefinition] = {
    # ── Classification (10) ───────────────────────────────────────────────────
    "random_forest_classifier": AlgorithmDefinition(
        key="random_forest_classifier",
        display_name="Random Forest Classifier",
        task_type="classification",
        factory=lambda seed: RandomForestClassifier(n_estimators=200, random_state=seed, n_jobs=-1),
        category="tree",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=True,
        expected_cost="medium",
        default_hyperparameters={"n_estimators": 200, "max_depth": None, "criterion": "gini"},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package=None,
    ),
    "logistic_regression": AlgorithmDefinition(
        key="logistic_regression",
        display_name="Logistic Regression",
        task_type="classification",
        factory=lambda seed: LogisticRegression(max_iter=1_000, random_state=seed),
        category="linear",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=True,
        expected_cost="low",
        default_hyperparameters={"max_iter": 1000, "C": 1.0, "penalty": "l2"},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package=None,
    ),
    "decision_tree_classifier": AlgorithmDefinition(
        key="decision_tree_classifier",
        display_name="Decision Tree Classifier",
        task_type="classification",
        factory=lambda seed: DecisionTreeClassifier(random_state=seed),
        category="tree",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=True,
        expected_cost="low",
        default_hyperparameters={"max_depth": None, "criterion": "gini", "min_samples_split": 2},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package=None,
    ),
    "k_nearest_neighbors_classifier": AlgorithmDefinition(
        key="k_nearest_neighbors_classifier",
        display_name="K-Nearest Neighbors Classifier",
        task_type="classification",
        factory=lambda _seed: KNeighborsClassifier(n_neighbors=5),
        category="distance",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=True,
        expected_cost="high",
        default_hyperparameters={"n_neighbors": 5, "weights": "uniform", "metric": "minkowski"},
        recommendation_tier="verification_only",
        max_safe_rows=5_000,  # O(N^2) distance computation
        dependency_package=None,
    ),
    "support_vector_classifier": AlgorithmDefinition(
        key="support_vector_classifier",
        display_name="Support Vector Classifier (SVC)",
        task_type="classification",
        factory=lambda seed: CalibratedClassifierCV(SVC(random_state=seed), ensemble=False),
        category="kernel",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=True,
        expected_cost="high",
        default_hyperparameters={"C": 1.0, "kernel": "rbf", "gamma": "scale"},
        recommendation_tier="verification_only",
        max_safe_rows=5_000,  # O(N^3) quadratic/cubic kernel solver
        dependency_package=None,
    ),
    "gradient_boosting_classifier": AlgorithmDefinition(
        key="gradient_boosting_classifier",
        display_name="Gradient Boosting Classifier",
        task_type="classification",
        factory=lambda seed: GradientBoostingClassifier(random_state=seed),
        category="boosting",
        supports_sparse_input=False,
        supports_missing_values=False,
        supports_multiclass=True,
        expected_cost="high",
        default_hyperparameters={"n_estimators": 100, "learning_rate": 0.1, "max_depth": 3},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package=None,
    ),
    "xgboost_classifier": AlgorithmDefinition(
        key="xgboost_classifier",
        display_name="XGBoost Classifier",
        task_type="classification",
        factory=_create_xgboost_classifier,
        category="boosting",
        supports_sparse_input=True,
        supports_missing_values=True,
        supports_multiclass=True,
        expected_cost="medium",
        default_hyperparameters={"n_estimators": 200, "learning_rate": 0.05, "max_depth": 6},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package="xgboost",
    ),
    "lightgbm_classifier": AlgorithmDefinition(
        key="lightgbm_classifier",
        display_name="LightGBM Classifier",
        task_type="classification",
        factory=_create_lightgbm_classifier,
        category="boosting",
        supports_sparse_input=True,
        supports_missing_values=True,
        supports_multiclass=True,
        expected_cost="low",
        default_hyperparameters={"n_estimators": 200, "learning_rate": 0.05, "max_depth": -1},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package="lightgbm",
    ),
    "gaussian_nb": AlgorithmDefinition(
        key="gaussian_nb",
        display_name="Naive Bayes (GaussianNB)",
        task_type="classification",
        factory=lambda _seed: GaussianNB(),
        category="naive_bayes",
        supports_sparse_input=False,
        supports_missing_values=False,
        supports_multiclass=True,
        expected_cost="low",
        default_hyperparameters={"var_smoothing": 1e-9},
        recommendation_tier="screening_default",
        max_safe_rows=None,  # O(N*D) linear time - safe on large datasets
        dependency_package=None,
    ),
    "ridge_classifier": AlgorithmDefinition(
        key="ridge_classifier",
        display_name="Ridge Classifier",
        task_type="classification",
        factory=lambda seed: RidgeClassifier(random_state=seed),
        category="linear",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=True,
        expected_cost="low",
        default_hyperparameters={"alpha": 1.0},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package=None,
    ),
    # ── Regression (10) ───────────────────────────────────────────────────────
    "random_forest_regressor": AlgorithmDefinition(
        key="random_forest_regressor",
        display_name="Random Forest Regressor",
        task_type="regression",
        factory=lambda seed: RandomForestRegressor(n_estimators=200, random_state=seed, n_jobs=-1),
        category="tree",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=False,
        expected_cost="medium",
        default_hyperparameters={"n_estimators": 200, "max_depth": None, "criterion": "squared_error"},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package=None,
    ),
    "linear_regression": AlgorithmDefinition(
        key="linear_regression",
        display_name="Linear Regression",
        task_type="regression",
        factory=lambda _seed: LinearRegression(),
        category="baseline",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=False,
        expected_cost="low",
        default_hyperparameters={"fit_intercept": True},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package=None,
    ),
    "decision_tree_regressor": AlgorithmDefinition(
        key="decision_tree_regressor",
        display_name="Decision Tree Regressor",
        task_type="regression",
        factory=lambda seed: DecisionTreeRegressor(random_state=seed),
        category="tree",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=False,
        expected_cost="low",
        default_hyperparameters={"max_depth": None, "criterion": "squared_error", "min_samples_split": 2},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package=None,
    ),
    "k_nearest_neighbors_regressor": AlgorithmDefinition(
        key="k_nearest_neighbors_regressor",
        display_name="K-Nearest Neighbors Regressor",
        task_type="regression",
        factory=lambda _seed: KNeighborsRegressor(n_neighbors=5),
        category="distance",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=False,
        expected_cost="high",
        default_hyperparameters={"n_neighbors": 5, "weights": "uniform", "metric": "minkowski"},
        recommendation_tier="verification_only",
        max_safe_rows=5_000,  # O(N^2) distance computation
        dependency_package=None,
    ),
    "support_vector_regressor": AlgorithmDefinition(
        key="support_vector_regressor",
        display_name="Support Vector Regressor (SVR)",
        task_type="regression",
        factory=lambda _seed: SVR(),
        category="kernel",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=False,
        expected_cost="high",
        default_hyperparameters={"C": 1.0, "kernel": "rbf", "gamma": "scale", "epsilon": 0.1},
        recommendation_tier="verification_only",
        max_safe_rows=5_000,  # O(N^3) kernel solver
        dependency_package=None,
    ),
    "gradient_boosting_regressor": AlgorithmDefinition(
        key="gradient_boosting_regressor",
        display_name="Gradient Boosting Regressor",
        task_type="regression",
        factory=lambda seed: GradientBoostingRegressor(random_state=seed),
        category="boosting",
        supports_sparse_input=False,
        supports_missing_values=False,
        supports_multiclass=False,
        expected_cost="high",
        default_hyperparameters={"n_estimators": 100, "learning_rate": 0.1, "max_depth": 3},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package=None,
    ),
    "xgboost_regressor": AlgorithmDefinition(
        key="xgboost_regressor",
        display_name="XGBoost Regressor",
        task_type="regression",
        factory=_create_xgboost_regressor,
        category="boosting",
        supports_sparse_input=True,
        supports_missing_values=True,
        supports_multiclass=False,
        expected_cost="medium",
        default_hyperparameters={"n_estimators": 200, "learning_rate": 0.05, "max_depth": 6},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package="xgboost",
    ),
    "lightgbm_regressor": AlgorithmDefinition(
        key="lightgbm_regressor",
        display_name="LightGBM Regressor",
        task_type="regression",
        factory=_create_lightgbm_regressor,
        category="boosting",
        supports_sparse_input=True,
        supports_missing_values=True,
        supports_multiclass=False,
        expected_cost="low",
        default_hyperparameters={"n_estimators": 200, "learning_rate": 0.05, "max_depth": -1},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package="lightgbm",
    ),
    "ridge_regressor": AlgorithmDefinition(
        key="ridge_regressor",
        display_name="Ridge Regressor",
        task_type="regression",
        factory=lambda seed: Ridge(random_state=seed),
        category="linear",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=False,
        expected_cost="low",
        default_hyperparameters={"alpha": 1.0},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package=None,
    ),
    "lasso_regressor": AlgorithmDefinition(
        key="lasso_regressor",
        display_name="Lasso Regressor",
        task_type="regression",
        factory=lambda seed: Lasso(random_state=seed),
        category="linear",
        supports_sparse_input=True,
        supports_missing_values=False,
        supports_multiclass=False,
        expected_cost="low",
        default_hyperparameters={"alpha": 1.0},
        recommendation_tier="screening_default",
        max_safe_rows=None,
        dependency_package=None,
    ),
}


def get_supported_algorithms_catalog() -> list[dict[str, Any]]:
    """Return the complete metadata catalog for all 20 algorithms with runtime availability."""
    catalog: list[dict[str, Any]] = []

    for key, defn in ALGORITHM_REGISTRY.items():
        is_avail = True
        unavailable_reason: str | None = None

        if defn.dependency_package:
            is_avail = is_package_available(defn.dependency_package)
            if not is_avail:
                unavailable_reason = (
                    f"Optional package '{defn.dependency_package}' is not installed in the environment."
                )

        catalog.append(
            {
                "id": defn.key,
                "key": defn.key,
                "display_name": defn.display_name,
                "task_type": defn.task_type,
                "category": defn.category,
                "supports_sparse_input": defn.supports_sparse_input,
                "supports_missing_values": defn.supports_missing_values,
                "supports_multiclass": defn.supports_multiclass,
                "expected_cost": defn.expected_cost,
                "default_hyperparameters": defn.default_hyperparameters,
                "recommendation_tier": defn.recommendation_tier,
                "max_safe_rows": defn.max_safe_rows,
                "is_available": is_avail,
                "unavailable_reason": unavailable_reason,
            }
        )

    return catalog


def get_algorithm(key: str, task_type: TaskType, random_state: int = 42) -> BaseEstimator:
    """Create the exact estimator registered for *key* after task and availability validation."""
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
    if definition.dependency_package and not is_package_available(definition.dependency_package):
        raise AlgorithmConfigurationError(
            f"Algorithm '{definition.display_name}' requires '{definition.dependency_package}' which is not installed."
        )
    return definition.factory(random_state)
