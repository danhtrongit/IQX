"""Realtime market data service (DNSE MQTT KRX → Redis pub/sub → WebSocket).

Lifespan hooks. ``startup()`` is a no-op unless ``REALTIME_ENABLED`` is set, so
the feature ships dark until credentials + flag are configured in the env.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def startup() -> None:
    """Start the DNSE bridge if realtime is enabled."""
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.REALTIME_ENABLED:
        logger.info("Realtime disabled (REALTIME_ENABLED=false)")
        return
    if not settings.REDIS_ENABLED:
        logger.warning("Realtime requires Redis; REDIS_ENABLED=false — skipping bridge")
        return

    from app.services.realtime.bridge import get_bridge

    get_bridge().start()
    logger.info("Realtime bridge started")


async def shutdown() -> None:
    """Stop the DNSE bridge (releases leader lock if held)."""
    from app.core.config import get_settings

    if not get_settings().REALTIME_ENABLED:
        return

    from app.services.realtime.bridge import get_bridge

    await get_bridge().stop()
    logger.info("Realtime bridge stopped")
