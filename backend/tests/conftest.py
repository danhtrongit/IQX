"""Shared test fixtures — in-memory SQLite async database for isolated tests."""

from __future__ import annotations

import os

# ── Override settings BEFORE any app imports ────────
os.environ.update(
    {
        "DATABASE_URL": "sqlite+aiosqlite:///",
        "JWT_SECRET_KEY": "test-secret-key-for-jwt-access-tokens",
        "JWT_REFRESH_SECRET_KEY": "test-secret-key-for-jwt-refresh-tokens",
        "APP_ENV": "testing",
        "DEBUG": "false",
        "CORS_ORIGINS": "http://localhost:3000",
        "SEPAY_MERCHANT_ID": "TEST_MERCHANT",
        "SEPAY_SECRET_KEY": "test-sepay-secret-key",
        "SEPAY_CHECKOUT_URL": "https://pay-sandbox.sepay.vn/v1/checkout/init",
        "APP_PUBLIC_URL": "http://localhost:3000",
        "AI_PROXY_BASE_URL": "http://test-ai-proxy:9999/v1",
        "AI_PROXY_MODEL": "test-model",
        "AI_PROXY_API_KEY": "test-api-key-not-real",
        "REDIS_ENABLED": "false",
    }
)

from collections.abc import AsyncGenerator  # noqa: E402

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402

# Clear cached settings so test env vars take effect
from app.core.config import get_settings  # noqa: E402

get_settings.cache_clear()

from app.core.database import Base, get_db  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User, UserRole, UserStatus  # noqa: E402

# ── Test database engine ─────────────────────────────
TEST_DATABASE_URL = "sqlite+aiosqlite://"
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    """Create all tables before each test, drop after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a test database session."""
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """HTTP test client with overridden DB dependency."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def production_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """HTTP test client using production-like commit/rollback lifecycle.

    Unlike the default ``client`` which shares a single session (bypassing
    commit), this fixture gives each request its own session from the
    test session factory, with real commit/rollback — matching production
    ``get_db`` behaviour.
    """

    async def production_get_db():
        async with TestSessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = production_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def fresh_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a completely independent session for read-back verification.

    Data committed by ``production_client`` can be verified here to prove
    it survived the full commit cycle.
    """
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a standard test user."""
    user = User(
        email="test@example.com",
        hashed_password=hash_password("Test@1234"),
        first_name="Test",
        last_name="User",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> User:
    """Create an admin test user."""
    user = User(
        email="admin@example.com",
        hashed_password=hash_password("Admin@1234"),
        first_name="Admin",
        last_name="User",
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


def get_auth_headers(token: str) -> dict[str, str]:
    """Build authorization headers for requests."""
    return {"Authorization": f"Bearer {token}"}
