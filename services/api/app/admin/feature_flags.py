"""Feature Flag Management — V7B.

Runtime feature toggles, segmented by group (Experimental/Beta/Enterprise/Internal).
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import List, Optional

from app.admin._storage import FEATURE_FLAGS_DIR, atomic_write, ensure_dir, get_lock
from app.schemas.admin import FeatureFlagCreate, FeatureFlagResponse, FeatureFlagUpdate

_VALID_GROUPS = {"Experimental", "Beta", "Enterprise", "Internal"}


def _get_path(name: str) -> str:
    return os.path.join(FEATURE_FLAGS_DIR, f"{name}.json")


def set_feature_flag(data: FeatureFlagCreate) -> FeatureFlagResponse:
    """Create or fully replace a feature flag."""
    if data.group not in _VALID_GROUPS:
        raise ValueError(f"Invalid group '{data.group}'. Must be one of: {sorted(_VALID_GROUPS)}")
    ensure_dir(FEATURE_FLAGS_DIR)
    now = datetime.now(timezone.utc)

    created_at = now
    lock = get_lock("feature_flags")
    with lock:
        path = _get_path(data.name)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    existing = FeatureFlagResponse.model_validate_json(f.read())
                created_at = existing.created_at
            except Exception:
                pass

    flag = FeatureFlagResponse(
        name=data.name,
        description=data.description,
        group=data.group,
        is_enabled=data.is_enabled,
        created_at=created_at,
        updated_at=now,
    )
    atomic_write(_get_path(data.name), flag.model_dump_json(), "feature_flags")
    return flag


def update_feature_flag(name: str, updates: FeatureFlagUpdate) -> Optional[FeatureFlagResponse]:
    """Partially update an existing feature flag."""
    ensure_dir(FEATURE_FLAGS_DIR)
    path = _get_path(name)
    lock = get_lock("feature_flags")
    with lock:
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                flag = FeatureFlagResponse.model_validate_json(f.read())
        except Exception:
            return None

    if updates.description is not None:
        flag.description = updates.description
    if updates.group is not None:
        if updates.group not in _VALID_GROUPS:
            raise ValueError(f"Invalid group '{updates.group}'")
        flag.group = updates.group
    if updates.is_enabled is not None:
        flag.is_enabled = updates.is_enabled
    flag.updated_at = datetime.now(timezone.utc)

    atomic_write(path, flag.model_dump_json(), "feature_flags")
    return flag


def get_feature_flag(name: str) -> Optional[FeatureFlagResponse]:
    """Return a single feature flag by name, or None if not found."""
    ensure_dir(FEATURE_FLAGS_DIR)
    path = _get_path(name)
    lock = get_lock("feature_flags")
    with lock:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return FeatureFlagResponse.model_validate_json(f.read())
            except Exception:
                pass
    return None


def list_feature_flags(group: Optional[str] = None) -> List[FeatureFlagResponse]:
    """Return all feature flags, optionally filtered by group."""
    ensure_dir(FEATURE_FLAGS_DIR)
    flags: List[FeatureFlagResponse] = []
    lock = get_lock("feature_flags")
    with lock:
        for fname in os.listdir(FEATURE_FLAGS_DIR):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(FEATURE_FLAGS_DIR, fname)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    flags.append(FeatureFlagResponse.model_validate_json(f.read()))
            except Exception:
                pass
    if group:
        flags = [f for f in flags if f.group == group]
    flags.sort(key=lambda f: f.name)
    return flags
