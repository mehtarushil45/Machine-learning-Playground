"""ML Platform — FastAPI application entry point.

Start locally:
    cd services/api
    python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

In Docker:
    docker compose -f infra/docker-compose.yml up api
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.middleware.blacklist import TokenBlacklistMiddleware
from app.redis_client import close_redis, ping_redis

from app.routers import auth, classrooms, datasets, deployments, experiments, explainability, health, jobs, models, notifications, pipelines, portfolios, predictions
from app.routers import organizations, workspaces, users_v7a, api_keys, activity  # V7A
from app.routers import admin  # V7B Part 1
from app.routers import studio, explainability_v7b, portfolios_v7b, classrooms_v7b, workflow  # V7B Part 2


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown hooks."""
    # ── Startup ───────────────────────────────────────────────────────────────
    redis_ok = await ping_redis()
    if redis_ok:
        import logging
        logging.getLogger(__name__).info("Redis connection verified at startup.")
    else:
        import logging
        logging.getLogger(__name__).warning(
            "Redis unreachable at startup — token blacklisting will fail-open."
        )
    yield
    # ── Shutdown ──────────────────────────────────────────────────────────────
    await close_redis()


app = FastAPI(
    title="ML Platform API",
    description=(
        "Organisation-grade ML learning and lab management platform. "
        "Authentication: OAuth2 / JWT (access + refresh tokens) with Redis-backed blacklisting. "
        "All data is scoped to an organisation and user."
    ),
    version="7B.2",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── Middleware (order matters — added last, runs first) ───────────────────────
# CORS must be outermost; blacklist runs inside CORS so it has parsed headers.
#
# IMPORTANT: allow_credentials=True requires an explicit origin list.
# Wildcard "*" is rejected by browsers when credentials (cookies) are included.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",    # Vite dev server
        "http://127.0.0.1:5173",   # Vite dev server (loopback alias)
        "http://localhost:4173",    # Vite preview
        "http://localhost:3000",    # CRA / alternate dev port
    ],
    allow_credentials=True,        # ← Required for httpOnly cookie auth
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Set-Cookie"],  # ← Let browser JS see Set-Cookie in preflight
)
app.add_middleware(TokenBlacklistMiddleware)

# ── Request ID & Contextual Logging Middleware ─────────────────────────────
from app.middleware.request_id import (
    RequestIDMiddleware,
    configure_structlog,
    register_request_id_exception_handlers,
    setup_celery_request_id_signals,
)

configure_structlog()
setup_celery_request_id_signals()
app.add_middleware(RequestIDMiddleware)
register_request_id_exception_handlers(app)

# ── SlowAPI Rate Limiting ─────────────────────────────────────────────────────
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.rate_limiter import limiter, custom_rate_limit_exceeded_handler

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, custom_rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────
# All application routes are served under /api/v1 to match the frontend contract.
# The health endpoint is mounted at root for Docker/k8s liveness probes.
API_V1_PREFIX = "/api/v1"

app.include_router(health.router)
app.include_router(auth.router, prefix=API_V1_PREFIX)
app.include_router(datasets.router, prefix=API_V1_PREFIX)
app.include_router(jobs.router, prefix=API_V1_PREFIX)
app.include_router(experiments.router, prefix=API_V1_PREFIX)
app.include_router(predictions.router, prefix=API_V1_PREFIX)
app.include_router(classrooms.router, prefix=API_V1_PREFIX)
app.include_router(portfolios.router, prefix=API_V1_PREFIX)
app.include_router(pipelines.router, prefix=API_V1_PREFIX)
app.include_router(explainability.router, prefix=API_V1_PREFIX)
app.include_router(deployments.router, prefix=API_V1_PREFIX)
app.include_router(models.router, prefix=API_V1_PREFIX)  # V5A: Model Versioning & Lineage
app.include_router(notifications.router, prefix=API_V1_PREFIX)

# ── V7A: Enterprise Organizations, Workspaces & RBAC ─────────────────────────
app.include_router(organizations.router, prefix=API_V1_PREFIX)
app.include_router(workspaces.router, prefix=API_V1_PREFIX)
app.include_router(users_v7a.router, prefix=API_V1_PREFIX)
app.include_router(api_keys.router, prefix=API_V1_PREFIX)
app.include_router(activity.router, prefix=API_V1_PREFIX)
app.include_router(admin.router, prefix=API_V1_PREFIX)  # V7B Part 1

# ── V7B Part 2: Enterprise Platform Completion ────────────────────────────────
app.include_router(studio.router, prefix=API_V1_PREFIX)              # View-as-Code Studio
app.include_router(explainability_v7b.router, prefix=API_V1_PREFIX)  # Ethics & Trust
app.include_router(portfolios_v7b.router, prefix=API_V1_PREFIX)      # Portfolio+
app.include_router(classrooms_v7b.router, prefix=API_V1_PREFIX)      # Classroom Analytics
app.include_router(workflow.router, prefix=API_V1_PREFIX)             # E2E Workflow


@app.get(f"{API_V1_PREFIX}/algorithms", tags=["Algorithms"])
async def get_algorithms():
    """Return dictionary of supported classification and regression algorithms."""
    from app.ml.model_factory import list_supported_algorithms
    return list_supported_algorithms()
