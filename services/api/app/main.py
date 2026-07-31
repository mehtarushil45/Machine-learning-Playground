"""ML Platform — FastAPI application entry point.

Start locally:
    cd services/api
    python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

In Docker:
    docker compose -f infra/docker-compose.yml up api
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, datasets, health, jobs

app = FastAPI(
    title="ML Platform API",
    description=(
        "Organisation-grade ML learning and lab management platform. "
        "Authentication: OAuth2 / JWT (access + refresh tokens). "
        "All data is scoped to an organisation and user."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
# All application routes are served under /api/v1 to match the frontend contract.
# The health endpoint is mounted at root for Docker/k8s liveness probes.
API_V1_PREFIX = "/api/v1"

app.include_router(health.router)
app.include_router(auth.router, prefix=API_V1_PREFIX)
app.include_router(datasets.router, prefix=API_V1_PREFIX)
app.include_router(jobs.router, prefix=API_V1_PREFIX)
