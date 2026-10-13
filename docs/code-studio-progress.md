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

## Next Steps: Phase 2 — Workspace and Persistence
- Server-side project workspace filesystem per user/project.
- Safe file operations (create, rename, delete, switch).
- Read-only `/workspace/data/` mount and isolated `/workspace/outputs/` directory.
- Background debounce autosave to server.
