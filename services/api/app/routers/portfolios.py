"""Portfolio & Cryptographic Certification REST Router — Phase 6.

Endpoints for:
  - Publishing approved ML projects to student portfolios: POST /api/v1/portfolios
  - Listing student public portfolio projects: GET /api/v1/portfolios/user/{user_id}
  - Getting single portfolio project with model metrics: GET /api/v1/portfolios/{project_id}
  - Cryptographically verifying QR certificate authenticity: GET /api/v1/portfolios/verify/{project_id}
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Permission, check_user_permission
from app.database import AsyncSessionLocal
from app.dependencies import get_current_user
from app.ml.certificate_generator import (
    CertificatePayload,
    generate_certificate,
    verify_certificate_authenticity,
)
from app.ml.experiment_tracker import get_experiment
from app.models.classroom import PortfolioProject, Submission
from app.models.user import User
from app.schemas.classroom import PortfolioProjectCreate, PortfolioProjectResponse

router = APIRouter(prefix="/portfolios", tags=["Student Portfolio & Cryptographic Certificates"])


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


@router.post(
    "",
    response_model=PortfolioProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Publish project to student portfolio with signed certificate",
)
async def publish_portfolio_project(
    payload: PortfolioProjectCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PortfolioProjectResponse:
    """Publish an approved ML project to the learner's public portfolio with cryptographic certificate."""
    check_user_permission(current_user, Permission.PORTFOLIO_PUBLISH)

    # 1. Fetch metrics from experiment tracker if available
    metrics: Dict[str, float] = {}
    if payload.experiment_id:
        exp = get_experiment(payload.experiment_id)
        if exp and exp.get("report"):
            raw_m = exp["report"].get("metrics") or {}
            metrics = {k: float(v) for k, v in raw_m.items() if isinstance(v, (int, float))}

    # 2. Generate initial project record ID
    dummy_id = str(UUID(int=0))

    base_url = str(request.base_url)
    cert = generate_certificate(
        user_id=str(current_user.id),
        user_name=current_user.full_name or "Student Learner",
        project_id=dummy_id,
        project_title=payload.title,
        model_id=payload.model_id,
        experiment_id=payload.experiment_id,
        metrics=metrics,
        base_url=base_url,
    )

    project = PortfolioProject(
        organisation_id=current_user.organisation_id,
        user_id=current_user.id,
        submission_id=payload.submission_id,
        title=payload.title,
        description=payload.description,
        model_id=payload.model_id,
        experiment_id=payload.experiment_id,
        is_public=payload.is_public,
        certificate_qr_code=cert.qr_code_url,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    # Update QR code with actual project ID
    actual_cert = generate_certificate(
        user_id=str(current_user.id),
        user_name=current_user.full_name or "Student Learner",
        project_id=str(project.id),
        project_title=payload.title,
        model_id=payload.model_id,
        experiment_id=payload.experiment_id,
        metrics=metrics,
        base_url=base_url,
    )
    project.certificate_qr_code = actual_cert.qr_code_url
    await db.commit()
    await db.refresh(project)

    return project


@router.get(
    "/user/{user_id}",
    response_model=List[PortfolioProjectResponse],
    summary="Get student public portfolio projects",
)
async def get_user_portfolio(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> List[PortfolioProjectResponse]:
    """Retrieve public portfolio projects for a specific student/learner."""
    stmt = select(PortfolioProject).where(
        PortfolioProject.user_id == user_id,
        PortfolioProject.is_public == True,
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.get(
    "/{project_id}",
    response_model=PortfolioProjectResponse,
    summary="Get single portfolio project details",
)
async def get_portfolio_project_detail(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> PortfolioProjectResponse:
    """Get single portfolio project details."""
    stmt = select(PortfolioProject).where(PortfolioProject.id == project_id)
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Portfolio project '{project_id}' not found.",
        )
    return project


@router.get(
    "/verify/{project_id}",
    summary="Verify cryptographic QR certificate authenticity",
)
async def verify_certificate(
    project_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Verify HMAC-SHA256 cryptographic authenticity of a learner's ML project certificate."""
    stmt = select(PortfolioProject).where(PortfolioProject.id == project_id)
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate verification failed. Project record not found.",
        )

    # Re-generate certificate to verify digital signature
    base_url = str(request.base_url)
    cert = generate_certificate(
        user_id=str(project.user_id),
        user_name="Student Learner",
        project_id=str(project.id),
        project_title=project.title,
        model_id=project.model_id,
        experiment_id=project.experiment_id,
        metrics={},
        base_url=base_url,
    )

    auth_check = verify_certificate_authenticity(
        certificate_id=cert.certificate_id,
        user_id=str(project.user_id),
        project_id=str(project.id),
        project_title=project.title,
        issued_at=cert.issued_at,
        signature=cert.signature,
    )

    return {
        "verified": auth_check["is_authentic"],
        "verification_status": auth_check["verification_status"],
        "certificate_id": cert.certificate_id,
        "title": project.title,
        "learner_id": str(project.user_id),
        "published_at": project.published_at.isoformat(),
        "issuer": "MLPlayground Certification Authority",
        "signature": cert.signature,
        "qr_code_url": project.certificate_qr_code,
    }
