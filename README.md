# ML Playground — Enterprise Machine Learning Platform

An organisation-grade, multi-tenant machine learning lab and experiment platform built with React 19, TypeScript, Tailwind CSS v4, FastAPI, PostgreSQL, and Redis.

---

## 🏛️ Platform Architecture

```
ml-playground/
├── apps/
│   └── web/                      # React 19 + TypeScript + Vite + APEX Design System
│       ├── src/
│       │   ├── components/       # APEX UI Primitives & App Layout
│       │   ├── dev/apex/         # APEX Component Showcase Playground
│       │   ├── features/datasets/# Ingestion, Profiler, Health Audit, Recommendations, Workspace
│       │   ├── providers/        # ThemeProvider & Context
│       │   ├── services/         # REST API Clients & Client-Side Fallback Engines
│       │   ├── theme/            # Semantic Tokens (Colors, Typography, Spacing, Motion)
│       │   ├── types/            # Strict TypeScript Interfaces
│       │   └── utils/            # Data Validation & Column Analysis Utilities
│       └── tsconfig.json         # Strict TypeScript Configuration
├── services/
│   └── api/                      # FastAPI Backend Service
│       ├── app/
│       │   ├── models/           # Async SQLAlchemy ORM Models (Org, User, Dataset, Job)
│       │   ├── routers/          # REST Endpoint Routers (Upload, Profile, Health, Recs)
│       │   ├── schemas/          # Pydantic v2 Validation Schemas
│       │   ├── security/         # PyJWT Auth (Access & Refresh Tokens)
│       │   └── services/         # Profiler Engine, Health Engine, Recommendation Engine
│       └── uploads/              # Secure Local File Storage
├── infra/                        # Docker Compose Services (PostgreSQL 16, Redis 7, FastAPI)
├── pnpm-workspace.yaml
└── .env.example
```

---

## 🚀 Active REST API Endpoints

| Endpoint | Method | Description | Source of Truth |
| :--- | :---: | :--- | :--- |
| `POST /api/v1/datasets/upload` | `POST` | Uploads and validates CSV files (size $\le$ 50MB, MIME, extension, structure). | Raw Upload File |
| `GET /api/v1/datasets/{id}/profile` | `GET` | Generates column schema, type inference, stats (`mean`, `median`, `std`), and missingness metrics. | TabularDataContainer |
| `GET /api/v1/datasets/{id}/health` | `GET` | Evaluates quality health score (0–100), grade, warnings, issues, and remediations. | DatasetProfileResponse |
| `GET /api/v1/datasets/{id}/recommendations` | `GET` | Recommends problem type, model algorithms, preprocessing pipeline, and target candidates. | Profile & Health Outputs |

---

## ⚡ Dataset Analysis & Workspace Workflow

```
[ Upload CSV ] ──> [ Profiler Engine ] ──> [ Dataset Health Engine ] ──> [ Recommendation Engine ]
                         │                        │                             │
                         ▼                        ▼                             ▼
                 [ Schema Profile ]      [ Health Audit Score ]       [ Task & Model Recommendations ]
                         │                        │                             │
                         └────────────────────────┴─────────────────────────────┘
                                                  │
                                                  ▼
                                      [ Enterprise Workspace ]
                                        • Executive Summary Bar
                                        • Next Best Action Center
                                        • Accordion Sections
                                        • Feature Matrix & Target Selector
```

---

## 🛠️ Sprint Status Overview

* **Sprint 1A (APEX Design System)**: **100% Complete** — Built design token system, dark/light theme engine, APEX component primitives, and layout shell.
* **Sprint 1B Phase 1 (Enterprise Upload)**: **100% Complete** — Implemented MIME, extension, size (50MB), non-empty, and path-traversal validation.
* **Sprint 1B Phase 2 (Dataset Profiler Engine)**: **100% Complete** — Built deterministic column type inference, statistical summaries, and `GET /datasets/{id}/profile` API.
* **Sprint 1B Phase 3 (Dataset Health Engine)**: **100% Complete** — Implemented deterministic quality scoring (0–100), health grade bands, issues list, and `GET /datasets/{id}/health` API.
* **Sprint 1B Phase 4 (ML Recommendation Engine)**: **100% Complete** — Built deterministic ML task classifier, algorithm choices, preprocessing steps, and `GET /datasets/{id}/recommendations` API.
* **Sprint 1B Phase 5 (Enterprise Workspace)**: **100% Complete** — Built top KPI banner, Next Best Action Panel, and collapsible workflow accordions.
* **Sprint 1B Phase 6 (Workflow & State Integration)**: **100% Complete** — Added `AbortController` cancellation, single-flight data orchestration, skeleton loaders, and degraded fallback states.
* **Sprint 1B Phase 7 (Performance & Code Splitting)**: **100% Complete** — Applied `React.memo` across workspace components, `useCallback`/`useMemo` optimizations, and `React.lazy` code splitting for `ApexPlayground` (`13.89 kB` separate chunk).
* **Sprint 1B Phase 8 (Production Readiness & Sign-off)**: **100% Complete** — Verified 0 lint/type/build errors, security audit, and documentation release readiness.

---

## 🔒 Security & Input Validation Controls

1. **CSV Upload Validation**: Enforces extension check (`.csv`), MIME type validation, file size limit ($\le 50\text{MB}$), non-empty payload check, and non-corrupted header/row structure.
2. **Path Traversal Protection**: All user filenames are sanitized using `sanitize_filename()` to prevent directory traversal or remote script execution.
3. **Graceful Error Exposure**: Standardized Pydantic and HTTP Exception handling; internal stack traces are suppressed in production mode.

---

## 📋 Sprint 2 Prerequisites

* **Sprint 2A**: Asynchronous ML training pipeline (Celery ML worker, scikit-learn model fitting, hyperparameter selection, real-time training progress over WebSockets, model metric evaluations).
* **Sprint 2B**: Model registry, artifact persistence (MinIO/S3 object storage), and inference prediction playground.
