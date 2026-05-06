"""Async Redis cache service for IQX backend.

Provides shared Redis client lifecycle management and JSON cache helpers.
All operations are fail-safe: Redis unavailability never crashes the API.

Usage:
    from app.services.cache.redis_cache import startup, shutdown, cache_get_json, cache_set_json

Lifespan:
    Call ``startup()`` during app startup, ``shutdown()`` during app shutdown.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Module-level client reference
_redis: Any | None = None


async def startup() -> None:
    """Initialise the shared Redis connection pool. Call from app lifespan."""
    global _redis  # noqa: PLW0603
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.REDIS_ENABLED:
        logger.info("Redis cache disabled (REDIS_ENABLED=false)")
        return

    try:
        import redis.asyncio as aioredis

        _redis = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=3,
            retry_on_timeout=True,
        )
        # Verify connectivity
        await _redis.ping()
        logger.info("Redis cache connected: %s", settings.REDIS_URL)
    except Exception:
        logger.warning("Redis cache unavailable, running uncached", exc_info=True)
        _redis = None


async def shutdown() -> None:
    """Close the shared Redis connection. Call from app lifespan."""
    global _redis  # noqa: PLW0603
    if _redis is not None:
        try:
            await _redis.aclose()
        except Exception:
            logger.warning("Error closing Redis connection", exc_info=True)
        _redis = None
    logger.info("Redis cache connection closed")


def get_redis_client() -> Any | None:
    """Return the shared Redis client, or None if unavailable."""
    return _redis


async def health_check() -> str:
    """Check Redis connectivity. Returns 'healthy', 'disabled', or 'unhealthy'."""
    if _redis is None:
        from app.core.config import get_settings

        if not get_settings().REDIS_ENABLED:
            return "disabled"
        return "unhealthy"
    try:
        await _redis.ping()
        return "healthy"
    except Exception:
        return "unhealthy"


def build_cache_key(
    prefix: str,
    path: str,
    params: dict[str, Any] | None = None,
) -> str:
    """Build a stable, deterministic cache key.

    Format: ``iqx:{prefix}:{path}:{params_hash}``

    - Path segments with stock symbols are uppercased
    - Query params are sorted and hashed for stability
    """
    # Normalize path: uppercase segments that look like stock ticker symbols
    # A symbol-like segment is short (1-10 chars), all alphanumeric,
    # and contains at least one uppercase letter (to distinguish from path words)
    normalised_parts = []
    _symbol_path_positions = {"quotes", "company", "trading", "fundamentals", "tickers"}
    in_symbol_context = False
    for part in path.strip("/").split("/"):
        if part in _symbol_path_positions:
            in_symbol_context = True
            normalised_parts.append(part)
        elif in_symbol_context and part.isalnum() and len(part) <= 10:
            normalised_parts.append(part.upper())
            in_symbol_context = False
        else:
            in_symbol_context = False
            normalised_parts.append(part)
    normalised_path = "/".join(normalised_parts)

    if params:
        # Sort, remove empty, build deterministic string
        sorted_params = sorted(
            ((k, str(v)) for k, v in params.items() if v is not None and str(v) != ""),
            key=lambda x: x[0],
        )
        if sorted_params:
            param_str = "&".join(f"{k}={v}" for k, v in sorted_params)
            param_hash = hashlib.md5(param_str.encode(), usedforsecurity=False).hexdigest()[:12]
        else:
            param_hash = "_"
    else:
        param_hash = "_"

    return f"iqx:{prefix}:{normalised_path}:{param_hash}"


async def cache_get_json(key: str) -> Any | None:
    """Get a JSON value from cache. Returns None on miss or error."""
    if _redis is None:
        return None
    try:
        raw = await _redis.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        logger.warning("Redis GET failed for key=%s", key, exc_info=True)
        return None


async def cache_set_json(key: str, value: Any, ttl_seconds: int) -> None:
    """Set a JSON value in cache with TTL. Silently fails on error."""
    if _redis is None:
        return
    try:
        serialized = json.dumps(value, default=str, ensure_ascii=False)
        await _redis.set(key, serialized, ex=ttl_seconds)
    except Exception:
        logger.warning("Redis SET failed for key=%s", key, exc_info=True)


async def cache_delete_pattern(pattern: str) -> int:
    """Delete all keys matching a pattern. Returns count deleted."""
    if _redis is None:
        return 0
    try:
        count = 0
        async for key in _redis.scan_iter(match=pattern, count=100):
            await _redis.delete(key)
            count += 1
        return count
    except Exception:
        logger.warning("Redis DELETE pattern failed for %s", pattern, exc_info=True)
        return 0
