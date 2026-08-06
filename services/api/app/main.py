"""ML Platform — FastAPI application entry point.

Start locally:
    cd services/api
    python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

In Docker:
    docker compose -f infra/docker-compose.yml up api
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, classrooms, datasets, deployments, experiments, explainability, health, jobs, models, pipelines, portfolios, predictions
from app.routers import organizations, workspaces, users_v7a, api_keys, activity  # V7A

app = FastAPI(
    title="ML Platform API",
    description=(
        "Organisation-grade ML learning and lab management platform. "
        "Authentication: OAuth2 / JWT (access + refresh tokens). "
        "All data is scoped to an organisation and user."
    ),
    version="7A.0",
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
app.include_router(experiments.router, prefix=API_V1_PREFIX)
app.include_router(predictions.router, prefix=API_V1_PREFIX)
app.include_router(classrooms.router, prefix=API_V1_PREFIX)
app.include_router(portfolios.router, prefix=API_V1_PREFIX)
app.include_router(pipelines.router, prefix=API_V1_PREFIX)
app.include_router(explainability.router, prefix=API_V1_PREFIX)
app.include_router(deployments.router, prefix=API_V1_PREFIX)
app.include_router(models.router, prefix=API_V1_PREFIX)  # V5A: Model Versioning & Lineage

# ── V7A: Enterprise Organizations, Workspaces & RBAC ─────────────────────────
app.include_router(organizations.router, prefix=API_V1_PREFIX)
app.include_router(workspaces.router, prefix=API_V1_PREFIX)
app.include_router(users_v7a.router, prefix=API_V1_PREFIX)
app.include_router(api_keys.router, prefix=API_V1_PREFIX)
app.include_router(activity.router, prefix=API_V1_PREFIX)
