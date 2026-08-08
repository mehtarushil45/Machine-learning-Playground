"""Redis client factory — single async connection pool for the entire app.

Design decisions:
  - One shared pool (redis.asyncio.ConnectionPool) — avoids a new TCP
    connection on every request.
  - ``get_redis()`` returns the pool-backed client; callers must not close it.
  - ``close_redis()`` is called once on app shutdown via the lifespan context.
  - The module is intentionally small: it knows nothing about tokens or business
    logic. That lives in ``app.auth.blacklist``.

Usage:
    from app.redis_client import get_redis

    redis = await get_redis()
    await redis.set("key", "value", ex=60)
"""

from __future__ import annotations

import logging
from typing import Optional

import redis.asyncio as aioredis
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level pool — initialised once on first call to get_redis()
_pool: Optional[aioredis.ConnectionPool] = None
_client: Optional[Redis] = None


def _build_pool() -> aioredis.ConnectionPool:
    """Create a connection pool from REDIS_URL in settings."""
    return aioredis.ConnectionPool.from_url(
        settings.redis_url,
        max_connections=20,
        decode_responses=True,  # all values come back as str, not bytes
        socket_connect_timeout=2,
        socket_timeout=2,
        retry_on_timeout=True,
    )


async def get_redis() -> Redis:
    """Return the shared async Redis client.

    Creates the pool on the first call (lazy init).  Thread-safe because
    FastAPI runs in a single asyncio event loop.
    """
    global _pool, _client
    if _client is None:
        _pool = _build_pool()
        _client = aioredis.Redis(connection_pool=_pool)
    return _client


async def ping_redis() -> bool:
    """Return True if Redis is reachable, False otherwise. Never raises."""
    try:
        client = await get_redis()
        return await client.ping()
    except Exception:
        return False


async def close_redis() -> None:
    """Gracefully close the connection pool. Call from app lifespan shutdown."""
    global _pool, _client
    if _client is not None:
        await _client.aclose()
        _client = None
    if _pool is not None:
        await _pool.aclose()
        _pool = None
    logger.info("Redis connection pool closed.")
