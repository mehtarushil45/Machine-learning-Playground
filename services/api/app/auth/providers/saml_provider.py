"""SAML 2.0 provider — V7A architecture placeholder.

Implementation planned for V8B.
"""

from __future__ import annotations

from typing import Optional


class SAMLProvider:
    """SAML 2.0 authentication provider. [V8B]"""

    provider_name = "saml"
    is_enabled = False

    async def authenticate(self, credentials: dict) -> Optional[dict]:
        raise NotImplementedError("SAML provider is planned for V8B.")

    async def refresh(self, refresh_token: str) -> Optional[dict]:
        raise NotImplementedError("SAML provider is planned for V8B.")

    async def revoke(self, token: str) -> bool:
        raise NotImplementedError("SAML provider is planned for V8B.")
