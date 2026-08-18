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


_std = ScalerDefinition("standard_scaler", "StandardScaler", StandardScaler)
_minmax = ScalerDefinition("min_max_scaler", "MinMaxScaler", MinMaxScaler)
_robust = ScalerDefinition("robust_scaler", "RobustScaler", RobustScaler)
_maxabs = ScalerDefinition("max_abs_scaler", "MaxAbsScaler", MaxAbsScaler)
_norm = ScalerDefinition("normalizer", "Normalizer", Normalizer)

SCALER_REGISTRY: Mapping[str, ScalerDefinition] = {
    "standard_scaler": _std,
    "min_max_scaler": _minmax,
    "robust_scaler": _robust,
    "max_abs_scaler": _maxabs,
    "normalizer": _norm,
}

SCALER_ALIASES = {
    "standard": "standard_scaler",
    "minmax": "min_max_scaler",
    "min_max": "min_max_scaler",
    "robust": "robust_scaler",
    "maxabs": "max_abs_scaler",
}


def get_scaler(key: str) -> TransformerMixin:
    """Create the exact scaler registered for *key*."""
    canonical_key = SCALER_ALIASES.get(key, key)
    definition = SCALER_REGISTRY.get(canonical_key)
    if definition is None:
        raise ScalerConfigurationError(
            f"Unknown scaler '{key}'. Select one of the published training options."
        )
    return definition.factory()
