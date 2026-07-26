# ml-playground

An organisation-grade ML learning and lab management platform.

## Monorepo layout

```
ml-playground/
├── apps/
│   └── web/              # React + TypeScript frontend (Vite)
├── services/
│   ├── api/              # FastAPI backend  (Batch 3)
│   └── worker/           # Celery + Redis ML worker  (Batch 4)
├── packages/
│   └── shared-types/     # Shared TypeScript types  (future)
├── infra/                # Docker Compose, nginx  (Batch 3+)
├── pnpm-workspace.yaml
└── .env.example
```

## Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 20 LTS |
| pnpm | 9 |
| Docker + Compose | 24 |
| Python | 3.12 |

## Quick start (frontend only)

```bash
pnpm install
pnpm dev          # starts Vite at http://localhost:5173
```

## Available scripts (run from repo root)

| Command | What it does |
|---|---|
| `pnpm dev` | Start the frontend dev server |
| `pnpm build` | Production build → `apps/web/dist/` |
| `pnpm lint` | ESLint across the web app |
| `pnpm preview` | Preview the production build locally |

## Working features

- CSV upload with file-type and content validation
- Dataset preview (first 10 rows, "Missing" for blank cells)
- Automatic numeric-column detection
- Feature column (multi-select) and target column (single) selection with mutual-exclusion

## Architecture decisions

- **Auth:** FastAPI OAuth2 / JWT — access token + refresh token
- **Multi-tenancy:** Organisation-scoped + user-scoped datasets and jobs
- **Object storage:** MinIO locally; AWS S3-compatible API in production
- **ML:** scikit-learn first; PyTorch added later; all training in the Python worker
- **Frontend state:** React local state until shared state is actually needed

## Environment variables

Copy `.env.example` to `.env` and fill in values before running services:

```bash
cp .env.example .env
```
