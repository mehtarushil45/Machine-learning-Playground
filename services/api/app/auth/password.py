"""Password hashing and verification via passlib + bcrypt with timing attack mitigation and password policy."""

from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Precomputed dummy bcrypt hash for timing attack mitigation on unknown emails (Part B1)
# Computed once at module import so verification runs standard bcrypt work factor
_DUMMY_BCRYPT_HASH: str = _pwd_context.hash("dummy_auth_hardening_password_constant_time_2026")

# Bundled list of top common passwords for rejection (Part D1)
_COMMON_PASSWORDS: frozenset[str] = frozenset({
    "1234567890", "123456789", "12345678", "12345678901", "password123", "password1234",
    "password12", "password!", "pass123456", "admin12345", "administrator", "qwertyuiop",
    "qwerty1234", "1111111111", "0000000000", "welcome123", "welcome1234", "letmein123",
    "changeme123", "iloveyou123", "sunshine123", "princess12", "football12", "monkey1234",
    "dragon1234", "master1234", "trustno123", "superman12", "starwars12", "database12",
    "system1234", "testing123", "root123456", "oracle1234", "default123", "guest12345",
    "mlplatform1", "mlplayground", "demopassword", "demopassword123", "demopassword!",
    "correcthorsebatterystaple", "abc1234567", "abcdefghij", "1234567890a", "p@ssword123",
    "p@ssw0rd123", "password@123", "admin@12345", "welcome@123", "changeit123", "secret1234",
    "hunter2123", "passcode123", "computer12", "internet12", "server1234", "docker1234",
    "postgres12", "security12", "management1", "development", "production1", "engineering",
    "administrator1", "login123456", "account1234", "access1234", "network123", "connect123",
    "springfield", "shadow1234", "killer1234", "jordan1234", "harley1234", "michelle12",
    "jessica123", "charlie123", "bailey1234", "matthew123", "anthony123", "daniel1234",
    "andrew1234", "joshua1234", "david12345", "james12345", "robert1234", "johnny1234",
    "william123", "richard123", "thomas1234", "charles123", "christopher", "anthony1234",
})


def hash_password(plain_password: str) -> str:
    """Return a bcrypt hash of ``plain_password``."""
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return ``True`` if ``plain_password`` matches ``hashed_password``."""
    return _pwd_context.verify(plain_password, hashed_password)


def verify_dummy_password(plain_password: str) -> bool:
    """Verify password against a dummy hash to preserve constant execution time (B1)."""
    return _pwd_context.verify(plain_password, _DUMMY_BCRYPT_HASH)


def needs_rehash(hashed_password: str) -> bool:
    """Check if password hash uses outdated algorithm or work factor parameters (B3)."""
    return _pwd_context.needs_update(hashed_password)


import re

# Common trivial password patterns (e.g. password12345!, welcome123!, etc.)
_COMMON_PREFIX_RE = re.compile(
    r"^(password|passcode|admin|administrator|welcome|qwerty|letmein|demopassword|changeme|testing|master|root|system)\d*[\W_]*$",
    re.IGNORECASE,
)


def validate_password_policy(
    plain_password: str,
    min_length: int = 10,
    max_length: int = 128,
) -> tuple[bool, str | None]:
    """Validate password against length policy and common passwords list (D1).

    Enforces:
      - Minimum length >= 10 (configurable)
      - Maximum length <= 128
      - Rejection of common passwords and trivial stem variations (e.g. Password12345!)
      - No composition rules (no mandatory special characters or mixed cases)
    """
    if len(plain_password) < min_length:
        return False, f"Password must be at least {min_length} characters long."
    if len(plain_password) > max_length:
        return False, f"Password cannot exceed {max_length} characters."
    
    pw_lower = plain_password.lower()
    if pw_lower in _COMMON_PASSWORDS or bool(_COMMON_PREFIX_RE.match(pw_lower)):
        return False, "This password is too common and easily guessed. Please choose a more secure password."
    if len(set(plain_password)) == 1:
        return False, "This password is too repetitive. Please choose a more secure password."
    return True, None


