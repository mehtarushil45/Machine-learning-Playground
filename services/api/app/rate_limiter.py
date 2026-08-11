"""SlowAPI Rate Limiter module.

Features:
- Extract user identity from JWT 'sub' claim (from Authorization header or access_token cookie)
- Fall back to remote client IP address for unauthenticated requests
- Per-endpoint rate limits (e.g. 10/min for training/writes, 60/min for reads)
- Structured 429 Error Responses with Retry-After headers
"""

from __future__ import annotations

import logging
import jwt
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings

logger = logging.getLogger("apex_ml.rate_limiter")


def get_jwt_sub_or_ip(request: Request) -> str:
    """Extract user identity from JWT 'sub' claim or fallback to client remote IP address."""
    token = None

    # 1. Inspect Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()

    # 2. Inspect access_token cookie
    if not token:
        token = request.cookies.get("access_token")

    if token:
        try:
            payload = jwt.decode(
                token,
                settings.secret_key,
                algorithms=["HS256"],
                options={"verify_exp": True},
            )
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except Exception:
            pass

    # 3. Fall back to client IP address
    return f"ip:{get_remote_address(request)}"


# Initialize SlowAPI Limiter with JWT key function
limiter = Limiter(key_func=get_jwt_sub_or_ip, default_limits=["60/minute"])


def custom_rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Custom HTTP 429 response handler for RateLimitExceeded exceptions."""
    detail = f"Rate limit exceeded: {exc.detail}. Please slow down."
    logger.warning("Rate limit exceeded for %s on %s: %s", get_jwt_sub_or_ip(request), request.url.path, exc.detail)
    
    req_id = getattr(request.state, "request_id", None) or ""

    response = JSONResponse(
        status_code=429,
        content={
            "detail": detail,
            "error": "RateLimitExceeded",
            "status_code": 429,
            "request_id": req_id,
        },
    )
    response.headers["Retry-After"] = "60"
    if req_id:
        response.headers["X-Request-ID"] = req_id
    return response
