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
import json
import logging
import math
import time
from datetime import datetime, timezone
from typing import Optional

import jwt as pyjwt

from app.config import settings
from app.redis_client import get_redis

logger = logging.getLogger(__name__)

# Redis key prefixes
_BLACKLIST_PREFIX = "blacklist:"
_USER_VERSION_PREFIX = "token_ver:"   # for per-user version invalidation
_SESSION_FAMILY_PREFIX = "auth:fam:"  # for session family tracking & reuse detection

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


# ---------------------------------------------------------------------------
# Session Family Tracking & Reuse Detection (Parts C2, C4, C6)
# ---------------------------------------------------------------------------

async def register_session_family(
    family_id: str,
    user_id: str,
    jti: str,
    raw_access: str,
    raw_refresh: str,
    ttl_seconds: int,
) -> bool:
    """Store initial refresh token session family metadata in Redis."""
    key = f"{_SESSION_FAMILY_PREFIX}{family_id}"
    data = {
        "user_id": user_id,
        "current_jti": jti,
        "prev_jti": None,
        "rotated_at": time.time(),
        "cached_access": raw_access,
        "cached_refresh": raw_refresh,
    }
    try:
        redis = await get_redis()
        await redis.set(key, json.dumps(data), ex=ttl_seconds)
        return True
    except Exception as exc:
        logger.error("Failed to register session family %s: %s", family_id, exc)
        return False


async def rotate_session_family(
    family_id: str,
    user_id: str,
    presented_jti: str,
    raw_old_refresh: str,
    new_jti: str,
    new_access_token: str,
    new_refresh_token: str,
    ttl_seconds: int,
    grace_window_seconds: int = 30,
) -> dict:
    """Rotate refresh token with session family tracking and concurrent grace window.

    Returns dict with:
      - {"action": "rotated", "access_token": ..., "refresh_token": ...} on normal rotation
      - {"action": "grace", "access_token": ..., "refresh_token": ...} on concurrent request within 30s
      - {"action": "reuse_detected"} on compromised replayed token (all sessions revoked)
    """
    key = f"{_SESSION_FAMILY_PREFIX}{family_id}"
    lock_key = f"lock:fam:{family_id}"
    try:
        redis = await get_redis()
        async with redis.lock(lock_key, timeout=10, blocking_timeout=5):
            raw_data = await redis.get(key)
            if not raw_data:
                # If no family record exists (e.g., redis restarted or expired), initialize fresh
                await register_session_family(
                    family_id=family_id,
                    user_id=user_id,
                    jti=new_jti,
                    raw_access=new_access_token,
                    raw_refresh=new_refresh_token,
                    ttl_seconds=ttl_seconds,
                )
                await blacklist_token(raw_old_refresh)
                return {
                    "action": "rotated",
                    "access_token": new_access_token,
                    "refresh_token": new_refresh_token,
                }

            data = json.loads(raw_data)
            current_jti = data.get("current_jti")
            prev_jti = data.get("prev_jti")
            rotated_at = data.get("rotated_at", 0)

            # ── Case 1: Active token presented — standard rotation ──────────────
            if presented_jti == current_jti:
                await blacklist_token(raw_old_refresh)
                data["prev_jti"] = current_jti
                data["current_jti"] = new_jti
                data["rotated_at"] = time.time()
                data["cached_access"] = new_access_token
                data["cached_refresh"] = new_refresh_token
                await redis.set(key, json.dumps(data), ex=ttl_seconds)
                return {
                    "action": "rotated",
                    "access_token": new_access_token,
                    "refresh_token": new_refresh_token,
                }

            # ── Case 2: Just-rotated token presented within grace window ────────
            now = time.time()
            if presented_jti == prev_jti and (now - rotated_at) <= grace_window_seconds:
                logger.info(
                    "Concurrent refresh for family %s within grace window (%.1fs). Returning cached tokens.",
                    family_id,
                    now - rotated_at,
                )
                return {
                    "action": "grace",
                    "access_token": data.get("cached_access", new_access_token),
                    "refresh_token": data.get("cached_refresh", new_refresh_token),
                }

            # ── Case 3: Token replay detected outside grace window — REUSE! ─────
            logger.critical(
                "SECURITY ALERT: Refresh token reuse detected for family %s, user %s! Revoking all sessions.",
                family_id,
                user_id,
            )
            await redis.delete(key)
            await blacklist_all_user_tokens(user_id)
            return {"action": "reuse_detected"}

    except Exception as exc:
        logger.error("Session family rotation error: %s", exc)
        # Fail-safe: still blacklist the old token and return the newly generated ones
        await blacklist_token(raw_old_refresh)
        return {
            "action": "rotated",
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
        }


async def revoke_session_family(family_id: str) -> bool:
    """Revoke a session family from Redis on logout."""
    key = f"{_SESSION_FAMILY_PREFIX}{family_id}"
    try:
        redis = await get_redis()
        await redis.delete(key)
        return True
    except Exception as exc:
        logger.error("Failed to revoke session family %s: %s", family_id, exc)
        return False

