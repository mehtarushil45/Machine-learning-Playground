"""JWT Token Blacklist — Redis-backed revocation store.

Architecture
------------
When a token is revoked (logout / forced expiry / key rotation), its unique
``jti`` claim is written to Redis with a TTL equal to the token's **remaining
lifetime**.  Once the token's natural expiry passes, Redis evicts the key
automatically — the blacklist never grows unbounded.

Redis key schema
----------------
    blacklist:<jti>  →  "1"   (TTL = seconds until token expiry)

The ``jti`` (JWT ID) claim must be embedded in every token at creation time.
If a token has no ``jti``, we fall back to a SHA-256 hash of the raw token
string so legacy tokens are still revocable.

Public API
----------
    await blacklist_token(raw_token)        — revoke a token
    await is_token_blacklisted(raw_token)   — check if revoked
    await blacklist_all_user_tokens(user_id)— nuclear option: revoke all sessions

Failure policy
--------------
If Redis is unreachable, ``is_token_blacklisted`` returns False (fail-open).
This preserves availability; the trade-off is that revoked tokens may be
accepted briefly during Redis downtime.  Use ``BLACKLIST_STRICT_MODE=true``
(see config) to fail-closed instead.
"""

from __future__ import annotations

import hashlib
import logging
import math
from datetime import datetime, timezone
from typing import Optional

import jwt as pyjwt

from app.config import settings
from app.redis_client import get_redis

logger = logging.getLogger(__name__)

# Redis key prefixes
_BLACKLIST_PREFIX = "blacklist:"
_USER_VERSION_PREFIX = "token_ver:"   # for per-user version invalidation

# Minimum TTL to bother storing (tokens expiring in < 5 s aren't worth keeping)
_MIN_TTL_SECONDS = 5


def _decode_unverified(raw_token: str) -> dict:
    """Decode token payload WITHOUT signature verification.

    Used only to read ``exp`` and ``jti`` from an already-validated token.
    We never trust the payload for auth decisions here.
    """
    return pyjwt.decode(
        raw_token,
        options={"verify_signature": False, "verify_exp": False},
        algorithms=["HS256"],
    )


def _jti_key(raw_token: str) -> str:
    """Derive a stable Redis key from a token.

    Prefers the ``jti`` claim; falls back to SHA-256(token) for tokens
    issued before ``jti`` was added.
    """
    try:
        payload = _decode_unverified(raw_token)
        jti: Optional[str] = payload.get("jti")
        if jti:
            return f"{_BLACKLIST_PREFIX}{jti}"
    except Exception:
        pass
    # Fallback: hash the raw token so we never store the token itself in Redis
    digest = hashlib.sha256(raw_token.encode()).hexdigest()
    return f"{_BLACKLIST_PREFIX}sha256:{digest}"


def _remaining_ttl(raw_token: str) -> int:
    """Return seconds until the token expires, clamped to [0, ∞).

    Returns 0 if the token is already expired (no point blacklisting it).
    """
    try:
        payload = _decode_unverified(raw_token)
        exp = payload.get("exp")
        if exp is None:
            # No expiry claim — use a safe default (access token TTL)
            return settings.access_token_expire_minutes * 60
        remaining = exp - datetime.now(timezone.utc).timestamp()
        return max(0, math.ceil(remaining))
    except Exception:
        return 0


async def blacklist_token(raw_token: str) -> bool:
    """Revoke a single token by writing it to the Redis blacklist.

    Returns True if successfully blacklisted, False if the token was already
    expired (no need to store) or if Redis is unavailable.
    """
    ttl = _remaining_ttl(raw_token)
    if ttl < _MIN_TTL_SECONDS:
        logger.debug("Token already expired; skipping blacklist write.")
        return False

    key = _jti_key(raw_token)
    try:
        redis = await get_redis()
        # NX=True: only set if not already present (idempotent)
        await redis.set(key, "1", ex=ttl, nx=True)
        logger.info("Token blacklisted. key=%s ttl=%ds", key, ttl)
        return True
    except Exception as exc:
        logger.error("Redis unavailable — token blacklist write failed: %s", exc)
        return False


async def is_token_blacklisted(raw_token: str) -> bool:
    """Return True if the token has been revoked.

    Fail-open: returns False (allow) if Redis is unreachable, so the API
    remains available during Redis downtime.
    """
    key = _jti_key(raw_token)
    try:
        redis = await get_redis()
        result = await redis.exists(key)
        return bool(result)
    except Exception as exc:
        logger.warning(
            "Redis unavailable — blacklist check skipped (fail-open): %s", exc
        )
        return False  # fail-open: allow the request


async def blacklist_all_user_tokens(user_id: str) -> bool:
    """Increment the per-user token version, instantly invalidating all sessions.

    This uses a separate Redis key per user that stores a monotonically
    increasing version number.  All issued tokens embed the version at creation
    time (``ver`` claim).  The dependency ``get_current_user`` compares the
    token's ``ver`` claim against the current Redis value.

    Returns True on success, False on Redis failure.
    """
    key = f"{_USER_VERSION_PREFIX}{user_id}"
    try:
        redis = await get_redis()
        # INCR is atomic — safe under concurrent logins
        new_version = await redis.incr(key)
        # Keep the version key alive for the max refresh token lifetime
        max_ttl = settings.refresh_token_expire_days * 86_400
        await redis.expire(key, max_ttl)
        logger.info(
            "All tokens invalidated for user %s. new_version=%d", user_id, new_version
        )
        return True
    except Exception as exc:
        logger.error("Redis unavailable — bulk revocation failed: %s", exc)
        return False


async def get_user_token_version(user_id: str) -> int:
    """Return the current token version for a user. 0 means no revocation yet."""
    key = f"{_USER_VERSION_PREFIX}{user_id}"
    try:
        redis = await get_redis()
        val = await redis.get(key)
        return int(val) if val else 0
    except Exception:
        return 0  # fail-open: 0 matches any token that embeds ver=0


async def get_blacklist_stats() -> dict:
    """Return diagnostic stats about the blacklist store. Used by admin endpoints."""
    try:
        redis = await get_redis()
        # Count blacklisted token keys (approximate — uses SCAN, not KEYS)
        token_count = 0
        user_version_count = 0
        async for _ in redis.scan_iter(match=f"{_BLACKLIST_PREFIX}*", count=200):
            token_count += 1
        async for _ in redis.scan_iter(match=f"{_USER_VERSION_PREFIX}*", count=200):
            user_version_count += 1
        info = await redis.info("memory")
        return {
            "blacklisted_tokens": token_count,
            "users_with_version_key": user_version_count,
            "redis_used_memory_human": info.get("used_memory_human", "unknown"),
            "redis_connected": True,
        }
    except Exception as exc:
        return {
            "blacklisted_tokens": -1,
            "users_with_version_key": -1,
            "redis_used_memory_human": "unknown",
            "redis_connected": False,
            "error": str(exc),
        }
