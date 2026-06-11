"""DNSE/Entrade authentication for the realtime MQTT bridge.

Flow (verified live 2026-06-11):
1. POST /auth {username, password} -> token (JWT, ~8h)
2. GET /me  (Bearer token)         -> investorId  (MQTT username)

The token is cached at module level and refreshed before its ~8h expiry.
Credentials come from settings (env only); we never log token/password values.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from app.core.config import get_settings
from app.services.market_data.http import fetch_json

logger = logging.getLogger(__name__)


@dataclass
class DnseToken:
    """A cached DNSE session: JWT + investorId + issue time."""

    token: str
    investor_id: str
    issued_at: float

    def is_stale(self, refresh_hours: float) -> bool:
        return (time.monotonic() - self.issued_at) >= refresh_hours * 3600


class DnseAuthError(RuntimeError):
    """Raised when DNSE auth/me fails or credentials are missing."""


async def authenticate(username: str, password: str) -> str:
    """POST /auth -> JWT token. Raises DnseAuthError on failure."""
    settings = get_settings()
    try:
        body = await fetch_json(
            settings.DNSE_AUTH_URL,
            method="POST",
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            json_body={"username": username, "password": password},
            max_retries=2,
            source="DNSE",
        )
    except Exception as exc:  # noqa: BLE001
        raise DnseAuthError(f"DNSE /auth request failed: {type(exc).__name__}") from exc

    token = (body or {}).get("token")
    if not token:
        raise DnseAuthError("DNSE /auth returned no token")
    return str(token)


async def fetch_investor_id(token: str) -> str:
    """GET /me (Bearer) -> investorId (used as MQTT username)."""
    settings = get_settings()
    try:
        body = await fetch_json(
            settings.DNSE_ME_URL,
            method="GET",
            headers={"Accept": "application/json", "authorization": f"Bearer {token}"},
            max_retries=2,
            source="DNSE",
        )
    except Exception as exc:  # noqa: BLE001
        raise DnseAuthError(f"DNSE /me request failed: {type(exc).__name__}") from exc

    investor_id = (body or {}).get("investorId")
    if not investor_id:
        raise DnseAuthError("DNSE /me returned no investorId")
    return str(investor_id)


# Module-level token cache (only the leader worker authenticates).
_cached: DnseToken | None = None


async def get_or_refresh(*, force: bool = False) -> DnseToken:
    """Return a valid DnseToken, authenticating/refreshing as needed."""
    global _cached  # noqa: PLW0603
    settings = get_settings()

    if not settings.DNSE_USERNAME or not settings.DNSE_PASSWORD:
        raise DnseAuthError("DNSE credentials missing (DNSE_USERNAME/DNSE_PASSWORD)")

    if (
        not force
        and _cached is not None
        and not _cached.is_stale(settings.REALTIME_TOKEN_REFRESH_HOURS)
    ):
        return _cached

    token = await authenticate(settings.DNSE_USERNAME, settings.DNSE_PASSWORD)
    investor_id = await fetch_investor_id(token)
    _cached = DnseToken(token=token, investor_id=investor_id, issued_at=time.monotonic())
    logger.info("DNSE auth ok (investorId=%s, token_len=%d)", investor_id, len(token))
    return _cached


def reset_cache() -> None:
    """Clear the cached token (used on shutdown / forced re-auth)."""
    global _cached  # noqa: PLW0603
    _cached = None
