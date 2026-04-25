"""Application configuration via pydantic-settings.

All settings are loaded from environment variables (or a `.env` file).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


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


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
