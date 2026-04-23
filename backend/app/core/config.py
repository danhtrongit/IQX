"""Application configuration using pydantic-settings."""

from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "IQX Backend"
    app_version: str = "0.1.0"
    debug: bool = False

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Database
    database_url: str = "postgresql+asyncpg://localhost:5432/iqx"

    # JWT
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # SePay Payment Gateway
    sepay_merchant_id: str = ""
    sepay_secret_key: str = ""
    sepay_ipn_secret: str = ""
    sepay_env: str = "sandbox"  # sandbox | production

    # Explicit checkout URL — SePay docs have inconsistencies between
    # pgapi-sandbox.sepay.vn and pay-sandbox.sepay.vn for this endpoint.
    # Always configure via env to avoid hardcoding the wrong one.
    sepay_checkout_url: str = "https://pay-sandbox.sepay.vn/v1/checkout/init"

    # REST API base URL for order detail, cancel, void
    sepay_api_base_url: str = "https://pgapi-sandbox.sepay.vn"

    # Payment return URLs (frontend)
    payment_return_base_url: str = "http://localhost:3000"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sync_database_url(self) -> str:
        """Return sync database URL for Alembic migrations."""
        return self.database_url.replace("+asyncpg", "+psycopg2")


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()
