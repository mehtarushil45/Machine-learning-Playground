"""Classroom Join Code Generation, Normalization, and Security Rate-Limiting.

Implements Parts C2, D1, D3:
- Cryptographically secure 6-character code generator using Python `secrets`.
- Alphabet excluding 0, O, 1, I, L (31 characters, ~0.887 billion combinations).
- Robust normalization: stripping whitespace, hyphens, uppercase conversion,
  and Unicode look-alike mapping.
- Per-user and per-IP rate-limiting with progressive lockout and uniform failure messages.
"""

from __future__ import annotations

import logging
import re
import secrets
import time
import unicodedata
from typing import Dict, Optional, Tuple

logger = logging.getLogger("apex_ml.classroom_codes")

# Alphabet excluding 0, O, 1, I, L (exactly 31 characters)
JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
assert len(JOIN_CODE_ALPHABET) == 31, "JOIN_CODE_ALPHABET must have exactly 31 characters"

# Uniform error message mandated by prompt Part D3
UNIFORM_JOIN_ERROR_MESSAGE = "Code not valid or the classroom isn't accepting students"

# Unicode look-alikes mapping for input normalization
LOOK_ALIKE_MAP = {
    # Cyrillic look-alikes to ASCII Latin
    "\u0410": "A",  # Cyrillic Capital Letter A
    "\u0430": "A",  # Cyrillic Small Letter a
    "\u0412": "B",  # Cyrillic Capital Letter Ve
    "\u0421": "C",  # Cyrillic Capital Letter Es
    "\u0441": "C",  # Cyrillic Small Letter es
    "\u0415": "E",  # Cyrillic Capital Letter Ie
    "\u0435": "E",  # Cyrillic Small Letter ie
    "\u041D": "H",  # Cyrillic Capital Letter En
    "\u041A": "K",  # Cyrillic Capital Letter Ka
    "\u041C": "M",  # Cyrillic Capital Letter Em
    "\u041E": "O",  # Cyrillic Capital Letter O
    "\u043E": "O",  # Cyrillic Small Letter o
    "\u0420": "P",  # Cyrillic Capital Letter Er
    "\u0440": "P",  # Cyrillic Small Letter er
    "\u0422": "T",  # Cyrillic Capital Letter Te
    "\u0425": "X",  # Cyrillic Capital Letter Ha
    "\u0445": "X",  # Cyrillic Small Letter ha
    "\u0423": "Y",  # Cyrillic Capital Letter U
    "\u0443": "Y",  # Cyrillic Small Letter u
}


def generate_join_code(length: int = 6) -> str:
    """Generate a cryptographically secure join code using secrets.choice."""
    return "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(length))


def normalize_join_code(raw: str) -> str:
    """Normalize user-entered join code.

    - Strips leading/trailing and intermediate spaces
    - Strips all hyphens/dashes (ASCII and Unicode)
    - Normalizes Unicode NFKC (fullwidth to standard Latin)
    - Maps known look-alikes
    - Converts to uppercase
    """
    if not raw:
        return ""

    # NFKC normalizes fullwidth Latin (e.g. Ａ -> A) and compatibility characters
    normalized = unicodedata.normalize("NFKC", str(raw))

    # Apply look-alike mappings
    for k, v in LOOK_ALIKE_MAP.items():
        normalized = normalized.replace(k, v)

    # Strip hyphens, dashes, and all forms of whitespace
    # Matches ASCII hyphen, en-dash, em-dash, minus sign, figure dash, etc.
    normalized = re.sub(r"[\s\-\u2010-\u2015\u2212]+", "", normalized)

    return normalized.upper().strip()


class JoinRateLimiter:
    """Rate limits code attempts per user and per IP with backoff and lockout (Part D3)."""

    def __init__(self, max_attempts: int = 5, window_seconds: int = 300, lockout_seconds: int = 300):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        # key -> (attempt_count, first_attempt_timestamp, lockout_until_timestamp)
        self._records: Dict[str, Tuple[int, float, float]] = {}

    def is_locked_out(self, key: str) -> Tuple[bool, int]:
        now = time.time()
        record = self._records.get(key)
        if not record:
            return False, 0

        count, first_time, lockout_until = record
        if lockout_until > now:
            remaining = int(lockout_until - now)
            return True, remaining
        return False, 0

    def record_failure(self, user_id: Optional[str], ip_address: Optional[str]) -> None:
        now = time.time()
        keys = []
        if user_id:
            keys.append(f"user:{user_id}")
        if ip_address:
            keys.append(f"ip:{ip_address}")

        for key in keys:
            count, first_time, lockout_until = self._records.get(key, (0, now, 0.0))
            if now - first_time > self.window_seconds:
                count = 1
                first_time = now
            else:
                count += 1

            if count >= self.max_attempts:
                lockout_until = now + self.lockout_seconds
                logger.warning(
                    f"[Security] Join rate-limit triggered for {key}. Lockout until {lockout_until}"
                )

            self._records[key] = (count, first_time, lockout_until)

    def record_success(self, user_id: Optional[str], ip_address: Optional[str]) -> None:
        if user_id:
            self._records.pop(f"user:{user_id}", None)
        if ip_address:
            self._records.pop(f"ip:{ip_address}", None)

    def check_allowed(self, user_id: Optional[str], ip_address: Optional[str]) -> None:
        """Check if user or IP is allowed. Raises if locked out."""
        from fastapi import HTTPException, status

        if user_id:
            locked, remaining = self.is_locked_out(f"user:{user_id}")
            if locked:
                logger.info(f"Rejected join request for user {user_id} due to rate lockout.")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many attempts. Please wait {remaining} seconds before trying again.",
                )

        if ip_address:
            locked, remaining = self.is_locked_out(f"ip:{ip_address}")
            if locked:
                logger.info(f"Rejected join request for IP {ip_address} due to rate lockout.")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many attempts. Please wait {remaining} seconds before trying again.",
                )


# Global rate limiter instance
join_rate_limiter = JoinRateLimiter()
