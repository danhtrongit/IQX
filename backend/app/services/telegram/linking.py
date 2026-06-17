"""Telegram account linking: deep-link token mint/resolve + webhook handler."""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.user import User
from app.services.cache.redis_cache import (
    cache_delete_pattern,
    cache_get_json,
    cache_set_json,
)
from app.services.telegram import client as tg

logger = logging.getLogger(__name__)

_LINK_TTL = 600  # 10 minutes
_PREFIX = "tg_link:"


async def mint_link_token(user_id: uuid.UUID) -> dict[str, str]:
    """Create a one-time link token and return ``{token, deep_link}``."""
    token = secrets.token_urlsafe(24)
    await cache_set_json(f"{_PREFIX}{token}", str(user_id), _LINK_TTL)
    username = get_settings().TELEGRAM_BOT_USERNAME
    deep_link = f"https://t.me/{username}?start={token}" if username else ""
    return {"token": token, "deep_link": deep_link}


async def resolve_link_token(token: str) -> uuid.UUID | None:
    """Resolve (and consume) a link token to a user id."""
    raw = await cache_get_json(f"{_PREFIX}{token}")
    if not raw:
        return None
    await cache_delete_pattern(f"{_PREFIX}{token}")
    try:
        return uuid.UUID(str(raw))
    except (ValueError, TypeError):
        return None


async def _safe_send(chat_id: str, text: str) -> None:
    try:
        await tg.send_message(chat_id, text)
    except Exception as exc:  # noqa: BLE001 - never let a reply failure break the webhook
        logger.warning("Telegram reply failed: %s", exc)


async def handle_update(update: dict, db: AsyncSession) -> None:
    """Process one webhook update. Only ``/start <token>`` links an account."""
    msg = update.get("message") or {}
    chat = msg.get("chat") or {}
    chat_id = chat.get("id")
    text = (msg.get("text") or "").strip()
    if chat_id is None or not text:
        return
    chat_id = str(chat_id)

    if not text.startswith("/start"):
        await _safe_send(chat_id, "IQX Alerts đang hoạt động. Quản lý cảnh báo trong ứng dụng IQX.")
        return

    parts = text.split(maxsplit=1)
    token = parts[1].strip() if len(parts) > 1 else ""
    if not token:
        await _safe_send(chat_id, "Chào mừng đến IQX Alerts. Mở liên kết kết nối từ ứng dụng IQX để bắt đầu.")
        return

    user_id = await resolve_link_token(token)
    if user_id is None:
        await _safe_send(chat_id, "Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng thử lại từ ứng dụng IQX.")
        return

    user = await db.get(User, user_id)
    if user is None:
        await _safe_send(chat_id, "Không tìm thấy tài khoản tương ứng.")
        return

    user.telegram_chat_id = chat_id
    user.telegram_linked_at = datetime.now(UTC)
    await db.commit()
    await _safe_send(chat_id, "✅ Đã kết nối IQX Alerts. Bạn sẽ nhận tín hiệu theo watchlist của mình.")
