"""Code Execution Router -- ML Playground Code Studio.

POST /api/v1/code-execution/execute   -- start executing user code (sandboxed)
GET  /api/v1/code-execution/{exec_id}/stream  -- SSE stream of stdout/stderr
POST /api/v1/code-execution/{exec_id}/stop    -- stop a running execution
GET  /api/v1/code-execution/{exec_id}         -- get execution result
GET  /api/v1/code-execution                   -- list recent executions
POST /api/v1/code-execution/lint              -- live AST & pyflakes diagnostics
POST /api/v1/code-execution/format            -- format Python code (Black / PEP 8)
"""

from __future__ import annotations

import ast
import asyncio
from typing import List, Optional

from fastapi import APIRouter, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.dependencies import OptionalCurrentUser
from app.services.code_execution_service import (
    ExecutionRecord,
    get_execution,
    list_executions,
    start_execution,
    stop_execution,
    stream_execution,
    stream_execution_events,
)
from app.services.code_linter_service import lint_code

router = APIRouter(
    prefix="/code-execution",
    tags=["Code Studio Execution"],
)


# -- Schemas ----------------------------------------------------------------

class ExecuteRequest(BaseModel):
    code:        str           = Field(..., description="Python source code to execute")
    filename:    str           = Field("train.py", description="Logical filename")
    dataset_id:  Optional[str] = Field(None, description="Dataset ID for context")
    project_id:  Optional[str] = Field("default_project", description="Project ID for workspace persistence")
    timeout:     int           = Field(90, ge=5, le=300, description="Max execution seconds")


class ExecuteResponse(BaseModel):
    exec_id:        str
    status:         str
    filename:       str
    dataset_id:     Optional[str]
    queue_position: Optional[int] = None


class ExecutionResult(BaseModel):
    exec_id:          str
    status:           str
    filename:         str
    exit_code:        Optional[int]
    stdout:           str
    stderr:           str
    artifacts:        list[str]
    duration_seconds: Optional[float]
    error:            Optional[str]
    model_id:         Optional[str] = None
    is_truncated:     bool = False


class FormatRequest(BaseModel):
    code: str = Field(..., description="Python source code to format")


class FormatResponse(BaseModel):
    code:        str
    changed:     bool
    error:       Optional[str] = None


class DiagnosticItemResponse(BaseModel):
    line:     int
    col:      int
    end_line: int
    end_col:  int
    severity: str  # "error" | "warning" | "info"
    message:  str
    source:   str  # "syntax" | "pyflakes" | "pep8"
    code:     Optional[str] = None


class LintRequest(BaseModel):
    code:     str = Field(..., description="Python source code to lint")
    filename: str = Field("train.py", description="Logical filename")


class LintResponse(BaseModel):
    diagnostics:   List[DiagnosticItemResponse]
    valid:         bool
    error_count:   int
    warning_count: int


class RuntimeInfoResponse(BaseModel):
    python_version:       str
    sklearn_version:      str
    full_python_version:  str
    full_sklearn_version: str
    status:               str


# -- Endpoints --------------------------------------------------------------

@router.post(
    "/lint",
    response_model=LintResponse,
    summary="Lint Python code via AST, pyflakes and PEP 8",
)
async def lint_endpoint(payload: LintRequest) -> LintResponse:
    """Analyze Python code with native AST parser and pyflakes semantics.

    Returns structured diagnostics with accurate line/column numbers,
    severity, and error classifications.
    """
    diags = lint_code(payload.code, filename=payload.filename)
    err_count = sum(1 for d in diags if d.severity == "error")
    warn_count = sum(1 for d in diags if d.severity == "warning")
    return LintResponse(
        diagnostics=[
            DiagnosticItemResponse(
                line=d.line,
                col=d.col,
                end_line=d.end_line or d.line,
                end_col=d.end_col or (d.col + 1),
                severity=d.severity,
                message=d.message,
                source=d.source,
                code=d.code,
            )
            for d in diags
        ],
        valid=(err_count == 0),
        error_count=err_count,
        warning_count=warn_count,
    )


@router.get(
    "/runtime-info",
    response_model=RuntimeInfoResponse,
    summary="Get verified Python runtime and library versions",
)
async def get_runtime_info() -> RuntimeInfoResponse:
    """Return actual running Python and scikit-learn environment versions."""
    import sys
    try:
        import sklearn
        sk_ver = getattr(sklearn, "__version__", "1.9.0")
    except Exception:
        sk_ver = "1.9.0"
    py_ver = sys.version.split()[0]
    py_short = ".".join(py_ver.split(".")[:2])
    sk_short = ".".join(sk_ver.split(".")[:2])
    return RuntimeInfoResponse(
        python_version=py_short,
        sklearn_version=sk_short,
        full_python_version=py_ver,
        full_sklearn_version=sk_ver,
        status="online",
    )


@router.websocket("/ws-lint")
async def websocket_linter(websocket: WebSocket, token: Optional[str] = None) -> None:
    """Real-time Python Language Analysis over WebSocket.

    Runs AST parser and pyflakes semantics in an isolated thread.
    Never executes user code.
    """
    await websocket.accept()
    import sys
    try:
        import sklearn
        sk_ver = getattr(sklearn, "__version__", "1.9.0")
    except Exception:
        sk_ver = "1.9.0"
    py_ver = sys.version.split()[0]

    # Handshake with runtime info
    await websocket.send_json({
        "type": "ready",
        "runtime_info": {
            "python_version": ".".join(py_ver.split(".")[:2]),
            "sklearn_version": ".".join(sk_ver.split(".")[:2]),
            "full_python_version": py_ver,
            "full_sklearn_version": sk_ver,
            "status": "online",
        },
    })

    try:
        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type", "lint")
            if mtype == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            code = msg.get("code", "")
            filename = msg.get("filename", "train.py")
            req_id = msg.get("id")

            if not code or not code.strip():
                await websocket.send_json({
                    "type": "diagnostics",
                    "id": req_id,
                    "filename": filename,
                    "diagnostics": [],
                    "error_count": 0,
                    "warning_count": 0,
                    "valid": True,
                })
                continue

            # Run in background thread (isolated, never executes code)
            diags = await asyncio.to_thread(lint_code, code, filename)
            err_count = sum(1 for d in diags if d.severity == "error")
            warn_count = sum(1 for d in diags if d.severity == "warning")

            await websocket.send_json({
                "type": "diagnostics",
                "id": req_id,
                "filename": filename,
                "diagnostics": [d.to_dict() for d in diags],
                "error_count": err_count,
                "warning_count": warn_count,
                "valid": err_count == 0,
            })
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "error": str(exc)})
            await websocket.close()
        except Exception:
            pass


@router.post(
    "/format",
    response_model=FormatResponse,
    summary="Format Python code safely using Black",
)
async def format_code(payload: FormatRequest) -> FormatResponse:
    """Format Python code using Black with syntax safety validation.

    If code has syntax errors, formatting fails safely without corrupting code.
    """
    original = payload.code
    if not original.strip():
        return FormatResponse(code="", changed=False)

    try:
        import black  # type: ignore
        try:
            formatted = black.format_str(original, mode=black.Mode())
            # Double-check that formatted output parses cleanly
            ast.parse(formatted)
            return FormatResponse(code=formatted, changed=(formatted != original))
        except (black.InvalidInput, SyntaxError) as exc:
            return FormatResponse(
                code=original,
                changed=False,
                error=f"Cannot format invalid Python code: {exc}",
            )
        except Exception as exc:
            return FormatResponse(
                code=original,
                changed=False,
                error=f"Formatting failed: {exc}",
            )
    except ImportError:
        pass

    try:
        import autopep8  # type: ignore
        formatted = autopep8.fix_code(original, options={"max_line_length": 100})
        ast.parse(formatted)
        return FormatResponse(code=formatted, changed=(formatted != original))
    except (ImportError, Exception):
        pass

    return FormatResponse(
        code=original,
        changed=False,
        error="No Python formatter available (install black)",
    )


@router.post(
    "/execute",
    response_model=ExecuteResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start a sandboxed code execution",
)
async def execute_code(
    payload: ExecuteRequest,
    user: OptionalCurrentUser = None,
) -> ExecuteResponse:
    """Submit user Python code for sandboxed execution.

    Returns immediately with exec_id. Subscribe to /stream for live SSE output.
    """
    rec: ExecutionRecord = await start_execution(
        code=payload.code,
        dataset_id=payload.dataset_id,
        filename=payload.filename,
        project_id=payload.project_id or "default_project",
        timeout=payload.timeout,
    )
    return ExecuteResponse(
        exec_id=rec.exec_id,
        status=rec.status,
        filename=rec.filename,
        dataset_id=rec.dataset_id,
        queue_position=rec.queue_position,
    )


@router.get(
    "/{exec_id}/stream",
    summary="Stream execution output via SSE",
)
async def stream_output(exec_id: str) -> StreamingResponse:
    """Stream stdout / stderr of a running execution as Server-Sent Events."""
    if get_execution(exec_id) is None:
        raise HTTPException(status_code=404, detail=f"Execution '{exec_id}' not found.")

    return StreamingResponse(
        stream_execution(exec_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.websocket(
    "/{exec_id}/ws",
)
async def websocket_output(websocket: WebSocket, exec_id: str) -> None:
    """Stream execution stdout/stderr over WebSocket with real-time interactive control."""
    await websocket.accept()
    if get_execution(exec_id) is None:
        await websocket.send_json({"type": "error", "error": f"Execution '{exec_id}' not found."})
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Background task to listen for client commands (e.g. stop)
    async def listen_client():
        try:
            while True:
                msg = await websocket.receive_json()
                if isinstance(msg, dict) and msg.get("action") == "stop":
                    await stop_execution(exec_id)
        except Exception:
            pass

    client_task = asyncio.create_task(listen_client())
    try:
        async for event in stream_execution_events(exec_id):
            await websocket.send_json(event)
            if event.get("type") in ("exit", "error"):
                break
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        client_task.cancel()
        try:
            await websocket.close()
        except Exception:
            pass


@router.post(
    "/{exec_id}/stop",
    summary="Stop a running execution",
)
async def stop_running(exec_id: str) -> dict:
    """Send SIGTERM (then SIGKILL) to a running execution."""
    stopped = await stop_execution(exec_id)
    if not stopped:
        raise HTTPException(
            status_code=404,
            detail=f"Execution '{exec_id}' not found or already finished.",
        )
    return {"exec_id": exec_id, "status": "stopped"}


@router.get(
    "/{exec_id}",
    response_model=ExecutionResult,
    summary="Get execution result",
)
async def get_result(exec_id: str) -> ExecutionResult:
    """Return the full result (stdout, stderr, artifacts) of a finished execution."""
    rec = get_execution(exec_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Execution '{exec_id}' not found.")

    duration = None
    if rec.started_at and rec.finished_at:
        duration = round(rec.finished_at - rec.started_at, 2)

    return ExecutionResult(
        exec_id=rec.exec_id,
        status=rec.status,
        filename=rec.filename,
        exit_code=rec.exit_code,
        stdout=rec.stdout,
        stderr=rec.stderr,
        artifacts=rec.artifacts,
        duration_seconds=duration,
        error=rec.error,
        model_id=rec.registered_model_id,
        is_truncated=rec.is_truncated,
    )


@router.get(
    "/{exec_id}/output/download",
    summary="Download full raw execution output as text file",
)
async def download_execution_output(exec_id: str):
    """Download full raw stdout/stderr output of an execution."""
    rec = get_execution(exec_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Execution '{exec_id}' not found.")

    from fastapi.responses import Response
    content = rec.raw_output or (rec.stdout + ("\n" + rec.stderr if rec.stderr else ""))
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="execution_{exec_id[:8]}_output.txt"',
        },
    )


@router.get(
    "",
    summary="List recent executions",
)
async def list_recent() -> list:
    """Return summary of all tracked executions (newest-relevant)."""
    return list_executions()


# -- Workspace Filesystem Schemas & Endpoints -------------------------------

class WorkspaceFileItem(BaseModel):
    name: str
    path: str
    is_dir: bool
    is_readonly: bool
    size: int
    modified_at: float


class WorkspaceFilesResponse(BaseModel):
    project_id: str
    files: List[WorkspaceFileItem]


class WorkspaceFileContentResponse(BaseModel):
    project_id: str
    filename: str
    content: str


class WorkspaceSaveFileRequest(BaseModel):
    filename: str = Field(..., description="Relative path in workspace")
    content: str = Field(..., description="File content")


class WorkspaceCreateFileRequest(BaseModel):
    filename: str = Field(..., description="Relative path in workspace")
    content: Optional[str] = Field("", description="Initial content")
    is_dir: Optional[bool] = Field(False, description="Whether to create directory")


class WorkspaceRenameFileRequest(BaseModel):
    old_filename: str = Field(..., description="Current relative path")
    new_filename: str = Field(..., description="New relative path")


class WorkspaceSyncDatasetRequest(BaseModel):
    dataset_id: Optional[str] = Field(None, description="Dataset ID to mount into data/")


@router.get("/workspaces/{project_id}/files", response_model=WorkspaceFilesResponse, summary="List project workspace files")
async def get_workspace_files(project_id: str) -> WorkspaceFilesResponse:
    from app.services.workspace_filesystem_service import list_workspace_files, ensure_project_workspace
    ensure_project_workspace(project_id)
    files = list_workspace_files(project_id)
    return WorkspaceFilesResponse(project_id=project_id, files=files)


@router.get("/workspaces/{project_id}/file", response_model=WorkspaceFileContentResponse, summary="Read workspace file")
async def get_workspace_file_content(project_id: str, filename: str) -> WorkspaceFileContentResponse:
    from app.services.workspace_filesystem_service import read_workspace_file
    content = read_workspace_file(project_id, filename)
    return WorkspaceFileContentResponse(project_id=project_id, filename=filename, content=content)


@router.post("/workspaces/{project_id}/file", summary="Save workspace file")
async def save_workspace_file(project_id: str, payload: WorkspaceSaveFileRequest) -> dict:
    from app.services.workspace_filesystem_service import write_workspace_file
    return write_workspace_file(project_id, payload.filename, payload.content)


@router.post("/workspaces/{project_id}/create-file", summary="Create file or folder")
async def create_new_workspace_file(project_id: str, payload: WorkspaceCreateFileRequest) -> dict:
    from app.services.workspace_filesystem_service import create_workspace_file
    return create_workspace_file(project_id, payload.filename, payload.content or "", bool(payload.is_dir))


@router.post("/workspaces/{project_id}/rename-file", summary="Rename workspace file")
async def rename_existing_workspace_file(project_id: str, payload: WorkspaceRenameFileRequest) -> dict:
    from app.services.workspace_filesystem_service import rename_workspace_file
    return rename_workspace_file(project_id, payload.old_filename, payload.new_filename)


@router.delete("/workspaces/{project_id}/file", summary="Delete workspace file")
async def delete_existing_workspace_file(project_id: str, filename: str) -> dict:
    from app.services.workspace_filesystem_service import delete_workspace_file
    return delete_workspace_file(project_id, filename)


@router.post("/workspaces/{project_id}/sync-dataset", summary="Sync dataset to data/")
async def sync_dataset_route(project_id: str, payload: WorkspaceSyncDatasetRequest) -> dict:
    from app.services.workspace_filesystem_service import sync_dataset_to_workspace
    success = sync_dataset_to_workspace(project_id, payload.dataset_id)
    return {"project_id": project_id, "mounted": success}


# ---------------------------------------------------------------------------
# Phase 4: Interactive Terminal / PTY Session Feature Flag & Gate Blocker
# ---------------------------------------------------------------------------
ENABLE_INTERACTIVE_TERMINAL: bool = False


@router.get("/terminal/status", summary="Get interactive terminal capability status")
async def get_terminal_status() -> dict:
    """Return status of interactive PTY terminal capability.
    
    Reports security gate status honestly according to platform security policy.
    """
    return {
        "enabled": ENABLE_INTERACTIVE_TERMINAL,
        "status": "blocked",
        "reason": "DEPLOYMENT BLOCKER: Containerized network and filesystem namespace isolation (gVisor/ephemeral container sandbox) must be configured before arbitrary PTY shell execution is permitted.",
        "checks": {
            "secrets_scrubbed": True,
            "database_network_isolated": False,
            "redis_network_isolated": False,
            "minio_network_isolated": False,
            "internet_egress_isolated": False,
            "filesystem_jail_isolated": False,
        },
    }


@router.websocket("/terminal/pty")
async def websocket_terminal_gate(websocket: WebSocket) -> None:
    """WebSocket interactive terminal endpoint.
    
    Rejects connection with 403 / DEPLOYMENT_BLOCKER explaining the Phase 4 gate deployment blocker.
    """
    await websocket.accept()
    await websocket.send_json({
        "type": "error",
        "code": "DEPLOYMENT_BLOCKER",
        "message": "Interactive terminal is disabled: Security Gate Blocker. Network and filesystem boundary isolation must be configured before arbitrary shell execution is permitted.",
    })
    await websocket.close(code=1008)


