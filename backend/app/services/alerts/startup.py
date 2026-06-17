"""App-startup hooks for the alert system: seed presets + register webhook."""

from __future__ import annotations

import logging

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.services.alerts.seeder import seed_alert_signals
from app.services.telegram import client as tg

logger = logging.getLogger(__name__)


async def alerts_startup() -> None:
    """Seed the 10 presets (idempotent) and register the Telegram webhook."""
    settings = get_settings()

    try:
        factory = get_session_factory()
        async with factory() as db:
            await seed_alert_signals(db)
    except Exception as exc:  # noqa: BLE001 - tolerate concurrent-worker seed races
        logger.warning("Alert signal seeding skipped: %s", exc)

    if tg.is_configured() and settings.TELEGRAM_WEBHOOK_SECRET and settings.APP_PUBLIC_URL:
        base = settings.APP_PUBLIC_URL.rstrip("/")
        url = f"{base}/api/v1/telegram/webhook/{settings.TELEGRAM_WEBHOOK_SECRET}"
        try:
            await tg.set_webhook(url, secret_token=settings.TELEGRAM_WEBHOOK_SECRET)
            logger.info("Telegram webhook registered")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Telegram setWebhook failed: %s", exc)
