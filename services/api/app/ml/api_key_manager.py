"""API Key Manager — V7A programmatic access keys.

Security contract:
    - The full key is generated once via ``secrets.token_urlsafe(32)``.
    - Format: ``sk-{8-char-workspace-prefix}-{random}``
    - The full key is returned ONLY at creation time in the response.
    - Only ``key_hash`` (SHA-256 hex digest) is persisted — never plaintext.
    - ``key_prefix`` stores the first 16 chars for display (e.g. ``sk-abc12345...``).
    - Validation: ``sha256(presented_key) == key_hash``.
    - Audit: ``last_ip`` and ``last_user_agent`` updated on each use.

Authentication header::
    X-API-Key: sk-{workspace_prefix}-{random_token}
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("apex_ml.api_key_manager")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _generate_key(workspace_id: Optional[str] = None) -> tuple[str, str, str]:
    """Generate a new API key tuple.

    Returns:
        (full_key, key_prefix, key_hash)
    """
    prefix_part = (workspace_id or "global")[:8].replace("-", "")
    random_part = secrets.token_urlsafe(32)
    full_key = f"sk-{prefix_part}-{random_part}"
    key_prefix = full_key[:16]
    key_hash = hashlib.sha256(full_key.encode("utf-8")).hexdigest()
    return full_key, key_prefix, key_hash


def _hash_key(key: str) -> str:
    """Return the SHA-256 hex digest of *key*."""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


async def create_api_key(
    db: AsyncSession,
    user_id: str,
    org_id: str,
    name: str,
    *,
    workspace_id: Optional[str] = None,
    scopes: Optional[list[str]] = None,
    expires_at: Optional[datetime] = None,
) -> dict:
    """Create a new API key and return it with the plaintext key (once).

    The plaintext key is NEVER stored.  The caller must present it to the user
    immediately and discard it after the response is sent.

    Args:
        db: Async DB session.
        user_id: ID of the user creating the key.
        org_id: Organisation ID.
        name: Human-readable key label.
        workspace_id: Optional workspace scope (None = org-scoped).
        scopes: List of permission strings this key is limited to.
        expires_at: Optional expiry datetime (None = no expiry).

    Returns:
        Dict with ``raw_key`` (present ONLY on creation), ``key_prefix``,
        ``key_id``, ``name``, ``scopes``, ``expires_at``, and metadata.
    """
    from app.models.api_key import ApiKey  # lazy import to avoid circular
    import uuid

    full_key, key_prefix, key_hash = _generate_key(workspace_id)

    api_key = ApiKey(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        organisation_id=uuid.UUID(org_id),
        workspace_id=uuid.UUID(workspace_id) if workspace_id else None,
        name=name,
        key_prefix=key_prefix,
        key_hash=key_hash,
        scopes=scopes or [],
        expires_at=expires_at,
        revoked=False,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return {
        "key_id": str(api_key.id),
        "name": api_key.name,
        "key_prefix": api_key.key_prefix,
        "raw_key": full_key,   # ← returned ONCE, never stored
        "scopes": api_key.scopes,
        "workspace_id": workspace_id,
        "organisation_id": org_id,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "created_at": api_key.created_at.isoformat(),
        "note": "Store this key securely. It will never be shown again.",
    }


async def validate_api_key(
    db: AsyncSession,
    presented_key: str,
    *,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Optional[dict]:
    """Validate a presented API key and return its metadata if valid.

    Updates audit fields (last_used_at, last_ip, last_user_agent) on success.

    Args:
        db: Async DB session.
        presented_key: The full API key as presented by the client.
        ip_address: Client IP for audit logging.
        user_agent: Client User-Agent for audit logging.

    Returns:
        Key metadata dict if valid, None if invalid/revoked/expired.
    """
    from app.models.api_key import ApiKey

    key_hash = _hash_key(presented_key)
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.key_hash == key_hash,
            ApiKey.revoked == False,  # noqa: E712
        )
    )
    api_key = result.scalar_one_or_none()
    if api_key is None:
        return None

    # Check expiry
    if api_key.expires_at and api_key.expires_at < _utc_now():
        return None

    # Update audit fields
    api_key.last_used_at = _utc_now()
    api_key.last_ip = ip_address
    api_key.last_user_agent = user_agent
    await db.commit()

    return {
        "key_id": str(api_key.id),
        "user_id": str(api_key.user_id),
        "organisation_id": str(api_key.organisation_id),
        "workspace_id": str(api_key.workspace_id) if api_key.workspace_id else None,
        "scopes": api_key.scopes,
        "key_prefix": api_key.key_prefix,
        "last_used_at": api_key.last_used_at.isoformat() if api_key.last_used_at else None,
    }


async def revoke_api_key(
    db: AsyncSession,
    key_id: str,
    revoked_by: str,
) -> dict:
    """Revoke an API key permanently.

    Args:
        db: Async DB session.
        key_id: UUID of the key to revoke.
        revoked_by: User ID performing the revocation.

    Returns:
        Updated key record (without key_hash).

    Raises:
        KeyError: If key not found.
    """
    from app.models.api_key import ApiKey
    import uuid

    result = await db.execute(select(ApiKey).where(ApiKey.id == uuid.UUID(key_id)))
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise KeyError(f"API key '{key_id}' not found")

    api_key.revoked = True
    api_key.revoked_at = _utc_now()
    await db.commit()

    return {
        "key_id": str(api_key.id),
        "key_prefix": api_key.key_prefix,
        "revoked": True,
        "revoked_at": api_key.revoked_at.isoformat(),
        "revoked_by": revoked_by,
    }


async def list_api_keys(
    db: AsyncSession,
    user_id: str,
    workspace_id: Optional[str] = None,
) -> list[dict]:
    """List API keys for a user. Never includes key_hash."""
    from app.models.api_key import ApiKey
    import uuid

    query = select(ApiKey).where(ApiKey.user_id == uuid.UUID(user_id))
    if workspace_id:
        query = query.where(ApiKey.workspace_id == uuid.UUID(workspace_id))

    result = await db.execute(query)
    keys = result.scalars().all()

    return [
        {
            "key_id": str(k.id),
            "name": k.name,
            "key_prefix": k.key_prefix,
            "scopes": k.scopes,
            "workspace_id": str(k.workspace_id) if k.workspace_id else None,
            "revoked": k.revoked,
            "expires_at": k.expires_at.isoformat() if k.expires_at else None,
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
            "last_ip": k.last_ip,
            "last_user_agent": k.last_user_agent,
            "created_at": k.created_at.isoformat(),
        }
        for k in keys
    ]


async def rotate_api_key(
    db: AsyncSession,
    key_id: str,
    rotated_by: str,
) -> dict:
    """Revoke the existing key and create a replacement with the same config.

    Args:
        db: Async DB session.
        key_id: UUID of the key to rotate.
        rotated_by: User ID performing the rotation.

    Returns:
        New key record with ``raw_key`` (present ONCE).
    """
    from app.models.api_key import ApiKey
    import uuid

    result = await db.execute(select(ApiKey).where(ApiKey.id == uuid.UUID(key_id)))
    old_key = result.scalar_one_or_none()
    if old_key is None:
        raise KeyError(f"API key '{key_id}' not found")

    # Revoke old
    old_key.revoked = True
    old_key.revoked_at = _utc_now()
    await db.flush()

    # Create new with same config
    new_record = await create_api_key(
        db=db,
        user_id=str(old_key.user_id),
        org_id=str(old_key.organisation_id),
        name=old_key.name + " (rotated)",
        workspace_id=str(old_key.workspace_id) if old_key.workspace_id else None,
        scopes=old_key.scopes,
        expires_at=old_key.expires_at,
    )
    new_record["rotated_from"] = key_id
    return new_record
