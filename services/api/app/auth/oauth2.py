"""FastAPI OAuth2 password bearer scheme.

The scheme extracts the Bearer token from the Authorization header.
It is used as a FastAPI dependency in ``app.dependencies``.
"""

from fastapi.security import OAuth2PasswordBearer

# ``tokenUrl`` is the URL clients call to obtain tokens.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
