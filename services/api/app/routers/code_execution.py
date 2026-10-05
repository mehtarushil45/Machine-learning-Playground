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
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request, status
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
    timeout:     int           = Field(90, ge=5, le=300, description="Max execution seconds")


class ExecuteResponse(BaseModel):
    exec_id:    str
    status:     str
    filename:   str
    dataset_id: Optional[str]


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
        timeout=payload.timeout,
    )
    return ExecuteResponse(
        exec_id=rec.exec_id,
        status=rec.status,
        filename=rec.filename,
        dataset_id=rec.dataset_id,
    )


@router.get(
    "/{exec_id}/stream",
    summary="Stream execution output via SSE",
)
async def stream_output(exec_id: str, _: Request = None) -> StreamingResponse:
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
    )


@router.get(
    "",
    summary="List recent executions",
)
async def list_recent() -> list:
    """Return summary of all tracked executions (newest-relevant)."""
    return list_executions()
