"""Telegram Bot API integration (outbound messages + webhook linking)."""

from __future__ import annotations

from app.services.telegram.client import (
    TelegramError,
    is_configured,
    send_message,
    set_webhook,
)

__all__ = ["TelegramError", "is_configured", "send_message", "set_webhook"]
