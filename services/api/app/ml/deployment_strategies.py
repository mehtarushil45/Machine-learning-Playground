"""Deployment Strategies — Version 6A.

Pure configuration module. Zero I/O, zero external dependencies.

Defines architecture and configuration for three deployment strategies:

1. BLUE_GREEN — Atomic traffic switch between two identical slots.
2. CANARY     — Incremental traffic migration through defined percentage stages.
3. ROLLING    — Sequential replica replacement with per-batch health checks.

Manual advancement only.
No Kubernetes, no Docker, no network I/O.

Public API
----------
``STRATEGY_NAMES``                frozenset of valid strategy name strings.
``get_strategy_schema(name)``     Required + optional config field definitions.
``validate_strategy_config(name, config)``  Raises ValueError on invalid config.
``build_strategy_config(name, model_id, **kwargs)``  Config dict with defaults.
``get_rollback_target(name, config)``  Returns model_id to roll back to.
``advance_canary(config)``        Pure function: returns next-stage config.
``record_rolling_batch(config, batch_updated)``  Pure function: updated config.
``get_strategy_summary(name, config)``  Human-readable summary dict.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("apex_ml.deployment_strategies")

# ---------------------------------------------------------------------------
# Strategy names
# ---------------------------------------------------------------------------

STRATEGY_NAMES: frozenset = frozenset({"BLUE_GREEN", "CANARY", "ROLLING"})

# ---------------------------------------------------------------------------
# Default canary stages
# ---------------------------------------------------------------------------

_DEFAULT_CANARY_STAGES: List[int] = [5, 25, 50, 75, 100]

# ---------------------------------------------------------------------------
# Schema definitions
# ---------------------------------------------------------------------------

_SCHEMAS: Dict[str, Dict[str, Any]] = {
    "BLUE_GREEN": {
        "description": (
            "Atomic traffic switch between two identical slots (Blue = current, "
            "Green = candidate). Rollback = switch back to prior slot."
        ),
        "required": ["model_id"],
        "optional": {
            "blue_model_id":    {"type": "str",   "description": "Model ID serving Blue slot (current stable)"},
            "green_model_id":   {"type": "str",   "description": "Model ID serving Green slot (candidate)"},
            "active_slot":      {"type": "str",   "default": "BLUE", "values": ["BLUE", "GREEN"]},
            "traffic_split":    {"type": "dict",  "default": {"blue": 100, "green": 0}},
            "rollback_slot":    {"type": "str",   "default": "BLUE", "values": ["BLUE", "GREEN"]},
            "health_check_path":{"type": "str",   "default": "/health"},
            "cutover_at":       {"type": "str",   "default": None},
        },
    },
    "CANARY": {
        "description": (
            "Incremental traffic migration. Base (stable) receives "
            "(100 - canary_pct)% traffic; Canary (new) receives canary_pct%. "
            "Manual stage advancement only."
        ),
        "required": ["model_id"],
        "optional": {
            "base_model_id":    {"type": "str",   "description": "Current stable model ID"},
            "canary_model_id":  {"type": "str",   "description": "New model under evaluation"},
            "traffic_stages":   {"type": "list",  "default": _DEFAULT_CANARY_STAGES,
                                 "description": "Ordered list of canary traffic percentages (must end at 100)"},
            "current_stage_index": {"type": "int", "default": 0},
            "current_canary_pct":  {"type": "int", "default": 5},
            "base_traffic_pct":    {"type": "int", "default": 95},
            "rollback_threshold":  {"type": "float", "default": None,
                                    "description": "Error rate threshold above which a warning is flagged"},
        },
    },
    "ROLLING": {
        "description": (
            "Sequential replica replacement. Each batch is validated before "
            "the next proceeds. Zero-downtime when max_unavailable is 0."
        ),
        "required": ["model_id", "total_replicas"],
        "optional": {
            "old_model_id":              {"type": "str",   "description": "Replicas still on old model"},
            "new_model_id":              {"type": "str",   "description": "Replicas updated to new model"},
            "updated_replicas":          {"type": "int",   "default": 0},
            "batch_size":                {"type": "int",   "default": 1},
            "max_surge":                 {"type": "int",   "default": 1},
            "max_unavailable":           {"type": "int",   "default": 0},
            "health_check_path":         {"type": "str",   "default": "/health"},
            "health_check_period_secs":  {"type": "int",   "default": 30},
            "rollback_on_failure":       {"type": "bool",  "default": True},
        },
    },
}


def get_strategy_schema(strategy_name: str) -> Dict[str, Any]:
    """Return the full schema definition for a strategy.

    Args:
        strategy_name: One of ``BLUE_GREEN``, ``CANARY``, ``ROLLING``.

    Returns:
        Schema dict with keys: ``description``, ``required``, ``optional``.

    Raises:
        ValueError: If strategy_name is not recognised.
    """
    name = strategy_name.strip().upper()
    if name not in STRATEGY_NAMES:
        raise ValueError(
            f"Unknown deployment strategy '{strategy_name}'. "
            f"Valid strategies: {sorted(STRATEGY_NAMES)}"
        )
    return dict(_SCHEMAS[name])


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_strategy_config(strategy_name: str, config: Dict[str, Any]) -> None:
    """Validate a strategy configuration dict.

    Args:
        strategy_name: Strategy identifier.
        config:        Configuration dict to validate.

    Raises:
        ValueError: On validation failure with a descriptive message.
    """
    name = strategy_name.strip().upper()
    if name not in STRATEGY_NAMES:
        raise ValueError(f"Unknown strategy '{strategy_name}'.")

    if name == "BLUE_GREEN":
        _validate_blue_green(config)
    elif name == "CANARY":
        _validate_canary(config)
    elif name == "ROLLING":
        _validate_rolling(config)


def _validate_blue_green(config: Dict[str, Any]) -> None:
    split = config.get("traffic_split")
    if split is not None:
        if not isinstance(split, dict):
            raise ValueError("'traffic_split' must be a dict with 'blue' and 'green' keys.")
        total = split.get("blue", 0) + split.get("green", 0)
        if total != 100:
            raise ValueError(
                f"'traffic_split' values must sum to 100. Got {total}."
            )
    slot = config.get("active_slot", "BLUE")
    if slot not in {"BLUE", "GREEN"}:
        raise ValueError(f"'active_slot' must be 'BLUE' or 'GREEN'. Got '{slot}'.")


def _validate_canary(config: Dict[str, Any]) -> None:
    stages = config.get("traffic_stages", _DEFAULT_CANARY_STAGES)
    if not stages or not all(isinstance(s, int) for s in stages):
        raise ValueError("'traffic_stages' must be a non-empty list of integers.")
    if stages[-1] != 100:
        raise ValueError(
            f"'traffic_stages' must end at 100 (full canary). Got last stage: {stages[-1]}."
        )
    if any(stages[i] >= stages[i + 1] for i in range(len(stages) - 1)):
        raise ValueError("'traffic_stages' must be strictly monotonically increasing.")

    threshold = config.get("rollback_threshold")
    if threshold is not None and not (0.0 < threshold < 1.0):
        raise ValueError(
            f"'rollback_threshold' must be a float between 0.0 and 1.0. Got {threshold}."
        )


def _validate_rolling(config: Dict[str, Any]) -> None:
    total = config.get("total_replicas")
    if total is None:
        raise ValueError("'total_replicas' is required for ROLLING strategy.")
    if not isinstance(total, int) or total < 1:
        raise ValueError(f"'total_replicas' must be a positive integer. Got {total}.")

    max_surge = config.get("max_surge", 1)
    max_unavail = config.get("max_unavailable", 0)
    if max_surge < 0:
        raise ValueError(f"'max_surge' must be >= 0. Got {max_surge}.")
    if max_unavail < 0:
        raise ValueError(f"'max_unavailable' must be >= 0. Got {max_unavail}.")
    if max_surge == 0 and max_unavail == 0:
        raise ValueError(
            "At least one of 'max_surge' or 'max_unavailable' must be > 0."
        )


# ---------------------------------------------------------------------------
# Config builder
# ---------------------------------------------------------------------------

def build_strategy_config(
    strategy_name: str,
    model_id: str,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Build a strategy configuration dict with defaults applied.

    Args:
        strategy_name: Strategy identifier.
        model_id:      Primary model ID being deployed.
        **kwargs:      Optional overrides for any config field.

    Returns:
        Fully-populated strategy config dict.

    Raises:
        ValueError: If strategy_name is not recognised or config is invalid.
    """
    name = strategy_name.strip().upper()
    if name not in STRATEGY_NAMES:
        raise ValueError(f"Unknown strategy '{strategy_name}'.")

    config: Dict[str, Any]

    if name == "BLUE_GREEN":
        config = {
            "blue_model_id":    kwargs.get("blue_model_id", model_id),
            "green_model_id":   kwargs.get("green_model_id", None),
            "active_slot":      kwargs.get("active_slot", "BLUE"),
            "traffic_split":    kwargs.get("traffic_split", {"blue": 100, "green": 0}),
            "rollback_slot":    kwargs.get("rollback_slot", "BLUE"),
            "health_check_path": kwargs.get("health_check_path", "/health"),
            "cutover_at":       kwargs.get("cutover_at", None),
        }

    elif name == "CANARY":
        stages = kwargs.get("traffic_stages", list(_DEFAULT_CANARY_STAGES))
        config = {
            "base_model_id":        kwargs.get("base_model_id", model_id),
            "canary_model_id":      kwargs.get("canary_model_id", None),
            "traffic_stages":       stages,
            "current_stage_index":  kwargs.get("current_stage_index", 0),
            "current_canary_pct":   stages[0] if stages else 5,
            "base_traffic_pct":     100 - (stages[0] if stages else 5),
            "rollback_threshold":   kwargs.get("rollback_threshold", None),
        }

    else:  # ROLLING
        total = kwargs.get("total_replicas", 1)
        batch = kwargs.get("batch_size", max(1, total // 4))
        config = {
            "old_model_id":              kwargs.get("old_model_id", model_id),
            "new_model_id":              kwargs.get("new_model_id", None),
            "total_replicas":            total,
            "updated_replicas":          kwargs.get("updated_replicas", 0),
            "batch_size":                batch,
            "max_surge":                 kwargs.get("max_surge", 1),
            "max_unavailable":           kwargs.get("max_unavailable", 0),
            "health_check_path":         kwargs.get("health_check_path", "/health"),
            "health_check_period_secs":  kwargs.get("health_check_period_secs", 30),
            "rollback_on_failure":       kwargs.get("rollback_on_failure", True),
        }

    validate_strategy_config(name, config)
    return config


# ---------------------------------------------------------------------------
# Rollback target
# ---------------------------------------------------------------------------

def get_rollback_target(
    strategy_name: str,
    config: Dict[str, Any],
) -> Optional[str]:
    """Return the model_id to roll back to for the given strategy + config.

    Args:
        strategy_name: Strategy identifier.
        config:        Current strategy configuration dict.

    Returns:
        model_id string, or None if no rollback target is determinable.
    """
    name = strategy_name.strip().upper()

    if name == "BLUE_GREEN":
        rollback_slot = config.get("rollback_slot", "BLUE")
        if rollback_slot == "BLUE":
            return config.get("blue_model_id")
        return config.get("green_model_id")

    elif name == "CANARY":
        # Rollback = revert to base (stable) model
        return config.get("base_model_id")

    elif name == "ROLLING":
        # Rollback = revert to old model
        return config.get("old_model_id")

    return None


# ---------------------------------------------------------------------------
# Pure strategy advancement (Canary)
# ---------------------------------------------------------------------------

def advance_canary(config: Dict[str, Any]) -> Dict[str, Any]:
    """Advance canary to the next traffic stage (pure function).

    Does not mutate *config*. Returns a new config dict.

    Args:
        config: Current CANARY strategy configuration.

    Returns:
        Updated config dict for the next stage.

    Raises:
        ValueError: If canary is already at 100% (final stage).
    """
    stages: List[int] = config.get("traffic_stages", _DEFAULT_CANARY_STAGES)
    current_idx: int = config.get("current_stage_index", 0)

    if current_idx >= len(stages) - 1:
        raise ValueError(
            "Canary is already at the final stage (100%). "
            "No further advancement possible."
        )

    next_idx = current_idx + 1
    next_pct = stages[next_idx]

    new_config = dict(config)
    new_config["current_stage_index"] = next_idx
    new_config["current_canary_pct"] = next_pct
    new_config["base_traffic_pct"] = 100 - next_pct
    return new_config


# ---------------------------------------------------------------------------
# Pure batch progress (Rolling)
# ---------------------------------------------------------------------------

def record_rolling_batch(
    config: Dict[str, Any],
    batch_updated: int,
) -> Dict[str, Any]:
    """Record that *batch_updated* additional replicas have been updated (pure function).

    Does not mutate *config*. Returns a new config dict.

    Args:
        config:        Current ROLLING strategy configuration.
        batch_updated: Number of replicas updated in this batch.

    Returns:
        Updated config dict with incremented ``updated_replicas``.

    Raises:
        ValueError: If updated_replicas would exceed total_replicas.
    """
    total: int = config.get("total_replicas", 1)
    current_updated: int = config.get("updated_replicas", 0)
    new_updated = current_updated + batch_updated

    if new_updated > total:
        raise ValueError(
            f"updated_replicas ({new_updated}) would exceed "
            f"total_replicas ({total})."
        )

    new_config = dict(config)
    new_config["updated_replicas"] = new_updated
    return new_config


# ---------------------------------------------------------------------------
# Human-readable summary
# ---------------------------------------------------------------------------

def get_strategy_summary(
    strategy_name: str,
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """Return a human-readable summary dict for a strategy config.

    Args:
        strategy_name: Strategy identifier.
        config:        Current strategy configuration.

    Returns:
        Summary dict suitable for API responses and model cards.
    """
    name = strategy_name.strip().upper()

    if name == "BLUE_GREEN":
        split = config.get("traffic_split", {"blue": 100, "green": 0})
        return {
            "strategy":    "BLUE_GREEN",
            "active_slot": config.get("active_slot", "BLUE"),
            "blue_model":  config.get("blue_model_id"),
            "green_model": config.get("green_model_id"),
            "traffic":     f"Blue={split.get('blue', 0)}% / Green={split.get('green', 0)}%",
            "rollback_to": config.get("rollback_slot", "BLUE"),
        }

    elif name == "CANARY":
        pct = config.get("current_canary_pct", 0)
        stages = config.get("traffic_stages", _DEFAULT_CANARY_STAGES)
        idx = config.get("current_stage_index", 0)
        return {
            "strategy":     "CANARY",
            "base_model":   config.get("base_model_id"),
            "canary_model": config.get("canary_model_id"),
            "traffic":      f"Base={100 - pct}% / Canary={pct}%",
            "stage":        f"{idx + 1}/{len(stages)}",
            "all_stages":   stages,
            "rollback_to":  config.get("base_model_id"),
        }

    elif name == "ROLLING":
        total   = config.get("total_replicas", 1)
        updated = config.get("updated_replicas", 0)
        return {
            "strategy":          "ROLLING",
            "progress":          f"{updated}/{total} replicas updated",
            "old_model":         config.get("old_model_id"),
            "new_model":         config.get("new_model_id"),
            "batch_size":        config.get("batch_size", 1),
            "max_surge":         config.get("max_surge", 1),
            "max_unavailable":   config.get("max_unavailable", 0),
            "rollback_to":       config.get("old_model_id"),
        }

    return {"strategy": strategy_name, "config": config}
