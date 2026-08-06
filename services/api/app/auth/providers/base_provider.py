"""Abstract authentication provider protocol — V7A architecture.

All future SSO providers (OIDC, SAML, LDAP) must implement this protocol.
"""

from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable


@runtime_checkable
class AuthProvider(Protocol):
    """Protocol that all authentication providers must satisfy."""

    provider_name: str
    is_enabled: bool

    async def authenticate(
        self,
        credentials: dict,
    ) -> Optional[dict]:
        """Authenticate a user and return their profile dict, or None on failure."""
        ...

    async def refresh(
        self,
        refresh_token: str,
    ) -> Optional[dict]:
        """Exchange a refresh token for a new session."""
        ...

    async def revoke(
        self,
        token: str,
    ) -> bool:
        """Revoke a token. Return True on success."""
        ...
