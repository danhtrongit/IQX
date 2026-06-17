"""Thin async Telegram Bot API client (httpx).

The bot token comes from ``settings.TELEGRAM_BOT_TOKEN`` (env only — never
committed). All calls are no-ops/raise cleanly when the bot is unconfigured.
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_API_BASE = "https://api.telegram.org"
_TIMEOUT = 10.0


class TelegramError(RuntimeError):
    """Raised when a Telegram API call fails."""


def is_configured() -> bool:
    return bool(get_settings().TELEGRAM_BOT_TOKEN)


def _url(method: str) -> str:
    token = get_settings().TELEGRAM_BOT_TOKEN
    return f"{_API_BASE}/bot{token}/{method}"


async def _call(method: str, payload: dict) -> dict:
    if not is_configured():
        raise TelegramError("Telegram chưa được cấu hình (thiếu TELEGRAM_BOT_TOKEN)")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(_url(method), json=payload)
    data = resp.json()
    if not data.get("ok"):
        raise TelegramError(f"Telegram {method} thất bại: {data.get('description')}")
    result = data.get("result", {})
    return result if isinstance(result, dict) else {}


async def send_message(chat_id: str, text: str, *, parse_mode: str = "HTML") -> dict:
    """Send a message to a chat. Raises TelegramError on failure."""
    return await _call(
        "sendMessage",
        {"chat_id": chat_id, "text": text, "parse_mode": parse_mode, "disable_web_page_preview": True},
    )


async def set_webhook(url: str, secret_token: str | None = None) -> dict:
    """Register the webhook URL with Telegram (idempotent)."""
    payload: dict = {"url": url, "allowed_updates": ["message"]}
    if secret_token:
        payload["secret_token"] = secret_token
    return await _call("setWebhook", payload)
