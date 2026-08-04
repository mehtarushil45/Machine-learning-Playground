"""Model Version Manager — V5A, extended V5B.

Provides true semantic versioning (MAJOR.MINOR.PATCH) for model families,
where a *model family* is identified by the ``(algorithm, dataset_id)`` pair.

The family registry is persisted as a single JSON file at:

    services/api/uploads/models/registry/version_families.json

Schema::

    {
      "<family_key>": {
        "family_key":   "<algorithm>@<dataset_id>",
        "algorithm":    "<algorithm name>",
        "dataset_id":   "<dataset UUID or string>",
        "major":        <int>,
        "minor":        <int>,
        "patch":        <int>,
        "current_model_id": "<model_id of latest registered version>",
        "current_version":  "vMAJOR.MINOR.PATCH",
        "version_history":  [
          {"version": "v1.0.0", "model_id": "...", "registered_at": "ISO"}
        ],
        "created_at":   "ISO",
        "updated_at":   "ISO"
      },
      ...
    }

Version bumping rules
---------------------
Each successful training in the same family bumps PATCH.
When the engine calls ``next_version(..., bump="minor")``, MINOR is bumped
and PATCH is reset to 0.
When ``bump="major"``, MAJOR is bumped, MINOR and PATCH are reset to 0.
The default bump is ``"patch"``.

Public API
----------
``next_version(algorithm, dataset_id, model_id, bump) -> str``
    Allocates and persists the next semantic version for the family.
    Returns the version string, e.g. ``"v1.3.0"``.

``get_current_version(algorithm, dataset_id) -> str | None``
    Returns the current (latest) version string, or None if no version yet.

``get_family(algorithm, dataset_id) -> dict | None``
    Returns the full family record, or None.

``list_families() -> list[dict]``
    Returns all tracked model families.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

logger = logging.getLogger("apex_ml.version_manager")

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

_REGISTRY_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "models", "registry")
)
_FAMILIES_PATH = os.path.join(_REGISTRY_ROOT, "version_families.json")

BumpLevel = Literal["major", "minor", "patch"]


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def _ensure_dirs() -> None:
    os.makedirs(_REGISTRY_ROOT, exist_ok=True)


def _load_families() -> Dict[str, Dict[str, Any]]:
    if not os.path.exists(_FAMILIES_PATH):
        return {}
    try:
        with open(_FAMILIES_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.error("Failed to load version_families.json: %s", exc)
        return {}


def _save_families(families: Dict[str, Dict[str, Any]]) -> None:
    _ensure_dirs()
    tmp = _FAMILIES_PATH + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(families, fh, indent=2, default=str)
        os.replace(tmp, _FAMILIES_PATH)
    except Exception as exc:
        logger.error("Failed to save version_families.json: %s", exc)
        raise


def _family_key(algorithm: str, dataset_id: str) -> str:
    """Stable key for an (algorithm, dataset_id) model family."""
    import re
    algo_slug = re.sub(r"[^a-z0-9]+", "-", algorithm.lower().strip()).strip("-")
    return f"{algo_slug}@{dataset_id}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def next_version(
    algorithm: str,
    dataset_id: str,
    model_id: str,
    bump: BumpLevel = "patch",
) -> str:
    """Allocate and persist the next semantic version for a model family.

    Atomically increments the version counter and records the new version
    in the family's ``version_history``.

    Args:
        algorithm:  Human-readable algorithm name (e.g. ``"Random Forest Classifier"``).
        dataset_id: Dataset UUID or identifier string.
        model_id:   The model_id of the newly registered model version.
        bump:       Which component to bump: ``"major"``, ``"minor"``, or ``"patch"``.
                    Defaults to ``"patch"``.

    Returns:
        New version string, e.g. ``"v1.0.3"``.
    """
    _ensure_dirs()
    families = _load_families()
    key = _family_key(algorithm, dataset_id)
    now = datetime.now(timezone.utc).isoformat()

    if key not in families:
        # First version in this family
        families[key] = {
            "family_key":           key,
            "algorithm":            algorithm,
            "dataset_id":           dataset_id,
            "major":                1,
            "minor":                0,
            "patch":                0,
            "current_model_id":     model_id,
            "current_version":      "v1.0.0",
            "version_history":      [
                {"version": "v1.0.0", "model_id": model_id, "registered_at": now}
            ],
            # V5B champion/challenger tracking
            "champion_model_id":    None,
            "challenger_model_ids": [],
            "rollback_history":     [],
            "created_at":  now,
            "updated_at":  now,
        }
        version_str = "v1.0.0"
        logger.info(
            "New model family '%s' — initial version %s (model_id=%s).",
            key, version_str, model_id,
        )
    else:
        fam = families[key]
        major: int = fam["major"]
        minor: int = fam["minor"]
        patch: int = fam["patch"]

        # V5B backward-compat: inject champion fields if missing
        fam.setdefault("champion_model_id",    None)
        fam.setdefault("challenger_model_ids", [])
        fam.setdefault("rollback_history",     [])

        if bump == "major":
            major += 1
            minor = 0
            patch = 0
        elif bump == "minor":
            minor += 1
            patch = 0
        else:  # patch
            patch += 1

        version_str = f"v{major}.{minor}.{patch}"
        fam["major"] = major
        fam["minor"] = minor
        fam["patch"] = patch
        fam["current_version"] = version_str
        fam["current_model_id"] = model_id
        fam["updated_at"] = now
        fam["version_history"].append(
            {"version": version_str, "model_id": model_id, "registered_at": now}
        )
        logger.info(
            "Family '%s' bumped (%s) → %s (model_id=%s).",
            key, bump, version_str, model_id,
        )

    _save_families(families)
    return version_str


def get_current_version(algorithm: str, dataset_id: str) -> Optional[str]:
    """Return the current (latest) semantic version for a model family, or None.

    Args:
        algorithm:  Algorithm name.
        dataset_id: Dataset identifier.

    Returns:
        Version string (e.g. ``"v1.0.3"``) or ``None`` if no version exists.
    """
    families = _load_families()
    key = _family_key(algorithm, dataset_id)
    fam = families.get(key)
    return fam["current_version"] if fam else None


def get_family(algorithm: str, dataset_id: str) -> Optional[Dict[str, Any]]:
    """Return the full family record, or None.

    Args:
        algorithm:  Algorithm name.
        dataset_id: Dataset identifier.

    Returns:
        Full family dict, or ``None``.
    """
    families = _load_families()
    key = _family_key(algorithm, dataset_id)
    return families.get(key)


def list_families() -> List[Dict[str, Any]]:
    """Return all tracked model families, sorted by most recently updated.

    Returns:
        List of family dicts.
    """
    families = _load_families()
    return sorted(
        families.values(),
        key=lambda f: f.get("updated_at", ""),
        reverse=True,
    )


# ---------------------------------------------------------------------------
# V5B Champion / Challenger API
# ---------------------------------------------------------------------------

def set_champion(
    algorithm: str,
    dataset_id: str,
    model_id: str,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> None:
    """Atomically set a model as Champion for its family.

    The previously registered champion (if any) is moved to
    ``challenger_model_ids`` unless it is already there.
    The promoted model is removed from ``challenger_model_ids``.

    Args:
        algorithm:    Algorithm name.
        dataset_id:   Dataset identifier.
        model_id:     Model ID to promote to Champion.
        performed_by: Actor performing the operation.
        reason:       Optional reason string (informational).
    """
    families = _load_families()
    key = _family_key(algorithm, dataset_id)
    now = datetime.now(timezone.utc).isoformat()

    if key not in families:
        # Family may not exist yet if called before next_version() — create stub
        families[key] = {
            "family_key":           key,
            "algorithm":            algorithm,
            "dataset_id":           dataset_id,
            "major":                1,
            "minor":                0,
            "patch":                0,
            "current_model_id":     model_id,
            "current_version":      "v1.0.0",
            "version_history":      [],
            "champion_model_id":    None,
            "challenger_model_ids": [],
            "rollback_history":     [],
            "created_at":           now,
            "updated_at":           now,
        }

    fam = families[key]
    fam.setdefault("champion_model_id",    None)
    fam.setdefault("challenger_model_ids", [])
    fam.setdefault("rollback_history",     [])

    previous_champion = fam["champion_model_id"]

    # Move previous champion to challengers (if different and not already there)
    if previous_champion and previous_champion != model_id:
        if previous_champion not in fam["challenger_model_ids"]:
            fam["challenger_model_ids"].append(previous_champion)

    # Remove new champion from challengers
    fam["challenger_model_ids"] = [
        cid for cid in fam["challenger_model_ids"] if cid != model_id
    ]

    fam["champion_model_id"] = model_id
    fam["updated_at"] = now
    _save_families(families)

    logger.info(
        "Champion set — family='%s' model_id=%s (previous=%s) by=%s",
        key, model_id, previous_champion, performed_by,
    )


def get_champion(
    algorithm: str,
    dataset_id: str,
) -> Optional[str]:
    """Return the current champion model_id for a family, or None.

    Args:
        algorithm:  Algorithm name.
        dataset_id: Dataset identifier.

    Returns:
        Champion model_id string, or None if no champion is set.
    """
    families = _load_families()
    key = _family_key(algorithm, dataset_id)
    fam = families.get(key)
    if fam is None:
        return None
    return fam.get("champion_model_id")


def get_challengers(
    algorithm: str,
    dataset_id: str,
) -> List[str]:
    """Return the list of challenger model IDs for a family.

    Args:
        algorithm:  Algorithm name.
        dataset_id: Dataset identifier.

    Returns:
        List of challenger model_id strings (may be empty).
    """
    families = _load_families()
    key = _family_key(algorithm, dataset_id)
    fam = families.get(key)
    if fam is None:
        return []
    return list(fam.get("challenger_model_ids", []))


def get_family_by_key(family_key: str) -> Optional[Dict[str, Any]]:
    """Return the full family record by its family_key string.

    Useful when the router receives a family_key from the URL path
    and needs to look up the family without knowing algorithm+dataset_id.

    Args:
        family_key: The exact family key string (e.g. ``"random-forest@ds-abc"``).

    Returns:
        Full family dict, or None if not found.
    """
    families = _load_families()
    return families.get(family_key)


def record_rollback_event(
    algorithm: str,
    dataset_id: str,
    from_model_id: str,
    to_model_id: str,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> None:
    """Append a rollback event to the family's rollback_history.

    This is called by the rollback REST endpoint after champion pointer
    and governance states have been updated.

    Args:
        algorithm:     Algorithm name.
        dataset_id:    Dataset identifier.
        from_model_id: Model ID that was champion before rollback.
        to_model_id:   Model ID rolled back to (new champion).
        performed_by:  Actor performing the rollback.
        reason:        Optional human-readable reason.
    """
    import uuid as _uuid  # local import to avoid top-level uuid dependency
    families = _load_families()
    key = _family_key(algorithm, dataset_id)
    if key not in families:
        logger.warning(
            "record_rollback_event: family '%s' not found — skipping.", key
        )
        return

    fam = families[key]
    fam.setdefault("rollback_history", [])

    event = {
        "event_id":      str(_uuid.uuid4()),
        "timestamp":     datetime.now(timezone.utc).isoformat(),
        "from_model_id": from_model_id,
        "to_model_id":   to_model_id,
        "performed_by":  performed_by,
        "reason":        reason,
    }
    fam["rollback_history"].append(event)
    fam["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save_families(families)

    logger.info(
        "Rollback event recorded — family='%s' from=%s to=%s by=%s",
        key, from_model_id, to_model_id, performed_by,
    )
