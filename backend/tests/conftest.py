"""Shared test fixtures."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, text

from app.core.config import get_settings
from app.models import Base

# Sync engine for setup/teardown (no event-loop dependency)
_settings = get_settings()
_sync_engine = create_engine(_settings.sync_database_url)


@pytest.fixture(scope="session", autouse=True)
def _setup_db():
    """Ensure tables exist before the test session."""
    Base.metadata.create_all(_sync_engine)
    yield


@pytest.fixture(autouse=True)
def _clean_tables():
    """Delete all user data and reset engine cache between tests."""
    yield
    with _sync_engine.connect() as conn:
        # FK-safe order: children first
        conn.execute(text("DELETE FROM payment_ipn_logs"))
        conn.execute(text("DELETE FROM subscriptions"))
        conn.execute(text("DELETE FROM payment_orders"))
        conn.execute(text("DELETE FROM users"))
        conn.execute(text("DELETE FROM plans"))
        conn.commit()
    # Clear the async engine cache so each test gets a fresh engine
    # bound to its own event loop
    from app.core.database import _get_engine, _get_session_factory

    _get_engine.cache_clear()
    _get_session_factory.cache_clear()


@pytest.fixture
async def client() -> AsyncClient:
    """Yield an async HTTP client bound to the FastAPI app."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

TEST_USER = {
    "email": "test@example.com",
    "username": "testuser",
    "password": "StrongPass123!",
    "full_name": "Test User",
}

ADMIN_USER = {
    "email": "admin@example.com",
    "username": "adminuser",
    "password": "AdminPass123!",
    "full_name": "Admin User",
}


async def register_user(client: AsyncClient, data: dict | None = None) -> dict:
    """Register a user and return the response JSON."""
    payload = data or TEST_USER
    resp = await client.post("/api/v1/auth/register", json=payload)
    return resp.json()


async def login_user(client: AsyncClient, email: str, password: str) -> dict:
    """Login and return the token response JSON."""
    resp = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    return resp.json()


async def get_auth_header(
    client: AsyncClient, data: dict | None = None
) -> dict[str, str]:
    """Register + login a user, return Authorization header dict."""
    payload = data or TEST_USER
    await register_user(client, payload)
    tokens = await login_user(client, payload["email"], payload["password"])
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_admin(client: AsyncClient) -> dict[str, str]:
    """Register a user, promote to admin via sync DB, return auth header."""
    await register_user(client, ADMIN_USER)
    with _sync_engine.connect() as conn:
        conn.execute(
            text(
                "UPDATE users SET role = 'admin', is_superuser = true "
                "WHERE email = :email"
            ),
            {"email": ADMIN_USER["email"]},
        )
        conn.commit()
    tokens = await login_user(client, ADMIN_USER["email"], ADMIN_USER["password"])
    return {"Authorization": f"Bearer {tokens['access_token']}"}
