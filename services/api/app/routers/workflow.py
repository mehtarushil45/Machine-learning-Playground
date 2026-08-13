"""Workflow Integration Router — End-to-End ML Platform Orchestration (V7B Part 2).

Base path: /api/v1/workflow
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query

from app.ml.workflow_integration import (
    generate_workflow_report,
    get_workflow_lineage,
    get_workflow_status,
)

from app.dependencies import CurrentUser

router = APIRouter(
    prefix="/workflow",
    tags=["Enterprise Workflow Integration"],
    dependencies=[Depends(CurrentUser)],  # ← all workflow endpoints require auth
)


@router.get("/status", response_model=Dict[str, Any], summary="Get end-to-end workflow status")
async def read_workflow_status(
    dataset_id: Optional[str] = Query(None),
    model_id: Optional[str] = Query(None),
    deployment_id: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Return workflow completion status based on linked resource IDs."""
    return get_workflow_status(
        dataset_id=dataset_id,
        model_id=model_id,
        deployment_id=deployment_id,
    )


@router.get("/lineage/{correlation_id}", response_model=Dict[str, Any], summary="Trace workflow lineage")
async def read_workflow_lineage(
    correlation_id: str,
    activity_events: List[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Trace all events sharing a correlation_id across the workflow."""
    return get_workflow_lineage(
        correlation_id=correlation_id,
        activity_events=activity_events or [],
    )


@router.get("/report", response_model=Dict[str, Any], summary="Generate workflow report")
async def read_workflow_report(
    correlation_id: str = Query(...),
    dataset_id: Optional[str] = Query(None),
    model_id: Optional[str] = Query(None),
    deployment_id: Optional[str] = Query(None),
    monitor_id: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Generate a comprehensive end-to-end workflow report."""
    return generate_workflow_report(
        correlation_id=correlation_id,
        dataset_id=dataset_id,
        model_id=model_id,
        deployment_id=deployment_id,
        monitor_id=monitor_id,
    )
