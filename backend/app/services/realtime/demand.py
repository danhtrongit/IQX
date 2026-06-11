"""Cross-worker symbol demand tracking via a Redis hash.

Each WS connection that subscribes to ``(symbol, channel)`` increments a
counter; on disconnect it decrements. The leader reads the live set to decide
which KRX MQTT topics to subscribe/unsubscribe. Ref-counting across workers is
why this lives in Redis rather than process memory.

Hash key:   ``realtime:demand``
Hash field: ``{CHANNEL}:{SYMBOL}``  (e.g. ``tick:FPT``)
Value:      int count (field removed when it drops to <= 0)
"""

from __future__ import annotations

import logging

from app.services.cache.redis_cache import get_redis_client

logger = logging.getLogger(__name__)

_HASH = "realtime:demand"


def _field(channel: str, symbol: str) -> str:
    return f"{channel}:{symbol.upper()}"


async def add(symbol: str, channels: list[str]) -> None:
    """Increment demand for a symbol across the given channels."""
    redis = get_redis_client()
    if redis is None:
        return
    try:
        async with redis.pipeline(transaction=False) as pipe:
            for ch in channels:
                pipe.hincrby(_HASH, _field(ch, symbol), 1)
            await pipe.execute()
    except Exception:  # noqa: BLE001
        logger.warning("demand.add failed (%s)", symbol, exc_info=True)


async def remove(symbol: str, channels: list[str]) -> None:
    """Decrement demand; delete fields that reach <= 0."""
    redis = get_redis_client()
    if redis is None:
        return
    try:
        for ch in channels:
            field = _field(ch, symbol)
            remaining = await redis.hincrby(_HASH, field, -1)
            if remaining <= 0:
                await redis.hdel(_HASH, field)
    except Exception:  # noqa: BLE001
        logger.warning("demand.remove failed (%s)", symbol, exc_info=True)


async def current() -> dict[str, set[str]]:
    """Return ``{symbol: {channels}}`` for all symbols with positive demand."""
    redis = get_redis_client()
    if redis is None:
        return {}
    try:
        raw: dict[str, str] = await redis.hgetall(_HASH)
    except Exception:  # noqa: BLE001
        logger.warning("demand.current failed", exc_info=True)
        return {}

    out: dict[str, set[str]] = {}
    for field, count in raw.items():
        try:
            if int(count) <= 0:
                continue
        except (TypeError, ValueError):
            continue
        channel, _, symbol = field.partition(":")
        if not symbol:
            continue
        out.setdefault(symbol, set()).add(channel)
    return out


async def clear() -> None:
    """Remove the whole demand hash (used on leader bootstrap/shutdown)."""
    redis = get_redis_client()
    if redis is None:
        return
    try:
        await redis.delete(_HASH)
    except Exception:  # noqa: BLE001
        logger.debug("demand.clear failed", exc_info=True)
