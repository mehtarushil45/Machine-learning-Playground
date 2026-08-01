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
