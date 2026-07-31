"""ML Platform — FastAPI application entry point.

Start locally:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

In Docker:
    docker compose -f infra/docker-compose.yml up api
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services.api.app.routers import auth, datasets, health, jobs

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
# Lock this down in production via an environment variable.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(datasets.router)
app.include_router(jobs.router)

# Mount API v1 prefixes
app.include_router(datasets.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(jobs.router, prefix="/api/v1")
print("\n========== REGISTERED ROUTES ==========")
for route in app.routes:
    methods = ",".join(route.methods)
    print(f"{methods:15} {route.path}")
print("=======================================\n")
