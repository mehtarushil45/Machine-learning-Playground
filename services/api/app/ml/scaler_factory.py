"""Canonical feature-scaler registry for training pipelines."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Mapping

from sklearn.base import TransformerMixin
from sklearn.preprocessing import MaxAbsScaler, MinMaxScaler, Normalizer, RobustScaler, StandardScaler


class ScalerConfigurationError(ValueError):
    """Raised when a scaler key is not part of the public registry."""


@dataclass(frozen=True)
class ScalerDefinition:
    key: str
    display_name: str
    factory: Callable[[], TransformerMixin]


SCALER_REGISTRY: Mapping[str, ScalerDefinition] = {
    "standard_scaler": ScalerDefinition("standard_scaler", "StandardScaler", StandardScaler),
    "min_max_scaler": ScalerDefinition("min_max_scaler", "MinMaxScaler", MinMaxScaler),
    "robust_scaler": ScalerDefinition("robust_scaler", "RobustScaler", RobustScaler),
    "max_abs_scaler": ScalerDefinition("max_abs_scaler", "MaxAbsScaler", MaxAbsScaler),
    "normalizer": ScalerDefinition("normalizer", "Normalizer", Normalizer),
}


def get_scaler(key: str) -> TransformerMixin:
    """Create the exact scaler registered for *key*."""
    definition = SCALER_REGISTRY.get(key)
    if definition is None:
        raise ScalerConfigurationError(
            f"Unknown scaler '{key}'. Select one of the published training options."
        )
    return definition.factory()
