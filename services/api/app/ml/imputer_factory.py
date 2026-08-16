"""Canonical missing-value-imputer registry for training pipelines."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Mapping

from sklearn.impute import KNNImputer, SimpleImputer

CONSTANT_FILL_VALUE = 0.0
"""Numeric default used by the ``constant`` option so missing values remain explicit and reproducible."""


class ImputerConfigurationError(ValueError):
    """Raised when an imputer key is not part of the public registry."""


@dataclass(frozen=True)
class ImputerDefinition:
    key: str
    display_name: str
    factory: Callable[[], SimpleImputer | KNNImputer]


IMPUTER_REGISTRY: Mapping[str, ImputerDefinition] = {
    "mean": ImputerDefinition("mean", "Mean", lambda: SimpleImputer(strategy="mean")),
    "median": ImputerDefinition("median", "Median", lambda: SimpleImputer(strategy="median")),
    "most_frequent": ImputerDefinition(
        "most_frequent", "Most Frequent", lambda: SimpleImputer(strategy="most_frequent"),
    ),
    "constant": ImputerDefinition(
        "constant", "Constant", lambda: SimpleImputer(strategy="constant", fill_value=CONSTANT_FILL_VALUE),
    ),
    "knn_imputer": ImputerDefinition(
        "knn_imputer", "K-Nearest Neighbors Imputer", lambda: KNNImputer(n_neighbors=5),
    ),
}


def get_imputer(key: str) -> SimpleImputer | KNNImputer:
    """Create the exact imputer registered for *key*."""
    definition = IMPUTER_REGISTRY.get(key)
    if definition is None:
        raise ImputerConfigurationError(
            f"Unknown imputer '{key}'. Select one of the published training options."
        )
    return definition.factory()
