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

## Next Steps: Phase 4 — Training Artifacts & Model Registry Bridge
- Standardize MLflow-compatible artifact packaging (`model.joblib`, `preprocessor.joblib`, `schema.json`, `metrics.json`).
- Auto-extract evaluation metrics (`accuracy`, `f1`, `auc_roc`, `loss`) from stdout/outputs and display structured performance card.
- 1-Click promotion bridge from Code Studio to Model Registry (Staging / Production) and Deployment Studio endpoint serving.
- Sandboxed execution with resource limits (timeout, memory, process isolation).
- Dual-channel WebSocket + SSE real-time stdout/stderr streaming with live exit codes.
- Integrated runtime error parser with file-frame detection and inline Monaco error highlights.

