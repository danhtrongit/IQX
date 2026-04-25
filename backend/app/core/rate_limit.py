"""Rate limiting middleware using slowapi.

Provides per-IP rate limiting with configurable limits per endpoint group.
Disabled during test runs (TESTING=1 or APP_ENV=testing).
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

_settings = get_settings()

# Disable rate limiting in test environments
_enabled = _settings.APP_ENV not in ("testing", "test")

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[_settings.RATE_LIMIT_DEFAULT],
    storage_uri="memory://",
    enabled=_enabled,
)
