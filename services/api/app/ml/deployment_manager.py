"""1-Click Deployment Studio & Embeddable Web Widget Engine — Phase 5.

Manages live model deployment endpoints, API key authentication, rate limits, request counters,
and generates cURL, Python, JavaScript SDK snippets & HTML/JS embeddable web widgets.
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import time
import uuid
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional

from app.ml.inference_engine import load_model, predict
from app.schemas.deployment import (
    DeploymentCreate,
    DeploymentPredictResponse,
    DeploymentResponse,
    IntegrationSnippets,
)

logger = logging.getLogger("apex_ml.deployment_manager")

_DEPLOYMENTS_ROOT = os.path.abspath(os.path.join(".", "uploads", "deployments"))
_INDEX_PATH = os.path.join(_DEPLOYMENTS_ROOT, "index.json")

_DEPLOYMENTS_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_LOCK = Lock()


def _ensure_dir() -> None:
    os.makedirs(_DEPLOYMENTS_ROOT, exist_ok=True)


def _load_index() -> None:
    global _DEPLOYMENTS_CACHE
    _ensure_dir()
    if os.path.exists(_INDEX_PATH):
        try:
            with open(_INDEX_PATH, "r", encoding="utf-8") as fh:
                _DEPLOYMENTS_CACHE = json.load(fh)
        except Exception as exc:
            logger.error("Failed to load deployments index: %s", exc)
            _DEPLOYMENTS_CACHE = {}


def _save_index() -> None:
    _ensure_dir()
    tmp_path = _INDEX_PATH + ".tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as fh:
            json.dump(_DEPLOYMENTS_CACHE, fh, indent=2, default=str)
        os.replace(tmp_path, _INDEX_PATH)
    except Exception as exc:
        logger.error("Failed to save deployments index: %s", exc)


# Initialize cache on module import
_load_index()


def create_deployment(payload: DeploymentCreate, base_url: str = "http://localhost:8000") -> DeploymentResponse:
    """Create a 1-click model deployment endpoint with API key and rate limits."""
    # Verify model exists & is loadable
    container = load_model(model_id=payload.model_id)

    dep_id = f"dep-{uuid.uuid4().hex[:10]}"
    api_key = f"ak_live_{secrets.token_hex(16)}"
    endpoint_url = f"{base_url.rstrip('/')}/api/v1/deployments/{dep_id}/predict"

    dep_dict = {
        "deployment_id": dep_id,
        "model_id": container.model_id,
        "deployment_name": payload.deployment_name,
        "api_key": api_key,
        "endpoint_url": endpoint_url,
        "status": "ACTIVE",
        "rate_limit_rpm": payload.rate_limit_rpm,
        "allowed_origins": payload.allowed_origins,
        "require_api_key": payload.require_api_key,
        "total_requests": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    with _CACHE_LOCK:
        _DEPLOYMENTS_CACHE[dep_id] = dep_dict
        _save_index()

    logger.info("Created deployment %s for model %s.", dep_id, payload.model_id)
    return DeploymentResponse(**dep_dict)


def get_deployment(deployment_id: str) -> Optional[DeploymentResponse]:
    """Retrieve deployment details by ID."""
    with _CACHE_LOCK:
        d = _DEPLOYMENTS_CACHE.get(deployment_id)
        return DeploymentResponse(**d) if d else None


def list_deployments() -> List[DeploymentResponse]:
    """List all registered deployments."""
    with _CACHE_LOCK:
        return [DeploymentResponse(**d) for d in _DEPLOYMENTS_CACHE.values()]


def predict_deployed_model(
    deployment_id: str,
    features: Dict[str, Any],
    provided_api_key: Optional[str] = None,
) -> DeploymentPredictResponse:
    """Execute prediction against a deployed model endpoint with authentication guard."""
    with _CACHE_LOCK:
        dep = _DEPLOYMENTS_CACHE.get(deployment_id)
        if not dep:
            raise KeyError(f"Deployment '{deployment_id}' not found.")

        if dep.get("status") != "ACTIVE":
            raise ValueError(f"Deployment '{deployment_id}' is currently {dep.get('status')}.")

        if dep.get("require_api_key"):
            if not provided_api_key or provided_api_key != dep.get("api_key"):
                raise PermissionError("Invalid or missing X-API-Key header authentication.")

        dep["total_requests"] = int(dep.get("total_requests", 0)) + 1
        _save_index()

        model_id = dep["model_id"]

    start_t = time.perf_counter()
    pred_res = predict(data=features, model_id=model_id)
    latency_ms = round((time.perf_counter() - start_t) * 1000.0, 2)

    return DeploymentPredictResponse(
        prediction=pred_res.get("prediction"),
        confidence=pred_res.get("confidence"),
        probabilities=pred_res.get("probabilities"),
        latency_ms=latency_ms,
        deployment_id=deployment_id,
    )


def update_deployment_status(deployment_id: str, new_status: str) -> DeploymentResponse:
    """Update deployment status ('ACTIVE', 'PAUSED', 'REVOKED')."""
    valid_statuses = {"ACTIVE", "PAUSED", "REVOKED"}
    if new_status.upper() not in valid_statuses:
        raise ValueError(f"Invalid status '{new_status}'. Must be one of {valid_statuses}.")

    with _CACHE_LOCK:
        if deployment_id not in _DEPLOYMENTS_CACHE:
            raise KeyError(f"Deployment '{deployment_id}' not found.")
        _DEPLOYMENTS_CACHE[deployment_id]["status"] = new_status.upper()
        _save_index()
        return DeploymentResponse(**_DEPLOYMENTS_CACHE[deployment_id])


def generate_integration_snippets(deployment_id: str, base_url: str = "http://localhost:8000") -> IntegrationSnippets:
    """Generate cURL, Python, JS, and HTML/JS embeddable widget code for a deployment."""
    dep = get_deployment(deployment_id)
    if not dep:
        raise KeyError(f"Deployment '{deployment_id}' not found.")

    endpoint_url = f"{base_url.rstrip('/')}/api/v1/deployments/{deployment_id}/predict"
    api_key = dep.api_key

    # cURL snippet
    curl_snippet = f"""curl -X POST "{endpoint_url}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: {api_key}" \\
  -d '{{\"features\": {{\"feature_1\": 10, \"feature_2\": 20}}}}'"""

    # Python SDK snippet
    python_snippet = f"""import requests

url = "{endpoint_url}"
headers = {{
    "Content-Type": "application/json",
    "X-API-Key": "{api_key}"
}}
payload = {{
    "features": {{
        "feature_1": 10,
        "feature_2": 20
    }}
}}

response = requests.post(url, json=payload, headers=headers)
print("Prediction:", response.json())"""

    # JavaScript fetch snippet
    javascript_snippet = f"""async function predictModel(featureData) {{
  const response = await fetch("{endpoint_url}", {{
    method: "POST",
    headers: {{
      "Content-Type": "application/json",
      "X-API-Key": "{api_key}"
    }},
    body: JSON.stringify({{ features: featureData }})
  }});
  const result = await response.json();
  console.log("Prediction Result:", result);
  return result;
}}"""

    # Embeddable HTML/JS Widget snippet
    embeddable_widget_html = f"""<!-- MLPlayground Embeddable Prediction Widget -->
<div id="ml-prediction-widget" style="font-family: sans-serif; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; max-width: 400px;">
  <h3 style="margin-top:0; color: #1e293b;">{dep.deployment_name}</h3>
  <form id="ml-widget-form">
    <div id="widget-inputs-container"></div>
    <button type="submit" style="background:#2563eb; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; width:100%; margin-top:12px;">Predict</button>
  </form>
  <div id="widget-result" style="margin-top:12px; font-weight:bold; color:#0f172a;"></div>
</div>

<script>
document.getElementById('ml-widget-form').addEventListener('submit', async (e) => {{
  e.preventDefault();
  const resDiv = document.getElementById('widget-result');
  resDiv.innerText = 'Predicting...';
  try {{
    const response = await fetch('{endpoint_url}', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json', 'X-API-Key': '{api_key}' }},
      body: JSON.stringify({{ features: {{}} }})
    }});
    const data = await response.json();
    resDiv.innerText = 'Prediction: ' + data.prediction + ' (Confidence: ' + (data.confidence || 'N/A') + ')';
  }} catch (err) {{
    resDiv.innerText = 'Error: ' + err.message;
  }}
}});
</script>"""

    return IntegrationSnippets(
        curl_snippet=curl_snippet,
        python_snippet=python_snippet,
        javascript_snippet=javascript_snippet,
        embeddable_widget_html=embeddable_widget_html,
    )


# ===========================================================================
# V6A: Enterprise Deployment Orchestration
#
# All functions below are new additions for Version 6A.
# No existing Phase 5 function above is modified.
#
# V6A is the canonical deployment system going forward.
# Phase 5 functions above are retained as a backward-compatibility layer.
# After V6A verification is complete, Phase 5 routes will be soft-deprecated
# and V6A routes promoted as the primary deployment API.
# ===========================================================================

import uuid as _uuid_mod  # local re-alias to avoid shadowing the module-level import

from app.ml.deployment_registry import (
    register_v6a_deployment,
    update_deployment_state,
    get_v6a_deployment,
    list_v6a_deployments,
    list_active_v6a,
    get_state_history,
)
from app.ml.deployment_state_machine import (
    validate_transition,
    make_deployment_event,
    event_type_for_state,
    evaluate_deployment_policy,
    check_governance_state_deployable,
    POLICY_BLOCK,
    POLICY_WARN,
    POLICY_ALLOW,
)
from app.ml.deployment_strategies import (
    build_strategy_config,
    validate_strategy_config,
    get_rollback_target,
    get_strategy_summary,
    advance_canary,
    STRATEGY_NAMES,
)
from app.ml.endpoint_manager import (
    register_endpoint,
    update_endpoint_status,
    get_endpoint,
    get_endpoint_by_deployment,
    list_endpoints as list_ep,
    deprecate_endpoint,
)

_v6a_logger = logging.getLogger("apex_ml.deployment_manager.v6a")

# ---------------------------------------------------------------------------
# V6A: Deployment metadata schema
# ---------------------------------------------------------------------------
# Every V6A deployment stores the following fields:
#
# deployment_id         str   "v6a-<hex>"
# deployment_name       str   human-readable label
# deployment_version    str   "v1.0.0"
# model_id              str   from model registry
# model_version         str   from model metadata
# model_family          str   family_key (algorithm@dataset_id)
# deployment_strategy   str   BLUE_GREEN | CANARY | ROLLING
# deployment_state      str   current lifecycle state
# deployment_timestamp  str   ISO-8601 when ACTIVE was first reached
# created_by            str   user or "system"
# endpoint_id           str   registered endpoint
# endpoint_name         str   endpoint display name
# endpoint_version      str   "v1.0.0"
# deployment_configuration dict  strategy-specific config
# policy_result         dict  DeploymentPolicy evaluation result
# created_at            str   ISO-8601
# updated_at            str   ISO-8601
# ---------------------------------------------------------------------------


def _resolve_model_meta(model_id: str) -> dict:
    """Load model metadata from registry; raise ValueError if not found."""
    try:
        from app.ml.model_registry import get_model_by_id  # noqa: PLC0415
        meta = get_model_by_id(model_id)
    except Exception as exc:
        raise ValueError(f"Failed to access model registry: {exc}") from exc
    if meta is None:
        raise ValueError(f"Model '{model_id}' not found in registry.")
    return meta


def _resolve_governance(model_id: str) -> dict:
    """Load governance record; raise ValueError if not found."""
    try:
        from app.ml.model_governance import get_governance  # noqa: PLC0415
        gov = get_governance(model_id)
    except Exception as exc:
        raise ValueError(f"Failed to access model governance: {exc}") from exc
    if gov is None:
        raise ValueError(
            f"No governance record found for model '{model_id}'. "
            "The model must have a V5B governance record before deployment."
        )
    return gov


# ---------------------------------------------------------------------------
# V6A Core Orchestration
# ---------------------------------------------------------------------------

def create_v6a_deployment(
    model_id: str,
    deployment_name: str,
    deployment_strategy: str,
    created_by: str = "system",
    admin_override: bool = False,
    endpoint_name: Optional[str] = None,
    endpoint_route: Optional[str] = None,
    endpoint_protocol: str = "HTTP",
    endpoint_auth: str = "API_KEY",
    deployment_version: str = "v1.0.0",
    strategy_kwargs: Optional[Dict[str, Any]] = None,
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Create a V6A enterprise deployment record.

    Steps
    -----
    1. Resolve model metadata from registry.
    2. Resolve V5B governance record.
    3. Check governance state is CANDIDATE, STAGING, or PRODUCTION.
    4. Evaluate Deployment Policy (ALLOW / ALLOW_WITH_WARNING / BLOCK).
    5. Build strategy configuration.
    6. Persist deployment record (state = CREATED).
    7. Register endpoint metadata.
    8. Return full deployment record.

    Args:
        model_id:             Model ID from the V5A/V5B registry.
        deployment_name:      Human-readable deployment name.
        deployment_strategy:  One of BLUE_GREEN, CANARY, ROLLING.
        created_by:           Actor creating the deployment.
        admin_override:       If True, governance admin overrides a BLOCK policy.
        endpoint_name:        Optional endpoint display name (defaults to deployment_name).
        endpoint_route:       Optional custom route (defaults to /api/v1/predict/<dep_id>).
        endpoint_protocol:    HTTP | HTTPS | GRPC  (default HTTP).
        endpoint_auth:        NONE | API_KEY | JWT | MTLS  (default API_KEY).
        deployment_version:   Semantic version string  (default v1.0.0).
        strategy_kwargs:      Optional strategy-specific configuration overrides.
        tags:                 Optional tag list for the endpoint.

    Returns:
        Full V6A deployment record dict.

    Raises:
        ValueError: On invalid strategy, non-deployable governance state,
                    or BLOCK policy without admin override.
    """
    strategy = deployment_strategy.strip().upper()
    if strategy not in STRATEGY_NAMES:
        raise ValueError(
            f"Unknown deployment strategy '{deployment_strategy}'. "
            f"Valid: {sorted(STRATEGY_NAMES)}"
        )

    now = datetime.now(timezone.utc).isoformat()

    # ── Step 1: Resolve model ─────────────────────────────────────────────
    model_meta = _resolve_model_meta(model_id)

    # ── Step 2: Resolve governance ────────────────────────────────────────
    gov = _resolve_governance(model_id)
    gov_state: str = gov.get("current_state", "UNKNOWN")

    # ── Step 3: Governance state gate ─────────────────────────────────────
    if not check_governance_state_deployable(gov_state):
        raise ValueError(
            f"Model '{model_id}' has governance state '{gov_state}'. "
            "Only CANDIDATE, STAGING, or PRODUCTION models may be deployed. "
            "Advance the model through the governance lifecycle first."
        )

    # ── Step 4: Deployment Policy evaluation ──────────────────────────────
    readiness_report: Dict[str, Any] = gov.get("readiness_report") or {}
    readiness_score: Optional[float] = readiness_report.get("readiness_score")

    policy_result = evaluate_deployment_policy(readiness_score, admin_override=admin_override)

    if policy_result["policy"] == POLICY_BLOCK:
        raise ValueError(
            f"Deployment blocked by policy. "
            f"Readiness score: {readiness_score}. "
            f"Reason: {policy_result['message']} "
            "A governance administrator may retry with admin_override=True."
        )

    if policy_result["policy"] == POLICY_WARN:
        _v6a_logger.warning(
            "Deployment '%s' proceeding with ALLOW_WITH_WARNING. "
            "readiness_score=%s. model_id=%s",
            deployment_name, readiness_score, model_id,
        )

    # ── Step 5: Build strategy config ─────────────────────────────────────
    kwargs = strategy_kwargs or {}
    dep_config = build_strategy_config(strategy, model_id, **kwargs)

    # ── Step 6: Build deployment record ───────────────────────────────────
    dep_id = f"v6a-{_uuid_mod.uuid4().hex[:12]}"

    # Attempt to read lineage / version for enrichment (non-blocking)
    model_version = model_meta.get("version") or model_meta.get("semantic_version") or "unknown"
    model_family  = model_meta.get("model_family") or ""

    _ep_name    = endpoint_name or deployment_name
    _ep_route   = endpoint_route or f"/api/v1/predict/{dep_id}"
    ep_version  = "v1.0.0"

    initial_event = make_deployment_event(
        event_type="CREATED",
        previous_state=None,
        new_state="CREATED",
        performed_by=created_by,
        reason="V6A deployment created.",
    )

    record: Dict[str, Any] = {
        "deployment_id":            dep_id,
        "deployment_name":          deployment_name,
        "deployment_version":       deployment_version,
        "model_id":                 model_id,
        "model_version":            model_version,
        "model_family":             model_family,
        "deployment_strategy":      strategy,
        "deployment_state":         "CREATED",
        "deployment_timestamp":     None,   # set when ACTIVE is first reached
        "created_by":               created_by,
        "endpoint_id":              None,   # set after endpoint is registered
        "endpoint_name":            _ep_name,
        "endpoint_version":         ep_version,
        "deployment_configuration": dep_config,
        "policy_result":            policy_result,
        "governance_state_at_create": gov_state,
        "readiness_score_at_create": readiness_score,
        "created_at":               now,
        "updated_at":               now,
        # consumed by registry; not stored in metadata.json
        "initial_event":            initial_event,
    }

    # ── Step 7: Persist to registry ───────────────────────────────────────
    register_v6a_deployment(record)

    # ── Step 8: Register endpoint metadata ────────────────────────────────
    ep_record = {
        "endpoint_name":    _ep_name,
        "endpoint_version": ep_version,
        "deployment_id":    dep_id,
        "model_id":         model_id,
        "model_family":     model_family,
        "route":            _ep_route,
        "protocol":         endpoint_protocol.upper(),
        "authentication":   endpoint_auth.upper(),
        "status":           "PENDING",
        "created_by":       created_by,
        "tags":             tags or [],
        "description":      f"Endpoint for V6A deployment {dep_id}.",
    }
    ep_id = register_endpoint(ep_record)

    # Link endpoint back to deployment record
    update_deployment_state(
        dep_id,
        new_state="CREATED",
        event={
            **initial_event,
            "reason": f"Endpoint {ep_id} registered.",
        },
    )
    # Patch endpoint_id into stored metadata directly
    import app.ml.deployment_registry as _dreg  # noqa: PLC0415
    meta_path = os.path.join(
        _dreg._V6A_ROOT, dep_id, "metadata.json"
    )
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as _fh:
                _stored = json.load(_fh)
            _stored["endpoint_id"] = ep_id
            _tmp = meta_path + ".tmp"
            with open(_tmp, "w", encoding="utf-8") as _fh:
                json.dump(_stored, _fh, indent=2, default=str)
            os.replace(_tmp, meta_path)
        except Exception as _exc:
            _v6a_logger.warning("Could not patch endpoint_id: %s", _exc)

    _v6a_logger.info(
        "V6A deployment created: dep_id=%s model_id=%s strategy=%s policy=%s",
        dep_id, model_id, strategy, policy_result["policy"],
    )

    result = get_v6a_deployment(dep_id) or record
    result["endpoint_id"] = ep_id
    return result


def validate_v6a_deployment(
    deployment_id: str,
    performed_by: str = "system",
) -> Dict[str, Any]:
    """Trigger pre-flight validation for a V6A deployment.

    Transitions: CREATED → VALIDATING → DEPLOYING

    Pre-flight checks:
    - Governance record accessible.
    - Governance state is CANDIDATE / STAGING / PRODUCTION.
    - Model binary path is present in metadata (non-empty string).

    Args:
        deployment_id: V6A deployment ID.
        performed_by:  Actor triggering validation.

    Returns:
        Updated deployment record (state = DEPLOYING on success).

    Raises:
        KeyError:   Deployment not found.
        ValueError: Invalid transition or pre-flight failure.
    """
    record = get_v6a_deployment(deployment_id)
    if record is None:
        raise KeyError(f"V6A deployment '{deployment_id}' not found.")

    current = record["deployment_state"]

    # CREATED → VALIDATING
    validate_transition(current, "VALIDATING")
    ev1 = make_deployment_event("VALIDATING", current, "VALIDATING", performed_by)
    update_deployment_state(deployment_id, "VALIDATING", ev1)

    try:
        # Pre-flight: governance state check
        model_id = record["model_id"]
        gov = _resolve_governance(model_id)
        gov_state = gov.get("current_state", "UNKNOWN")
        if not check_governance_state_deployable(gov_state):
            raise ValueError(
                f"Model governance state '{gov_state}' is no longer deployable. "
                "Expected CANDIDATE, STAGING, or PRODUCTION."
            )

        # Pre-flight: model binary path present
        model_meta = _resolve_model_meta(model_id)
        if not model_meta.get("model_path"):
            raise ValueError(
                f"Model '{model_id}' has no model_path in registry. "
                "Ensure training completed and the artifact was saved."
            )

    except Exception as exc:
        # Validation failed → FAILED
        ev_fail = make_deployment_event(
            "FAILED", "VALIDATING", "FAILED", performed_by,
            reason=f"Pre-flight failed: {exc}",
        )
        update_deployment_state(deployment_id, "FAILED", ev_fail)
        raise ValueError(f"Validation failed for deployment '{deployment_id}': {exc}") from exc

    # VALIDATING → DEPLOYING
    validate_transition("VALIDATING", "DEPLOYING")
    ev2 = make_deployment_event("DEPLOYING", "VALIDATING", "DEPLOYING", performed_by,
                                reason="Pre-flight checks passed.")
    update_deployment_state(deployment_id, "DEPLOYING", ev2)

    return get_v6a_deployment(deployment_id)


def deploy_v6a(
    deployment_id: str,
    performed_by: str = "system",
) -> Dict[str, Any]:
    """Promote a V6A deployment to ACTIVE.

    Transitions: DEPLOYING → ACTIVE

    Post-activation:
    - Model governance state is advanced to PRODUCTION (if not already).
    - Champion pointer is updated via model_version_manager.
    - Endpoint status → ACTIVE.
    - deployment_timestamp is set.

    All V5B calls are non-blocking (try/except).

    Args:
        deployment_id: V6A deployment ID.
        performed_by:  Actor triggering deployment.

    Returns:
        Updated deployment record (state = ACTIVE).

    Raises:
        KeyError:   Deployment not found.
        ValueError: Invalid transition.
    """
    record = get_v6a_deployment(deployment_id)
    if record is None:
        raise KeyError(f"V6A deployment '{deployment_id}' not found.")

    current = record["deployment_state"]
    validate_transition(current, "ACTIVE")

    now = datetime.now(timezone.utc).isoformat()

    ev = make_deployment_event("ACTIVATED", current, "ACTIVE", performed_by,
                               reason="Deployment activated.")
    record_out = update_deployment_state(deployment_id, "ACTIVE", ev)

    # Stamp deployment_timestamp
    try:
        import app.ml.deployment_registry as _dreg  # noqa: PLC0415
        meta_path = os.path.join(_dreg._V6A_ROOT, deployment_id, "metadata.json")
        if os.path.exists(meta_path):
            with open(meta_path, "r", encoding="utf-8") as _fh:
                _m = json.load(_fh)
            _m["deployment_timestamp"] = now
            _tmp = meta_path + ".tmp"
            with open(_tmp, "w", encoding="utf-8") as _fh:
                json.dump(_m, _fh, indent=2, default=str)
            os.replace(_tmp, meta_path)
    except Exception as _exc:
        _v6a_logger.warning("Could not stamp deployment_timestamp: %s", _exc)

    model_id    = record["model_id"]
    model_family = record.get("model_family", "")

    # ── V5B: Advance governance to PRODUCTION (non-blocking) ─────────────
    try:
        from app.ml.model_governance import get_governance, transition_state  # noqa: PLC0415
        _gov = get_governance(model_id)
        if _gov and _gov.get("current_state") not in {"PRODUCTION"}:
            transition_state(model_id, "PRODUCTION", performed_by,
                             reason=f"Promoted by V6A deployment {deployment_id}.")
    except Exception as _exc:
        _v6a_logger.warning(
            "V5B governance transition to PRODUCTION failed (non-blocking): %s", _exc
        )

    # ── V5B: Update champion (non-blocking) ──────────────────────────────
    try:
        from app.ml.model_version_manager import set_champion, get_family_by_key  # noqa: PLC0415
        _fam = get_family_by_key(model_family) if model_family else None
        if _fam:
            set_champion(
                _fam["algorithm"], _fam["dataset_id"],
                model_id, performed_by,
                reason=f"Champion set by V6A deployment {deployment_id}.",
            )
    except Exception as _exc:
        _v6a_logger.warning(
            "V5B set_champion failed (non-blocking): %s", _exc
        )

    # ── Endpoint → ACTIVE (non-blocking) ─────────────────────────────────
    try:
        ep_id = record.get("endpoint_id")
        if ep_id:
            update_endpoint_status(ep_id, "ACTIVE")
    except Exception as _exc:
        _v6a_logger.warning("Endpoint status update failed (non-blocking): %s", _exc)

    _v6a_logger.info("V6A deployment %s → ACTIVE (model=%s).", deployment_id, model_id)
    return get_v6a_deployment(deployment_id) or record_out


def scale_v6a(
    deployment_id: str,
    scaling_config: Optional[Dict[str, Any]] = None,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Trigger a scaling operation: ACTIVE → SCALING → ACTIVE.

    For CANARY strategy, ``scaling_config`` may contain ``advance_stage=True``
    to advance to the next traffic percentage stage.

    For ROLLING strategy, ``scaling_config`` may contain ``batch_updated=N``
    to record that N replicas have been updated.

    Args:
        deployment_id:  V6A deployment ID.
        scaling_config: Optional strategy-specific scaling parameters.
        performed_by:   Actor triggering scaling.
        reason:         Optional reason.

    Returns:
        Updated deployment record (state = ACTIVE).

    Raises:
        KeyError:   Deployment not found.
        ValueError: Invalid transition or strategy error.
    """
    record = get_v6a_deployment(deployment_id)
    if record is None:
        raise KeyError(f"V6A deployment '{deployment_id}' not found.")

    current = record["deployment_state"]
    validate_transition(current, "SCALING")

    ev1 = make_deployment_event("SCALING", current, "SCALING", performed_by, reason)
    update_deployment_state(deployment_id, "SCALING", ev1)

    # Apply strategy-specific logic
    strategy  = record.get("deployment_strategy", "")
    dep_config = record.get("deployment_configuration") or {}
    new_config = dict(dep_config)
    cfg = scaling_config or {}

    try:
        if strategy == "CANARY" and cfg.get("advance_stage"):
            new_config = advance_canary(dep_config)
        elif strategy == "ROLLING" and cfg.get("batch_updated"):
            from app.ml.deployment_strategies import record_rolling_batch  # noqa: PLC0415
            new_config = record_rolling_batch(dep_config, int(cfg["batch_updated"]))
    except Exception as _exc:
        _v6a_logger.warning("Strategy config update during scale failed: %s", _exc)

    # Persist updated strategy config
    _patch_deployment_config(deployment_id, new_config)

    validate_transition("SCALING", "ACTIVE")
    ev2 = make_deployment_event("ACTIVATED", "SCALING", "ACTIVE", performed_by,
                                reason="Scaling complete.")
    update_deployment_state(deployment_id, "ACTIVE", ev2)

    return get_v6a_deployment(deployment_id)


def update_v6a_deployment(
    deployment_id: str,
    new_model_id: str,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Champion model swap: ACTIVE → UPDATING → ACTIVE.

    The deployment is updated to serve the new model. The strategy
    configuration is updated to reflect the new model ID. V5B governance
    is updated (non-blocking).

    Args:
        deployment_id: V6A deployment ID.
        new_model_id:  New model ID (must be in registry with valid governance).
        performed_by:  Actor performing the update.
        reason:        Optional reason.

    Returns:
        Updated deployment record (state = ACTIVE).

    Raises:
        KeyError:   Deployment not found.
        ValueError: Invalid transition or new model not found.
    """
    record = get_v6a_deployment(deployment_id)
    if record is None:
        raise KeyError(f"V6A deployment '{deployment_id}' not found.")

    # Validate new model
    new_meta = _resolve_model_meta(new_model_id)
    new_gov  = _resolve_governance(new_model_id)
    if not check_governance_state_deployable(new_gov.get("current_state", "")):
        raise ValueError(
            f"New model '{new_model_id}' has governance state "
            f"'{new_gov.get('current_state')}'. Only CANDIDATE, STAGING, "
            "or PRODUCTION models may be deployed."
        )

    current = record["deployment_state"]
    validate_transition(current, "UPDATING")

    ev1 = make_deployment_event("UPDATING", current, "UPDATING", performed_by, reason)
    update_deployment_state(deployment_id, "UPDATING", ev1)

    # Update strategy config with new model
    dep_config = record.get("deployment_configuration") or {}
    new_config = dict(dep_config)
    strategy = record.get("deployment_strategy", "")
    if strategy == "BLUE_GREEN":
        # Swap green slot to new model
        new_config["green_model_id"] = new_model_id
    elif strategy == "CANARY":
        new_config["canary_model_id"] = new_model_id
    elif strategy == "ROLLING":
        new_config["new_model_id"] = new_model_id
    _patch_deployment_config(deployment_id, new_config)

    # ── V5B: non-blocking governance + champion update ────────────────────
    old_model_id = record["model_id"]
    model_family = record.get("model_family", "")

    try:
        from app.ml.model_governance import transition_state as _ts  # noqa: PLC0415
        _gov = new_gov.get("current_state", "")
        if _gov not in {"PRODUCTION"}:
            _ts(new_model_id, "PRODUCTION", performed_by,
                reason=f"Promoted via V6A update on deployment {deployment_id}.")
    except Exception as _exc:
        _v6a_logger.warning("V5B governance advance on update failed: %s", _exc)

    try:
        from app.ml.model_version_manager import set_champion, get_family_by_key  # noqa: PLC0415
        _fam = get_family_by_key(model_family) if model_family else None
        if _fam:
            set_champion(_fam["algorithm"], _fam["dataset_id"],
                         new_model_id, performed_by, reason)
    except Exception as _exc:
        _v6a_logger.warning("V5B set_champion on update failed: %s", _exc)

    # Update deployment record model_id
    _patch_deployment_model(deployment_id, new_model_id, new_meta)

    validate_transition("UPDATING", "ACTIVE")
    ev2 = make_deployment_event("ACTIVATED", "UPDATING", "ACTIVE", performed_by,
                                reason=f"Updated to model {new_model_id}.")
    update_deployment_state(deployment_id, "ACTIVE", ev2)

    _v6a_logger.info(
        "V6A deployment %s updated: %s → %s.", deployment_id, old_model_id, new_model_id
    )
    return get_v6a_deployment(deployment_id)


def rollback_v6a(
    deployment_id: str,
    target_model_id: Optional[str] = None,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Roll back a V6A deployment to a prior model version.

    Transitions: ACTIVE | UPDATING | FAILED → ROLLED_BACK

    Rollback logic is fully delegated to V5B:
    - ``model_governance.rollback_governance(target_model_id)``
    - ``model_governance.deprecate_governance(old_model_id)``
    - ``model_version_manager.record_rollback_event(...)``

    Zero new rollback logic is introduced here.

    If *target_model_id* is not provided, it is resolved from the strategy
    configuration (e.g. rollback_slot for Blue/Green, base for Canary).

    Args:
        deployment_id:   V6A deployment ID.
        target_model_id: Model ID to roll back to (optional — resolved from strategy).
        performed_by:    Actor performing rollback.
        reason:          Optional reason.

    Returns:
        Updated deployment record (state = ROLLED_BACK).

    Raises:
        KeyError:   Deployment not found.
        ValueError: Invalid transition or rollback target not determinable.
    """
    record = get_v6a_deployment(deployment_id)
    if record is None:
        raise KeyError(f"V6A deployment '{deployment_id}' not found.")

    current = record["deployment_state"]
    validate_transition(current, "ROLLED_BACK")

    strategy   = record.get("deployment_strategy", "")
    dep_config = record.get("deployment_configuration") or {}
    old_model  = record["model_id"]

    # Resolve rollback target
    resolved_target = target_model_id
    if not resolved_target:
        resolved_target = get_rollback_target(strategy, dep_config)
    if not resolved_target:
        raise ValueError(
            f"Cannot determine rollback target for deployment '{deployment_id}'. "
            "Provide target_model_id explicitly."
        )

    if resolved_target == old_model:
        raise ValueError(
            f"Rollback target '{resolved_target}' is the same as the current model. "
            "No rollback needed."
        )

    # ── V5B: Delegate rollback (non-blocking) ────────────────────────────
    try:
        from app.ml.model_governance import rollback_governance, deprecate_governance  # noqa: PLC0415
        rollback_governance(resolved_target, performed_by,
                            reason=reason or f"Rolled back by V6A deployment {deployment_id}.")
        deprecate_governance(old_model, performed_by,
                             reason=reason or f"Superseded by rollback on {deployment_id}.")
    except Exception as _exc:
        _v6a_logger.warning("V5B rollback_governance failed (non-blocking): %s", _exc)

    try:
        from app.ml.model_version_manager import record_rollback_event, get_family_by_key  # noqa: PLC0415
        model_family = record.get("model_family", "")
        _fam = get_family_by_key(model_family) if model_family else None
        if _fam:
            record_rollback_event(
                _fam["algorithm"], _fam["dataset_id"],
                from_model_id=old_model,
                to_model_id=resolved_target,
                performed_by=performed_by,
                reason=reason,
            )
    except Exception as _exc:
        _v6a_logger.warning("V5B record_rollback_event failed (non-blocking): %s", _exc)

    # ── Update endpoint → INACTIVE ────────────────────────────────────────
    try:
        ep_id = record.get("endpoint_id")
        if ep_id:
            update_endpoint_status(ep_id, "INACTIVE")
    except Exception as _exc:
        _v6a_logger.warning("Endpoint INACTIVE update failed (non-blocking): %s", _exc)

    ev = make_deployment_event("ROLLED_BACK", current, "ROLLED_BACK", performed_by, reason)
    update_deployment_state(deployment_id, "ROLLED_BACK", ev)

    _v6a_logger.info(
        "V6A deployment %s rolled back: %s → %s.",
        deployment_id, old_model, resolved_target,
    )
    return get_v6a_deployment(deployment_id)


def archive_v6a(
    deployment_id: str,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Archive a V6A deployment (terminal state).

    Transitions: ACTIVE | ROLLED_BACK | FAILED → ARCHIVED

    Args:
        deployment_id: V6A deployment ID.
        performed_by:  Actor archiving the deployment.
        reason:        Optional reason.

    Returns:
        Updated deployment record (state = ARCHIVED).

    Raises:
        KeyError:   Deployment not found.
        ValueError: Invalid transition.
    """
    record = get_v6a_deployment(deployment_id)
    if record is None:
        raise KeyError(f"V6A deployment '{deployment_id}' not found.")

    current = record["deployment_state"]
    validate_transition(current, "ARCHIVED")

    # Deprecate endpoint
    try:
        ep_id = record.get("endpoint_id")
        if ep_id:
            deprecate_endpoint(ep_id)
    except Exception as _exc:
        _v6a_logger.warning("Endpoint deprecation on archive failed: %s", _exc)

    ev = make_deployment_event("ARCHIVED", current, "ARCHIVED", performed_by, reason)
    update_deployment_state(deployment_id, "ARCHIVED", ev)

    _v6a_logger.info("V6A deployment %s archived.", deployment_id)
    return get_v6a_deployment(deployment_id)


def get_v6a_deployment_record(deployment_id: str) -> Optional[Dict[str, Any]]:
    """Return the full V6A deployment record, or None if not found."""
    return get_v6a_deployment(deployment_id)


def list_v6a_deployment_records(
    status: Optional[str] = None,
    strategy: Optional[str] = None,
    model_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """Return V6A deployment summaries with optional filters."""
    return list_v6a_deployments(status=status, strategy=strategy,
                                model_id=model_id, limit=limit, offset=offset)


def list_active_v6a_deployments() -> List[str]:
    """Return list of currently ACTIVE V6A deployment IDs."""
    return list_active_v6a()


def get_v6a_state_history(deployment_id: str) -> List[Dict[str, Any]]:
    """Return the immutable state event log for a V6A deployment."""
    return get_state_history(deployment_id)


def get_v6a_endpoint(deployment_id: str) -> Optional[Dict[str, Any]]:
    """Return the endpoint metadata for a V6A deployment."""
    record = get_v6a_deployment(deployment_id)
    if not record:
        return None
    ep_id = record.get("endpoint_id")
    if ep_id:
        return get_endpoint(ep_id)
    return get_endpoint_by_deployment(deployment_id)


# ---------------------------------------------------------------------------
# V6A: Patch helpers
# ---------------------------------------------------------------------------

def _patch_deployment_config(deployment_id: str, new_config: Dict[str, Any]) -> None:
    """Patch deployment_configuration in metadata.json (non-atomic, best-effort)."""
    try:
        import app.ml.deployment_registry as _dreg  # noqa: PLC0415
        meta_path = os.path.join(_dreg._V6A_ROOT, deployment_id, "metadata.json")
        if not os.path.exists(meta_path):
            return
        with open(meta_path, "r", encoding="utf-8") as _fh:
            _m = json.load(_fh)
        _m["deployment_configuration"] = new_config
        _m["updated_at"] = datetime.now(timezone.utc).isoformat()
        _tmp = meta_path + ".tmp"
        with open(_tmp, "w", encoding="utf-8") as _fh:
            json.dump(_m, _fh, indent=2, default=str)
        os.replace(_tmp, meta_path)
    except Exception as _exc:
        _v6a_logger.warning("_patch_deployment_config failed: %s", _exc)


def _patch_deployment_model(
    deployment_id: str,
    new_model_id: str,
    new_model_meta: Dict[str, Any],
) -> None:
    """Update model_id / model_version in metadata.json after champion swap."""
    try:
        import app.ml.deployment_registry as _dreg  # noqa: PLC0415
        meta_path = os.path.join(_dreg._V6A_ROOT, deployment_id, "metadata.json")
        if not os.path.exists(meta_path):
            return
        with open(meta_path, "r", encoding="utf-8") as _fh:
            _m = json.load(_fh)
        _m["model_id"]      = new_model_id
        _m["model_version"] = (
            new_model_meta.get("version")
            or new_model_meta.get("semantic_version")
            or "unknown"
        )
        _m["updated_at"] = datetime.now(timezone.utc).isoformat()
        _tmp = meta_path + ".tmp"
        with open(_tmp, "w", encoding="utf-8") as _fh:
            json.dump(_m, _fh, indent=2, default=str)
        os.replace(_tmp, meta_path)
    except Exception as _exc:
        _v6a_logger.warning("_patch_deployment_model failed: %s", _exc)

