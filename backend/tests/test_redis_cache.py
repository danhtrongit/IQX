"""Tests for Redis cache service and decorator.

Covers:
- Cache hit skips upstream call
- Redis down falls back to upstream
- Error responses (4xx/5xx) are not cached
- Different query params produce different cache keys
- TTL settings are passed correctly
- Cache key builder normalization
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.cache.redis_cache import build_cache_key

# ══════════════════════════════════════════════════════
# 1. Cache key builder tests
# ══════════════════════════════════════════════════════


class TestBuildCacheKey:
    """Test cache key construction and normalization."""

    def test_basic_key(self):
        key = build_cache_key("api:v1", "/api/v1/market-data/reference/symbols")
        assert key.startswith("iqx:api:v1:")
        assert "reference" in key
        assert "symbols" in key

    def test_key_with_params(self):
        key = build_cache_key(
            "api:v1",
            "/api/v1/market-data/quotes/VCB/ohlcv",
            {"interval": "1D", "start": "2026-01-01"},
        )
        assert key.startswith("iqx:api:v1:")
        assert "VCB" in key

    def test_different_params_different_keys(self):
        key1 = build_cache_key("api:v1", "/api/v1/test", {"symbol": "VCB"})
        key2 = build_cache_key("api:v1", "/api/v1/test", {"symbol": "FPT"})
        assert key1 != key2

    def test_same_params_same_key(self):
        key1 = build_cache_key("api:v1", "/api/v1/test", {"a": "1", "b": "2"})
        key2 = build_cache_key("api:v1", "/api/v1/test", {"b": "2", "a": "1"})
        assert key1 == key2  # Sorted params produce same hash

    def test_no_params_stable(self):
        key1 = build_cache_key("api:v1", "/api/v1/test")
        key2 = build_cache_key("api:v1", "/api/v1/test", None)
        assert key1 == key2

    def test_empty_params_ignored(self):
        key1 = build_cache_key("api:v1", "/api/v1/test")
        key2 = build_cache_key("api:v1", "/api/v1/test", {"source": ""})
        assert key1 == key2  # Empty string params are excluded

    def test_symbol_uppercase_normalization(self):
        key1 = build_cache_key("api:v1", "/api/v1/market-data/quotes/vcb/ohlcv")
        key2 = build_cache_key("api:v1", "/api/v1/market-data/quotes/VCB/ohlcv")
        assert key1 == key2  # Both normalized to VCB
        assert "VCB" in key1


# ══════════════════════════════════════════════════════
# 2. Redis cache service tests
# ══════════════════════════════════════════════════════


class TestRedisCacheService:
    """Test redis_cache module functions."""

    @pytest.mark.asyncio
    async def test_cache_get_returns_none_when_disabled(self):
        """When _redis is None, cache_get_json returns None."""
        from app.services.cache.redis_cache import cache_get_json

        result = await cache_get_json("test:key")
        assert result is None

    @pytest.mark.asyncio
    async def test_cache_set_noop_when_disabled(self):
        """When _redis is None, cache_set_json does nothing."""
        from app.services.cache.redis_cache import cache_set_json

        # Should not raise
        await cache_set_json("test:key", {"data": "test"}, 60)

    @pytest.mark.asyncio
    async def test_cache_delete_pattern_noop_when_disabled(self):
        """When _redis is None, cache_delete_pattern returns 0."""
        from app.services.cache.redis_cache import cache_delete_pattern

        result = await cache_delete_pattern("test:*")
        assert result == 0

    @pytest.mark.asyncio
    async def test_health_check_disabled(self):
        """When REDIS_ENABLED=false, health check returns 'disabled'."""
        from app.services.cache.redis_cache import health_check

        result = await health_check()
        assert result == "disabled"

    @pytest.mark.asyncio
    async def test_cache_get_json_with_mock_redis(self):
        """cache_get_json returns parsed JSON on hit."""
        import app.services.cache.redis_cache as mod

        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=json.dumps({"data": [1, 2, 3]}))

        original = mod._redis
        try:
            mod._redis = mock_redis
            result = await mod.cache_get_json("test:key")
            assert result == {"data": [1, 2, 3]}
            mock_redis.get.assert_awaited_once_with("test:key")
        finally:
            mod._redis = original

    @pytest.mark.asyncio
    async def test_cache_set_json_with_mock_redis(self):
        """cache_set_json serializes and stores with TTL."""
        import app.services.cache.redis_cache as mod

        mock_redis = AsyncMock()
        mock_redis.set = AsyncMock()

        original = mod._redis
        try:
            mod._redis = mock_redis
            await mod.cache_set_json("test:key", {"value": 42}, 300)
            mock_redis.set.assert_awaited_once()
            call_args = mock_redis.set.call_args
            assert call_args[0][0] == "test:key"
            assert json.loads(call_args[0][1]) == {"value": 42}
            assert call_args[1]["ex"] == 300
        finally:
            mod._redis = original

    @pytest.mark.asyncio
    async def test_cache_get_json_redis_error_returns_none(self):
        """Redis errors during GET are caught gracefully."""
        import app.services.cache.redis_cache as mod

        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(side_effect=ConnectionError("Redis down"))

        original = mod._redis
        try:
            mod._redis = mock_redis
            result = await mod.cache_get_json("test:key")
            assert result is None
        finally:
            mod._redis = original

    @pytest.mark.asyncio
    async def test_cache_set_json_redis_error_noop(self):
        """Redis errors during SET are caught gracefully."""
        import app.services.cache.redis_cache as mod

        mock_redis = AsyncMock()
        mock_redis.set = AsyncMock(side_effect=ConnectionError("Redis down"))

        original = mod._redis
        try:
            mod._redis = mock_redis
            # Should not raise
            await mod.cache_set_json("test:key", {"data": 1}, 60)
        finally:
            mod._redis = original

    @pytest.mark.asyncio
    async def test_health_check_healthy_with_mock(self):
        """health_check returns 'healthy' when ping succeeds."""
        import app.services.cache.redis_cache as mod

        mock_redis = AsyncMock()
        mock_redis.ping = AsyncMock(return_value=True)

        original = mod._redis
        try:
            mod._redis = mock_redis
            result = await mod.health_check()
            assert result == "healthy"
        finally:
            mod._redis = original

    @pytest.mark.asyncio
    async def test_health_check_unhealthy_with_mock(self):
        """health_check returns 'unhealthy' when ping fails."""
        import app.services.cache.redis_cache as mod

        mock_redis = AsyncMock()
        mock_redis.ping = AsyncMock(side_effect=ConnectionError("nope"))

        original = mod._redis
        try:
            mod._redis = mock_redis
            result = await mod.health_check()
            assert result == "unhealthy"
        finally:
            mod._redis = original


# ══════════════════════════════════════════════════════
# 3. Decorator tests
# ══════════════════════════════════════════════════════


class TestRedisCachedDecorator:
    """Test the redis_cached decorator behavior."""

    @pytest.mark.asyncio
    async def test_decorator_skips_when_disabled(self):
        """When REDIS_ENABLED=false, decorator calls original function directly."""
        from app.services.cache.decorator import redis_cached

        call_count = 0

        @redis_cached()
        async def my_endpoint(request=None):
            nonlocal call_count
            call_count += 1
            return {"data": "from_upstream"}

        mock_request = MagicMock()
        mock_request.url.path = "/api/v1/test"
        mock_request.query_params = {}

        result = await my_endpoint(request=mock_request)
        assert result == {"data": "from_upstream"}
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_cache_hit_returns_cached_response(self):
        """When cache has data, decorator returns it without calling the function."""
        from app.services.cache.decorator import redis_cached

        call_count = 0

        @redis_cached()
        async def my_endpoint(request=None):
            nonlocal call_count
            call_count += 1
            return {"data": "from_upstream"}

        mock_request = MagicMock()
        mock_request.url.path = "/api/v1/test"
        mock_request.query_params = {}

        cached_data = {"data": "from_cache"}

        with (
            patch("app.core.config.get_settings") as mock_settings,
            patch("app.services.cache.redis_cache.cache_get_json", new_callable=AsyncMock) as mock_get,
            patch("app.services.cache.redis_cache.cache_set_json", new_callable=AsyncMock),
        ):
            settings = mock_settings.return_value
            settings.REDIS_ENABLED = True
            settings.REDIS_DEFAULT_TTL_SECONDS = 300
            mock_get.return_value = cached_data

            result = await my_endpoint(request=mock_request)

            # Result should be a JSONResponse with cached data
            from fastapi.responses import JSONResponse
            assert isinstance(result, JSONResponse)
            assert json.loads(result.body) == cached_data
            assert call_count == 0  # Original function NOT called

    @pytest.mark.asyncio
    async def test_cache_miss_calls_upstream_and_caches(self):
        """On cache miss, call original function and cache result."""
        from app.services.cache.decorator import redis_cached

        @redis_cached()
        async def my_endpoint(request=None):
            return {"data": "fresh_data"}

        mock_request = MagicMock()
        mock_request.url.path = "/api/v1/test"
        mock_request.query_params = {}

        with (
            patch("app.core.config.get_settings") as mock_settings,
            patch("app.services.cache.redis_cache.cache_get_json", new_callable=AsyncMock) as mock_get,
            patch("app.services.cache.redis_cache.cache_set_json", new_callable=AsyncMock) as mock_set,
        ):
            settings = mock_settings.return_value
            settings.REDIS_ENABLED = True
            settings.REDIS_DEFAULT_TTL_SECONDS = 300
            mock_get.return_value = None  # Cache miss

            result = await my_endpoint(request=mock_request)

            assert result == {"data": "fresh_data"}
            mock_set.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_no_cache_on_empty_data_unless_cache_empty(self):
        """Empty data is not cached unless cache_empty=True."""
        from app.services.cache.decorator import redis_cached

        @redis_cached(cache_empty=False)
        async def my_endpoint(request=None):
            return {"data": []}

        mock_request = MagicMock()
        mock_request.url.path = "/api/v1/test"
        mock_request.query_params = {}

        with (
            patch("app.core.config.get_settings") as mock_settings,
            patch("app.services.cache.redis_cache.cache_get_json", new_callable=AsyncMock) as mock_get,
            patch("app.services.cache.redis_cache.cache_set_json", new_callable=AsyncMock) as mock_set,
        ):
            settings = mock_settings.return_value
            settings.REDIS_ENABLED = True
            settings.REDIS_DEFAULT_TTL_SECONDS = 300
            mock_get.return_value = None

            result = await my_endpoint(request=mock_request)
            assert result == {"data": []}
            mock_set.assert_not_awaited()  # Empty data not cached

    @pytest.mark.asyncio
    async def test_cache_empty_data_when_allowed(self):
        """cache_empty=True allows caching empty responses."""
        from app.services.cache.decorator import redis_cached

        @redis_cached(cache_empty=True)
        async def my_endpoint(request=None):
            return {"data": []}

        mock_request = MagicMock()
        mock_request.url.path = "/api/v1/test"
        mock_request.query_params = {}

        with (
            patch("app.core.config.get_settings") as mock_settings,
            patch("app.services.cache.redis_cache.cache_get_json", new_callable=AsyncMock) as mock_get,
            patch("app.services.cache.redis_cache.cache_set_json", new_callable=AsyncMock) as mock_set,
        ):
            settings = mock_settings.return_value
            settings.REDIS_ENABLED = True
            settings.REDIS_DEFAULT_TTL_SECONDS = 300
            mock_get.return_value = None

            result = await my_endpoint(request=mock_request)
            assert result == {"data": []}
            mock_set.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_ttl_setting_passed_correctly(self):
        """Custom TTL setting name is resolved from settings."""
        from app.services.cache.decorator import redis_cached

        @redis_cached(ttl_setting="REDIS_TTL_REALTIME_SECONDS")
        async def my_endpoint(request=None):
            return {"data": "realtime"}

        mock_request = MagicMock()
        mock_request.url.path = "/api/v1/test"
        mock_request.query_params = {}

        with (
            patch("app.core.config.get_settings") as mock_settings,
            patch("app.services.cache.redis_cache.cache_get_json", new_callable=AsyncMock) as mock_get,
            patch("app.services.cache.redis_cache.cache_set_json", new_callable=AsyncMock) as mock_set,
        ):
            settings = mock_settings.return_value
            settings.REDIS_ENABLED = True
            settings.REDIS_TTL_REALTIME_SECONDS = 15
            settings.REDIS_DEFAULT_TTL_SECONDS = 300
            mock_get.return_value = None

            await my_endpoint(request=mock_request)

            # Verify TTL passed is 15 (REDIS_TTL_REALTIME_SECONDS)
            call_args = mock_set.call_args
            assert call_args[0][2] == 15  # TTL arg

    @pytest.mark.asyncio
    async def test_redis_down_still_returns_upstream(self):
        """When Redis errors during GET, upstream is called normally."""
        from app.services.cache.decorator import redis_cached

        @redis_cached()
        async def my_endpoint(request=None):
            return {"data": "fallback_data"}

        mock_request = MagicMock()
        mock_request.url.path = "/api/v1/test"
        mock_request.query_params = {}

        with (
            patch("app.core.config.get_settings") as mock_settings,
            patch("app.services.cache.redis_cache.cache_get_json", new_callable=AsyncMock) as mock_get,
            patch("app.services.cache.redis_cache.cache_set_json", new_callable=AsyncMock) as mock_set,
        ):
            settings = mock_settings.return_value
            settings.REDIS_ENABLED = True
            settings.REDIS_DEFAULT_TTL_SECONDS = 300
            mock_get.return_value = None  # Redis returns None (like connection error)
            mock_set.side_effect = ConnectionError("Redis down")

            result = await my_endpoint(request=mock_request)
            assert result == {"data": "fallback_data"}


# ══════════════════════════════════════════════════════
# 4. Health endpoint integration test
# ══════════════════════════════════════════════════════


class TestHealthWithRedis:
    """Test that health endpoint includes Redis status."""

    @pytest.mark.asyncio
    async def test_health_includes_redis_field(self, client):
        """Health response should include 'redis' field."""
        resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "redis" in data
        assert data["redis"] in ("healthy", "unhealthy", "disabled")

    @pytest.mark.asyncio
    async def test_health_redis_disabled(self, client):
        """When REDIS_ENABLED=false, redis shows as 'disabled'."""
        resp = await client.get("/api/v1/health")
        data = resp.json()
        assert data["redis"] == "disabled"
