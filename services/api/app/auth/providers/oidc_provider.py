"""OIDC / OAuth2 provider — V7A architecture placeholder.

Implementation planned for V8A.
"""

from __future__ import annotations

from typing import Optional


class OIDCProvider:
    """OpenID Connect authentication provider. [V8A]"""

    provider_name = "oidc"
    is_enabled = False

    async def authenticate(self, credentials: dict) -> Optional[dict]:
        raise NotImplementedError("OIDC provider is planned for V8A.")

    async def refresh(self, refresh_token: str) -> Optional[dict]:
        raise NotImplementedError("OIDC provider is planned for V8A.")

    async def revoke(self, token: str) -> bool:
        raise NotImplementedError("OIDC provider is planned for V8A.")
