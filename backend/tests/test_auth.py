"""Tests for authentication endpoints."""

import pytest
from httpx import AsyncClient

from tests.conftest import (
    TEST_USER,
    get_auth_header,
    login_user,
    register_user,
)

# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient) -> None:
    """POST /api/v1/auth/register creates a new user."""
    resp = await client.post("/api/v1/auth/register", json=TEST_USER)
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == TEST_USER["email"]
    assert data["username"] == TEST_USER["username"]
    assert "hashed_password" not in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient) -> None:
    """Cannot register with an already-used email."""
    await register_user(client)
    resp = await client.post("/api/v1/auth/register", json=TEST_USER)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_duplicate_username(client: AsyncClient) -> None:
    """Cannot register with an already-used username."""
    await register_user(client)
    dup = {**TEST_USER, "email": "other@example.com"}
    resp = await client.post("/api/v1/auth/register", json=dup)
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient) -> None:
    """POST /api/v1/auth/login returns token pair."""
    await register_user(client)
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": TEST_USER["email"], "password": TEST_USER["password"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient) -> None:
    """Login with wrong password returns 401."""
    await register_user(client)
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": TEST_USER["email"], "password": "wrongpassword"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_email(client: AsyncClient) -> None:
    """Login with unknown email returns 401."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "noone@example.com", "password": "anything"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_me(client: AsyncClient) -> None:
    """GET /api/v1/auth/me returns the authenticated user."""
    headers = await get_auth_header(client)
    resp = await client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == TEST_USER["email"]
    assert data["role"] == "member"


@pytest.mark.asyncio
async def test_get_me_no_token(client: AsyncClient) -> None:
    """GET /api/v1/auth/me without token returns 401."""
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient) -> None:
    """POST /api/v1/auth/refresh returns a new token pair."""
    await register_user(client)
    tokens = await login_user(client, TEST_USER["email"], TEST_USER["password"])
    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_refresh_with_access_token_fails(client: AsyncClient) -> None:
    """Using an access token as refresh token should fail."""
    await register_user(client)
    tokens = await login_user(client, TEST_USER["email"], TEST_USER["password"])
    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["access_token"]},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Change password
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_change_password(client: AsyncClient) -> None:
    """POST /api/v1/auth/change-password succeeds with correct current password."""
    headers = await get_auth_header(client)
    resp = await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": TEST_USER["password"],
            "new_password": "NewStrong456!",
        },
        headers=headers,
    )
    assert resp.status_code == 204

    # Old password should no longer work
    resp2 = await client.post(
        "/api/v1/auth/login",
        json={"email": TEST_USER["email"], "password": TEST_USER["password"]},
    )
    assert resp2.status_code == 401

    # New password should work
    resp3 = await client.post(
        "/api/v1/auth/login",
        json={"email": TEST_USER["email"], "password": "NewStrong456!"},
    )
    assert resp3.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_current(client: AsyncClient) -> None:
    """Change password with wrong current password returns 400."""
    headers = await get_auth_header(client)
    resp = await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "wrongpassword",
            "new_password": "NewStrong456!",
        },
        headers=headers,
    )
    assert resp.status_code == 400
