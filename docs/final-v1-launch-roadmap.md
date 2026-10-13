# ML Playground: Final 2-Week Launch Roadmap (v1 Production Release)

> **Document Status**: Active Master Roadmap  
> **Target Horizon**: 14 Days to Production v1 Launch  
> **Platform Standard**: Commercial ML Platform & Teaching-First Workbench  
> **Core Mandate**: Clean UI/UX, Truthful Execution, Zero Fake Code, No Ad-Hoc Phase/v7 Tags, Pruned Test Bloat  

---

## 1. Executive Summary & Core Product Philosophy

ML Playground is a startup-grade, teaching-first machine learning platform. It bridges the gap between no-code visual pipeline construction and professional Python code experimentation. 

### The Four Foundational Pillars for v1

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       THE 4 FOUNDATIONAL PILLARS                                         │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                         │
│   ┌───────────────────────────┐  ┌───────────────────────────┐  ┌────────────────────────────────────┐   │
│   │   PILLAR 1: CLEAN UI/UX   │  │   PILLAR 2: TRUTHFUL ML   │  │   PILLAR 3: ZERO FAKE CODE         │   │
│   │  • Zero "Blocked" badges  │  │  • Fast AST syntax check  │  │  • Purge Math.random() feat_0..3   │   │
│   │  • No dummy locked files  │  │  • ML Cause & Effect      │  │  • Real scikit-learn weights only  │   │
│   │  • Clean uncluttered      │  │  • Isolated run sandbox   │  │  • Real execution stdout/stderr    │   │
│   │    toolbars & actions     │  │  • True stdout/stderr     │  │  • No synthetic mock responses     │   │
│   │  • High-contrast palette  │  │  • Champion vs Candidate   │  │  • 100% verified data flows        │   │
│   └───────────────────────────┘  └───────────────────────────┘  └────────────────────────────────────┘   │
│                                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                     PILLAR 4: RIGOROUS PRUNING & CANONICAL NAMING                               │   │
│   │  • Purge ad-hoc phase/v7 file names (users_v7a -> users, phase1..5 tests -> canonical suites)   │   │
│   │  • Delete 130KB classroom coursework & student grading debt                                      │   │
│   │  • Consolidate bloated test files into clean, permanent feature suites                          │   │
│   │  • Clean API route paths and OpenAPI tags (no "V7A", "V7B", "Phase 3" leaks)                    │   │
│   └─────────────────────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Pillar 1: Clean, Uncluttered, Startup-Grade UI/UX**
   - Eliminate defensive visual noise: no ugly red "PTY Shell (Blocked)" badges, no artificial padlocked dummy folders (`data/` locks), and no duplicate copy/download buttons.
   - Every screen must feel intentional, responsive, and polished with our curated high-contrast palette (`#0B0912`, `#151026`, `#C9A24B`, `#4B3B7C`).

2. **Pillar 2: Truthful Execution & Teaching-First ML Intelligence**
   - **Do not build another generic VS Code.** Build a studio where **every code edit is translated into its machine learning impact**.
   - Separate typing from running. Fast AST and Pyflakes diagnostics flag syntax and undefined names (`k`) without running code.
   - Before running: explain what changed from the baseline visual pipeline and why it matters.
   - When running: execute the code cleanly in an isolated sandbox, streaming true stdout and stderr to a clean console.

3. **Pillar 3: Zero Fake Code Guarantee**
   - Absolute prohibition against synthetic data stubs, fake arrays, or mock endpoints.
   - Delete `ExplainabilityHub.tsx` which uses `feat_0..feat_3` with `Math.random()`.
   - Real explainability (SHAP values, permutation importances, feature importance) is computed directly from trained scikit-learn models on real test splits in `TrainingResultsPage.tsx`.
   - No placeholder badges, no fake progress bars, and no synthetic latency numbers.

4. **Pillar 4: Rigorous Pruning & Canonical Architecture**
   - Eliminate all temporary and ad-hoc naming (`v7`, `v7a`, `v7b`, `phase1`..`phase5`, `milestone3`..`milestone5`).
   - Clean backend router naming (`users_v7a.py` → `users.py`, eliminate `explainability_v7b.py`).
   - Consolidate test bloat: prune college classroom tests, merge fragmented phase tests into permanent canonical suites.

---

## 2. Test File Audit & Consolidation Strategy

The project currently contains **62 test files** (30 in frontend, 32 in backend), many of which are fragmented artifacts created by ad-hoc prompts (`phase1`..`phase5`), student coursework tests, or temporary milestone files. 

### Frontend Test Consolidation Plan (`apps/web/src/test/`)

| Current File | Action | Canonical Target / Rationale |
|---|---|---|
| `ClassroomEntryFlow.test.tsx` | **DELETE** | Academic coursework debt. Not in enterprise scope. |
| `ClassroomLabHub.test.tsx` | **DELETE** | Academic student assignment grading. |
| `ClassroomSimplifiedFlow.test.tsx` | **DELETE** | Academic exam flow. |
| `phase1TruthfulDiagnostics.test.tsx` | **CONSOLIDATE** | Merge into `codeStudioDiagnostics.test.tsx` (AST checks, debounced validation, undefined name warnings). |
| `phase2WorkspacePersistence.test.tsx` | **CONSOLIDATE** | Merge into `codeStudioWorkspace.test.tsx` (real script switching, save state, tab persistence). |
| `phase3ExecutionStreaming.test.tsx` | **CONSOLIDATE** | Merge into `codeStudioExecution.test.tsx` (run dispatch, log streaming, console output). |
| `phase4SecurityGate.test.tsx` | **CONSOLIDATE** | Merge into `codeStudioExecution.test.tsx` (timeout, resource limits, clean termination). |
| `phase5MlEditing.test.tsx` | **CONSOLIDATE** | Merge into `codeStudioPipelineGuardian.test.tsx` (diff analysis, ML cause-and-effect explanations). |
| `Milestone3ExperimentTracking.test.tsx` | **CONSOLIDATE** | Merge into `TrainingResultsPage.test.tsx` (leaderboard, run diffs, metrics). |
| `Milestone4DataGovernance.test.tsx` | **CONSOLIDATE** | Merge into `ProjectGatekeeper.test.tsx` (DuckDB profiling, leakage warnings). |
| `Milestone5MonacoStudio.test.tsx` | **CONSOLIDATE** | Merge into `ViewAsCodeStudio.test.tsx` (Monaco mounting, snippets). |
| `LoginPage.test.tsx` | **KEEP** | Core authentication flow test. |
| `ProjectGatekeeper.test.tsx` | **KEEP** | Ingestion and dataset onboarding flow test. |
| `TrainingResultsPage.test.tsx` | **KEEP** | Experiment leaderboard and model diagnostic test. |
| `AICopilotDrawer.test.tsx` | **KEEP** | Real Copilot interaction and diff generation test. |
| `driftMonitoring.test.tsx` | **KEEP** | Production data drift detection test. |
| `codeParser.test.ts` | **KEEP** | AST pipeline parser utility test. |
| `recommendationService.test.ts` | **KEEP** | Model recommendation engine test. |
| `trainingContract.test.ts` | **KEEP** | Scikit-learn training schema contract test. |

**Frontend Result**: Reduces 30 test files to **14 canonical, high-signal test suites** with zero `phase*` or `milestone*` tags.

---

### Backend Test Consolidation Plan (`services/api/tests/`)

| Current File | Action | Canonical Target / Rationale |
|---|---|---|
| `test_classroom_entry_and_management.py` | **DELETE** | Academic grading and exam session debt. |
| `test_classroom_lab_exam.py` | **DELETE** | Academic tolerance grading tests. |
| `test_code_studio_execution_phase3.py` | **CONSOLIDATE** | Merge into `test_code_execution_engine.py` (sandboxed process execution, stdout streaming). |
| `test_code_studio_phase4_security_gate.py` | **CONSOLIDATE** | Merge into `test_code_execution_engine.py` (timeout enforcement, memory safety). |
| `test_milestone4_dataset_engine.py` | **RENAME** | Rename to `test_dataset_profiling_engine.py` (canonical naming). |
| `test_code_studio_workspace.py` | **KEEP** | Clean workspace file CRUD tests. |
| `test_duckdb_profiler.py` | **KEEP** | High-throughput DuckDB profiling verification. |
| `test_drift_monitoring_service.py` | **KEEP** | Real statistical drift (PSI, KS-test) verification. |
| `test_copilot_service.py` | **KEEP** | LLM Copilot prompt synthesis and response tests. |
| `test_e2e_code_to_deployment.py` | **KEEP** | Full pipeline end-to-end integration test. |
| `test_training_e2e_contract.py` | **KEEP** | Scikit-learn training options and hyperparameter tests. |
| `test_algorithm_catalog.py` & `factory.py` | **KEEP** | Scikit-learn algorithm registry verification. |

**Backend Result**: Prunes dead classroom files and collapses fragmented phase test files into permanent, enterprise-grade test suites.

---

## 3. Backend Routers, Endpoints & API Canonical Naming Audit

### 1. Files & Routers to Delete or Rename

```
CURRENT (Bloated & Ad-Hoc)                  CANONICAL V1 (Clean & Enterprise)
services/api/app/routers/users_v7a.py   ──► services/api/app/routers/users.py
services/api/app/routers/explainability_v7b.py ──► PURGED (Consolidate real endpoints into explainability.py)
services/api/app/routers/classrooms.py  ──► DELETED (Purge ~130KB academic coursework)
services/api/scratch/phase4_gate_audit.py ──► DELETED
services/api/scratch/matrix_audit.py    ──► DELETED
services/api/uploads/live-phase6-*.csv   ──► DELETED
```

### 2. FastAPI OpenAPI Metadata & Tags Cleanup

- **FastAPI Version**: In `services/api/app/main.py`, change `version="7B.2"` to `version="1.0.0"`.
- **Router Tags**:
  - Change `tags=["Users (V7A)"]` to `tags=["Users"]`.
  - Change `tags=["Explainability & Fairness (V5B)"]` to `tags=["Explainability"]`.
  - Eliminate `tags=["Explainability & Ethics (V7B)"]`.
  - Remove all docstrings referencing "Phase 3", "V7A", "V7B Part 2".
- **Router Inclusions**:
  - Remove `app.include_router(classrooms.router, prefix=API_V1_PREFIX)`.
  - Remove `app.include_router(explainability_v7b.router, prefix=API_V1_PREFIX)`.
  - Change `from app.routers import users_v7a` to `from app.routers import users`.

### 3. Endpoint Inventory & Health Check

All production endpoints will follow the clean `/api/v1/<domain>` hierarchy:
- `/api/v1/auth/*` (Login, Register, Refresh, Logout, Demo)
- `/api/v1/users/*` (Profile, Memberships, Preferences)
- `/api/v1/datasets/*` (Upload, DuckDB Profile, Preview, Schema)
- `/api/v1/code/*` (AST Validate, Sandbox Run, Stop, Stream)
- `/api/v1/copilot/*` (Explain Code, Suggest Fix, Generate Diff)
- `/api/v1/jobs/*` (Training Job Dispatch, Status, Logs)
- `/api/v1/models/*` (Model Registry, Lineage, Promotion)
- `/api/v1/experiments/*` (Leaderboard, Param Diff, Metrics)
- `/api/v1/deployments/*` (Real-time Serving, Batch CSV Scoring, Drift Telemetry)

---

## 4. Zero Fake Code Mandate & Code Studio Architecture

### 1. Eliminating Synthetic Stubs
- **Delete `ExplainabilityHub.tsx`**: Remove the fake `feat_0..3` array populated with `Math.random()`.
- **Real Model Explainability**: All feature importances and SHAP values will be extracted directly from scikit-learn models (`estimator.feature_importances_` or `estimator.coef_`) trained on real datasets in `TrainingResultsPage.tsx`.

### 2. The Code Studio Truthful Engine

The user reported two critical issues in Code Studio:
1. Changing a single letter or character caused an alarming terminal block error.
2. Typing random letters at the bottom did not trigger errors because of a broken regex parser.
3. Defensive UI badges like `PTY Shell (Blocked)` and padlocked `data/` folders cluttered the screen.

#### The Architectural Solution: Separation of Typing from Running

```
User types in Monaco Editor
         │ (500ms debounce)
         ▼
┌─────────────────────────────────────────────────────────┐
│ FAST PYTHON AST CHECKS (ast.parse + Pyflakes)          │
│ • Detect syntax errors immediately (SyntaxError)        │
│ • Detect undefined names (`k` => NameError)             │
│ • Set inline Monaco red squiggles & Problems drawer     │
│ • Terminal / Run Console stays completely silent!       │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ PIPELINE GUARDIAN (AST Diff vs Visual Baseline)         │
│ • Plain-English ML Cause & Effect explanation:          │
│   - `test_size: 0.2 -> 0.3` => "Model trains on 70% data│
│     instead of 80%; evaluation on 30% unseen data."     │
│   - `RandomForest -> LogisticRegression` => "Switched   │
│     to linear classifier; instantaneous training."      │
└────────────────────────┬────────────────────────────────┘
                         │
            User clicks [Run Experiment]
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ ISOLATED SUBPROCESS SANDBOX EXECUTION                   │
│ • Dispatches execution job with 60s timeout             │
│ • Streams true stdout and stderr into Run Console       │
│ • Clickable traceback links jump Monaco to error line   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ POST-RUN EXPERIMENT CARD                                │
│ • True R² / Accuracy / F1 metrics from execution run    │
│ • Delta vs Champion Baseline                            │
│ • 1-Click [Set as Champion] or [Discard]                │
└─────────────────────────────────────────────────────────┘
```

#### Code Studio UI Cleanup Rules:
1. **No "PTY Shell (Blocked)" Badge**: Replace with clean, subtle status indicator (`Ready` / `Executing...` / `Completed`).
2. **No Fake Padlocked Files**: Remove `data/` and `outputs/` dummy tree nodes. Show only real files (`pipeline_generated.py`, `+ New Script`).
3. **No Duplicate Actions**: Exactly one green prominent `Run Experiment` button (`Ctrl+Enter`), one `Stop` button (active only when running), `Preview Impact`, `Snippets`, and `Save` (`Ctrl+S`).

---

## 5. Page-by-Page Implementation Blueprint (7 Core Pages)

---

### Page 1: Authentication & Onboarding (`LoginPage.tsx` / `auth.py`)

#### Current Problem
- `LoginPage.tsx` contains leftover demo classroom presets, confusing roles, and verbose tabs.

#### The v1 Target
- Clean, high-conversion commercial login gateway.
- Two simple pathways:
  1. **Direct Sign In** (Email / Password with remember-me).
  2. **1-Click Demo Sandbox** (Instantly creates an isolated session pre-seeded with sample dataset).
- Real JWT tokens stored securely, auto-injected via Axios interceptor.
- Deep luxury dark aesthetic (`#0B0912`, `#151026`, gold focus rings `#C9A24B`).

#### Checklist
- [ ] Prune classroom/student tab selectors and role radios from `LoginPage.tsx`.
- [ ] Implement smooth 1-Click Demo Sandbox initialization.
- [ ] Verify JWT token refresh flow and clean redirect on 401 Unauthorized.

---

### Page 2: Project Gatekeeper & Dataset Onboarding (`ProjectGatekeeper.tsx` / `datasets.py`)

#### Current Problem
- Leftover references to student lab exams, mock datasets, and multi-step wizard clutter.

#### The v1 Target
- The primary entry gateway for every machine learning project:
  1. **Upload Dataset**: Drag-and-drop CSV, Parquet, or JSON Lines.
  2. **Industry Benchmarks**: Customer Churn (Telco), California Housing (Regression), Titanic (Classification).
- Real-time DuckDB/Polars profiling:
  - Instant row/column counts, missingness breakdown, data type inference.
  - Automated Data Health Warnings: Target leakage detection ($r > 0.98$), constant columns, high-cardinality IDs.
- Two immediate launch paths:
  - **Launch Visual Pipeline**: Build pipeline visually with algorithm recommendations.
  - **Launch Code Studio**: Open pre-generated Python pipeline script directly in Monaco.

#### Checklist
- [ ] Remove all exam/classroom modal code.
- [ ] Wire DuckDB profiler to display live data health metrics.
- [ ] Seed active dataset context and route cleanly to chosen workbench.

---

### Page 3: Code Studio & Pipeline Guardian (`ViewAsCodeStudio.tsx`, `MonacoCodeStudioEditor.tsx`)

#### Current Problem
- Cluttered explorer with padlocks, red "PTY Shell (Blocked)" badge, broken error detection, and regex false alarms.

#### The v1 Target
- Professional Python workbench with Monaco editor, debounced AST diagnostics, and Pipeline Guardian.
- File explorer displays only real project files.
- Run Console displays real stdout/stderr with jumpable traceback links.
- Experiment Card displays real post-run metrics with 1-click Champion promotion.

#### Checklist
- [ ] Remove `PTY Shell (Blocked)` badge and artificial padlock tree nodes.
- [ ] Connect debounced AST syntax and undefined name checker.
- [ ] Wire Run button to sandboxed execution worker and stream console output.
- [ ] Add Pipeline Guardian plain-English ML impact explanation modal.

---

### Page 4: AI Copilot (`AICopilotDrawer.tsx` / `copilot.py`)

#### Current Problem
- Drawer was sometimes disconnected from Monaco context or displayed boilerplate suggestions.

#### The v1 Target
- Dockable right-hand copilot panel with full context awareness:
  - Current Monaco code snippet.
  - Active dataset schema and problem type.
  - Last terminal traceback error.
- **In-Problem Actions**: Clicking `[Explain]` in the Problems panel asks Copilot why the issue matters in ML terms. Clicking `[Fix]` opens `RegenerateDiffModal` with side-by-side diff review.
- **Strict Guardrail**: Zero code is applied silently. User must review diff and click "Accept & Replace Code".

#### Checklist
- [ ] Wire `[Explain]` and `[Fix]` buttons from Problems drawer to Copilot.
- [ ] Enforce side-by-side diff modal before accepting any LLM suggestion.
- [ ] Add graceful fallback when external LLM API key is not configured.

---

### Page 5: Training Results & Model Registry (`TrainingResultsPage.tsx` / `ExperimentLeaderboard.tsx`)

#### Current Problem
- Contained synthetic explainability stubs (`feat_0..3`) disconnected from real model weights.

#### The v1 Target
- **Multi-Run Leaderboard**: Compare up to 5 runs side-by-side with color-coded diffs across hyperparameters and metrics.
- **Deep Diagnostic Visualizations**:
  - Real Interactive Confusion Matrix: Absolute counts vs row/column normalized percentages.
  - Dynamic Classification Threshold Optimizer: Real-time slider (0.0 to 1.0) showing Precision vs Recall trade-offs.
  - True Feature Importance: Extracted directly from model pipeline weights.
- **Model Registry Staging**:
  - Lifecycle states: `Experiment` → `Candidate` → `Champion (Production)`.
  - 1-Click `Deploy Champion` action.

#### Checklist
- [ ] Purge `feat_0..3` synthetic arrays and remove `ExplainabilityHub.tsx`.
- [ ] Wire confusion matrix and feature importances to real run artifacts.
- [ ] Add 1-click promotion to Champion.

---

### Page 6: Model Deployment & Inference Engine (`DeploymentsHub.tsx` / `deployments.py`)

#### Current Problem
- UI had prototype forms disconnected from real serialized pipeline weights.

#### The v1 Target
- **High-Throughput Batch Scoring**:
  - Drag-and-drop an unlabeled CSV file (up to 50k rows).
  - Background worker scores rows and provides downloadable enriched CSV with predictions and probabilities.
- **Low-Latency REST Endpoint**:
  - Dedicated route: `POST /api/v1/deployments/{id}/predict`.
  - Strict input schema validation with informative error payloads.
  - Ready-to-use SDK code snippets in Python, cURL, and Node.js.
- **Live Telemetry Dashboard**:
  - Throughput (req/s), Latency percentiles (P50/P95/P99), and HTTP status codes.

#### Checklist
- [ ] Verify local pipeline deployment creates active endpoint from `.joblib` weights.
- [ ] Verify Bulk CSV scoring runs cleanly and exports valid CSV.
- [ ] Ensure SDK copy buttons provide working code snippets.

---

### Page 7: Interactive User Guide (`UserGuidePage.tsx`)

#### Current Problem
- Static text documentation that does not reflect the refined 4-pillar platform.

#### The v1 Target
- Interactive, searchable product guide covering:
  1. **Dataset Engine**: Profiling, health checks, target leakage.
  2. **Pipeline Builder**: Recommendation engine algorithms, scalers, imputers.
  3. **Code Studio**: Monaco shortcuts, AST diagnostics, Pipeline Guardian.
  4. **Results & Deployment**: Champion promotion, Batch CSV scoring, REST API.
- Live interactive diagrams and searchable FAQs.

#### Checklist
- [ ] Update walkthrough text to match the refined v1 workflows.
- [ ] Add visual architecture diagrams.

---

## 6. Day-by-Day Implementation Timeline (14 Days)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       14-DAY V1 LAUNCH SCHEDULE                                        │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                        │
│   WEEK 1: PRUNING, CANONICAL ARCHITECTURE & CODE STUDIO GUARDIAN                                       │
│   ├── Day 1-2:  Prune Academic Debt, Dead Routers & Consolidate Bloated Test Files                     │
│   │             • Delete classrooms.py (130KB) & explainability_v7b.py                                 │
│   │             • Rename users_v7a.py -> users.py & clean OpenAPI tags                                 │
│   │             • Prune classroom tests & consolidate phase1..5 tests into canonical suites           │
│   │             • Purge ExplainabilityHub.tsx and feat_0..3 fake code                                  │
│   ├── Day 3-4:  Code Studio UI Overhaul (Remove PTY Blocked badge, clean explorer)                     │
│   ├── Day 5-6:  Pipeline Guardian Engine (AST ML Cause & Effect, fast Python checks)                  │
│   └── Day 7:    Reliable Sandbox Execution & Console Streaming (Fix Run button)                       │
│                                                                                                        │
│   WEEK 2: RESULTS, DEPLOYMENTS, COPILOT & POLISH                                                       │
│   ├── Day 8-9:  Post-Run Experiment Cards & Leaderboard (Champion vs Candidate)                       │
│   ├── Day 10:   AI Copilot Contextual In-Problem Explanations & Diff Review                           │
│   ├── Day 11:   Gatekeeper & Dataset Profiler Polish (Clean ingestion flow)                           │
│   ├── Day 12:   Deployment Studio & Bulk Batch CSV Scoring Verification                               │
│   ├── Day 13:   Login Page & User Guide Final Polish                                                  │
│   └── Day 14:   End-to-End System Integration Test, Performance Audit & Freeze                        │
│                                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Detailed Day-by-Day Deliverables

* **Day 1–2: Pruning Academic Debt, Router Cleanup & Test Consolidation**
  - Delete `services/api/app/routers/classrooms.py` and remove mount from `main.py`.
  - Delete `services/api/app/routers/explainability_v7b.py`.
  - Rename `services/api/app/routers/users_v7a.py` → `users.py` and update imports.
  - Delete `apps/web/src/features/explainability/ExplainabilityHub.tsx` (`feat_0..3` fake arrays).
  - Delete `apps/web/src/features/classrooms/` (all 9 files).
  - Delete classroom tests: `ClassroomEntryFlow.test.tsx`, `ClassroomLabHub.test.tsx`, `ClassroomSimplifiedFlow.test.tsx`, `test_classroom_entry_and_management.py`, `test_classroom_lab_exam.py`.
  - Consolidate frontend phase tests (`phase1`..`phase5`) into `codeStudioDiagnostics.test.tsx` and `codeStudioExecution.test.tsx`.
  - Consolidate backend phase tests into `test_code_execution_engine.py`.
  - Clean OpenAPI version to `1.0.0` and purge `(V7A)`, `(V7B)`, `(Phase 3)` tags.
  - Verify `npm run build` and `npx tsc --noEmit` pass with 0 errors.

* **Day 3–4: Code Studio UI Overhaul & Explorer Cleanup**
  - Remove `PTY Shell (Blocked)` badge from toolbar.
  - Clean up file tree: remove artificial padlocked `data/` and `outputs/` folders.
  - Streamline toolbar buttons: `Run Experiment` (`Ctrl+Enter`), `Stop`, `Preview Impact`, `Snippets`, `Save` (`Ctrl+S`).
  - Wire status indicator to reflect clean state: `Ready` / `Executing...` / `Completed`.

* **Day 5–6: Fast Python Checks & Pipeline Guardian**
  - Implement 500ms debounced syntax and undefined-name validation via AST without executing code.
  - When user writes invalid syntax or undefined variables (`k`), display inline red squiggles in Monaco and populate Problems drawer.
  - Implement Pipeline Guardian AST analyzer: translate hyperparameter or model changes into plain-English ML explanations.
  - Add `[Preview Impact]` diff modal.

* **Day 7: Reliable Sandbox Execution & Console Streaming**
  - Fix execution errors on the `Run` button: ensure user script runs smoothly in container sandbox.
  - Stream true stdout and stderr into Run Console in real-time.
  - Enable jumpable traceback links that navigate Monaco directly to error lines.

* **Day 8–9: Post-Run Experiment Cards & Leaderboard**
  - Render an Experiment Card after every run comparing metrics to the Champion baseline.
  - Embed interactive Confusion Matrix and Feature Importance directly in Results page.
  - Enable 1-click "Set as Champion" promotion.

* **Day 10: AI Copilot In-Problem Diagnostics & Diff Guard**
  - Connect `[Explain]` button on diagnostics and tracebacks to auto-populate Copilot drawer.
  - Enforce `RegenerateDiffModal` side-by-side review on all proposed code fixes.

* **Day 11: Project Gatekeeper & Ingestion Polish**
  - Clean up dataset onboarding: instant DuckDB profiling, health checks, target leakage warnings.
  - Polish 1-click project initialization.

* **Day 12: Deployment Studio & Bulk Batch CSV Scoring**
  - Verify local model serving endpoints (`POST /api/v1/deployments/{id}/predict`).
  - Verify drag-and-drop Batch CSV scoring with download of predicted CSV.

* **Day 13: Login Page & User Guide Polish**
  - Clean up `LoginPage.tsx`: sleek dark mode, remove student presets, smooth JWT auth.
  - Update `UserGuidePage.tsx`: interactive visual walkthrough of the 4-pillar platform.

* **Day 14: End-to-End Integration, Performance Audit & Launch Freeze**
  - Execute end-to-end smoke test: Login → Upload Dataset → Build Pipeline → Edit in Studio → Run Experiment → Compare Metrics → Deploy Endpoint → Batch Score.
  - Verify `npm run build` bundles under 2s with 0 TypeScript errors.
  - Verify backend test suite is 100% green.
  - Freeze codebase for Version 1 launch.

---

## 7. Definition of Done (v1 Release Quality Gate)

A feature is considered complete for v1 **only** when all of the following criteria are met:
1. **Zero UI Noise**: No defensive placeholder badges, no fake locked files, and no broken buttons.
2. **ML Truthfulness**: Every diagnostic, metric, and error message reflects true Python and scikit-learn reality.
3. **Zero Fake Code**: No synthetic data stubs, `Math.random()` features, or simulated latency.
4. **No Ad-Hoc Tags**: Zero files, routers, or OpenAPI tags containing `v7`, `phase`, or `milestone`.
5. **Consolidated Test Suites**: Clean, canonical test files testing real behaviors without duplicate or obsolete bloat.
6. **Clean Builds & Tests**: `npx tsc --noEmit` returns 0 errors; production bundle builds cleanly; backend pytest suite passes 100%.
7. **No Academic Clutter**: Zero references to classrooms, exams, student grades, or mock bootcamps.
