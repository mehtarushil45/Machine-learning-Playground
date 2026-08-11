"""Application configuration loaded from environment variables.

All values come from the .env file at the repo root.
See /.env.example for the full list and expected formats.

Security validation runs at import time — the app refuses to start if
SECRET_KEY is too short, is a known weak default, or if MinIO credentials
are the factory defaults in a non-local environment.

Generate a strong secret key:
    python -c "import secrets; print(secrets.token_hex(64))"
"""

from __future__ import annotations

import os
import re
from typing import ClassVar, FrozenSet

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings

# ---------------------------------------------------------------------------
# Path helpers (CWD-independent)
# ---------------------------------------------------------------------------

# uploads/ lives one directory above this file (services/api/uploads/).
_DEFAULT_UPLOAD_DIR: str = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "uploads")
)

# Probe for .env from multiple CWD launch points:
#   - repo root  (docker compose exec)
#   - services/api  (uvicorn from services/api/)
#   - services/api/app  (unusual but handled)
_ENV_FILE_PATHS: tuple[str, ...] = (
    ".env",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")),
)

# ---------------------------------------------------------------------------
# Known-weak / insecure default values that must be rejected at startup.
# All comparisons are case-insensitive after stripping whitespace.
# ---------------------------------------------------------------------------

_WEAK_SECRET_KEYS: FrozenSet[str] = frozenset(
    {
        "change-me-in-production",
        "change-me",
        "changeme",
        "secret",
        "secret_key",
        "secretkey",
        "mysecret",
        "your-secret-key",
        "supersecret",
        "super-secret",
        "insecure",
        "development",
        "dev",
        "test",
        "testing",
        "password",
        "12345678",
        "abcdefgh",
        "please-change-this",
        "please-change-this-value-now!!!!!",
        "default",
        "example",
        "jwt_secret",
        "jwt-secret",
        "tochange",
        "todo",
    }
)

_WEAK_MINIO_CREDENTIALS: FrozenSet[str] = frozenset(
    {
        "minioadmin",
        "minio",
        "admin",
        "administrator",
        "password",
        "changeme",
        "change-me",
        "12345678",
        "accesskey",
        "secretkey",
    }
)

# Minimum byte-length thresholds
_SECRET_KEY_MIN_LEN: int = 32   # bytes — 256-bit minimum, 64 recommended
_MINIO_KEY_MIN_LEN: int = 8     # MinIO's own enforced minimum is 8 chars

# Environments where weak MinIO credentials are ALWAYS rejected
_STRICT_ENVIRONMENTS: FrozenSet[str] = frozenset({"production", "prod", "staging"})


class Settings(BaseSettings):
    """Validated application settings.

    Validation order (Pydantic guarantees field validators run before
    model validators):
      1. ``secret_key``:  length ≥ 32, not a known-weak default.
      2. ``s3_access_key`` / ``s3_secret_key``:  not factory defaults.
         In production/staging environments these are always validated strictly.
      3. ``storage_backend``:  must be "local" or "minio".
      4. ``access_token_expire_minutes``: must be positive.
      5. ``refresh_token_expire_days``:  must be positive.
      6. Model-level cross-field guard: minio backend requires non-default creds.
    """

    # ── Internal class-level constants (not env vars) ─────────────────────────
    _WEAK_KEYS: ClassVar[FrozenSet[str]] = _WEAK_SECRET_KEYS
    _WEAK_MINIO: ClassVar[FrozenSet[str]] = _WEAK_MINIO_CREDENTIALS

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://postgres:postgres@db:5432/mlplatform"

    # ── JWT / Auth ────────────────────────────────────────────────────────────
    # Stored as SecretStr so the value is masked in repr() / logs.
    # Access the raw string via:  settings.secret_key.get_secret_value()
    secret_key: SecretStr = SecretStr("")  # REQUIRED: set SECRET_KEY env var (min 32 chars)
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = "redis://redis:6379/0"

    # ── S3-compatible Object Storage ──────────────────────────────────────────
    s3_endpoint_url: str = "http://minio:9000"
    s3_access_key: SecretStr = SecretStr("minioadmin")
    s3_secret_key: SecretStr = SecretStr("minioadmin")
    s3_bucket_name: str = "ml-datasets"

    # ── Dataset Upload Settings ───────────────────────────────────────────────
    max_upload_size_bytes: int = 50 * 1024 * 1024  # 50 MB
    upload_dir: str = _DEFAULT_UPLOAD_DIR

    # ── Storage Backend Selector ──────────────────────────────────────────────
    # Allowed values: "local" | "minio"
    storage_backend: str = "local"

    # ── Runtime environment label ─────────────────────────────────────────────
    # Used to conditionally enforce strict credential checks.
    # Set APP_ENV=production in your deployment environment.
    app_env: str = "development"

    # ── Cookie configuration ──────────────────────────────────────────────────
    # Controls how Set-Cookie is emitted for access and refresh tokens.
    # cookie_secure must be True in production (HTTPS only).
    # cookie_samesite: "lax" works for same-site SPAs; use "none" only with
    # cookie_secure=True for cross-origin setups.
    cookie_secure: bool = False          # Set True in production (HTTPS)
    cookie_samesite: str = "lax"         # "lax" | "strict" | "none"
    cookie_domain: str | None = None     # None = browser default (current host)

    model_config = {
        "env_file": _ENV_FILE_PATHS,
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    # =========================================================================
    # Field validators
    # =========================================================================

    @field_validator("secret_key", mode="before")
    @classmethod
    def validate_secret_key(cls, v: object) -> object:
        """Enforce SECRET_KEY strength at startup.

        Checks (in order):
          1. Must be a non-empty string.
          2. Must be at least ``_SECRET_KEY_MIN_LEN`` characters.
          3. Must not be a known-weak placeholder value.
          4. Must not consist solely of a single repeated character (e.g. "aaa…").
          5. Must not be a pure decimal integer string (e.g. "1234…").
        """
        raw: str = v.get_secret_value() if isinstance(v, SecretStr) else str(v)
        raw = raw.strip()

        # 1 — Non-empty
        if not raw:
            raise ValueError(
                "SECRET_KEY must not be empty. "
                f"Generate one with:  python -c \"import secrets; print(secrets.token_hex(64))\""
            )

        # 2 — Minimum length
        if len(raw) < _SECRET_KEY_MIN_LEN:
            raise ValueError(
                f"SECRET_KEY is too short ({len(raw)} chars). "
                f"Minimum required: {_SECRET_KEY_MIN_LEN} characters. "
                f"Recommended: 64 hex characters (python -c \"import secrets; print(secrets.token_hex(64))\")."
            )

        # 3 — Not a known-weak default
        if raw.lower() in _WEAK_SECRET_KEYS:
            raise ValueError(
                f"SECRET_KEY is a known insecure default value ({raw!r}). "
                "Replace it immediately: "
                "python -c \"import secrets; print(secrets.token_hex(64))\""
            )

        # 4 — Not a single repeated character (e.g. "xxxxxxxxxx…")
        if len(set(raw)) == 1:
            raise ValueError(
                "SECRET_KEY must not consist of a single repeated character. "
                "Use a cryptographically random value."
            )

        # 5 — Not a pure numeric string (e.g. "12345678901234567890…")
        if raw.isdigit():
            raise ValueError(
                "SECRET_KEY must not be a numeric-only string. "
                "Use a cryptographically random value."
            )

        return v  # Return the original (SecretStr or plain str) unchanged

    @field_validator("s3_access_key", "s3_secret_key", mode="before")
    @classmethod
    def validate_minio_credentials(cls, v: object) -> object:
        """Warn (or raise in strict env) when MinIO factory defaults are in use.

        In ``development`` / ``local`` environments, factory defaults emit a
        startup warning only.  In ``production`` or ``staging`` they raise a
        hard error.

        Note: ``app_env`` is not available inside a field validator because
        field validators run per-field before the model is assembled.
        The model-level ``@model_validator`` enforces the strict-env check.
        Here we only check for default-credential length.
        """
        raw: str = v.get_secret_value() if isinstance(v, SecretStr) else str(v)
        raw = raw.strip()

        if not raw:
            raise ValueError(
                "MinIO credentials (S3_ACCESS_KEY / S3_SECRET_KEY) must not be empty."
            )

        if len(raw) < _MINIO_KEY_MIN_LEN:
            raise ValueError(
                f"MinIO credential is too short ({len(raw)} chars). "
                f"Minimum: {_MINIO_KEY_MIN_LEN} characters."
            )

        return v

    @field_validator("storage_backend", mode="before")
    @classmethod
    def validate_storage_backend(cls, v: object) -> str:
        """Ensure STORAGE_BACKEND is a recognised value."""
        val = str(v).strip().lower()
        if val not in {"local", "minio"}:
            raise ValueError(
                f"STORAGE_BACKEND must be 'local' or 'minio', got: {v!r}"
            )
        return val

    @field_validator("access_token_expire_minutes", mode="before")
    @classmethod
    def validate_access_token_ttl(cls, v: object) -> int:
        """Ensure access token TTL is a positive integer."""
        try:
            val = int(v)
        except (TypeError, ValueError):
            raise ValueError(
                f"ACCESS_TOKEN_EXPIRE_MINUTES must be a positive integer, got: {v!r}"
            )
        if val < 1:
            raise ValueError(
                "ACCESS_TOKEN_EXPIRE_MINUTES must be at least 1 minute."
            )
        if val > 1440:
            import warnings
            warnings.warn(
                f"ACCESS_TOKEN_EXPIRE_MINUTES={val} exceeds 24 hours. "
                "Consider a shorter access-token lifetime for security.",
                stacklevel=4,
            )
        return val

    @field_validator("refresh_token_expire_days", mode="before")
    @classmethod
    def validate_refresh_token_ttl(cls, v: object) -> int:
        """Ensure refresh token TTL is a positive integer."""
        try:
            val = int(v)
        except (TypeError, ValueError):
            raise ValueError(
                f"REFRESH_TOKEN_EXPIRE_DAYS must be a positive integer, got: {v!r}"
            )
        if val < 1:
            raise ValueError(
                "REFRESH_TOKEN_EXPIRE_DAYS must be at least 1 day."
            )
        if val > 90:
            import warnings
            warnings.warn(
                f"REFRESH_TOKEN_EXPIRE_DAYS={val} exceeds 90 days. "
                "This is a long refresh window — review your security policy.",
                stacklevel=4,
            )
        return val

    # =========================================================================
    # Cross-field / model-level validator
    # =========================================================================

    @model_validator(mode="after")
    def enforce_strict_environment_checks(self) -> "Settings":
        """Cross-field security enforcement after all fields are parsed.

        In production / staging environments:
          - Weak MinIO credentials (factory defaults) raise a hard error.
          - Secret key shorter than 64 chars triggers a warning (32 is the min,
            64 is the recommended production floor).

        In development environments:
          - Factory MinIO credentials emit a startup warning only.
          - Sub-optimal SECRET_KEY length emits a warning only.
        """
        import warnings

        env = self.app_env.strip().lower()
        is_strict = env in _STRICT_ENVIRONMENTS

        # --- MinIO credential check ---
        access_raw = self.s3_access_key.get_secret_value().strip().lower()
        secret_raw = self.s3_secret_key.get_secret_value().strip().lower()

        access_is_default = access_raw in _WEAK_MINIO_CREDENTIALS
        secret_is_default = secret_raw in _WEAK_MINIO_CREDENTIALS

        if access_is_default or secret_is_default:
            which = []
            if access_is_default:
                which.append("S3_ACCESS_KEY")
            if secret_is_default:
                which.append("S3_SECRET_KEY")
            msg = (
                f"MinIO factory-default credentials detected ({', '.join(which)}). "
                "Change these before handling any real data. "
                "See .env.example for generation commands."
            )
            if is_strict:
                raise ValueError(
                    f"[{env.upper()}] {msg} "
                    "Application start-up blocked."
                )
            else:
                warnings.warn(
                    f"\n{'='*70}\n"
                    f"⚠️  SECURITY WARNING — MinIO default credentials in use\n"
                    f"   {msg}\n"
                    f"{'='*70}",
                    UserWarning,
                    stacklevel=2,
                )

        # --- SECRET_KEY length recommendation for production ---
        secret_len = len(self.secret_key.get_secret_value().strip())
        if secret_len < 64:
            rec_msg = (
                f"SECRET_KEY is {secret_len} chars. "
                "64+ hex characters are recommended for production "
                "(python -c \"import secrets; print(secrets.token_hex(64))\")."
            )
            if is_strict:
                raise ValueError(
                    f"[{env.upper()}] {rec_msg} "
                    "Application start-up blocked."
                )
            else:
                warnings.warn(
                    f"\n{'='*70}\n"
                    f"⚠️  SECURITY WARNING — Short SECRET_KEY\n"
                    f"   {rec_msg}\n"
                    f"{'='*70}",
                    UserWarning,
                    stacklevel=2,
                )

        return self


# ---------------------------------------------------------------------------
# Module-level singleton — import this everywhere:
#   from app.config import settings
#
# ValidationError raised here means the app will NOT start.
# The error message tells the operator exactly what to fix.
# ---------------------------------------------------------------------------
settings = Settings()
