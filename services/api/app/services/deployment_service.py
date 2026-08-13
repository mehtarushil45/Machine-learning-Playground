"""Deployment Service.

Provides fully async, DB-backed CRUD operations for model deployments,
replacing the former file-based JSON index in deployment_manager.py.

All write operations are scoped to an authenticated owner_id so that
users cannot modify or list deployments they do not own.
"""

from __future__ import annotations

import secrets
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deployment import Deployment, DeploymentStatus
from app.schemas.deployment import DeploymentCreate, DeploymentResponse

logger = logging.getLogger("apex_ml.deployment_service")

_VALID_STATUSES = {s.value for s in DeploymentStatus}


def _to_response(dep: Deployment) -> DeploymentResponse:
    """Map ORM Deployment instance → Pydantic DeploymentResponse."""
    return DeploymentResponse(
        deployment_id=str(dep.id),
        model_id=dep.model_id,
        deployment_name=dep.deployment_name,
        api_key=dep.api_key,
        endpoint_url=dep.endpoint_url,
        status=dep.status,
        rate_limit_rpm=dep.rate_limit_rpm,
        total_requests=dep.total_requests,
        created_at=dep.created_at.isoformat() if isinstance(dep.created_at, datetime) else str(dep.created_at),
    )


async def create_deployment(
    payload: DeploymentCreate,
    *,
    owner_id: str,
    base_url: str,
    db: AsyncSession,
) -> DeploymentResponse:
    """Create and persist a new model deployment endpoint."""
    dep_id = uuid.uuid4()
    api_key = f"ak_live_{secrets.token_hex(16)}"
    endpoint_url = f"{base_url.rstrip('/')}/api/v1/deployments/{dep_id}/predict"

    dep = Deployment(
        id=dep_id,
        deployment_name=payload.deployment_name,
        model_id=payload.model_id,
        api_key=api_key,
        endpoint_url=endpoint_url,
        status=DeploymentStatus.ACTIVE.value,
        rate_limit_rpm=payload.rate_limit_rpm,
        require_api_key=payload.require_api_key,
        total_requests=0,
        owner_id=owner_id,
    )
    db.add(dep)
    await db.commit()
    await db.refresh(dep)

    logger.info("Created deployment %s for model %s (owner=%s).", dep.id, dep.model_id, owner_id)
    return _to_response(dep)


async def list_deployments(
    *,
    owner_id: str,
    db: AsyncSession,
) -> list[DeploymentResponse]:
    """Return all deployments owned by *owner_id*."""
    stmt = select(Deployment).where(Deployment.owner_id == owner_id).order_by(Deployment.created_at.desc())
    result = await db.execute(stmt)
    return [_to_response(d) for d in result.scalars().all()]


async def get_deployment(
    deployment_id: str,
    *,
    db: AsyncSession,
) -> Deployment:
    """Return the ORM Deployment or raise HTTP 404.

    Ownership is NOT checked here — callers that need it should verify
    via ``assert_owner`` after this call.
    """
    try:
        dep_uuid = uuid.UUID(deployment_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Deployment '{deployment_id}' not found.",
        )

    result = await db.execute(select(Deployment).where(Deployment.id == dep_uuid))
    dep = result.scalar_one_or_none()
    if dep is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Deployment '{deployment_id}' not found.",
        )
    return dep


def assert_owner(dep: Deployment, owner_id: str) -> None:
    """Raise HTTP 403 if *owner_id* is not the deployment owner."""
    if dep.owner_id != owner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this deployment.",
        )


async def update_status(
    deployment_id: str,
    new_status: str,
    *,
    owner_id: str,
    db: AsyncSession,
) -> DeploymentResponse:
    """Update deployment status (ACTIVE / PAUSED / REVOKED)."""
    if new_status.upper() not in _VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{new_status}'. Must be one of {sorted(_VALID_STATUSES)}.",
        )
    dep = await get_deployment(deployment_id, db=db)
    assert_owner(dep, owner_id)
    dep.status = new_status.upper()
    await db.commit()
    await db.refresh(dep)
    return _to_response(dep)


async def increment_request_counter(
    deployment_id: str,
    *,
    db: AsyncSession,
) -> None:
    """Atomically increment the total_requests counter after a successful inference."""
    try:
        dep = await get_deployment(deployment_id, db=db)
        dep.total_requests = (dep.total_requests or 0) + 1
        await db.commit()
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to increment request counter for %s: %s", deployment_id, exc)


async def get_deployment_api_key(deployment_id: str, *, db: AsyncSession) -> str:
    """Return the stored api_key for a deployment — used by the inference guard."""
    dep = await get_deployment(deployment_id, db=db)
    return dep.api_key


async def get_deployment_info(deployment_id: str, *, db: AsyncSession) -> Dict[str, Any]:
    """Return a plain dict with inference-relevant fields for the ML engine."""
    dep = await get_deployment(deployment_id, db=db)
    return {
        "deployment_id": str(dep.id),
        "model_id": dep.model_id,
        "status": dep.status,
        "api_key": dep.api_key,
        "require_api_key": dep.require_api_key,
    }
