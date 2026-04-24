"""Application configuration using pydantic-settings.

Settings are loaded from environment variables and .env file.
"""

from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings.

    All values can be overridden via environment variables or a .env file
    located in the project root (backend/).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Application ──────────────────────────────────────────────
    app_name: str = "IQX API"
    app_version: str = "1.0.0"
    app_description: str = "IQX Backend API Service"
    debug: bool = False

    # ── Server ───────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000

    # ── Database ─────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://localhost:5432/iqx"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sync_database_url(self) -> str:
        """Return sync database URL for Alembic migrations."""
        return self.database_url.replace("+asyncpg", "+psycopg2")

    # ── JWT ───────────────────────────────────────────────────────
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (singleton)."""
    return Settings()
