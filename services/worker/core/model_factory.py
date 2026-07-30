"""Model Factory.

Instantiates scikit-learn estimator models for Classification and Regression tasks.
"""

from typing import Any

from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor


def create_model(algorithm: str, random_seed: int = 42) -> Any:
    """Instantiate a scikit-learn model estimator based on algorithm name."""
    algo_clean = algorithm.strip()

    # Classification Models
    if algo_clean in ("Random Forest Classifier", "Random Forest"):
        return RandomForestClassifier(n_estimators=100, random_state=random_seed)
    if algo_clean in ("Decision Tree Classifier", "Decision Tree"):
        return DecisionTreeClassifier(random_state=random_seed)
    if algo_clean in ("Logistic Regression",):
        return LogisticRegression(max_iter=1000, random_state=random_seed)
    if algo_clean in ("Gradient Boosting Classifier", "Gradient Boosting"):
        return GradientBoostingClassifier(random_state=random_seed)

    # Regression Models
    if algo_clean in ("Random Forest Regressor",):
        return RandomForestRegressor(n_estimators=100, random_state=random_seed)
    if algo_clean in ("Linear Regression",):
        return LinearRegression()
    if algo_clean in ("Decision Tree Regressor",):
        return DecisionTreeRegressor(random_state=random_seed)
    if algo_clean in ("Gradient Boosting Regressor",):
        return GradientBoostingRegressor(random_state=random_seed)

    # Default Fallback for Custom or Unrecognized Algorithms
    if "Regressor" in algo_clean or "Regression" in algo_clean:
        return RandomForestRegressor(n_estimators=100, random_state=random_seed)
    return RandomForestClassifier(n_estimators=100, random_state=random_seed)
