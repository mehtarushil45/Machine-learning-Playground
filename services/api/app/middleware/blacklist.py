"""JWT Blacklist Middleware.

Provides ``TokenBlacklistMiddleware`` — a Starlette ``BaseHTTPMiddleware``
that intercepts every request carrying a Bearer token and short-circuits with
HTTP 401 **before** the route handler runs if the token is blacklisted.

Why middleware AND the dependency check?
----------------------------------------
The dependency in ``get_current_user`` catches most cases.  This middleware
adds a defence-in-depth layer for routes that don't use ``CurrentUser`` (e.g.
health checks, docs) and ensures revoked tokens can never reach any handler.

Excluded paths
--------------
Paths that don't require auth are skipped entirely so the middleware adds
zero latency to them.  Configure via ``BLACKLIST_EXEMPT_PREFIXES`` below.

Performance
-----------
A single ``EXISTS`` call to Redis is O(1) and typically < 1 ms on a
co-located Redis instance.  The middleware only fires when an Authorization
header is present; anonymous requests pay no cost.
"""

from __future__ import annotations

import logging

from fastapi import status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.auth.blacklist import is_token_blacklisted

logger = logging.getLogger(__name__)

# These path prefixes skip the blacklist check entirely.
# Docs, health, and the login/refresh endpoints must be exempt.
_EXEMPT_PREFIXES: tuple[str, ...] = (
    "/docs",
    "/redoc",
    "/openapi.json",
    "/health",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",   # refresh validates its own token separately
)


def _extract_bearer(request: Request) -> str | None:
    """Return the raw token string from the Authorization header, or None."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip() or None
    return None


class TokenBlacklistMiddleware(BaseHTTPMiddleware):
    """Middleware that rejects blacklisted JWT tokens before route dispatch.

    Attach to the FastAPI app:

        from app.middleware.blacklist import TokenBlacklistMiddleware
        app.add_middleware(TokenBlacklistMiddleware)
    """

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        # Skip exempt paths
        path = request.url.path
        if any(path.startswith(prefix) for prefix in _EXEMPT_PREFIXES):
            return await call_next(request)

        # Only check requests that carry a Bearer token
        raw_token = _extract_bearer(request)
        if raw_token is None:
            return await call_next(request)

        # Redis blacklist check — fail-open on Redis error
        if await is_token_blacklisted(raw_token):
            logger.warning(
                "Blacklisted token rejected by middleware. path=%s", path
            )
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Token has been revoked"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        return await call_next(request)
