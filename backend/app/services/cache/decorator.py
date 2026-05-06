"""Decorator for caching FastAPI endpoint responses in Redis.

Usage::

    @router.get("/reference/symbols")
    @redis_cached(ttl_setting="REDIS_TTL_REFERENCE_SECONDS")
    async def list_symbols(...) -> MarketDataResponse:
        ...

Features:
- Builds cache key from request path + sorted query params
- Only caches successful (2xx) responses
- Falls through gracefully when Redis is unavailable
- Skips caching for error responses (4xx/5xx)
"""

from __future__ import annotations

import functools
import json
import logging
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def redis_cached(
    ttl_setting: str = "REDIS_DEFAULT_TTL_SECONDS",
    prefix: str = "api:v1",
    cache_empty: bool = False,
) -> Any:
    """Decorator factory for caching GET endpoint responses.

    Args:
        ttl_setting: Name of the Settings attribute for TTL in seconds.
        prefix: Cache key prefix (after ``iqx:``).
        cache_empty: If True, cache empty list/dict responses too.
    """

    def decorator(func: Any) -> Any:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            from app.core.config import get_settings
            from app.services.cache.redis_cache import (
                build_cache_key,
                cache_get_json,
                cache_set_json,
            )

            settings = get_settings()

            # Skip if Redis is disabled
            if not settings.REDIS_ENABLED:
                return await func(*args, **kwargs)

            # Extract Request from kwargs (FastAPI injects it)
            request: Request | None = kwargs.get("request")
            if request is None:
                # Try to find Request in args
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if request is None:
                # No request object, can't build cache key
                return await func(*args, **kwargs)

            # Build cache key from path + query params
            path = request.url.path
            params = dict(request.query_params)
            cache_key = build_cache_key(prefix, path, params)
            ttl = getattr(settings, ttl_setting, settings.REDIS_DEFAULT_TTL_SECONDS)

            # Try cache hit
            cached = await cache_get_json(cache_key)
            if cached is not None:
                logger.debug("Cache HIT: %s", cache_key)
                # Return as JSONResponse to avoid re-serialization
                return JSONResponse(content=cached, headers={"X-Cache": "HIT"})

            # Cache miss — call the actual endpoint
            logger.debug("Cache MISS: %s", cache_key)
            result = await func(*args, **kwargs)

            # Only cache successful responses
            try:
                if isinstance(result, JSONResponse):
                    if 200 <= result.status_code < 300:
                        body = json.loads(result.body)
                        if cache_empty or _has_data(body):
                            await cache_set_json(cache_key, body, ttl)
                else:
                    # Pydantic model or dict — cache it
                    if hasattr(result, "model_dump"):
                        body = result.model_dump(mode="json")
                    elif isinstance(result, dict):
                        body = result
                    else:
                        # Can't serialize, skip caching
                        return result

                    if cache_empty or _has_data(body):
                        await cache_set_json(cache_key, body, ttl)
            except Exception:
                logger.warning("Cache SET failed for %s", cache_key, exc_info=True)

            return result

        return wrapper

    return decorator


def _has_data(body: Any) -> bool:
    """Check if response body has meaningful data (not empty)."""
    if isinstance(body, dict):
        data = body.get("data")
        if data is None:
            return bool(body)  # Non-empty dict is fine
        return not (isinstance(data, (list, dict)) and len(data) == 0)
    return body is not None
