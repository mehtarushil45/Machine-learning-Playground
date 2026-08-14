# ⚡ ML Playground — Enterprise Machine Learning Platform

[![Version](https://img.shields.io/badge/version-7B.2--Enterprise-4B3B7C?style=for-the-badge)](./README.md)
[![License](https://img.shields.io/badge/license-MIT-6E1423?style=for-the-badge)](./LICENSE)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.0-4169E1?style=for-the-badge&logo=postgresql)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7.2-DC382D?style=for-the-badge&logo=redis)](https://redis.io)

An organisation-grade, multi-tenant machine learning laboratory, experiment tracker, model governance, and deployment orchestration platform. Built with **React 19**, **TypeScript**, **FastAPI**, **Async SQLAlchemy 2.0**, **PostgreSQL 16**, **Redis 7**, and **MinIO S3 Storage**.

---

## 📋 Table of Contents

- [🏛️ Platform Architecture](#️-platform-architecture)
- [🛠️ Technology Stack & Tools Used](#️-technology-stack--tools-used)
- [✨ Core Modules & Capabilities](#-core-modules--capabilities)
  - [1. Data Lab & Tabular Profiler Engine](#1-data-lab--tabular-profiler-engine)
  - [2. View-as-Code Studio (Bi-Directional DSL Engine)](#2-view-as-code-studio-bi-directional-dsl-engine)
  - [3. Explainability, Fairness & Ethics Suite](#3-explainability-fairness--ethics-suite)
  - [4. Model Registry & Lifecycle Governance](#4-model-registry--lifecycle-governance)
  - [5. 1-Click Deployment Studio & API Widgets](#5-1-click-deployment-studio--api-widgets)
  - [6. Classroom & Audit Reproducibility Engine](#6-classroom--audit-reproducibility-engine)
  - [7. Learner Portfolios & Cryptographic QR Verification](#7-learner-portfolios--cryptographic-qr-verification)
  - [8. Operations Center & Enterprise Administration](#8-operations-center--enterprise-administration)
- [🔒 Security & Compliance Architecture](#-security--compliance-architecture)
- [🚀 REST API Reference Directory](#-rest-api-reference-directory)
- [⚡ Local Development & Setup Guide](#-local-development--setup-guide)
- [🎨 APEX Design System & UI Architecture](#-apex-design-system--ui-architecture)

---

## 🏛️ Platform Architecture

The system operates as a monorepo containing a modern SPA frontend (`apps/web`), an asynchronous REST microservice (`services/api`), and containerized infrastructure services (`infra`).

```
ml-playground/
├── apps/
│   └── web/                          # React 19 + TypeScript + Vite + APEX UI System
│       ├── src/
│       │   ├── components/           # UI Primitives, Portals, Error Boundaries & Layout
│       │   │   ├── layout/           # Sidebar, User Avatar, Header controls
│       │   │   ├── notifications/    # Real-time Notification Bell & Drawer
│       │   │   └── ui/               # ErrorBoundary, Toast, Modal, Dropdown Portals
│       │   ├── dev/apex/             # APEX Design Token & Primitive Showcase
│       │   ├── features/             # Feature Modules (Data Lab, Studio, Ethics, Deployments)
│       │   │   ├── classrooms/       # ClassroomHub & Student Audit Dashboards
│       │   │   ├── datasets/         # EnterpriseWorkspace, Profiler, Health Audit
│       │   │   ├── deployments/      # DeploymentStudio, REST Widget Generator
│       │   │   ├── explainability/   # ExplainabilityHub (SHAP, Fairness, Counterfactuals)
│       │   │   ├── pipelines/        # ViewAsCodeStudio (DAG Visual Editor & DSL)
│       │   │   └── portfolios/       # PortfolioViewer & Cryptographic QR Certs
│       │   ├── hooks/                # Custom React Hooks (useLatestModel, useAuth)
│       │   ├── providers/            # AuthContext, ThemeProvider, QueryProvider
│       │   ├── services/             # REST Clients & Client-Side Logic Engines
│       │   ├── theme/                # Semantic Design Tokens (Colors, Typography, Motion)
│       │   ├── types/                # Strict TypeScript Interfaces & Schemas
│       │   └── utils/                # Data Validation & Profiling Helpers
│       └── tsconfig.json             # Strict TypeScript Configuration
├── services/
│   └── api/                          # FastAPI Backend Service (Python 3.10+)
│       ├── app/
│       │   ├── admin/                # Enterprise Operations, Backups, Flags, Audits
│       │   ├── auth/                 # JWT Token Encoding/Decoding, Redis Blacklist
│       │   ├── core/                 # RBAC Engine, Permission Matrix & Context
│       │   ├── ingestion/            # File Processing & MinIO S3 Backend
│       │   ├── ml/                   # ML Core Engines
│       │   │   ├── activity_feed.py  # Immutable JSONL Workspace Audit Trail
│       │   │   ├── api_key_manager.py# Hashed API Key Engine (SHA-256)
│       │   │   ├── cert_generator.py # HMAC-SHA256 Certificate Signer & QR Verifier
│       │   │   ├── code_generator.py # Visual DAG to Python Code Compiler
│       │   │   ├── ethics_engine.py  # Ethics Scoring & Multi-Attribute Bias Audits
│       │   │   ├── explainability.py # Global SHAP & Local Force Waterfall Calculations
│       │   │   ├── fairness_checker.py# Disparate Impact & Equal Opportunity Audits
│       │   │   ├── inference_engine.py# Real-Time & Batch Prediction Engine
│       │   │   ├── model_governance.py# Lifecycle Transitions & Champion/Challenger
│       │   │   ├── model_registry.py # Model Version Control & Artifact Metadata
│       │   │   └── profiler_engine.py# Deterministic Column Inference & Stats
│       │   ├── models/               # Async SQLAlchemy 2.0 ORM Models
│       │   │   ├── api_key.py        # API Keys (Hashed)
│       │   │   ├── classroom.py      # Classrooms, Assignments, Submissions, Portfolios
│       │   │   ├── dataset.py        # Datasets & Metadata
│       │   │   ├── deployment.py     # Deployments & Endpoint Traffic Configurations
│       │   │   ├── organisation.py   # Multi-Tenant Organisations
│       │   │   ├── user.py           # Users & UserRole Enums
│       │   │   ├── workspace.py      # Workspaces & Collaboration Boundaries
│       │   │   └── workspace_member.py# Workspace Roles & Member Status
│       │   ├── rbac/                 # Workspace & Org Permission Enforcers
│       │   ├── routers/              # 23 FastAPI REST Endpoints (Auth Protected)
│       │   ├── schemas/              # Pydantic v2 Request/Response Schemas
│       │   ├── config.py             # Security-Enforced Settings (Pydantic Settings)
│       │   ├── database.py           # Async SQLAlchemy Engine & Session Pool
│       │   ├── dependencies.py       # CurrentUser, AdminUser, DBSession Injectors
│       │   └── main.py               # FastAPI App Initialization & Middleware
│       └── uploads/                  # Storage Root (Datasets, Models, Activity Audit)
├── infra/                            # Docker Compose Stack
│   └── docker-compose.yml            # PostgreSQL 16, Redis 7, MinIO, FastAPI
├── pyproject.toml                    # Monorepo Python Configuration
├── pnpm-workspace.yaml               # Monorepo Node Configuration
└── .env.example                      # Complete Environment Variable Template
```

---

## 🛠️ Technology Stack & Tools Used

### **Frontend Infrastructure**
* **Core Framework**: `React 19` (Concurrent Rendering, Transitions)
* **Language**: `TypeScript 5.7+` (Strict Type System, Zero `any`)
* **Build System**: `Vite 6` (Hot Module Replacement, Dynamic Code Splitting)
* **Styling & Tokens**: Custom Vanilla CSS with APEX Design System Tokens (Dark/Light mode, Glassmorphism, HSL tailwind-free variables)
* **State & Data Fetching**: `@tanstack/react-query` v5 for async server state, React Context API for authentication & theme
* **Iconography**: `lucide-react`
* **Portals & Error Resilience**: React Portals (`createPortal`) for dynamic positioning strategy, Class-based `ErrorBoundary` with Sentry integration and per-tab fault isolation

### **Backend Infrastructure**
* **Core Service**: `Python 3.10+` with `FastAPI` (Asynchronous ASGI Web Framework)
* **Data Persistence**: `SQLAlchemy 2.0` (AsyncIO mode) with `asyncpg` driver & `PostgreSQL 16`
* **Validation & Schemas**: `Pydantic v2` (BaseModel with field validators & custom type coercion)
* **Authentication & Security**: `PyJWT` (JWT encoding/decoding), `Passlib` (Argon2 / Bcrypt password hashing), `slowapi` (Redis-backed rate limiting), `python-multipart` (Streamed file processing)
* **Caching & Message Broker**: `Redis 7.2` (Token blacklist, per-user version bulk revocation, rate limiting window)
* **Object Storage**: `MinIO` (S3 API Compatible storage for raw datasets & pickled model artifacts)

### **Machine Learning & Analytics Stack**
* **ML Engines**: `scikit-learn`, `pandas`, `numpy`, `joblib`
* **Classification Algorithms**: Logistic Regression, Random Forest Classifier, Gradient Boosting Classifier, Decision Trees, Support Vector Machines (SVM), K-Nearest Neighbors (KNN), XGBoost-style Ensembles
* **Regression Algorithms**: Linear Regression, Ridge Regression, Lasso Regression, Random Forest Regressor, Gradient Boosting Regressor
* **Evaluation Metrics**: Accuracy, Precision, Recall, F1-Score, ROC-AUC, Mean Squared Error (MSE), Root Mean Squared Error (RMSE), Mean Absolute Error (MAE), R² Score
* **Explainability & Fairness**: SHAP (SHapley Additive exPlanations) values engine, Permutation Importance, Disparate Impact Ratio, Demographic Parity, Equal Opportunity Difference, Counterfactual What-If Simulator

---

## ✨ Core Modules & Capabilities

### 1. Data Lab & Tabular Profiler Engine
* **Streamed File Ingestion**: Uploads CSV datasets up to 50MB with instant MIME, header, extension, and corrupted row validation.
* **Deterministic Type Inference**: Classifies columns automatically into `numeric`, `categorical`, `datetime`, `boolean`, or `text`.
* **Statistical Summaries**: Calculates mean, median, standard deviation, min/max, missing values, skewness, and cardinality.
* **Quality Health Scoring**: Computes a deterministic 0–100 dataset health score with issue detection (high missingness, duplicate rows, zero-variance columns) and automated remediation steps.
* **ML Task Classification**: Recommends problem type (`binary_classification`, `multiclass_classification`, `regression`), candidate target columns, and pre-processing pipeline configurations.

### 2. View-as-Code Studio (Bi-Directional DSL Engine)
* **Visual Pipeline DAG**: Interactive visual node canvas for dataset loading, feature preprocessing, model training, evaluation, and deployment.
* **Bi-Directional Sync**: Instant two-way translation between visual DAG nodes and declarative YAML/JSON DSL files.
* **Code Compiler**: Generates clean, production-ready Python scikit-learn code directly from pipeline specifications.
* **DSL Versioning & Templates**: Supports pipeline templates, snapshotting, and diffing across pipeline iterations.

### 3. Explainability, Fairness & Ethics Suite
* **Global Model Interpretability**: Generates feature importance rankings and global SHAP summary statistics to explain model drivers.
* **Local Waterfall Force Plots**: Computes individual prediction force plots detailing feature contributions for any specific data point.
* **Demographic Bias & Fairness Audit**: Evaluates model predictions across protected attributes (gender, age, ethnicity) to detect Disparate Impact, Demographic Parity violations, and Equal Opportunity gaps.
* **Counterfactual "What-If" Simulator**: Allows interactive feature tweaks to calculate exact feature changes required to flip a model output (e.g. loan rejection to approval).
* **Trust & Ethics Score**: Generates comprehensive PDF-ready model ethics reports combining fairness, explainability, performance, and governance compliance.

### 4. Model Registry & Lifecycle Governance
* **Versioned Model Management**: Stores models with semantic versioning (`v1.0.0`), metrics snapshots, and hyperparameter logs.
* **Governance Lifecycle Engine**: Strict state machine for model lifecycle transitions:
  $$\text{DRAFT} \longrightarrow \text{EXPERIMENTAL} \longrightarrow \text{CANDIDATE} \longrightarrow \text{STAGING} \longrightarrow \text{ACTIVE} \longrightarrow \text{DEPRECATED} \longrightarrow \text{ARCHIVED}$$
* **Champion / Challenger Framework**: Maintains active production champions while testing candidate challengers side-by-side.
* **Rollback History**: Logs all production promotions and rollbacks with immutable audit entries.

### 5. 1-Click Deployment Studio & API Widgets
* **1-Click REST Endpoints**: Deploys any registered model instantly to a managed REST endpoint (`/api/v1/predict`).
* **Traffic Routing Strategies**: Supports `CANARY` (percentage split), `BLUE_GREEN` (instant cutover), and `ROLLING` deployment strategies.
* **Interactive Web Widget Generator**: Embeddable JavaScript & cURL code generator allowing developers to integrate model inference into external apps in seconds.
* **Real-time Health Telemetry**: Live latency, throughput, and memory consumption metrics for deployed model pods.

### 6. Classroom & Audit Reproducibility Engine
* **Educational Classrooms**: Supports instructor creation of ML lab assignments with custom dataset challenges and submission deadlines.
* **Automated Experiment Grading**: Evaluates student model submissions against hidden test metrics, pipeline reproducibility, and code quality.
* **Reproducible Audit Reports**: Generates verifiable audit trails verifying that a student's model was trained directly on assigned data without data leakage.

### 7. Learner Portfolios & Cryptographic QR Verification
* **Student Showcase Portfolios**: Generates public, shareable portfolios showcasing completed ML projects, model leaderboards, and code.
* **Recruiter & Public View**: Custom views tailored for hiring managers highlighting verified ML engineering competencies.
* **Cryptographic QR Certificates**: Issues digital certificates signed with **HMAC-SHA256** keys (`MLPLAYGROUND_CERT_SECRET`). Anyone scanning the embedded QR code can instantly verify authenticity against the verification endpoint (`/api/v1/portfolios/verify/{project_id}`).

### 8. Operations Center & Enterprise Administration
* **System Metadata Telemetry**: Displays runtime environment metrics (Python version, OS platform, storage backends, database status).
* **Immutable Activity Feed**: Logged audit events saved to append-only JSONL files (`uploads/activity/{org_id}/{workspace_id}/YYYY-MM.jsonl`) tagged with end-to-end `correlation_id` tracing.
* **Automated Backup & Restore**: Creates and restores compressed database & filesystem backups with safety confirmation checks.
* **Feature Flags Engine**: Enables or disables platform features on-the-fly without service restarts.
* **Platform Maintenance Mode**: Toggleable platform lock state protecting database migrations.

---

## 🔒 Security & Compliance Architecture

The platform enforces strict security practices across all layers:

1. **Multi-Tenancy Scoping**: Strict data isolation enforced at both DB level (`organisation_id`, `workspace_id`) and API level via RBAC dependencies.
2. **Dual-Source JWT Authentication**: Resolves tokens from httpOnly `access_token` cookies (XSS-safe priority) or `Authorization: Bearer <token>` headers (CLI/API compatibility).
3. **Redis Token Blacklist**: Instant single-token revocation (`jti` claim) and per-user token version bump (`ver` claim) for immediate session invalidation across all devices.
4. **Hashed API Keys**: Programmatic API keys are generated with prefix display (`mp_live_...`) while storing only high-entropy SHA-256 hashes in PostgreSQL.
5. **Startup Secret Validation**: Rejects default insecure keys (`secret_key`, `minioadmin`) and requires strong entropy ($\ge 32$ chars) at service startup.
6. **Path Traversal & CSV Sanitization**: File uploads sanitize all filename inputs to prevent directory traversal and arbitrary code execution.
7. **Rate Limiting**: Enforces IP and user-based request rate limits via Redis sliding windows.
8. **Fault Isolation (Frontend)**: React `ErrorBoundary` wraps individual feature tabs to ensure a error in one view never crashes the main navigation or active state.

---

## 🚀 REST API Reference Directory

All endpoints (except `/health` probes) require authentication via Bearer JWT or httpOnly Cookie.

### **Authentication & Accounts (`/api/v1/auth`)**
| Method | Endpoint | Description | Auth Required |
| :---: | :--- | :--- | :---: |
| `POST` | `/api/v1/auth/register` | Register a new platform account | Public |
| `POST` | `/api/v1/auth/login` | Login and acquire access/refresh cookies | Public |
| `POST` | `/api/v1/auth/logout` | Revoke active token session via Redis blacklist | Bearer / Cookie |
| `POST` | `/api/v1/auth/refresh` | Issue new short-lived access token | Cookie |
| `GET` | `/api/v1/auth/me` | Fetch active user profile & organisation roles | Bearer / Cookie |

### **Datasets & Profiling (`/api/v1/datasets`)**
| Method | Endpoint | Description | Auth Required |
| :---: | :--- | :--- | :---: |
| `POST` | `/api/v1/datasets/upload` | Upload & ingest tabular CSV dataset ($\le 50\text{MB}$) | Bearer / Cookie |
| `GET` | `/api/v1/datasets` | List workspace datasets | Bearer / Cookie |
| `GET` | `/api/v1/datasets/{id}` | Get dataset details & storage path | Bearer / Cookie |
| `GET` | `/api/v1/datasets/{id}/profile` | Generate column statistics & data types | Bearer / Cookie |
| `GET` | `/api/v1/datasets/{id}/health` | Compute dataset quality health score & remediations | Bearer / Cookie |
| `GET` | `/api/v1/datasets/{id}/recommendations` | Recommends ML problem type, models & target candidate | Bearer / Cookie |

### **Experiments & Models (`/api/v1/experiments`, `/api/v1/models`)**
| Method | Endpoint | Description | Auth Required |
| :---: | :--- | :--- | :---: |
| `GET` | `/api/v1/experiments` | List & filter experiment runs | Bearer / Cookie |
| `GET` | `/api/v1/models` | List versioned model registry records | Bearer / Cookie |
| `GET` | `/api/v1/models/algorithms` | List supported classification & regression algorithms | Bearer / Cookie |
| `POST` | `/api/v1/models/{id}/promote` | Promote model version to `ACTIVE` champion | Bearer / Cookie |
| `POST` | `/api/v1/models/{id}/governance/transition` | Transition lifecycle state (`DRAFT` $\to$ `ACTIVE`) | Bearer / Cookie |
| `GET` | `/api/v1/models/{id}/readiness` | Generate model deployment readiness checklist | Bearer / Cookie |

### **Prediction & Inference (`/api/v1/predict`)**
| Method | Endpoint | Description | Auth Required |
| :---: | :--- | :--- | :---: |
| `POST` | `/api/v1/predict` | Real-time single/row-wise model inference | Bearer / Cookie |
| `POST` | `/api/v1/predict/batch` | Batch CSV / JSON file prediction execution | Bearer / Cookie |
| `GET` | `/api/v1/predict/models` | List active models ready for inference | Bearer / Cookie |

### **Explainability & Ethics (`/api/v1/explainability`)**
| Method | Endpoint | Description | Auth Required |
| :---: | :--- | :--- | :---: |
| `POST` | `/api/v1/explainability/global` | Compute global SHAP & feature importance | Bearer / Cookie |
| `POST` | `/api/v1/explainability/local` | Compute local prediction force plot waterfall | Bearer / Cookie |
| `POST` | `/api/v1/explainability/fairness` | Audit demographic bias & disparate impact | Bearer / Cookie |
| `POST` | `/api/v1/explainability/what-if` | Run counterfactual prediction simulation | Bearer / Cookie |
| `POST` | `/api/v1/explainability/trust-report` | Generate comprehensive PDF model ethics report | Bearer / Cookie |

### **Deployments & Infrastructure (`/api/v1/deployments`)**
| Method | Endpoint | Description | Auth Required |
| :---: | :--- | :--- | :---: |
| `POST` | `/api/v1/deployments` | Create 1-click model REST endpoint | Bearer / Cookie |
| `GET` | `/api/v1/deployments` | List active workspace deployments | Bearer / Cookie |
| `POST` | `/api/v1/deployments/{id}/traffic` | Update traffic allocation (Canary / Blue-Green) | Bearer / Cookie |

### **Portfolios & Cryptographic Verification (`/api/v1/portfolios`)**
| Method | Endpoint | Description | Auth Required |
| :---: | :--- | :--- | :---: |
| `POST` | `/api/v1/portfolios` | Publish project to portfolio with HMAC certificate | Bearer / Cookie |
| `GET` | `/api/v1/portfolios/user/{user_id}` | Fetch public student portfolio projects | Bearer / Cookie |
| `GET` | `/api/v1/portfolios/verify/{project_id}` | Cryptographically verify QR certificate HMAC signature | Bearer / Cookie |

### **Enterprise Admin Operations (`/api/v1/admin`)**
| Method | Endpoint | Description | Auth Required |
| :---: | :--- | :--- | :---: |
| `GET` | `/api/v1/admin/system/metadata` | Retrieve server environment & storage metadata | Admin Role |
| `GET` | `/api/v1/admin/operations/dashboard` | Fetch worker node status & active jobs | Admin Role |
| `GET` | `/api/v1/admin/audit` | Query immutable activity log entries | Admin Role |
| `POST` | `/api/v1/admin/backups/create` | Create full database & storage backup | Admin Role |
| `POST` | `/api/v1/admin/feature-flags` | Create or update global platform feature flag | Admin Role |

---

## ⚡ Local Development & Setup Guide

### **Prerequisites**
- **Node.js**: `v20.0.0+`
- **pnpm**: `v9.0.0+`
- **Python**: `3.10` or `3.11`
- **Docker & Docker Compose**: (For PostgreSQL, Redis, MinIO)

### **1. Clone & Install Dependencies**

```bash
# Clone the repository
git clone https://github.com/mehtarushil45/Machine-learning-Playground.git
cd Machine-learning-Playground

# Install Node dependencies across monorepo
pnpm install

# Setup Python Virtual Environment for API
cd services/api
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install Python requirements
pip install -r requirements.txt
cd ../..
```

### **2. Configure Environment Variables**

Copy `.env.example` to `.env` in the root workspace directory:

```bash
cp .env.example .env
```

Generate strong keys for security settings:

```bash
# Generate SECRET_KEY (64 hex characters):
python -c "import secrets; print(secrets.token_hex(64))"

# Generate MLPLAYGROUND_CERT_SECRET (48 hex characters):
python -c "import secrets; print(secrets.token_hex(48))"
```

Update your `.env` file with the generated keys.

### **3. Launch Infrastructure Services (Docker)**

```bash
# Start PostgreSQL 16, Redis 7, and MinIO
docker-compose -f infra/docker-compose.yml up -d
```

### **4. Start Backend Service**

```bash
cd services/api
# Run Uvicorn dev server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Backend API interactive docs will be available at: `http://localhost:8000/docs`

### **5. Start Frontend Application**

```bash
cd apps/web
pnpm dev
```
Frontend Web Application will be available at: `http://localhost:5173`

---

## 🎨 APEX Design System & UI Architecture

The application UI is engineered using the **APEX Design System**, built specifically for high-density machine learning operations:

* **Color Palette (Blueberry & Maroon)**:
  - Base Canvas (`#0B0912`): Dark deep-space obsidian
  - Surface Containers (`#1B1530`): Rich muted blueberry
  - Elevated Cards (`#2A2247`): Elevated interactive surface
  - Primary Accent (`#4B3B7C` / `#6C5CA6`): Vibrant violet-purple
  - Accent Maroon (`#6E1423`): Deep crimson highlight
  - Gold Accent (`#C9A24B`): Quality & health indicator
* **Typography**:
  - Display Headers: `Outfit`, sans-serif
  - Body & UI: `Inter`, system-ui
  - Code & Metrics: `Fira Code`, monospace
* **Layer Z-Index Hierarchy**:
  - `Base`: 0
  - `Sticky Headers`: 10
  - `Dropdowns & Selects`: 40
  - `Modals`: 50
  - `Notifications`: 60
  - `Toasts`: 70
  - `Tooltips`: 80
  - `Fixed Portals`: 9000
* **Non-Clipping Portal Strategy**: Dropdown menus, notification drawers, and user avatars use `position: fixed` calculated at runtime via `getBoundingClientRect()` to break free from container `overflow: hidden` boundaries.

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](./LICENSE) for more information.
