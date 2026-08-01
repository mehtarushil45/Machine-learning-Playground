"""Cryptographically Verifiable Certificate Engine — Phase 6.

Generates HMAC-SHA256 digitally signed certificates and QR code verification links
for student ML portfolio projects and course practical completion.
"""

from __future__ import annotations

import hmac
import hashlib
import json
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("apex_ml.certificate_generator")

_SECRET_KEY = os.environ.get("MLPLAYGROUND_CERT_SECRET", "mlplayground-enterprise-cert-key-2026")


class CertificatePayload(BaseModel):
    """Cryptographic certificate data payload."""

    certificate_id: str = Field(..., description="Unique certificate identifier", example="CERT-89316C9A")
    user_id: str = Field(..., description="Learner UUID")
    user_name: str = Field("Student Learner", description="Learner full name")
    project_id: str = Field(..., description="Portfolio project UUID")
    project_title: str = Field(..., description="Project title")
    model_id: Optional[str] = Field(None, description="Trained model ID")
    experiment_id: Optional[str] = Field(None, description="Experiment ID")
    metrics: Dict[str, float] = Field(default_factory=dict, description="Verified model performance metrics")
    issued_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    signature: str = Field(..., description="HMAC-SHA256 digital signature")
    qr_code_url: str = Field(..., description="Public QR code verification URL")
    verification_url: str = Field(..., description="Verification endpoint URL")


def generate_certificate(
    user_id: str,
    user_name: str,
    project_id: str,
    project_title: str,
    model_id: Optional[str] = None,
    experiment_id: Optional[str] = None,
    metrics: Optional[Dict[str, float]] = None,
    base_url: str = "http://localhost:8000",
) -> CertificatePayload:
    """Generate a cryptographically signed certificate payload with QR verification URL.

    Args:
        user_id: Learner UUID.
        user_name: Learner full name.
        project_id: Project UUID.
        project_title: Title of project.
        model_id: Optional model ID.
        experiment_id: Optional experiment ID.
        metrics: Performance metrics dict.
        base_url: System base URL for verification links.

    Returns:
        CertificatePayload object with HMAC-SHA256 signature and QR code link.
    """
    cert_id = f"CERT-{project_id[:8].upper()}"
    issued_at = datetime.now(timezone.utc).isoformat()
    clean_metrics = {k: round(float(v), 4) for k, v in (metrics or {}).items() if isinstance(v, (int, float))}

    # Canonical message for HMAC-SHA256 signature
    canonical_msg = f"{cert_id}|{user_id}|{project_id}|{project_title}|{issued_at}"
    signature = hmac.new(
        _SECRET_KEY.encode("utf-8"),
        canonical_msg.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    verification_url = f"{base_url.rstrip('/')}/api/v1/portfolios/verify/{project_id}"
    qr_code_url = f"https://api.qrserver.com/v1/create-qr-code/?size=150x150&data={verification_url}"

    return CertificatePayload(
        certificate_id=cert_id,
        user_id=str(user_id),
        user_name=user_name,
        project_id=str(project_id),
        project_title=project_title,
        model_id=model_id,
        experiment_id=experiment_id,
        metrics=clean_metrics,
        issued_at=issued_at,
        signature=signature,
        qr_code_url=qr_code_url,
        verification_url=verification_url,
    )


def verify_certificate_authenticity(
    certificate_id: str,
    user_id: str,
    project_id: str,
    project_title: str,
    issued_at: str,
    signature: str,
) -> Dict[str, Any]:
    """Verify HMAC-SHA256 digital signature of a certificate to guarantee non-tampering.

    Returns:
        Dictionary containing is_authentic boolean, verification status, and issuer details.
    """
    canonical_msg = f"{certificate_id}|{user_id}|{project_id}|{project_title}|{issued_at}"
    expected_sig = hmac.new(
        _SECRET_KEY.encode("utf-8"),
        canonical_msg.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    is_authentic = secrets.compare_digest(expected_sig, signature)

    return {
        "is_authentic": is_authentic,
        "verification_status": "VERIFIED_GENUINE" if is_authentic else "SIGNATURE_MISMATCH_TAMPERED",
        "certificate_id": certificate_id,
        "issuer": "MLPlayground Certification Authority",
        "algorithm": "HMAC-SHA256",
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }
