"""Rate limiting module for sensitive authentication endpoints (Part B2).

Implements:
1. Redis-backed sliding window rate limiter per client IP.
2. Per-account progressive exponential backoff to deter credential stuffing
   without permanent account lockouts.
3. In-memory graceful fallback when Redis is unavailable.
"""

from __future__ import annotations

import json
import logging
import math
import time
from collections import defaultdict
from typing import Dict, List
from fastapi import HTTPException, Request, status

from app.redis_client import get_redis

logger = logging.getLogger(__name__)

# Fallback in-memory storage when Redis is unavailable
_in_memory_ip_history: Dict[str, List[float]] = defaultdict(list)
_in_memory_account_fails: Dict[str, dict] = {}


def get_client_ip(request: Request) -> str:
    """Extract client IP from headers or client socket."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


async def check_ip_rate_limit(
    ip: str,
    action: str = "login",
    max_requests: int = 20,
    window_seconds: int = 60,
) -> None:
    """Enforce a sliding-window rate limit on an IP address (Redis with memory fallback)."""
    now = time.time()
    cutoff = now - window_seconds
    redis_key = f"rate_limit:ip:{action}:{ip}"

    try:
        redis = await get_redis()
        # Add current timestamp to sorted set
        pipe = redis.pipeline()
        pipe.zremrangebyscore(redis_key, 0, cutoff)
        pipe.zadd(redis_key, {str(now): now})
        pipe.zcard(redis_key)
        pipe.expire(redis_key, window_seconds + 5)
        results = await pipe.execute()
        count = results[2]

        if count > max_requests:
            # Find earliest timestamp to compute exact retry after seconds
            oldest = await redis.zrange(redis_key, 0, 0, withscores=True)
            retry_after = window_seconds
            if oldest:
                retry_after = max(1, math.ceil(window_seconds - (now - float(oldest[0][1]))))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many {action} attempts. Please try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )
        return
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Redis rate limiter unavailable (%s); falling back to in-memory: %s", action, exc)

    # In-memory fallback
    hist_key = f"{action}:{ip}"
    _in_memory_ip_history[hist_key] = [t for t in _in_memory_ip_history[hist_key] if t > cutoff]
    if len(_in_memory_ip_history[hist_key]) >= max_requests:
        oldest_ts = _in_memory_ip_history[hist_key][0]
        retry_after = max(1, math.ceil(window_seconds - (now - oldest_ts)))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many {action} attempts. Please try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )
    _in_memory_ip_history[hist_key].append(now)


async def check_account_progressive_delay(email: str) -> None:
    """Check if the account must wait before making another login attempt (B2).

    Delay progression based on consecutive failures:
      1-3 failures: 0s delay
      4 failures:   2s delay
      5 failures:   4s delay
      6 failures:   8s delay
      7 failures:   16s delay
      8+ failures:  30s delay (clamped)
    """
    clean_email = email.strip().lower()
    redis_key = f"rate_limit:account:{clean_email}"
    now = time.time()

    count = 0
    last_fail = 0.0

    try:
        redis = await get_redis()
        raw = await redis.get(redis_key)
        if raw:
            data = json.loads(raw)
            count = data.get("count", 0)
            last_fail = data.get("last_fail", 0.0)
    except Exception as exc:
        logger.warning("Redis account rate check failed: %s; using in-memory", exc)
        data = _in_memory_account_fails.get(clean_email, {})
        count = data.get("count", 0)
        last_fail = data.get("last_fail", 0.0)

    if count < 4:
        return

    # Progressive delay calculation: 2 ** (count - 3), clamped to 30s
    required_delay = min(30, 2 ** (count - 3))
    elapsed = now - last_fail
    if elapsed < required_delay:
        wait_seconds = math.ceil(required_delay - elapsed)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts for this account. Please wait {wait_seconds} seconds before trying again.",
            headers={"Retry-After": str(wait_seconds)},
        )


async def record_account_login_failure(email: str) -> int:
    """Record a failed login attempt for an account and return the required delay (seconds)."""
    clean_email = email.strip().lower()
    redis_key = f"rate_limit:account:{clean_email}"
    now = time.time()
    ttl = 900  # 15 minutes window

    count = 1
    try:
        redis = await get_redis()
        raw = await redis.get(redis_key)
        if raw:
            data = json.loads(raw)
            count = data.get("count", 0) + 1
        data = {"count": count, "last_fail": now}
        await redis.set(redis_key, json.dumps(data), ex=ttl)
    except Exception as exc:
        logger.warning("Failed to record account failure in Redis: %s; using in-memory", exc)
        data = _in_memory_account_fails.get(clean_email, {"count": 0})
        count = data["count"] + 1
        _in_memory_account_fails[clean_email] = {"count": count, "last_fail": now}

    if count < 4:
        return 0
    return min(30, 2 ** (count - 3))


async def reset_account_login_failures(email: str) -> None:
    """Clear failed login attempts upon successful authentication."""
    clean_email = email.strip().lower()
    redis_key = f"rate_limit:account:{clean_email}"
    try:
        redis = await get_redis()
        await redis.delete(redis_key)
    except Exception:
        pass
    _in_memory_account_fails.pop(clean_email, None)


async def check_register_rate_limit(request: Request) -> None:
    """FastAPI dependency enforcing rate limiting on registration endpoints."""
    ip = get_client_ip(request)
    await check_ip_rate_limit(ip, action="register", max_requests=10, window_seconds=60)


async def check_forgot_password_rate_limit(request: Request) -> None:
    """FastAPI dependency enforcing rate limiting on password reset requests."""
    ip = get_client_ip(request)
    await check_ip_rate_limit(ip, action="password_reset", max_requests=5, window_seconds=60)

