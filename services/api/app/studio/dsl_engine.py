"""DSL Engine — View-as-Code Studio (V7B Part 2).

Generates YAML/JSON DSL representations for datasets, pipelines,
experiments, deployments, monitoring configs, and workspaces.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.schemas.studio import DSLDocument, DSLEdge, DSLNode, DSLValidationResult

try:
    import yaml as _yaml
    _HAS_YAML = True
except ImportError:
    _HAS_YAML = False


# ── DSL Builders ──────────────────────────────────────────────────────────────

def build_dataset_dsl(
    dataset_id: str,
    name: str,
    source_type: str = "csv",
    schema: Optional[Dict[str, Any]] = None,
    validation_rules: Optional[Dict[str, Any]] = None,
) -> DSLDocument:
    """Generate a Dataset DSL document."""
    now = datetime.now(timezone.utc)
    return DSLDocument(
        dsl_type="dataset",
        dsl_id=dataset_id,
        name=name,
        version="1.0",
        nodes=[
            DSLNode(node_id="source", node_type="source", label="Data Source",
                    config={"source_type": source_type}),
            DSLNode(node_id="validate", node_type="validate", label="Validation",
                    config={"rules": validation_rules or {}}),
            DSLNode(node_id="profile", node_type="profile", label="Profiling",
                    config={"schema": schema or {}}),
        ],
        edges=[
            DSLEdge(source="source", target="validate"),
            DSLEdge(source="validate", target="profile"),
        ],
        metadata={"dataset_id": dataset_id, "source_type": source_type},
        created_at=now,
        updated_at=now,
    )


def build_pipeline_dsl(
    pipeline_id: str,
    name: str,
    steps: List[Dict[str, Any]],
) -> DSLDocument:
    """Generate a Pipeline DSL document from a list of step configs."""
    now = datetime.now(timezone.utc)
    nodes = [
        DSLNode(
            node_id=step.get("id", f"step_{i}"),
            node_type=step.get("type", "transform"),
            label=step.get("label", f"Step {i}"),
            config=step.get("config", {}),
        )
        for i, step in enumerate(steps)
    ]
    edges = [
        DSLEdge(source=nodes[i].node_id, target=nodes[i + 1].node_id)
        for i in range(len(nodes) - 1)
    ]
    return DSLDocument(
        dsl_type="pipeline",
        dsl_id=pipeline_id,
        name=name,
        nodes=nodes,
        edges=edges,
        metadata={"step_count": len(steps)},
        created_at=now,
        updated_at=now,
    )


def build_experiment_dsl(
    experiment_id: str,
    name: str,
    algorithm: str,
    dataset_id: str,
    hyperparams: Optional[Dict[str, Any]] = None,
) -> DSLDocument:
    """Generate an Experiment DSL document."""
    now = datetime.now(timezone.utc)
    return DSLDocument(
        dsl_type="experiment",
        dsl_id=experiment_id,
        name=name,
        nodes=[
            DSLNode(node_id="data", node_type="dataset", label="Dataset",
                    config={"dataset_id": dataset_id}),
            DSLNode(node_id="train", node_type="train", label="Training",
                    config={"algorithm": algorithm, "hyperparams": hyperparams or {}}),
            DSLNode(node_id="evaluate", node_type="evaluate", label="Evaluation", config={}),
        ],
        edges=[
            DSLEdge(source="data", target="train"),
            DSLEdge(source="train", target="evaluate"),
        ],
        metadata={"experiment_id": experiment_id, "algorithm": algorithm},
        created_at=now,
        updated_at=now,
    )


def build_deployment_dsl(
    deployment_id: str,
    name: str,
    model_id: str,
    strategy: str = "BLUE_GREEN",
    endpoint_config: Optional[Dict[str, Any]] = None,
) -> DSLDocument:
    """Generate a Deployment DSL document."""
    now = datetime.now(timezone.utc)
    return DSLDocument(
        dsl_type="deployment",
        dsl_id=deployment_id,
        name=name,
        nodes=[
            DSLNode(node_id="model", node_type="model", label="Model",
                    config={"model_id": model_id}),
            DSLNode(node_id="strategy", node_type="strategy", label="Deployment Strategy",
                    config={"strategy": strategy}),
            DSLNode(node_id="endpoint", node_type="endpoint", label="Endpoint",
                    config=endpoint_config or {}),
        ],
        edges=[
            DSLEdge(source="model", target="strategy"),
            DSLEdge(source="strategy", target="endpoint"),
        ],
        metadata={"deployment_id": deployment_id, "model_id": model_id, "strategy": strategy},
        created_at=now,
        updated_at=now,
    )


def build_monitoring_dsl(
    monitor_id: str,
    name: str,
    deployment_id: str,
    checks: Optional[List[str]] = None,
) -> DSLDocument:
    """Generate a Monitoring DSL document."""
    now = datetime.now(timezone.utc)
    check_nodes = [
        DSLNode(node_id=f"check_{c}", node_type="check", label=c.replace("_", " ").title(), config={})
        for c in (checks or ["data_drift", "performance", "system"])
    ]
    return DSLDocument(
        dsl_type="monitoring",
        dsl_id=monitor_id,
        name=name,
        nodes=[
            DSLNode(node_id="deployment", node_type="deployment", label="Deployment",
                    config={"deployment_id": deployment_id}),
            *check_nodes,
            DSLNode(node_id="alerts", node_type="alerts", label="Alert Rules", config={}),
        ],
        edges=[
            *[DSLEdge(source="deployment", target=n.node_id) for n in check_nodes],
            *[DSLEdge(source=n.node_id, target="alerts") for n in check_nodes],
        ],
        metadata={"monitor_id": monitor_id, "deployment_id": deployment_id},
        created_at=now,
        updated_at=now,
    )


def build_workspace_dsl(
    workspace_id: str,
    name: str,
    members: Optional[List[str]] = None,
    settings: Optional[Dict[str, Any]] = None,
) -> DSLDocument:
    """Generate a Workspace DSL document."""
    now = datetime.now(timezone.utc)
    return DSLDocument(
        dsl_type="workspace",
        dsl_id=workspace_id,
        name=name,
        nodes=[
            DSLNode(node_id="workspace", node_type="workspace", label="Workspace",
                    config={"workspace_id": workspace_id, "settings": settings or {}}),
            DSLNode(node_id="members", node_type="members", label="Members",
                    config={"member_ids": members or []}),
        ],
        edges=[DSLEdge(source="workspace", target="members")],
        metadata={"workspace_id": workspace_id},
        created_at=now,
        updated_at=now,
    )


# ── Export ─────────────────────────────────────────────────────────────────────

def export_dsl_yaml(doc: DSLDocument) -> str:
    """Export DSL document as YAML string."""
    if _HAS_YAML:
        return _yaml.dump(doc.model_dump(mode="json"), default_flow_style=False, sort_keys=False)
    # Fallback: JSON with YAML-like comment header
    return f"# DSL Export (yaml module not installed; outputting JSON)\n{export_dsl_json(doc)}"


def export_dsl_json(doc: DSLDocument) -> str:
    """Export DSL document as formatted JSON string."""
    return doc.model_dump_json(indent=2)


# ── Validation ─────────────────────────────────────────────────────────────────

def validate_dsl(doc: DSLDocument) -> DSLValidationResult:
    """Validate DSL document structure."""
    errors: List[str] = []
    warnings: List[str] = []
    node_ids = {n.node_id for n in doc.nodes}

    for edge in doc.edges:
        if edge.source not in node_ids:
            errors.append(f"Edge source '{edge.source}' references unknown node.")
        if edge.target not in node_ids:
            errors.append(f"Edge target '{edge.target}' references unknown node.")

    if not doc.nodes:
        warnings.append("DSL document has no nodes.")
    if not doc.name:
        errors.append("DSL document must have a name.")

    return DSLValidationResult(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
    )


# ── Import ─────────────────────────────────────────────────────────────────────

def import_dsl_json(content: str) -> DSLDocument:
    """Parse a JSON-encoded DSL document."""
    try:
        return DSLDocument.model_validate_json(content)
    except Exception as e:
        raise ValueError(f"Invalid DSL JSON: {e}")


def import_dsl_yaml(content: str) -> DSLDocument:
    """Parse a YAML-encoded DSL document."""
    if not _HAS_YAML:
        raise ImportError("PyYAML is not installed. Install it to use YAML import.")
    try:
        data = _yaml.safe_load(content)
        return DSLDocument.model_validate(data)
    except Exception as e:
        raise ValueError(f"Invalid DSL YAML: {e}")
