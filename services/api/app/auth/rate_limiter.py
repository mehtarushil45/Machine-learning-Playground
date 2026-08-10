"""Rate limiting module for sensitive authentication endpoints.

Implements an in-memory sliding window rate limiter per client IP address.
"""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Dict, List
from fastapi import HTTPException, Request, status


class RateLimiter:
    """Sliding-window rate limiter for client request control."""

    def __init__(self, max_requests: int = 5, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._history: Dict[str, List[float]] = defaultdict(list)

    def check(self, key: str) -> None:
        """Check if request rate limit is exceeded for *key* (e.g. client IP)."""
        now = time.time()
        cutoff = now - self.window_seconds

        # Retain timestamps within active sliding window
        self._history[key] = [t for t in self._history[key] if t > cutoff]

        if len(self._history[key]) >= self.max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Maximum {self.max_requests} requests per {self.window_seconds} seconds.",
            )
        self._history[key].append(now)

    def reset(self, key: str | None = None) -> None:
        """Reset rate limit history for a specific key or all keys."""
        if key:
            self._history.pop(key, None)
        else:
            self._history.clear()


# Default registration rate limiter: max 5 requests per 60 seconds
registration_limiter = RateLimiter(max_requests=5, window_seconds=60)


async def check_register_rate_limit(request: Request) -> None:
    """FastAPI dependency enforcing rate limiting on registration endpoints."""
    client_ip = "127.0.0.1"
    if request.client and request.client.host:
        client_ip = request.client.host

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    registration_limiter.check(client_ip)
