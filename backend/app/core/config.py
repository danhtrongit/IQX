"""Application configuration via pydantic-settings.

All settings are loaded from environment variables (or a `.env` file).
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Patterns that indicate a placeholder/default JWT secret
_PLACEHOLDER_PATTERNS = re.compile(
    r"change.in.production|changeme|replace.me|your.secret|CHANGE_ME|placeholder|"
    r"^dev-|^test-|^default-|^secret$|^changethis$",
    re.IGNORECASE,
)


class Settings(BaseSettings):
    """Central configuration for the IQX backend."""

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────
    APP_NAME: str = "IQX"
    APP_VERSION: str = "0.1.0"
    APP_ENV: str = "development"
    DEBUG: bool = False

    # ── Database ─────────────────────────────────────
    DATABASE_URL: str

    # ── JWT ───────────────────────────────────────────
    JWT_SECRET_KEY: str
    JWT_REFRESH_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── CORS ─────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:3000"
    CORS_METHODS: str = "GET,POST,PUT,DELETE,PATCH,OPTIONS"
    CORS_HEADERS: str = "Authorization,Content-Type,Accept"

    # ── API Docs ─────────────────────────────────────
    ENABLE_API_DOCS: bool | None = None  # None = auto (enabled in dev, disabled in prod)

    # ── SePay Payment Gateway ────────────────────────
    SEPAY_MERCHANT_ID: str = ""
    SEPAY_SECRET_KEY: str = ""
    SEPAY_CHECKOUT_URL: str = "https://pay-sandbox.sepay.vn/v1/checkout/init"
    APP_PUBLIC_URL: str = "http://localhost:3000"

    # ── Logging ──────────────────────────────────────
    LOG_LEVEL: str = "INFO"

    # ── Market Data ──────────────────────────────────
    MARKET_DATA_TIMEOUT_SECONDS: float = 15.0
    MARKET_DATA_CACHE_ENABLED: bool = True
    MARKET_DATA_CACHE_TTL_REFERENCE_SECONDS: int = 3600  # 1 hour
    MARKET_DATA_CACHE_TTL_REALTIME_SECONDS: int = 10
    MARKET_DATA_CACHE_TTL_HISTORY_SECONDS: int = 300  # 5 minutes
    MARKET_DATA_CACHE_MAX_SIZE: int = 1000

    # ── Rate Limiting ────────────────────────────────
    RATE_LIMIT_DEFAULT: str = "60/minute"
    RATE_LIMIT_AUTH: str = "10/minute"
    RATE_LIMIT_MARKET_DATA: str = "120/minute"

    # ── AI Proxy ─────────────────────────────────────
    AI_PROXY_BASE_URL: str = ""
    AI_PROXY_MODEL: str = "deepseek-v4-flash"
    AI_PROXY_API_KEY: str = ""
    AI_PROXY_TIMEOUT_SECONDS: float = 120.0

    # ── Symbol Seed ─────────────────────────────────
    SIMPLIZE_LOGO_BASE_URL: str = "https://cdn.simplize.vn/simplizevn/logo"

    # ── Redis ────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_ENABLED: bool = False
    REDIS_DEFAULT_TTL_SECONDS: int = 300        # 5 phút
    REDIS_TTL_REALTIME_SECONDS: int = 15        # intraday, price-board
    REDIS_TTL_REFERENCE_SECONDS: int = 3600     # symbols, industries
    REDIS_TTL_OVERVIEW_SECONDS: int = 30        # market overview
    REDIS_TTL_MACRO_SECONDS: int = 900          # macro, funds, company
    REDIS_TTL_NEWS_SECONDS: int = 300           # tin tức
    REDIS_TTL_AI_DASHBOARD_SECONDS: int = 60    # AI dashboard payload
    REDIS_TTL_AI_INDUSTRY_SECONDS: int = 600    # AI industry payload (per icb_code)
    REDIS_TTL_AI_ANALYSIS_SECONDS: int = 1800   # AI analysis result cache (30 phút)
    REDIS_TTL_SHEETS_SECONDS: int = 600         # Google Sheets data (10 phút)

    # ── Google Sheets ────────────────────────────────
    GOOGLE_SHEETS_API_KEY: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS as a comma-separated string into a list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def cors_methods_list(self) -> list[str]:
        return [m.strip() for m in self.CORS_METHODS.split(",") if m.strip()]

    @property
    def cors_headers_list(self) -> list[str]:
        return [h.strip() for h in self.CORS_HEADERS.split(",") if h.strip()]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def api_docs_enabled(self) -> bool:
        """Whether to expose /docs, /redoc, /openapi.json."""
        if self.ENABLE_API_DOCS is not None:
            return self.ENABLE_API_DOCS
        return not self.is_production

    @model_validator(mode="after")
    def _reject_placeholder_jwt_secrets(self) -> Settings:
        """Reject placeholder/default JWT secrets in production."""
        if self.APP_ENV != "production":
            return self
        for field_name in ("JWT_SECRET_KEY", "JWT_REFRESH_SECRET_KEY"):
            value = getattr(self, field_name)
            if _PLACEHOLDER_PATTERNS.search(value):
                raise ValueError(
                    f"{field_name} contains a placeholder value and must be "
                    f"changed before running in production (APP_ENV=production)."
                )
            if len(value) < 32:
                raise ValueError(
                    f"{field_name} is too short ({len(value)} chars). "
                    f"Use at least 32 characters in production."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
