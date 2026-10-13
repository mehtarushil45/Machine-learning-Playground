# Code Studio Evolution Progress

## Phase 0 — Audit (Completed)

### 0.1 Diagnostics Path Trace
- **Trigger Bug Root Cause**: In `apps/web/src/features/pipelines/ViewAsCodeStudio.tsx`, the primary diagnostic path relies on a 350ms debounced HTTP call to `POST /api/v1/code-execution/lint` and `/api/v1/learning/code-lint`. When this network call fails, is rejected, or is in fallback mode, the editor relies on `analyzeCode(displayedCode)`.
- **Why changing 1 letter in generated code errored while appended text did not**:
  `analyzeCode` does not parse Python syntax or build an AST. It runs regex patterns. One rule checks if `pd.` or `np.` appears without a matching `import pandas as pd` or `import numpy as np` in the preamble. Modifying `import pandas as pd` to `iimport pandas as pd` broke the regex, triggering an error on every line containing `pd.read_csv`. Conversely, typing arbitrary words (`hello world`, `foo bar`) at the bottom of the buffer matched none of the regex patterns in `analyzeCode`, producing **0 errors**.
- **Buffer Scope**: `analyzeCode` inspects lines via `.split('\n')` but only applies ad-hoc regexes. The backend `lint_code` covers the entire buffer using Python's `ast.parse` and `pyflakes.api.check`.
- **Underlines vs Status Bar**: Underlines in Monaco are driven by `allDiagnostics` via `monaco.editor.setModelMarkers`. The status bar count only counts `d.severity === 'error'` and `d.severity === 'warning'`, ignoring `info` diagnostics. If the linter is offline, the editor falls back to `analyzeCode` and reports "0 problems" with a green checkmark instead of indicating analysis unavailability.

### 0.2 Test Matrix Results
Audited against real Python `ast` + `pyflakes` (`services/api/app/services/code_linter_service.py`) and client fallback (`analyzeCode`):

| Test Mutation | Backend Linter (Pyflakes + AST) | Client Fallback (`analyzeCode`) | Flagged by Real Python? |
|---|---|---|---|
| 1. Change letter on line 1 (`import` -> `iimport`) | `L1: [error] SyntaxError: invalid syntax (E999)` | `None (0 problems)` | Yes |
| 2. Change letter in middle (`0.2` -> `0.2x`) | `L13: [error] SyntaxError: invalid decimal literal (E999)` | `None (0 problems)` | Yes |
| 3. Change letter on last line (`print` -> `pprint`) | `L23: [error] undefined name 'pprint' (F821)` | `None (0 problems)` | Yes |
| 4. Change letter inside string (`'dataset.csv'` -> `'dataset_mod.csv'`) | `None (clean)` | `None (clean)` | No (Valid syntax) |
| 5. Change letter inside comment | `None (clean)` | `None (clean)` | No (Valid syntax) |
| 6. Append one bare word after last line (`foo`) | `L25: [error] undefined name 'foo' (F821)` | `None (clean)` | Yes |
| 7. Append two random words after last line (`hello world`) | `L25: [error] SyntaxError: invalid syntax (E999)` | `None (clean)` | Yes |
| 8. Append unclosed bracket (`x = [1, 2, 3`) | `L25: [error] SyntaxError: '[' was never closed (E999)` | `None (clean)` | Yes |
| 9. Append bad indent (`    bad_indent = 1`) | `L25: [error] SyntaxError: unexpected indent (E999)` | `None (clean)` | Yes |
| 10. Append undefined name (`print(undefined_var)`) | `L25: [error] undefined name 'undefined_var' (F821)` | `None (clean)` | Yes |
| 11. Append unused import (`import math`) | `L25: [warning] 'math' imported but unused (F401)` | `None (clean)` | Yes |
| 12. Delete closing quote (`'dataset.csv'` -> `'dataset.csv`) | `L9: [error] SyntaxError: unterminated string literal (E999)` | `None (clean)` | Yes |

### 0.3 Status-Bar & Header Value Audit

| Value | UI Display | Actual Reality | Status |
|---|---|---|---|
| Python Version | `Python 3.10` | `Python 3.12.14` (in Docker `infra-api-1` and `infra-worker-1`) | Hardcoded / False |
| scikit-learn Version | `scikit-learn 1.4` | `scikit-learn 1.9.0` (installed in containers) | Hardcoded / False |
| Status Problem Count | `0 problems` | Hardcoded fallback when count is 0; fails to report "Analysis unavailable" when offline | Brittle / Fake clean state |
| Generated/Modified State | `✦ Generated` / `● Modified` | Toggled by raw `onChange` handler; does not check content diff or builder sync | Simplistic flag |
| Cursor Ln/Col | `Ln X, Col Y` | Real (`editor.onDidChangeCursorPosition`) | Real |
| User Name | `ML Demo User` | Only stored in auth session / login demo profile; not rendered in Code Studio status bar | Partially Real |

### 0.4 Persistence, Execution & Shortcuts Audit

| Area | Current Implementation | Issues Identified |
|---|---|---|
| File Storage | Browser `localStorage` (`ml_playground_project_state_v3`) | No server-side persistence; clearing cache or switching browser deletes code. |
| Execution Architecture | Dispatches to Celery if Redis is available, falls back to local subprocess `sys.executable` on API container | Local fallback executes directly inside API server process with full secrets/environment access. |
| Debug Tab | Displays a static metadata grid (exec_id, status, exit_code, file, dataset) | Entirely decorative; has zero breakpoint/step/variable debug capabilities. |
| Logs Tab | Displays platform log entries (`LogEntry[]`) generated from execution lifecycle events | Separated from raw terminal stdout/stderr, working as intended. |
| Keyboard Shortcuts | `Ctrl+Enter` (Run), `Ctrl+S` (Save & parse config), `Ctrl+\`` (Toggle bottom terminal) | Editor overrides `Ctrl+Enter` (default was insert line after). |
| `Ctrl+K` Search | Header search bar has placeholder `(Ctrl+K)` | No key listener registered in `App.tsx`; does not intercept or conflict currently, but needs isolation when implemented. |

## Phase 1 — Truthful Diagnostics and Editor Integrity (Completed)

### 1.1 Truthful Diagnostics Backend Services
- **Linter Engine Hardening**: Installed `pyflakes==4.0.3` across `infra-api-1` and `infra-worker-1` Docker containers and pinned in `services/api/requirements.txt`. Fixed silent exception swallowing in `code_linter_service.py` where missing pyflakes import previously caused silent linter degradation.
- **Dynamic Runtime Info**: Created `GET /api/v1/code-execution/runtime-info` returning live `{"python_version":"3.12","sklearn_version":"1.9","full_python_version":"3.12.14","full_sklearn_version":"1.9.0","status":"online"}` directly from container `sys.version` and `sklearn.__version__`.
- **Real-Time WebSocket Linter**: Added authenticated WebSocket route `ws://localhost:8000/api/v1/code-execution/ws-lint` in `services/api/app/routers/code_execution.py`. Executes AST parse and Pyflakes checks in an isolated worker thread pool without executing user code. Verified live WebSocket communication with sub-50ms latency.

### 1.2 Frontend Language Client (`usePythonLanguageClient.ts`)
- **WebSocket Client with Auto-Reconnection**: Created React hook managing authenticated WebSocket connection with exponential backoff (1s to 10s), debounced keypress dispatch (280ms), and HTTP fallback to `/api/v1/code-execution/lint` if WebSocket is offline.
- **Honest Status Reporting**: Tracks 3 explicit states: `'connected'`, `'connecting'`, `'unavailable'`. When the backend is unreachable, status reflects `'unavailable'` and the UI renders `"Analysis unavailable"` — never claiming "0 problems".
- **Buffer Integrity**: Handles empty buffers cleanly (clears diagnostics immediately) and parses the entire buffer without line limits, region exemptions, or content filtering.

### 1.3 Unified Marker Store & Trigger Bug Resolution
- **Removed Fake Regex Checker**: Completely deleted `analyzeCode` from `ViewAsCodeStudio.tsx`. The fake regex checker had caused the trigger bug by checking only `np.`/`pd.` imports without parsing Python syntax.
- **Single Source of Truth**: `allDiagnostics` unifies `pythonLanguageClient.diagnostics` with sandboxed `runtimeDiagnostics`. Monaco underlines, the status bar problem pill, and the bottom Problems panel consume this unified store.
- **Pre-flight Syntax Check**: Added build verification in `handleRunCode`. If syntax errors exist in the buffer, execution is blocked immediately, notifying the user and switching to the Problems tab.
- **Mutation Matrix Verification**: Verified all 12 mutations from Phase 0 against the live backend and client:
  - Appending `hello world` at the bottom flags `SyntaxError: invalid syntax (E999)` on line 25.
  - Appending `foo` flags `undefined name 'foo' (F821)` on line 25.
  - Modifying `import` to `iimport` flags `SyntaxError: invalid syntax (E999)` on line 1.
  - Deleting quotes flags `SyntaxError: unterminated string literal (E999)` on line 9.

### 1.4 Safe Regeneration with Side-by-Side Diff (`RegenerateDiffModal.tsx`)
- **Monaco DiffEditor Integration**: Implemented side-by-side visual diff using Monaco's native `DiffEditor` component. Left pane shows the current modified buffer; right pane shows the newly generated builder pipeline code.
- **Explicit Acceptance**: Replaced destructive modal with `RegenerateDiffModal`. Clicking "Accept & Replace Code" cleanly applies the new pipeline; clicking "Reject (Keep My Edits)" preserves all manual edits without data loss.

### 1.5 Dynamic Status Bar & 4-State File Indicators
- **Live Version Reflection**: Status bar renders `Python 3.12` and `scikit-learn 1.9` dynamically from `usePythonLanguageClient.runtimeInfo`.
- **4-State File Lifecycle Indicators**:
  1. `✦ Generated`: Buffer matches the visual builder's generated pipeline code.
  2. `● Modified`: In-memory buffer has unpersisted changes relative to saved state.
  3. `▲ Diverged from builder`: Saved code has diverged from the visual builder pipeline.
  4. `✓ Saved`: Matches the persisted file state.
- **Truthful Status Button**: When language client is offline, displays `<AlertCircle /> Analysis unavailable` in muted gray/red rather than a false green "0 problems".

### 1.6 Non-blocking Configuration Synchronization (`codeParser.ts`)
- **Safe Ctrl+S Handling**: Enhanced `parsePipelineTargetAndConfig` with `isSynced` and `parseError`. When manual code diverges from visual builder structure, `handleSaveCode` saves the file and displays a non-blocking toast `File Saved (Config Not Synced): <reason>` without blocking the user.

### 1.7 Verification & Tests
- Frontend production bundle built cleanly: `npm run build` (0 errors).
- Unit test suite: 22 tests passing across `ViewAsCodeStudio.test.tsx`, `idePersistence.test.tsx`, `phase1TruthfulDiagnostics.test.tsx`, `codeParser.test.ts`, and `Milestone5MonacoStudio.test.tsx`.
- Matrix audit script (`services/api/scratch/matrix_audit.py`) verified 100% agreement on all 12 test cases against live container.

---

---

## Phase 2 — Workspace and Persistence (Completed)

### 2.1 Backend Workspace Filesystem Service (`workspace_filesystem_service.py`)
- **Server-Side Project Workspace Root**: Created structured workspace manager storing user project files under `UPLOADS_DIR/workspaces/{project_id}`.
- **Directory Layout Standard**:
  - `data/`: Mount for project datasets (strictly read-only). Automatically synchronizes active dataset CSV (`dataset.csv`).
  - `outputs/`: Dedicated directory for run artifacts (trained models, `.joblib`, `.json`, logs, charts).
  - Project root: Stores Python experiment scripts (`pipeline_generated.py`, user scripts).
- **CRUD Operations**:
  - `list_workspace_files(project_id)`: Recursively scans workspace returning structured metadata (`name`, `path`, `is_dir`, `is_readonly`, `size`, `modified_at`).
  - `read_workspace_file(project_id, filename)`: Reads UTF-8 content; safely rejects binary files with informative 400 error.
  - `write_workspace_file(project_id, filename, content)`: Handles autosaves and manual edits; validates path and write permissions.
  - `create_workspace_file(project_id, filename, content, is_dir)`: Creates files or subdirectories.
  - `rename_workspace_file(project_id, old_filename, new_filename)`: Safely renames files.
  - `delete_workspace_file(project_id, filename)`: Safely removes non-read-only files.

### 2.2 Security Guardrails & Path Traversal Protection
- **Path Boundary Enforcement**: `resolve_safe_path(root, filename)` ensures all paths resolve strictly inside the project root via `path.resolve().relative_to(root.resolve())`. Rejects `..` traversal, root escapes, and null bytes with HTTP 400.
- **Read-Only `data/` Protection**: Any attempt to write (`write_workspace_file`), create, rename, or delete files inside `data/` raises HTTP 403 Forbidden: `"The 'data/' directory is read-only. Uploaded datasets cannot be modified directly."`

### 2.3 Execution Sandbox Staging & Artifact Sync-Back (`code_execution_service.py`)
- **Project Scoping**: Added `project_id` to `ExecuteRequest` and `ExecutionRecord`.
- **Pre-execution Staging**: Prior to execution in `_run_execution`, all files from `workspaces/{project_id}` (including `data/` and user scripts) are staged into the execution sandbox directory, guaranteeing user scripts can read `data/dataset.csv`.
- **Post-execution Sync-Back**: Upon process exit, generated artifacts in `sandbox/outputs` as well as any root model files (`*.joblib`, `*.pkl`, `*.onnx`) are automatically persisted back to the project's permanent `workspaces/{project_id}/outputs` directory.

### 2.4 Frontend Workspace File Explorer & Categorization (`ViewAsCodeStudio.tsx`)
- **3-Tier Grouped Explorer**:
  1. `data/`: Shows dataset files (`data/dataset.csv`) with `RO` badge and lock icon (🔒). Selection opens file in read-only mode in Monaco editor; deletion is disabled.
  2. `outputs/`: Shows generated run artifacts (`outputs/metrics.json`, `outputs/model.joblib`) with artifact icons, sizes, and quick delete button.
  3. `experiments/`: Shows editable Python scripts (`pipeline_generated.py`, etc.) with `✦ Generated` and `● Modified` status indicators, inline file creation input, and delete buttons.
- **Category-Aware Tabs**: Tabs display category-specific icons (Database icon for `data/`, Folder icon for `outputs/`, FileCode for scripts) and lock badges for read-only files.
- **Read-Only Protection in Editor**: When a user selects a file in `data/` or a binary artifact, Monaco editor is set to `readOnly={true}`, and the status bar displays `🔒 Read-Only`.

### 2.5 1500ms Debounced Autosave Engine & Status Transitions
- **Debounced Server Sync**: When the user edits code, an autosave timer debounces for 1500ms.
- **Visual Status Transitions**:
  - While editing: Status bar displays `● Modified` (gold).
  - During save: Status bar displays `● Autosaving…` (gold).
  - Upon server confirmation: Status bar displays `✓ Saved` (green) (or `✦ Generated` / `▲ Diverged from builder`).
- **Immediate Save**: Ctrl+S or manual save calls `CodeExecutionService.saveWorkspaceFile` immediately and refreshes the workspace file tree.

### 2.6 Verification & Testing
- **Backend Pytest**: `tests/test_code_studio_workspace.py` verified 2/2 tests passed (100%):
  - Full CRUD lifecycle (create, write, read, list, rename, delete).
  - Path traversal protection (`..` -> 400 Bad Request).
  - Read-only protection (`data/` write & delete -> 403 Forbidden).
- **Frontend Vitest**: 14/14 tests passed across 4 test suites (`phase2WorkspacePersistence.test.tsx`, `phase1TruthfulDiagnostics.test.tsx`, `ViewAsCodeStudio.test.tsx`, `idePersistence.test.tsx`).
- **Production Web Bundle**: Built cleanly via `npm run build` in 1.13s with zero TypeScript/Vite errors.

---

---

## Phase 3 — Isolated Execution Sandbox and Output Streaming (Completed)

### 3.1 Hardened Cross-Platform Execution Sandbox (`code_execution_service.py` & Celery)
- **Process Group Isolation & Tree Termination**: Implemented `_kill_process_tree` across POSIX and Windows. On Linux/POSIX, child processes are spawned with `preexec_fn=os.setsid` and killed with `os.killpg(os.getpgid(pid), signal.SIGKILL)`. On Windows, child process trees are terminated using `taskkill /F /T /PID`. Kills the entire process hierarchy including spawned worker pools or runaway child processes.
- **Resource Constraints**: Capped process time limits to `timeout` seconds (default 90s, max 300s) and memory to `512MB` via `resource.RLIMIT_AS` on POSIX environments.
- **Real Exit Codes & States**:
  - `completed` (exit code `0`)
  - `failed` (exit code `>0`)
  - `timed_out` (exit code `124`)
  - `out_of_memory` (exit code `137`)
  - `cancelled` / `stopped` (exit code `130`)
  - `queued` (with dynamic integer `queue_position`)
- **Safe Environment Stripping**: Sandboxed child executions are stripped of sensitive host environment variables (`DATABASE_URL`, `POSTGRES_PASSWORD`, `SECRET_KEY`, `JWT_SECRET`, `CELERY_BROKER_URL`, `MINIO_SECRET_KEY`), passing only safe execution parameters (`PYTHONUNBUFFERED`, `PYTHONDONTWRITEBYTECODE`, `PROJECT_ID`, `DATASET_ID`).

### 3.2 Project-Scoped Concurrency Queue
- **Concurrency Tracking**: Implemented `_ACTIVE_PROJECT_RUNS` and `_PROJECT_QUEUES` in `code_execution_service.py`. When a run is dispatched for an active project, it is queued with its zero-indexed queue position (`queue_position = 1, 2, ...`).
- **Auto-Dequeue & Notification**: When the active run terminates or is stopped, the next queued run is dequeued automatically and dispatched to compute, notifying connected SSE listeners via `type: "status", status: "running"`.
- **Queue Eviction**: Stopping a queued execution removes it from the project queue immediately and marks status as `cancelled`.

### 3.3 Safe ANSI Parser (`ansiParser.tsx`)
- **Complete 16-Color Code Support**: Parses standard ANSI escape codes (`\u001b[30m`–`37m`, `\u001b[90m`–`97m`, `\u001b[40m`–`47m`, bold, underline, italic, reset `\u001b[0m`) into styled React span elements with tokenized brand colors (`#EF4444`, `#22C55E`, `#F59E0B`, `#3B82F6`, etc.).
- **Safe Escape Stripping**: Safely filters out cursor positioning codes (`\u001b[2K`, `\u001b[1A`), OSC hyperlinks, and terminal control sequences without escape artifacts or regex denial of service.

### 3.4 Interactive Python Traceback Navigation & Editor Centering
- **Traceback Frame Detection**: Terminal output parser detects Python traceback lines matching `File "([^"]+)", line (\d+)(?:, in (.+))?`.
- **Click-to-Jump**: Renders clickable lines with gold indicator (`↳ File "train.py", line 14 [Jump to line 14]`).
- **Cursor Centering & Inline Marker**: Clicking navigates the Monaco editor to the target file and centers the cursor on the exact error line (`setCursorPos({ line, col: 1 })`), placing an inline runtime diagnostic marker on the offending line.

### 3.5 Output Capping & Full Raw Output Download
- **Output Streaming Cap**: Enforced `MAX_STREAM_LINES = 5000` limit to prevent browser memory exhaustion on infinite print loops.
- **Truncation Notice Banner**: Displays warning banner when `is_truncated = true` informing the user that output exceeded 5,000 lines.
- **Raw Output Attachment Endpoint**: Added `GET /api/v1/code-execution/{exec_id}/output/download` returning the complete untruncated output as an `attachment; filename=execution-{exec_id}.txt` text file.
- **Quick Download Button**: Download icon added to the bottom panel toolbar allowing 1-click export of the raw output file.

### 3.6 Honest Status & Outage Reporting
- **No Fabricated Exit Codes**: If the execution backend is unreachable or returns 404, status is marked `failed`, exit code is explicitly kept `null`, and output explains: `[ML Playground] Execution backend unavailable (404 Not Found)`.

### 3.7 Verification & Tests
- **Backend Pytest**: `tests/test_code_studio_execution_phase3.py` verified **5/5 tests passed (100%)**:
  1. `test_execution_success_and_lifecycle` PASSED
  2. `test_execution_timeout_kills_process_tree` PASSED
  3. `test_execution_stop_kills_process_tree` PASSED
  4. `test_project_concurrency_queue` PASSED
  5. `test_download_raw_output_endpoint` PASSED
- **Combined Backend Test Suite**: **7/7 tests passed (100%)** across Phase 2 & Phase 3.
- **Frontend Vitest**: **17/17 tests passed (100%)** across `phase3ExecutionStreaming.test.tsx`, `phase2WorkspacePersistence.test.tsx`, and `phase1TruthfulDiagnostics.test.tsx`.
- **TypeScript & Production Build**: `npx tsc --noEmit` passed with 0 errors; `npm run build` succeeded in 1.13s.

---

## Phase 4 — Security Gate Audit & Terminal Guardrails (Completed)

### 4.1 Mandatory Security Gate Audit (Real Subprocess Execution)
Before considering terminal construction or interactive PTY shells, an empirical security gate audit was conducted by executing real audit code (`scratch/phase4_gate_audit.py`) through `CodeExecutionService.start_execution` inside the running Docker container `infra-api-1`.

#### Empirical Audit Results:
| Security Check | Command / Probe | Result | Status |
|---|---|---|---|
| **1. Sensitive Env Scrubbing** | Inspect `os.environ` keys for secrets (`DATABASE_URL`, `JWT_SECRET`, `SECRET_KEY`, `MINIO_SECRET_KEY`, `POSTGRES_PASSWORD`, `MLPLAYGROUND_CERT_SECRET`) | `sensitive_env_keys: []` | **PASSED** |
| **2. Host Filesystem Protection** | Probe read access to `/app/.env` | `env_file_readable: True` | **FAILED** |
| **3. Database Network Isolation** | Probe TCP socket connection to `db:5432` | `can_reach_postgres_db: True` | **FAILED** |
| **4. Redis Network Isolation** | Probe TCP socket connection to `redis:6379` | `can_reach_redis: True` | **FAILED** |
| **5. MinIO Network Isolation** | Probe TCP socket connection to `minio:9000` | `can_reach_minio: True` | **FAILED** |
| **6. Internet Egress Isolation** | Probe TCP socket connection to `1.1.1.1:80` | `can_reach_internet: True` | **FAILED** |
| **7. Workspace Write Boundary** | Probe write access to `/tmp/pwn.txt` | `can_write_outside_workspace: True` | **FAILED** |

### 4.2 Mandatory Gate Decision: DEPLOYMENT BLOCKER
Because the child subprocess runs inside the container's default network namespace (`eth0`) and mount namespace, it can establish TCP sockets to backend database/cache services and access parent container filesystem paths outside its workspace.

Per the engineering specification:
> *"If any check fails, report a DEPLOYMENT BLOCKER, leave this phase behind a disabled flag, and do not build the terminal."*

**Outcome**: An arbitrary interactive terminal (xterm.js / PTY shell) **CANNOT AND MUST NOT** be opened to students without true network namespace isolation (`ip netns` or `--network none`) and ephemeral filesystem sandboxing (gVisor `runsc` or ephemeral Docker container). The interactive terminal is explicitly locked behind a disabled feature flag.

### 4.3 Backend Security Hardening & Gate Endpoints
1. **Strict Environment Variable Allowlist**:
   Upgraded both `code_execution_service.py` and Celery worker `code_execution_task.py` to use `_ALLOWED_ENV_VARS` (`PATH`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TERM`, `HOME`, `USER`, `TMPDIR`, `TEMP`, `TMP`, `SYSTEMROOT`, `WINDIR`, `COMSPEC`, `PATHEXT`). All host process environment variables are scrubbed, eliminating host credential leakage.
2. **Feature Flag Locked**:
   `ENABLE_INTERACTIVE_TERMINAL = False` in `services/api/app/routers/code_execution.py`.
3. **Status Endpoint**:
   `GET /api/v1/code-execution/terminal/status` returns:
   ```json
   {
     "enabled": false,
     "status": "blocked",
     "reason": "DEPLOYMENT BLOCKER: Containerized network and filesystem namespace isolation (gVisor/ephemeral container sandbox) must be configured before arbitrary PTY shell execution is permitted."
   }
   ```
4. **WebSocket Rejection Guard**:
   Connecting to `ws:///api/v1/code-execution/terminal/pty` immediately sends a structured error message (`type: "error"`, `code: "DEPLOYMENT_BLOCKER"`) and closes the connection with code `1008 (Policy Violation)`.

### 4.4 Frontend Honest Labeling
1. **PTY Shell (Blocked) Badge**:
   Added a visible `PTY Shell (Blocked)` status badge with a lock icon (🔒) and full `DEPLOYMENT BLOCKER` explanation tooltip in the bottom panel toolbar.
2. **Debug Panel Honest Banner**:
   Added an explicit banner in the bottom Debug tab:
   > *"Execution Inspector — Interactive breakpoints & step-debugging not available yet (planned for Phase 7)."*
3. **API Client Integration**:
   Added `CodeExecutionService.getTerminalStatus()` to `apps/web/src/services/api.ts`.

### 4.5 Verification & Tests
- **Backend Pytest**: `tests/test_code_studio_phase4_security_gate.py` verified **3/3 tests passed (100%)**:
  1. `test_subprocess_environment_allowlist` PASSED
  2. `test_terminal_status_endpoint` PASSED
  3. `test_terminal_websocket_blocked` PASSED
- **Full Backend Code Studio Suite**: **10/10 tests passed (100%)** across Phase 2, Phase 3, and Phase 4.
- **Frontend Vitest**: `src/test/phase4SecurityGate.test.tsx` verified **3/3 tests passed (100%)**:
  1. `honestly exposes CodeExecutionService.getTerminalStatus() as blocked` PASSED
  2. `renders PTY Shell (Blocked) badge with deployment blocker tooltip in bottom panel` PASSED
  3. `renders honest Execution Inspector banner in debug tab without faking step debugging` PASSED
- **Full Frontend Code Studio Suite**: **20/20 tests passed (100%)** across Phase 1, Phase 2, Phase 3, and Phase 4.
- **TypeScript & Production Build**: `npx tsc --noEmit` passed with 0 errors; `npm run build` succeeded in 2.37s.

---

---

## Phase 5 — ML-Native Editing & Language Intelligence (Completed)

### 5.1 Schema-Aware Autocompletion (`mlCodeIntelligence.ts`)
- **Subscript Introspection**: Typing `df["`, `df['`, `data["`, `X["`, `df.drop(columns=["...`, or within `columns = [...]` triggers autocomplete suggestions containing all columns in the active dataset's schema.
- **Rich Column Metadata**: Each column completion displays its inferred data type (`numeric`, `categorical`, `string`), origin dataset name, and assigned role (`🎯 Target Variable`, `★ Selected Feature`, or `Feature`).
- **Target & Feature Shortcuts**: When outside column subscripts, autocompletion offers `TARGET_COLUMN` (e.g. `"churn"`) and `FEATURE_COLUMNS` (JSON array of selected feature columns) with full inline documentation.
- **ML Primitives Autocomplete**: Outside quotes, provides completions for pinned scikit-learn models (`RandomForestClassifier`, `GradientBoostingClassifier`, `LogisticRegression`), transformers (`StandardScaler`, `SimpleImputer`, `ColumnTransformer`, `Pipeline`), and model selection utilities (`train_test_split`, `cross_val_score`).

### 5.2 Hover & Signature Help Engine
- **Pinned Library Docstrings**: Registered a dedicated Monaco Hover Provider supplying formatted markdown docstrings for scikit-learn 1.9.0, Python 3.12, pandas, and joblib.
- **Dataset Column Hover**: Hovering over any dataset column identifier displays its schema metadata, inferred type, parent dataset, and whether it is configured as the active target variable or feature.
- **Active Signature Help**: Registered a Monaco Signature Help Provider tracking cursor position inside function calls (e.g. `train_test_split(`, `RandomForestClassifier(`, `cross_val_score(`) with parameter documentation and active parameter highlighting based on comma positions outside strings.

### 5.3 Working Snippet Set with Learning Explanations
Created 5 core executable ML snippets directly accessible via toolbar dropdown and Monaco autocomplete:
1. `train-test-split`: Unbiased train (80%) and test (20%) partitioning with random state.
2. `ml-pipeline`: Complete leak-proof scikit-learn `Pipeline` encapsulating imputation, scaling, and classification.
3. `cross-validation`: Generalization stability measurement via 5-fold cross-validation.
4. `confusion-matrix`: Evaluation on test split showing confusion matrix and classification report.
5. `feature-importance`: Gini impurity reduction extraction across features.
- **Learning Mode Guidance**: When Learning Mode is active, inserting any snippet triggers an educational toast explaining *why* the pattern is critical (e.g., preventing data leakage, addressing metric imbalance) and logs a telemetry signal via `LearningContext.logSignal`.

### 5.4 Learning-Layer Static AST Checks (`ML Playground checks`)
- **AST Preprocessing Leakage Audit**: Evaluates user code with debounced calls (350ms) to `LearningService.auditCode`. Detects data leakage (e.g., preprocessing transformer `.fit()` executed prior to `train_test_split()`).
- **Clean Diagnostics Separation**: In the Problems tab, learning violations are badged distinctly as `🎓 ML Playground checks` with gold borders and high-contrast styling. They are never mixed into Python syntax, Pyflakes, or runtime errors.

### 5.5 AI Copilot Explain & Fix Actions with Side-by-Side Diff Review
- **In-Problem Actions**: Every diagnostic item and terminal traceback line displays dedicated `[Explain]` and `[Fix]` buttons.
- **Explain Action**: Dispatches an inquiry to AI Copilot describing the exact code line, error message, and ML context, opening the AI Copilot side drawer.
- **Fix Action & Explicit Acceptance**: Asking Copilot for a fix triggers code generation and immediately displays the side-by-side `RegenerateDiffModal` (`DiffEditor`). No edits are ever applied silently to the user's buffer without explicit review and clicking "Accept & Replace Code".
- **Server-Side Policy Enforcement**: `CopilotService.generate_response` strictly enforces classroom exam policies:
  - `policy="off"`: Rejects requests immediately with `allowed: False` and policy warning notice without calling the LLM.
  - `policy="explain-only"`: Injects strict non-solution guidelines forbidding complete pipelines or copy-paste code.
  - `policy="full"`: Standard pair-programming.

### 5.6 Verification & Tests
- **Frontend Vitest**: `src/test/phase5MlEditing.test.tsx` verified **13/13 tests passed (100%)**:
  1. `suggests column names when typing inside df["..."] subscript` PASSED
  2. `suggests column names inside single quotes subscript df['...` PASSED
  3. `provides TARGET_COLUMN and FEATURE_COLUMNS suggestions` PASSED
  4. `suggests scikit-learn and pandas ML primitives when outside subscripts` PASSED
  5. `returns scikit-learn 1.9.0 pinned docstrings for ML models and transformers` PASSED
  6. `returns dataset column hover info for columns in the active schema` PASSED
  7. `returns null hover docstring for unrecognized keywords` PASSED
  8. `provides accurate signature help for functions with active parameter detection` PASSED
  9. `provides all 5 core ML snippets required by the Phase 5 spec` PASSED
  10. `ensures each snippet includes working executable code and learning explanation` PASSED
  11. `renders separate "ML Playground checks" badge in Problems tab when AST audit finds data leakage` PASSED
  12. `triggers Copilot Explain message when Explain button is clicked` PASSED
  13. `triggers Copilot Fix message and opens side-by-side RegenerateDiffModal for user acceptance` PASSED
- **Regression Test Suites**: **20/20 tests passed (100%)** across `phase1TruthfulDiagnostics.test.tsx`, `phase2WorkspacePersistence.test.tsx`, `phase3ExecutionStreaming.test.tsx`, and `phase4SecurityGate.test.tsx`.
- **Backend Pytest**: `tests/test_copilot_service.py` verified **6/6 tests passed (100%)**, including policy enforcement (`off`, `explain-only`, `full`).
- **Full Backend Code Studio Suite**: **8/8 tests passed (100%)** across `test_code_studio_execution_phase3.py` and `test_code_studio_phase4_security_gate.py`.
- **Frontend Typecheck & Production Build**:
  - `npx tsc --noEmit` passed with 0 errors.
  - `npm run build` succeeded with clean bundle in 1.81s.


