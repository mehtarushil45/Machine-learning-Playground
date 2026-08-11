"""Request ID Middleware & Contextual Logging Module.

Features:
- Generates or propagates `X-Request-ID` HTTP headers for all FastAPI requests.
- Binds `request_id` into Python logging context via `structlog.contextvars`.
- Provides `get_request_id()` contextvar helper.
- Propagates `request_id` into Celery task headers & worker execution context.
- Injects `request_id` into all error response bodies and response headers.
"""

from __future__ import annotations

import logging
import uuid
from contextvars import ContextVar
from typing import Any, Callable, Dict, Optional

import structlog
from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger("apex_ml.request_id")

# Context variable tracking current request_id across async call stacks
request_id_ctx_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)


def get_request_id() -> Optional[str]:
    """Retrieve the current request ID from contextvars."""
    return request_id_ctx_var.get()


def configure_structlog() -> None:
    """Configure structlog with contextvars processor for automatic request_id logging."""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=False,
    )


class RequestIDMiddleware(BaseHTTPMiddleware):
    """FastAPI Middleware to manage X-Request-ID header propagation & contextvars."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 1. Inspect incoming header or generate new request_id
        req_id = request.headers.get("X-Request-ID") or request.headers.get("x-request-id")
        if not req_id:
            req_id = f"req_{uuid.uuid4().hex[:16]}"

        # 2. Store in request.state and contextvars
        request.state.request_id = req_id
        token = request_id_ctx_var.set(req_id)
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=req_id)

        try:
            response: Response = await call_next(request)
            response.headers["X-Request-ID"] = req_id
            return response
        finally:
            request_id_ctx_var.reset(token)
            structlog.contextvars.clear_contextvars()


def format_error_payload(
    detail: Any,
    status_code: int,
    request: Request,
    error_type: Optional[str] = None,
) -> Dict[str, Any]:
    """Format structured error payload containing request_id."""
    req_id = getattr(request.state, "request_id", None) or get_request_id() or ""
    payload: Dict[str, Any] = {
        "detail": detail,
        "status_code": status_code,
        "request_id": req_id,
    }
    if error_type:
        payload["error"] = error_type
    return payload


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Exception handler for HTTPExceptions including request_id."""
    payload = format_error_payload(exc.detail, exc.status_code, request)
    req_id = payload["request_id"]
    response = JSONResponse(status_code=exc.status_code, content=payload)
    if req_id:
        response.headers["X-Request-ID"] = req_id
    return response


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Exception handler for RequestValidationError including request_id."""
    payload = format_error_payload(
        detail=exc.errors(),
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        request=request,
        error_type="ValidationError",
    )
    req_id = payload["request_id"]
    response = JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=payload)
    if req_id:
        response.headers["X-Request-ID"] = req_id
    return response


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Exception handler for unhandled server errors including request_id."""
    req_id = getattr(request.state, "request_id", None) or get_request_id() or ""
    logger.error("Unhandled internal server error", error=str(exc), request_id=req_id, exc_info=True)
    payload = format_error_payload(
        detail="Internal server error",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        request=request,
        error_type="InternalServerError",
    )
    response = JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content=payload)
    if req_id:
        response.headers["X-Request-ID"] = req_id
    return response


def register_request_id_exception_handlers(app: FastAPI) -> None:
    """Register request_id exception handlers on FastAPI application."""
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)


# ── Celery Signal Integration ────────────────────────────────────────────────
try:
    from celery.signals import before_task_publish, task_prerun

    @before_task_publish.connect(weak=False)
    def add_request_id_to_celery_task(headers=None, **kwargs):
        """Inject request_id into Celery task headers prior to publication."""
        if headers is not None:
            req_id = get_request_id()
            if req_id and "request_id" not in headers:
                headers["request_id"] = req_id

    @task_prerun.connect(weak=False)
    def setup_celery_task_request_id(task_id=None, task=None, args=None, kwargs=None, **extra):
        """Extract request_id from task headers/kwargs and bind to structlog context in worker."""
        req_id = None
        if task and hasattr(task, "request") and task.request:
            task_headers = getattr(task.request, "headers", None) or {}
            req_id = task_headers.get("request_id")

        if not req_id and kwargs and "request_id" in kwargs:
            req_id = kwargs["request_id"]

        if req_id:
            request_id_ctx_var.set(req_id)
            structlog.contextvars.bind_contextvars(request_id=req_id)

except ImportError:
    def add_request_id_to_celery_task(headers=None, **kwargs):
        pass

    def setup_celery_task_request_id(task_id=None, task=None, args=None, kwargs=None, **extra):
        pass


def setup_celery_request_id_signals(celery_app: Any = None) -> None:
    """Helper initializer to ensure Celery signals are registered."""
    pass
