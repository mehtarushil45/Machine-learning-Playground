"""LDAP / Active Directory provider — V7A architecture placeholder.

Implementation planned for V8C.
"""

from __future__ import annotations

from typing import Optional


class LDAPProvider:
    """LDAP / Active Directory authentication provider. [V8C]"""

    provider_name = "ldap"
    is_enabled = False

    async def authenticate(self, credentials: dict) -> Optional[dict]:
        raise NotImplementedError("LDAP provider is planned for V8C.")

    async def refresh(self, refresh_token: str) -> Optional[dict]:
        raise NotImplementedError("LDAP provider is planned for V8C.")

    async def revoke(self, token: str) -> bool:
        raise NotImplementedError("LDAP provider is planned for V8C.")
