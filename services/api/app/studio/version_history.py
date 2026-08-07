"""DSL Version History & Diff Viewer (V7B Part 2)."""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from app.config import settings
from app.schemas.studio import DSLDiff, DSLDocument, DSLVersionEntry

_HISTORY_DIR = os.path.join(settings.upload_dir, "admin", "studio", "history")
_LOCK = threading.Lock()


def _ensure_dir() -> None:
    os.makedirs(_HISTORY_DIR, exist_ok=True)


def _history_file(dsl_id: str) -> str:
    _ensure_dir()
    return os.path.join(_HISTORY_DIR, f"{dsl_id}.jsonl")


def snapshot_version(doc: DSLDocument, message: Optional[str] = None) -> DSLVersionEntry:
    """Save a versioned snapshot of a DSL document."""
    entry = DSLVersionEntry(
        version_id=str(uuid.uuid4()),
        dsl_id=doc.dsl_id,
        dsl_type=doc.dsl_type,
        version=doc.version,
        snapshot=doc.model_dump(mode="json"),
        created_at=datetime.now(timezone.utc),
        message=message,
    )
    path = _history_file(doc.dsl_id)
    with _LOCK:
        with open(path, "a", encoding="utf-8") as f:
            f.write(entry.model_dump_json() + "\n")
    return entry


def get_version_history(dsl_id: str) -> List[DSLVersionEntry]:
    """Return all snapshots for a DSL document (newest first)."""
    path = _history_file(dsl_id)
    entries: List[DSLVersionEntry] = []
    with _LOCK:
        if not os.path.exists(path):
            return []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    try:
                        entries.append(DSLVersionEntry.model_validate_json(line))
                    except Exception:
                        pass
    entries.reverse()
    return entries


def diff_versions(dsl_id: str, from_version: str, to_version: str) -> DSLDiff:
    """Compute a structural diff between two named versions of a DSL document."""
    history = get_version_history(dsl_id)
    by_version = {e.version: e for e in history}

    if from_version not in by_version:
        raise KeyError(f"Version '{from_version}' not found for DSL '{dsl_id}'")
    if to_version not in by_version:
        raise KeyError(f"Version '{to_version}' not found for DSL '{dsl_id}'")

    old_snap = by_version[from_version].snapshot
    new_snap = by_version[to_version].snapshot

    old_node_ids = {n["node_id"] for n in old_snap.get("nodes", [])}
    new_node_ids = {n["node_id"] for n in new_snap.get("nodes", [])}

    old_nodes_by_id = {n["node_id"]: n for n in old_snap.get("nodes", [])}
    new_nodes_by_id = {n["node_id"]: n for n in new_snap.get("nodes", [])}

    added = sorted(new_node_ids - old_node_ids)
    removed = sorted(old_node_ids - new_node_ids)
    modified = sorted(
        nid for nid in old_node_ids & new_node_ids
        if old_nodes_by_id[nid] != new_nodes_by_id[nid]
    )

    def edge_key(e: dict) -> str:
        return f"{e['source']}->{e['target']}"

    old_edges = {edge_key(e) for e in old_snap.get("edges", [])}
    new_edges = {edge_key(e) for e in new_snap.get("edges", [])}
    added_edges = sorted(new_edges - old_edges)
    removed_edges = sorted(old_edges - new_edges)

    parts = []
    if added:
        parts.append(f"{len(added)} node(s) added")
    if removed:
        parts.append(f"{len(removed)} node(s) removed")
    if modified:
        parts.append(f"{len(modified)} node(s) modified")
    if added_edges:
        parts.append(f"{len(added_edges)} edge(s) added")
    if removed_edges:
        parts.append(f"{len(removed_edges)} edge(s) removed")
    summary = "; ".join(parts) if parts else "No structural changes"

    return DSLDiff(
        dsl_id=dsl_id,
        from_version=from_version,
        to_version=to_version,
        added_nodes=added,
        removed_nodes=removed,
        modified_nodes=modified,
        added_edges=added_edges,
        removed_edges=removed_edges,
        summary=summary,
    )
