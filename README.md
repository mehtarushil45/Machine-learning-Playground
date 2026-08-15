# ⚡ ML Playground — Enterprise Machine Learning Platform

[![Version](https://img.shields.io/badge/version-v2--Launch-4B3B7C?style=for-the-badge)](./README.md)
[![License](https://img.shields.io/badge/license-MIT-6E1423?style=for-the-badge)](./LICENSE)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.0-4169E1?style=for-the-badge&logo=postgresql)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7.2-DC382D?style=for-the-badge&logo=redis)](https://redis.io)
[![MinIO](https://img.shields.io/badge/MinIO-S3--Compatible-C72C48?style=for-the-badge&logo=minio)](https://min.io)

An end-to-end machine learning laboratory platform. Upload a CSV, profile it, train a model, audit fairness, deploy via REST API, and issue a cryptographic portfolio certificate — all in one continuous six-stage lifecycle.

---

## 📋 Table of Contents

- [Architecture Overview](#️-architecture-overview)
- [Six-Page Lifecycle](#-six-page-lifecycle)
- [Technology Stack](#️-technology-stack)
- [BB Design System](#-bb-design-system)
- [Project Context and State](#-project-context--state)
- [Infrastructure and Docker](#-infrastructure--docker)
- [API Reference](#-api-reference)
- [Local Development](#-local-development)
- [Environment Variables](#-environment-variables)

---

## 🏛️ Architecture Overview

```
ml-playground/
├── apps/
│   └── web/                          # React 19 + TypeScript + Vite SPA
│       └── src/
│           ├── providers/
│           │   ├── ProjectContext.tsx # Global 6-page lifecycle state
│           │   ├── AuthContext.tsx
│           │   └── ThemeProvider.tsx
│           ├── components/
│           │   ├── layout/
│           │   │   ├── LifecycleRail.tsx  # 6-stage stepper in header
│           │   │   └── SidebarUserAvatar.tsx
│           │   ├── notifications/    # Real-time WebSocket notification bell
│           │   └── ui/               # ErrorBoundary, Toast, Card, Button, Badge
│           ├── features/
│           │   ├── datasets/         # Page 1 — DatasetProfilerPage (4-panel grid)
│           │   ├── pipelines/        # Page 2 — ViewAsCodeStudio (DAG/Code)
│           │   ├── explainability/   # Page 3 — ExplainabilityHub (SHAP, Fairness)
│           │   ├── classrooms/       # Page 4 — ClassroomHub (Audit)
│           │   ├── deployments/      # Page 5 — DeploymentStudio (1-Click REST)
│           │   └── portfolios/       # Page 6 — PortfolioViewer (HMAC-SHA256 QR)
│           ├── hooks/
│           ├── services/             # REST clients + client-side engines
│           ├── types/
│           └── App.tsx
├── services/
│   └── api/                          # FastAPI + Async SQLAlchemy 2.0
│       ├── routers/                  # datasets, jobs, models, deployments, notifications
│       ├── services/                 # Training orchestration, SHAP, certificate signing
│       ├── models/                   # SQLAlchemy ORM models
│       ├── schemas/                  # Pydantic v2 request/response schemas
│       └── alembic/                  # Database migration history
├── infra/
│   └── docker-compose.yml            # Postgres, Redis, MinIO, migrate (one-shot), api, worker
└── .env.example
```

---

## 🔁 Six-Page Lifecycle

Every session follows a single, linear lifecycle tracked by the **LifecycleRail** in the header and the **ProjectContext** shared across all pages:

| Stage | Page | What happens |
|-------|------|-------------|
| **1 Dataset** | Dataset & Profiler | Upload CSV → auto-profile → health audit → select features/target → launch training |
| **2 Pipeline** | View-as-Code Studio | Inspect generated training code, edit preprocessing DAG, re-run experiments |
| **3 Evaluate** | Explainability & Ethics | SHAP feature importance, fairness audit, what-if counterfactuals |
| **4 Verify** | Classrooms & Audit | Reproducibility audit, submission review for students |
| **5 Deploy** | Deployment Studio | 1-click REST deployment, embed widget generator, canary rollouts |
| **6 Certify** | Portfolios & Verification | Issue HMAC-SHA256 signed certificate, scannable QR code for employers |

The `ProjectContext` carries `dataset`, `selectedFeatures`, `selectedTarget`, `activeJob`, and `lifecycleStage` across all six pages without re-fetching on tab switch.

---

## 🛠️ Technology Stack

### Frontend (apps/web)

| Tool | Version | Purpose |
|------|---------|---------|
| React | 19.0 | UI framework with concurrent rendering |
| TypeScript | 5.7+ | Strict static types |
| Vite | 6.x | HMR dev server, production bundler |
| Lucide React | latest | Icon set |
| Framer Motion | 12.x | Page transitions |

### Backend (services/api)

| Tool | Version | Purpose |
|------|---------|---------|
| FastAPI | 0.110+ | Async REST API with OpenAPI docs |
| SQLAlchemy | 2.0 async | ORM with async session management |
| Alembic | latest | Database schema migrations |
| Celery | 5.x | Async training job worker |
| Pydantic v2 | latest | Request/response validation |
| scikit-learn | latest | Training engine |
| XGBoost / LightGBM | latest | Gradient boosting algorithms |
| SHAP | latest | Explainability values |
| slowapi | latest | Rate limiting |

### Infrastructure

| Service | Image | Purpose |
|---------|-------|---------|
| PostgreSQL | 16 | Primary relational database |
| Redis | 7.2-alpine | Celery broker + result backend |
| MinIO | latest | S3-compatible model artifact storage |
| `migrate` (one-shot) | api Dockerfile | Runs `alembic upgrade head` before api/worker start |

---

## 🎨 BB Design System

All UI uses the **BB (Blueberry-Bordeaux)** design token set:

```ts
const BB = {
  base:         '#0B0912',   // page background
  surface:      '#1B1530',   // cards, panels
  elevated:     '#2A2247',   // inputs, dropdowns
  border:       'rgba(107,92,166,0.18)',
  primary:      '#4B3B7C',   // primary interactive
  primaryLight: '#6C5CA6',   // active states
  maroon:       '#6E1423',   // CTA buttons, danger, active nav accent
  gold:         '#C9A24B',   // WebSocket connected, warnings
  text:         '#F5F1EC',   // primary text
  muted:        '#9E93B8',   // secondary text
  disabled:     '#3D3558',   // disabled/placeholder
}
```

Key patterns: asymmetric chamfered-corner buttons (`8px 8px 0 8px`), maroon `2px` left-border for active nav items, no colored glows, Inter UI font + JetBrains Mono.

---

## 🔗 Project Context & State

`src/providers/ProjectContext.tsx` is the single source of truth:

```ts
interface ProjectState {
  dataset:          Dataset | null;
  selectedFeatures: string[];
  selectedTarget:   string | null;
  activeJob:        JobEntity | null;
  lifecycleStage:   'dataset' | 'pipeline' | 'evaluate' | 'verify' | 'deploy' | 'certify';
}
```

Usage in any page component:

```tsx
const { dataset, selectedFeatures, loadDataset } = useProject();
```

`loadDataset(d)` resets selection state so a new upload always starts clean.

---

## 🐳 Infrastructure & Docker

```bash
cd infra
docker compose up --build
```

The `migrate` service runs `alembic upgrade head` and exits before `api` and `worker` start — solving the race condition where containers could start against an un-migrated schema.

**Dependency graph:**

```
db (healthy) ──→ migrate (exit 0) ──→ api (healthy)
                                  └──→ worker (healthy)
redis (healthy) ───────────────────→ api, worker
minio (healthy) ───────────────────→ api
```

| Service | Port |
|---------|------|
| API | 8000 |
| MinIO console | 9001 |
| PostgreSQL | 5432 |
| Redis | 6379 |

---

## 📡 API Reference

Interactive docs at `http://localhost:8000/docs`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/datasets/upload` | Upload CSV |
| `GET` | `/api/v1/datasets/{id}/profile` | Column-level profile |
| `GET` | `/api/v1/datasets/{id}/health` | Quality score + issue audit |
| `GET` | `/api/v1/datasets/{id}/recommendations` | ML task + algorithm suggestions |
| `POST` | `/api/v1/jobs/` | Submit training job |
| `GET` | `/api/v1/jobs/{id}` | Job status + metrics |
| `GET` | `/api/v1/jobs/{id}/stream` | SSE telemetry stream |
| `POST` | `/api/v1/jobs/{id}/cancel` | Cancel running job |
| `GET` | `/api/v1/models/latest` | Latest trained model |
| `GET` | `/api/v1/algorithms/supported` | Available algorithm list |
| `POST` | `/api/v1/deployments/` | Deploy model as REST endpoint |
| `POST` | `/api/v1/portfolios/verify` | Verify HMAC-SHA256 certificate |
| `WS` | `/ws/notifications` | Real-time WebSocket stream |
| `GET` | `/health/ready` | Docker readiness probe |

---

## ⚡ Local Development

### Frontend only (no Docker needed)

```bash
cd apps/web
npm install
npm run dev
# → http://localhost:5173
```

The frontend has a full client-side profiler, health engine, and recommendation engine. Upload a CSV and the Dataset & Profiler page runs entirely in the browser without any backend.

### Full stack

```bash
cp .env.example .env
# Edit .env with your values

cd infra
docker compose up --build

# Frontend (separate terminal)
cd apps/web
npm run dev
```

### Backend only

```bash
cd services/api
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload --port 8000

# Celery worker (separate terminal)
celery -A services.worker.celery_app worker --loglevel=info
```

---

## 🔑 Environment Variables

Copy `.env.example` to `.env`:

```bash
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/mlplatform
REDIS_URL=redis://localhost:6379/0

S3_ENDPOINT_URL=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_NAME=mlplatform

SECRET_KEY=change-me-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

CERTIFICATE_SECRET_KEY=change-me-in-production
```

> **Never commit .env to version control.** It is listed in .gitignore.

---

## 🔒 Security Notes

- JWT tokens signed with HS256, 60-minute expiry
- Certificate HMAC uses `secrets.compare_digest` (constant-time comparison)
- Rate limiting on all public endpoints via `slowapi`
- `uploads/` directories excluded from git
- The **Simulate Alert** debug button in the notification bell only renders in `import.meta.env.DEV` builds
