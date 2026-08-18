"""View-as-Code Studio Router — V7B Part 2.

Provides DSL export/import/validate endpoints for all resource types.
Base path: /api/v1/studio
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse

from app.studio.dsl_engine import (
    build_dataset_dsl,
    build_deployment_dsl,
    build_experiment_dsl,
    build_monitoring_dsl,
    build_pipeline_dsl,
    build_workspace_dsl,
    export_dsl_json,
    export_dsl_yaml,
    import_dsl_json,
    import_dsl_yaml,
    validate_dsl,
)
from app.studio.version_history import (
    diff_versions,
    get_version_history,
    snapshot_version,
)
from app.studio.template_library import get_template, list_templates

from app.schemas.studio import (
    DSLDiff,
    DSLDocument,
    DSLExportRequest,
    DSLImportRequest,
    DSLTemplate,
    DSLValidationResult,
    DSLVersionEntry,
)

from app.dependencies import get_current_user

router = APIRouter(
    prefix="/studio",
    tags=["View-as-Code Studio"],
    dependencies=[Depends(get_current_user)],  # ← all studio endpoints require auth
)


# ── DSL Builders ────────────────────────────────────────────────────────────────

@router.get("/dsl/dataset/{dataset_id}", response_model=DSLDocument, summary="Get Dataset DSL")
async def get_dataset_dsl(dataset_id: str, name: str = "Dataset") -> DSLDocument:
    """Generate a View-as-Code DSL document for a dataset."""
    return build_dataset_dsl(dataset_id=dataset_id, name=name)


@router.get("/dsl/experiment/{experiment_id}", response_model=DSLDocument, summary="Get Experiment DSL")
async def get_experiment_dsl(
    experiment_id: str,
    name: str = "Experiment",
    algorithm: str = "random_forest",
    dataset_id: str = "dataset-001",
) -> DSLDocument:
    """Generate a View-as-Code DSL document for an experiment."""
    return build_experiment_dsl(
        experiment_id=experiment_id,
        name=name,
        algorithm=algorithm,
        dataset_id=dataset_id,
    )


@router.get("/dsl/deployment/{deployment_id}", response_model=DSLDocument, summary="Get Deployment DSL")
async def get_deployment_dsl(
    deployment_id: str,
    name: str = "Deployment",
    model_id: str = "model-001",
    strategy: str = "BLUE_GREEN",
) -> DSLDocument:
    """Generate a View-as-Code DSL document for a deployment."""
    return build_deployment_dsl(
        deployment_id=deployment_id,
        name=name,
        model_id=model_id,
        strategy=strategy,
    )


@router.get("/dsl/monitoring/{monitor_id}", response_model=DSLDocument, summary="Get Monitoring DSL")
async def get_monitoring_dsl(monitor_id: str, deployment_id: str, name: str = "Monitor") -> DSLDocument:
    """Generate a View-as-Code DSL document for a monitoring configuration."""
    return build_monitoring_dsl(monitor_id=monitor_id, name=name, deployment_id=deployment_id)


@router.get("/dsl/workspace/{workspace_id}", response_model=DSLDocument, summary="Get Workspace DSL")
async def get_workspace_dsl(workspace_id: str, name: str = "Workspace") -> DSLDocument:
    """Generate a View-as-Code DSL document for a workspace."""
    return build_workspace_dsl(workspace_id=workspace_id, name=name)


# ── Export ─────────────────────────────────────────────────────────────────────

@router.post("/export", summary="Export DSL as YAML or JSON")
async def export_dsl(request: DSLExportRequest) -> PlainTextResponse:
    """Export a DSL document. Currently returns a sample; integrate with dsl_engine builders."""
    doc = build_dataset_dsl(dataset_id=request.dsl_id, name=f"Export-{request.dsl_id}")
    if request.format.lower() == "yaml":
        content = export_dsl_yaml(doc)
        media_type = "text/yaml"
    else:
        content = export_dsl_json(doc)
        media_type = "application/json"
    return PlainTextResponse(content=content, media_type=media_type)


# ── Import ─────────────────────────────────────────────────────────────────────

@router.post("/import", response_model=DSLDocument, summary="Import DSL from YAML/JSON")
async def import_dsl(request: DSLImportRequest) -> DSLDocument:
    """Import a DSL document from YAML or JSON content."""
    try:
        if request.format.lower() == "yaml":
            doc = import_dsl_yaml(request.content)
        else:
            doc = import_dsl_json(request.content)
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    return doc


# ── Validate ───────────────────────────────────────────────────────────────────

@router.post("/validate", response_model=DSLValidationResult, summary="Validate a DSL document")
async def validate_dsl_endpoint(doc: DSLDocument) -> DSLValidationResult:
    """Validate DSL structure and return errors/warnings."""
    return validate_dsl(doc)


# ── Version History ─────────────────────────────────────────────────────────────

@router.post("/history/snapshot", response_model=DSLVersionEntry, summary="Snapshot a DSL version")
async def create_snapshot(doc: DSLDocument, message: Optional[str] = Query(None)) -> DSLVersionEntry:
    """Save a versioned snapshot of a DSL document."""
    return snapshot_version(doc, message=message)


@router.get("/history/{dsl_id}", response_model=List[DSLVersionEntry], summary="Get DSL version history")
async def get_history(dsl_id: str) -> List[DSLVersionEntry]:
    """Return all saved versions for a DSL document."""
    return get_version_history(dsl_id)


@router.get("/history/{dsl_id}/diff", response_model=DSLDiff, summary="Diff two DSL versions")
async def get_diff(
    dsl_id: str,
    from_version: str = Query(..., description="Source version label"),
    to_version: str = Query(..., description="Target version label"),
) -> DSLDiff:
    """Compute structural diff between two DSL versions."""
    try:
        return diff_versions(dsl_id, from_version, to_version)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Templates ──────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=List[DSLTemplate], summary="List DSL templates")
async def read_templates(
    dsl_type: Optional[str] = Query(None, description="pipeline | deployment | monitoring | experiment | dataset"),
    tags: Optional[str] = Query(None, description="Comma-separated tag filters"),
) -> List[DSLTemplate]:
    """List all available pre-built DSL templates."""
    tag_list = [t.strip() for t in tags.split(",")] if tags else None
    return list_templates(dsl_type=dsl_type, tags=tag_list)


@router.get("/templates/{template_id}", response_model=DSLTemplate, summary="Get a specific template")
async def read_template(template_id: str) -> DSLTemplate:
    """Return a specific pre-built DSL template."""
    try:
        return get_template(template_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
