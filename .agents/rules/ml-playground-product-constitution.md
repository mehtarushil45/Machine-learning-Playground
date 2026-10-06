---
trigger: always_on
---

# ML Playground Product Constitution

## 1. Product Identity & Quality Standards

- **Startup-Grade Platform**: ML Playground is a startup-grade ML platform, not a student project. Everything built must reflect production-grade rigor, scalability, and polish.
- **Uniqueness & Differentiation**: We aim to compete with the best ML platforms, but must NOT copy or mix their features into a generic platform. Product identity, uniqueness, and focused UX take precedence over feature parity.
- **Core Priorities**: Product identity, uniqueness, UX, ML correctness, reliability, and quality are strictly higher priority than sheer feature count.

## 2. ML Correctness & Rigor

- **No Silent Invalidity**: Never silently allow an invalid ML decision or configuration. Errors, invalid pipeline configurations, and unsupported data formats or parameters must be explicitly caught, validated, and reported.
- **Verification & Testing**: Never claim a feature is complete without verification and tests. Every pipeline, component, and model workflow must be demonstrably verified.

## 3. Architecture & Code Evolution

- **Inspect & Reuse**: Before changing code, inspect the existing architecture and reuse it where appropriate. Do not reinvent existing patterns or add redundant abstractions.
- **Preserve Working Functionality**: Preserve working functionality unless a change is intentionally approved.
- **No Monolithic Refactors**: Never perform a large refactor or implement an entire phase at once.
- **Smallest Safe Changes**: Prefer the smallest safe change that moves the product toward its strategic goal.

## 4. Incremental Engineering Workflow

Always work incrementally following the disciplined cycle:
**Audit** → **Plan** → **Implement** → **Test** → **Review** → **Commit**

1. **Audit**: Inspect existing state, architecture, and dependencies.
2. **Plan**: Formulate the smallest safe, high-impact increment before touching code.
3. **Implement**: Execute strictly within scope, avoiding unnecessary surface changes.
4. **Test**: Validate functionality, edge cases, and ML correctness.
5. **Review**: Ensure alignment with product identity, UX, and architectural integrity.
6. **Commit**: Finalize and document the change cleanly.

## 5. Technical Decision-Making & Investigation

- **Investigate When Uncertain**: When uncertain, investigate and report before implementing. Never make unverified assumptions.
- **Constructive Challenge**: Challenge product or technical decisions when evidence suggests a better approach, cleaner architecture, or superior user experience.

Enterprise ML Platform Architecture (100k+ Users)
Building an enterprise ML platform capable of serving hundreds of thousands of users (competing with Databricks, AWS SageMaker Studio, Snowflake ML, and Weights & Biases) requires shifting from a monolithic, in-memory web app to a distributed, decoupled MLOps operating system.

Below is the definitive architectural blueprint, covering what to prune, how to rebuild the four core pillars, and the infrastructure required to scale.

┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              ENTERPRISE ML PLATFORM ARCHITECTURAL TOPOLOGY                             │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                      1. DATASET ENGINE (Distributed Data & Feature Governance)                  │   │
│   │  • Out-of-Core Engine (DuckDB/Polars)  • S3 Multipart Upload  • Data Leakage & Drift Guardrails │   │
│   └────────────────────────────────┬───────────────────────────────────────────────────────────────┘   │
│                                    ▼                                                                   │
│   ┌────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                      2. CODE STUDIO (Isolated Compute & Language Engine)                       │   │
│   │  • Containerized Execution Sandboxes   • Virtual Environments • Monaco / LSP • Git Integration  │   │
│   └────────────────────────────────┬───────────────────────────────────────────────────────────────┘   │
│                                    ▼                                                                   │
│   ┌────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                      3. EXPERIMENT TRACKING & RESULTS (MLflow / W&B Standard)                  │   │
│   │  • Multi-Run Leaderboard & Param Diff • Confusion Matrix/ROC • Model Registry (Champion/Staging│   │
│   └────────────────────────────────┬───────────────────────────────────────────────────────────────┘   │
│                                    ▼                                                                   │
│   ┌────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                      4. MODEL DEPLOYMENT (Production Serving & MLOps Engine)                   │   │
│   │  • Real-time REST Endpoints            • Bulk Batch CSV Scoring • P99 Latency & Drift Telemetry │   │
│   └────────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                        │
│  ════════════════════════════════════════════════════════════════════════════════════════════════════  │
│  INFRASTRUCTURE FOUNDATION:                                                                            │
│  PostgreSQL (Relational Metadata & RLS) ┆ Redis (Token-bucket Rate Limiting & Job Queues)              │
│  S3 / MinIO (Immutable Artifacts & Data) ┆ Celery / K8s Job Workers (Decoupled Ephemeral Compute)       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
Phase 0: What to Delete / Prune (Eliminating Non-Enterprise Debt)
To make the platform serious, credible, and enterprise-grade, we should remove toy and academic features that dilute focus:

Delete classrooms & classrooms_v7b (Student Assignment & Grading Hub):
Why: Classroom submission verification, student tolerance grading, and assignment portals scream college coursework. Enterprise data science teams and ML engineers never use classroom grading tools.
Delete portfolios & portfolios_v7b (Certificate Generator with Fake HMAC):
Why: Generating "Certificates of Completion" with mock QR codes is a hallmark of student bootcamp portals, not enterprise tools like Databricks or SageMaker.
Delete Synthetic explainability Stub (feat_0–feat_3):
Why: The current standalone explainability tab uses hardcoded mock arrays disconnected from real runs. Real explainability (SHAP, permutation importance) belongs inside the Training Results page as part of model evaluation.
Eliminate In-Memory Dictionaries (_JOBS_STORE = {}, in-memory registries):
Why: In a multi-tenant production environment with multiple API replicas behind a load balancer, in-memory state causes random 404s. Everything must be persisted in PostgreSQL and cached in Redis.
Eliminate Local Disk File Storage:
Why: Storing uploaded datasets and joblib weights on the container's local file system breaks when scaling beyond a single server. All datasets and model weights must be stored in Object Storage (S3 / MinIO / GCS).
Pillar 1: Enterprise Dataset Engine (Data Foundation & Feature Governance)
In an enterprise platform with 100k+ users, datasets range from 10MB to 50GB+. Loading full CSVs into pandas in the web server's memory will cause immediate Out-Of-Memory (OOM) crashes.

1. Ingestion & Out-of-Core Processing
Direct S3 Multipart Upload: Users upload large files directly to Object Storage (S3 / MinIO / GCS) via presigned URLs. The FastAPI web server never buffers gigabytes of raw file bytes into memory.
Out-of-Core Engine (DuckDB / Polars): Replace Pandas with DuckDB or Polars for dataset profiling. DuckDB can query and profile 20GB+ CSVs or Parquet files on modest server instances in sub-second time using memory-mapped zero-copy execution.
Multi-Format Support: Native support for Parquet, CSV, JSON Lines, Arrow, and remote SQL database connections (PostgreSQL, Snowflake, BigQuery).
2. Feature Governance & Schema Introspection
Strict Data Type Classification:
Continuous Numeric, Discrete Integer, High-Cardinality Categorical ($>50$ unique), Low-Cardinality Categorical, Datetime/Temporal, Free Text, and Constant/Identifier.
Automated Data Leakage & Anomaly Detection:
Auto-flags columns with $>0.98$ correlation with target (target leakage).
Auto-flags zero-variance (constant) columns and ID-like unique columns (row_id, uuid).
Missingness matrix & imputation strategy recommendation (KNN, Iterative, Median, Most Frequent).
Dataset Versioning & Content Hashing:
Every dataset version receives an immutable SHA-256 content hash (dataset-churn:v1, dataset-churn:v2).
Enforces immutable audit lineage: once a model is trained on v1, v1 cannot be mutated or overwritten.
Pillar 2: Enterprise Code Studio (Decoupled Compute & Real IDE)
A toy platform runs user scripts as local child processes on the web server. An enterprise platform isolates every user's execution in a resource-capped, ephemeral sandbox.

3. Decoupled Compute Architecture
Worker Pool / Celery Task Runners:
Clicking "Run" dispatches a job message to a Redis/RabbitMQ queue.
Dedicated worker processes (or ephemeral Docker/Kubernetes containers) pick up the job. The web API remains completely responsive even under heavy execution loads.
Hardware Isolation & Quotas (cgroups):
Strict resource boundaries per user execution: 2 vCPUs, 4GB RAM, 120s timeout, and 500MB scratch disk quota.
Subprocesses are spawned in read-only filesystems with temporary /tmp overlays, protecting server files and environment secrets.
4. Professional Editor Capabilities
Monaco Editor Engine (VS Code core):
Integrate Monaco for full multi-cursor editing, bracket matching, code folding, minimap, and find/replace regex.
Language Server Protocol (LSP) / Pyright:
Real-time autocompletion for scikit-learn, pandas, numpy, and xgboost.
Type-checking, hover docstrings, and symbol jump-to-definition.
Multi-File Workspace & Package Environment:
Support project directory trees (train.py, preprocessing.py, config.yaml, requirements.txt).
Isolated virtualenv per project or pre-warmed container environments.
Git Version Control Integration:
Built-in Git branch, commit, diff, and remote push/pull to GitHub or GitLab.
Pillar 3: Enterprise Training Results & Model Registry
Enterprise data scientists run hundreds of experiments. The Results page must act like MLflow, Weights & Biases, and Neptune combined.

5. Multi-Run Experiment Leaderboard
Run Comparison Matrix:
Compare up to 5 runs side-by-side with color-coded diffs across hyperparameters (learning_rate, n_estimators, max_depth) and evaluation metrics (ROC-AUC, PR-AUC, Log Loss, F1-Score, Inference Latency (ms)).
Interactive Parallel Coordinates Plot:
Visualize high-dimensional hyperparameter tuning paths (e.g. visualizing how max_depth vs. min_samples_split drives F1-Score).
6. Deep Diagnostic Evaluation
Interactive Confusion Matrix:
Toggle between absolute counts, row-normalized (recall), and column-normalized (precision). Click on any quadrant to inspect sample misclassifications.
Threshold Optimizer (ROC / PR Curve):
Dynamic slider to adjust the classification decision threshold from 0.0 to 1.0, showing real-time impact on Precision, Recall, and False Positive Rate.
Feature Importance & SHAP Integrated in Place:
Permutation feature importance and SHAP beeswarm summary plots computed directly on the test split and stored with the run artifact.
7. Formal Model Registry (Governance Gateway)
Standardized Model Artifact Package (MLflow format):
Model weights (model.joblib or model.onnx).
Serialized preprocessing pipeline (preprocessor.joblib).
Input/Output Feature Schema definition (schema.json).
Environment specification (requirements.txt).
Model Lifecycle Staging:
Formal promotion workflow: Experiment $\rightarrow$ Candidate (Staging) $\rightarrow$ Champion (Production) $\rightarrow$ Archived.
1-Click "Deploy Champion to Production" button directly from the leaderboard.
Pillar 4: Enterprise Model Deployment & Production MLOps
In enterprise systems, deployment is not just a form with input fields; it is high-availability serving, batch scoring, and real-time monitoring.

8. High-Throughput Batch CSV Scoring Engine
Bulk Inference Processing:
Drag-and-drop an unlabeled 100k-row CSV or Parquet file.
Worker processes score rows in parallel chunks.
Export/download the enriched dataset with predicted_label, probability_distribution, and prediction_timestamp.
9. Production REST API Endpoints
Low-Latency Serving Engine:
Optimized inference engine utilizing ONNX Runtime or vectorized Scikit-Learn pipelines.
Dedicated inference route: POST /api/v1/deployments/{endpoint_name}/invocations.
Input schema validation enforcing strict types (numeric ranges, valid categorical strings) with informative error payloads.
Copy-Paste Production SDKs:
Auto-generated, authenticated client code in Python (requests / httpx), cURL, Node.js (TypeScript), Go, and Java.
10. Real-Time Telemetry & Data Drift Monitoring
Performance Metrics Dashboard:
Live charts tracking Throughput (req/sec), P50 / P95 / P99 Latency (ms), and HTTP 2xx / 4xx / 5xx Error Rates.
Automated Data Drift Detection:
Real-time Population Stability Index (PSI) and Kolmogorov-Smirnov (KS) statistical testing comparing live production inference features against the training baseline distribution.
Automated warning banner: "Feature monthly_charges has drifted (PSI = 0.31 > 0.25). Model retraining recommended."
Traffic Splitting (Canary / Blue-Green Deployments):
Route 90% of live traffic to Champion v1 and 10% to Challenger v2 to validate real-world performance before full cutover.
Infrastructure Blueprint for 100k+ Users
To support lakhs of concurrent users reliably, the system must be decoupled into three independent tiers:

[ Clients: Web / CLI / SDK ]
            │ (HTTPS)
            ▼
┌───────────────────────────┐
│ Cloudflare / AWS ALB      │ (Global CDN, SSL termination, DDoS protection)
└───────────┬───────────────┘
            │
┌───────────▼───────────────┐
│ Stateless FastAPI Pods    │ (Replicated horizontally: 5-50 instances)
│ • JWT Auth & RBAC         │ • Rate Limiting (Redis Token Bucket)
│ • API Gateways            │ • S3 Presigned URL Generator
└───────────┬───────────────┘
            │
            ├────────────────────────────────┬───────────────────────────────┐
            ▼                                ▼                               ▼
┌───────────────────────┐        ┌───────────────────────┐       ┌───────────────────────┐
│ Relational Database   │        │ Cache & Message Queue │       │ Distributed Storage   │
│ PostgreSQL (Managed)  │        │ Redis Cluster         │       │ AWS S3 / MinIO        │
│ • User / Org / Tenant │        │ • Session Cache       │       │ • Datasets (Parquet)  │
│ • Experiment Metadata │        │ • Celery Job Queue    │       │ • Model Artifacts     │
│ • Model Registry      │        │ • Live SSE Channels   │       │ • Execution Logs      │
└───────────────────────┘        └───────────┬───────────┘       └───────────────────────┘
                                             │
                                 ┌───────────▼───────────┐
                                 │ Celery Compute Pods   │ (Auto-scaling K8s worker pool)
                                 │ • Dataset Profiling   │
                                 │ • Sandboxed Training  │
                                 │ • Batch CSV Scoring   │
                                 └───────────────────────┘
Step-by-Step Implementation Roadmap
Here is how we can roll this out systematically:

Milestone Deliverables Target Outcome
Milestone 1: Navigation & Architecture Pruning • Remove classrooms & portfolios from top-level UI and routing.
• Clean primary navigation down to the 4 core pillars: Data, Studio, Results, Deployments.
• Ensure zero dead links or broken dependencies. Clean, laser-focused professional enterprise interface.
Milestone 2: Batch Inference & Model Registry (Deployments) • Build drag-and-drop Bulk CSV scoring engine with exportable results.
• Implement Model Registry with Lifecycle stages (Champion, Staging, Archived).
• Add P95/P99 latency & inference telemetry logging. Production-grade deployment and batch scoring capabilities.
Milestone 3: Deep Experiment Tracking & Leaderboard (Results) • Multi-run side-by-side comparison table with hyperparameter diffs.
• Interactive threshold tuner on ROC/PR curves.
• Embed real SHAP feature importance directly into Results. Weights & Biases / MLflow caliber experiment tracking.
Milestone 4: Dataset Engine & DuckDB Profiling (Datasets) • Integrate DuckDB/Polars for streaming out-of-core profiling.
• Automated data leakage and multicollinearity detector.
• Parquet support and immutable dataset versioning. Zero OOM crashes on large files with instant profiling.
Milestone 5: Monaco & Distributed Compute (Code Studio) • Migrate Code Studio editor to Monaco with Python syntax services.
• Queue code execution through Celery/Redis worker sandboxes.
• Live WebSocket execution log streaming. Indestructible cloud IDE architecture.
Next Action
To begin this transformation, we can start with Milestone 1 & Milestone 2:

Cleanly prune the academic/toy pages (classrooms and portfolios) and streamline the platform navigation to the 4 core pillars.
Build the Batch CSV Scoring Engine and Model Registry inside the Deployment and Results hubs.
Let me know if you are ready to proceed with Milestone 1!
