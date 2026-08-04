"""Model Version Manager — Version 5A.

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
            "family_key":       key,
            "algorithm":        algorithm,
            "dataset_id":       dataset_id,
            "major":            1,
            "minor":            0,
            "patch":            0,
            "current_model_id": model_id,
            "current_version":  "v1.0.0",
            "version_history":  [
                {"version": "v1.0.0", "model_id": model_id, "registered_at": now}
            ],
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
