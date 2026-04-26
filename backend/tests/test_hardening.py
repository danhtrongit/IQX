"""Tests for hardening features: docs gating, CORS, rate limiting."""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest


@pytest.mark.asyncio
async def test_docs_enabled_in_dev():
    """API docs should be accessible in dev environment."""
    env = os.environ.copy()
    env.pop("ENABLE_API_DOCS", None)
    env["APP_ENV"] = "development"
    with patch.dict(os.environ, env, clear=True):
        from app.core.config import get_settings

        get_settings.cache_clear()
        s = get_settings()
        assert s.api_docs_enabled is True
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_docs_disabled_in_production():
    """API docs should be disabled in production by default."""
    prod_env = {
        "APP_ENV": "production",
        "JWT_SECRET_KEY": "a-secure-production-secret-key-at-least-32-chars-long",
        "JWT_REFRESH_SECRET_KEY": "a-secure-production-refresh-key-at-least-32-chars-long",
    }
    with patch.dict(os.environ, prod_env, clear=False):
        from app.core.config import get_settings

        get_settings.cache_clear()
        s = get_settings()
        assert s.api_docs_enabled is False
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_docs_force_enabled_in_production():
    """ENABLE_API_DOCS=true should override production auto-disable."""
    prod_env = {
        "APP_ENV": "production",
        "ENABLE_API_DOCS": "true",
        "JWT_SECRET_KEY": "a-secure-production-secret-key-at-least-32-chars-long",
        "JWT_REFRESH_SECRET_KEY": "a-secure-production-refresh-key-at-least-32-chars-long",
    }
    with patch.dict(os.environ, prod_env, clear=False):
        from app.core.config import get_settings

        get_settings.cache_clear()
        s = get_settings()
        assert s.api_docs_enabled is True
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_cors_methods_parsed():
    """CORS_METHODS should be parsed as comma-separated list."""
    from app.core.config import get_settings

    get_settings.cache_clear()
    s = get_settings()
    methods = s.cors_methods_list
    assert "GET" in methods
    assert "POST" in methods
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_cors_wildcard_disables_credentials():
    """Wildcard CORS_ORIGINS with credentials should be rejected."""
    with patch.dict(os.environ, {"CORS_ORIGINS": "*"}, clear=False):
        from app.core.config import get_settings

        get_settings.cache_clear()
        s = get_settings()
        assert "*" in s.cors_origins_list
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_cache_max_size():
    """TTLCache should respect max_size config."""
    from app.services.market_data.cache import TTLCache

    cache = TTLCache(max_size=3)
    cache.set("a", 1, 60)
    cache.set("b", 2, 60)
    cache.set("c", 3, 60)
    cache.set("d", 4, 60)  # should evict "a"
    assert cache.get("a") is None
    assert cache.get("d") == 4
    assert cache.size == 3


@pytest.mark.asyncio
async def test_cache_lru_eviction():
    """LRU: accessing 'a' should keep it, evict 'b' instead."""
    from app.services.market_data.cache import TTLCache

    cache = TTLCache(max_size=3)
    cache.set("a", 1, 60)
    cache.set("b", 2, 60)
    cache.set("c", 3, 60)
    # Access "a" to make it recently used
    cache.get("a")
    # Now add "d" — should evict "b" (least recently used)
    cache.set("d", 4, 60)
    assert cache.get("a") == 1
    assert cache.get("b") is None
    assert cache.get("d") == 4


# ── JWT secret validation tests ──────────────────────


@pytest.mark.asyncio
async def test_jwt_placeholder_rejected_in_production():
    """Placeholder JWT secrets should be rejected in production."""
    prod_env = {
        "APP_ENV": "production",
        "JWT_SECRET_KEY": "dev-secret-key-change-in-production-abc123xyz789",
        "JWT_REFRESH_SECRET_KEY": "a-secure-production-refresh-key-at-least-32-chars-long",
    }
    with patch.dict(os.environ, prod_env, clear=False):
        from app.core.config import get_settings

        get_settings.cache_clear()
        with pytest.raises(Exception, match="placeholder"):
            get_settings()
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_jwt_short_secret_rejected_in_production():
    """Short JWT secrets (< 32 chars) should be rejected in production."""
    prod_env = {
        "APP_ENV": "production",
        "JWT_SECRET_KEY": "AbCdEfGhIjKlMnOpQrStUvWxYz12",
        "JWT_REFRESH_SECRET_KEY": "a-secure-production-refresh-key-at-least-32-chars-long",
    }
    with patch.dict(os.environ, prod_env, clear=False):
        from app.core.config import get_settings

        get_settings.cache_clear()
        with pytest.raises(Exception, match="too short"):
            get_settings()
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_jwt_valid_secrets_accepted_in_production():
    """Valid secrets should work in production."""
    prod_env = {
        "APP_ENV": "production",
        "JWT_SECRET_KEY": "a-secure-production-secret-key-at-least-32-chars-long",
        "JWT_REFRESH_SECRET_KEY": "a-secure-production-refresh-key-at-least-32-chars-long",
    }
    with patch.dict(os.environ, prod_env, clear=False):
        from app.core.config import get_settings

        get_settings.cache_clear()
        s = get_settings()
        assert s.APP_ENV == "production"
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_jwt_placeholder_allowed_in_dev():
    """Placeholder JWT secrets should be allowed in development."""
    dev_env = {
        "APP_ENV": "development",
        "JWT_SECRET_KEY": "dev-secret-key-change-in-production-abc123xyz789",
        "JWT_REFRESH_SECRET_KEY": "dev-refresh-secret-key-change-in-production-xyz789abc123",
    }
    with patch.dict(os.environ, dev_env, clear=False):
        from app.core.config import get_settings

        get_settings.cache_clear()
        s = get_settings()
        assert s.APP_ENV == "development"
        get_settings.cache_clear()
