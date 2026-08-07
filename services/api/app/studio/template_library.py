"""Template Library — Pre-built DSL templates for rapid scaffolding (V7B Part 2)."""

from __future__ import annotations

from typing import Dict, List
from datetime import datetime, timezone
from app.schemas.studio import DSLDocument, DSLEdge, DSLNode, DSLTemplate


def _now() -> datetime:
    return datetime.now(timezone.utc)


_TEMPLATES: Dict[str, DSLTemplate] = {
    "binary_classification": DSLTemplate(
        template_id="tpl-binary-classification",
        name="Binary Classification Pipeline",
        description="End-to-end binary classification workflow: CSV → profile → train RandomForest → evaluate → deploy",
        dsl_type="pipeline",
        tags=["classification", "random_forest", "beginner"],
        document=DSLDocument(
            dsl_type="pipeline",
            dsl_id="tpl-binary-classification",
            name="Binary Classification Pipeline",
            nodes=[
                DSLNode(node_id="source", node_type="source", label="CSV Source", config={"format": "csv"}),
                DSLNode(node_id="impute", node_type="preprocess", label="Impute Missing", config={"strategy": "median"}),
                DSLNode(node_id="encode", node_type="preprocess", label="Encode Categoricals", config={"method": "onehot"}),
                DSLNode(node_id="scale", node_type="preprocess", label="Standard Scale", config={}),
                DSLNode(node_id="train", node_type="train", label="Random Forest", config={"algorithm": "random_forest", "n_estimators": 100}),
                DSLNode(node_id="evaluate", node_type="evaluate", label="Evaluate", config={"metrics": ["accuracy", "f1", "roc_auc"]}),
            ],
            edges=[
                DSLEdge(source="source", target="impute"),
                DSLEdge(source="impute", target="encode"),
                DSLEdge(source="encode", target="scale"),
                DSLEdge(source="scale", target="train"),
                DSLEdge(source="train", target="evaluate"),
            ],
            metadata={"template": True},
            created_at=_now(),
            updated_at=_now(),
        ),
    ),
    "regression_pipeline": DSLTemplate(
        template_id="tpl-regression",
        name="Regression Pipeline",
        description="Numeric prediction workflow with gradient boosting",
        dsl_type="pipeline",
        tags=["regression", "gradient_boosting", "intermediate"],
        document=DSLDocument(
            dsl_type="pipeline",
            dsl_id="tpl-regression",
            name="Regression Pipeline",
            nodes=[
                DSLNode(node_id="source", node_type="source", label="Data Source", config={"format": "csv"}),
                DSLNode(node_id="feature_eng", node_type="preprocess", label="Feature Engineering", config={}),
                DSLNode(node_id="train", node_type="train", label="Gradient Boosting", config={"algorithm": "gradient_boosting"}),
                DSLNode(node_id="evaluate", node_type="evaluate", label="Evaluate", config={"metrics": ["rmse", "mae", "r2"]}),
            ],
            edges=[
                DSLEdge(source="source", target="feature_eng"),
                DSLEdge(source="feature_eng", target="train"),
                DSLEdge(source="train", target="evaluate"),
            ],
            metadata={"template": True},
            created_at=_now(),
            updated_at=_now(),
        ),
    ),
    "blue_green_deployment": DSLTemplate(
        template_id="tpl-blue-green",
        name="Blue/Green Deployment",
        description="Zero-downtime Blue/Green deployment strategy for model serving",
        dsl_type="deployment",
        tags=["deployment", "blue_green", "enterprise"],
        document=DSLDocument(
            dsl_type="deployment",
            dsl_id="tpl-blue-green",
            name="Blue/Green Deployment",
            nodes=[
                DSLNode(node_id="model", node_type="model", label="Model", config={}),
                DSLNode(node_id="strategy", node_type="strategy", label="Blue/Green Strategy", config={"strategy": "BLUE_GREEN"}),
                DSLNode(node_id="endpoint", node_type="endpoint", label="Endpoint", config={"protocol": "HTTP", "auth": "API_KEY"}),
                DSLNode(node_id="monitor", node_type="monitoring", label="Post-deploy Monitoring", config={"enabled_checks": ["performance", "data_drift"]}),
            ],
            edges=[
                DSLEdge(source="model", target="strategy"),
                DSLEdge(source="strategy", target="endpoint"),
                DSLEdge(source="endpoint", target="monitor"),
            ],
            metadata={"template": True},
            created_at=_now(),
            updated_at=_now(),
        ),
    ),
    "canary_deployment": DSLTemplate(
        template_id="tpl-canary",
        name="Canary Deployment",
        description="Gradual traffic rollout: 10% → 25% → 50% → 100%",
        dsl_type="deployment",
        tags=["deployment", "canary", "enterprise"],
        document=DSLDocument(
            dsl_type="deployment",
            dsl_id="tpl-canary",
            name="Canary Deployment",
            nodes=[
                DSLNode(node_id="model", node_type="model", label="Champion Model", config={}),
                DSLNode(node_id="canary", node_type="strategy", label="Canary Strategy", config={"strategy": "CANARY", "stages": [10, 25, 50, 100]}),
                DSLNode(node_id="endpoint", node_type="endpoint", label="Endpoint", config={}),
            ],
            edges=[
                DSLEdge(source="model", target="canary"),
                DSLEdge(source="canary", target="endpoint"),
            ],
            metadata={"template": True},
            created_at=_now(),
            updated_at=_now(),
        ),
    ),
    "ml_monitoring": DSLTemplate(
        template_id="tpl-monitoring",
        name="Full Monitoring Suite",
        description="Data drift + performance + system monitoring with alerting",
        dsl_type="monitoring",
        tags=["monitoring", "drift", "alerts", "enterprise"],
        document=DSLDocument(
            dsl_type="monitoring",
            dsl_id="tpl-monitoring",
            name="Full Monitoring Suite",
            nodes=[
                DSLNode(node_id="deployment", node_type="deployment", label="Deployment", config={}),
                DSLNode(node_id="drift", node_type="check", label="Data Drift", config={"threshold": 0.1}),
                DSLNode(node_id="perf", node_type="check", label="Performance", config={"metric": "accuracy", "threshold": 0.85}),
                DSLNode(node_id="system", node_type="check", label="System Health", config={"latency_p99_ms": 500}),
                DSLNode(node_id="alerts", node_type="alerts", label="Alerts", config={"channels": ["email", "slack"]}),
            ],
            edges=[
                DSLEdge(source="deployment", target="drift"),
                DSLEdge(source="deployment", target="perf"),
                DSLEdge(source="deployment", target="system"),
                DSLEdge(source="drift", target="alerts"),
                DSLEdge(source="perf", target="alerts"),
                DSLEdge(source="system", target="alerts"),
            ],
            metadata={"template": True},
            created_at=_now(),
            updated_at=_now(),
        ),
    ),
}


def list_templates(dsl_type: str = None, tags: List[str] = None) -> List[DSLTemplate]:
    """Return available templates, optionally filtered by type or tags."""
    templates = list(_TEMPLATES.values())
    if dsl_type:
        templates = [t for t in templates if t.dsl_type == dsl_type]
    if tags:
        templates = [t for t in templates if any(tag in t.tags for tag in tags)]
    return templates


def get_template(template_id: str) -> DSLTemplate:
    """Return a specific template by ID."""
    for t in _TEMPLATES.values():
        if t.template_id == template_id:
            return t
    raise KeyError(f"Template '{template_id}' not found.")
