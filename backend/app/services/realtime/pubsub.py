"""Redis pub/sub wrapper for the realtime fan-out.

The leader publishes normalized messages to per-symbol channels; each WS
connection subscribes to the channels for the symbols it cares about.
Reuses the shared Redis client from the cache service.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from app.services.cache.redis_cache import get_redis_client

logger = logging.getLogger(__name__)


async def publish(channel: str, payload: dict[str, Any]) -> None:
    """Publish a JSON payload to a Redis channel. Fail-safe."""
    redis = get_redis_client()
    if redis is None:
        return
    try:
        await redis.publish(channel, json.dumps(payload, default=str, ensure_ascii=False))
    except Exception:  # noqa: BLE001
        logger.warning("Redis PUBLISH failed for channel=%s", channel, exc_info=True)


async def subscribe(channels: list[str]) -> AsyncGenerator[dict[str, Any], None]:
    """Async-iterate messages from the given channels until cancelled.

    Yields parsed JSON payloads. The caller owns the lifecycle (cancel the
    task to unsubscribe). Returns immediately if Redis is unavailable.
    """
    redis = get_redis_client()
    if redis is None or not channels:
        return

    pubsub = redis.pubsub()
    try:
        await pubsub.subscribe(*channels)
        async for message in pubsub.listen():
            if message is None or message.get("type") != "message":
                continue
            data = message.get("data")
            if data is None:
                continue
            try:
                yield json.loads(data)
            except (TypeError, ValueError):
                continue
    finally:
        try:
            await pubsub.unsubscribe(*channels)
            await pubsub.aclose()
        except Exception:  # noqa: BLE001
            logger.debug("pubsub cleanup error", exc_info=True)
