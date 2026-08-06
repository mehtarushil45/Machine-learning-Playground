"""Collaboration Engine — V7A architecture scaffold.

This module defines the data schemas and placeholder functions for the
V7A collaboration layer. Tags are fully implemented; all other features
(Comments, Notes, Mentions, ReviewRequests) are architecture placeholders
that raise NotImplementedError and are planned for V7B.

Implemented in V7A:
    - Tags (via resource_ownership.tag_resource)
    - Labels (via resource_ownership.set_labels)

Architecture only (V7B):
    - CommentThread
    - Note
    - Mention
    - ReviewRequest
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger("apex_ml.collaboration")

SCHEMA_VERSION = "7a.1.0"


# ============================================================================
# IMPLEMENTED: Tags and Labels
# ============================================================================

def add_tags(
    resource_type: str,
    resource_id: str,
    tags: list[str],
    added_by: str,
) -> dict:
    """Add tags to a resource's ownership record.

    Tags are freeform strings stored in the ownership overlay.
    Existing tags are preserved; duplicates are deduplicated.

    Args:
        resource_type: One of the valid resource types.
        resource_id: ID of the resource.
        tags: New tags to add.
        added_by: User ID of the tagger.

    Returns:
        Updated ownership record with merged tags.
    """
    from app.ml.resource_ownership import tag_resource
    return tag_resource(resource_type, resource_id, tags, added_by)


def set_resource_labels(
    resource_type: str,
    resource_id: str,
    labels: list[str],
    set_by: str,
) -> dict:
    """Set structured classification labels on a resource.

    Labels replace the existing label set (unlike tags which are additive).
    Labels are controlled vocabulary for Dataset Catalog taxonomy.

    Args:
        resource_type: One of the valid resource types.
        resource_id: ID of the resource.
        labels: New label list (replaces existing).
        set_by: User ID of the labeller.

    Returns:
        Updated ownership record.
    """
    from app.ml.resource_ownership import set_labels
    return set_labels(resource_type, resource_id, labels, set_by)


def set_favorite(
    resource_type: str,
    resource_id: str,
    favorite: bool,
    user_id: str,
) -> dict:
    """Mark or unmark a resource as a favorite."""
    from app.ml.resource_ownership import set_favorite as _set_favorite
    return _set_favorite(resource_type, resource_id, favorite, user_id)


# ============================================================================
# ARCHITECTURE ONLY (V7B): Comments, Notes, Mentions, ReviewRequests
# ============================================================================

def create_comment_thread(
    resource_type: str,
    resource_id: str,
    author_id: str,
    body: str,
    workspace_id: str,
) -> dict:
    """Create a comment thread on a resource. [V7B]"""
    raise NotImplementedError(
        "Comment threads are planned for V7B — Collaboration Engine."
    )


def reply_to_comment(
    thread_id: str,
    author_id: str,
    body: str,
) -> dict:
    """Reply to an existing comment thread. [V7B]"""
    raise NotImplementedError(
        "Comment replies are planned for V7B — Collaboration Engine."
    )


def resolve_comment(
    thread_id: str,
    resolved_by: str,
) -> dict:
    """Resolve a comment thread. [V7B]"""
    raise NotImplementedError(
        "Comment resolution is planned for V7B — Collaboration Engine."
    )


def create_note(
    resource_type: str,
    resource_id: str,
    author_id: str,
    title: str,
    body: str,
    workspace_id: str,
    is_shared: bool = True,
) -> dict:
    """Create a note attached to a resource. [V7B]"""
    raise NotImplementedError(
        "Notes are planned for V7B — Collaboration Engine."
    )


def mention_user(
    thread_id: str,
    mentioned_user_id: str,
    mentioned_by: str,
) -> dict:
    """Create a @mention in a comment or note. [V7B]"""
    raise NotImplementedError(
        "Mentions are planned for V7B — Collaboration Engine."
    )


def create_review_request(
    resource_type: str,
    resource_id: str,
    requested_by: str,
    reviewer_ids: list[str],
    workspace_id: str,
    notes: Optional[str] = None,
) -> dict:
    """Create a formal review request for a resource. [V7B]"""
    raise NotImplementedError(
        "Review requests are planned for V7B — Collaboration Engine."
    )
