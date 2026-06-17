"""Telegram webhook — receives bot updates (account linking via /start <token>).

Public endpoint guarded by a secret path segment (``TELEGRAM_WEBHOOK_SECRET``)
and, when present, Telegram's ``X-Telegram-Bot-Api-Secret-Token`` header.
"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Header, Request

from app.api.deps import DBSession
from app.core.config import get_settings
from app.services.telegram.linking import handle_update

router = APIRouter(prefix="/telegram", tags=["Telegram"])


@router.post("/webhook/{secret}")
async def telegram_webhook(
    secret: str,
    request: Request,
    db: DBSession,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict:
    """Handle a Telegram update. Returns 200 even on bad secret (no info leak)."""
    settings = get_settings()
    configured = settings.TELEGRAM_WEBHOOK_SECRET
    if not configured or not hmac.compare_digest(secret, configured):
        return {"ok": True}
    if x_telegram_bot_api_secret_token is not None and not hmac.compare_digest(
        x_telegram_bot_api_secret_token, configured
    ):
        return {"ok": True}

    try:
        update = await request.json()
    except Exception:  # noqa: BLE001
        return {"ok": True}
    if isinstance(update, dict):
        await handle_update(update, db)
    return {"ok": True}
