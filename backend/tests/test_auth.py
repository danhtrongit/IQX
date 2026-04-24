"""Tests for authentication endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.models.user import User
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    """Registration with valid data should return 201 and user details."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "newuser@example.com",
            "password": "Str0ng@Pass",
            "first_name": "New",
            "last_name": "User",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["first_name"] == "New"
    assert data["last_name"] == "User"
    assert data["role"] == "user"
    assert data["status"] == "active"
    assert "id" in data
    # Password hash must NOT be in response
    assert "hashed_password" not in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient, test_user: User):
    """Registering with an existing email should return 409."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "test@example.com",
            "password": "Str0ng@Pass",
            "first_name": "Dup",
            "last_name": "User",
        },
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_register_weak_password(client: AsyncClient):
    """Registration with a weak password should fail validation."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "weak@example.com",
            "password": "weak",
            "first_name": "Weak",
            "last_name": "Pass",
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_user: User):
    """Login with correct credentials should return tokens."""
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "test@example.com",
            "password": "Test@1234",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, test_user: User):
    """Login with wrong password should return 401."""
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "test@example.com",
            "password": "Wrong@Pass1",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(client: AsyncClient):
    """Login with non-existent email should return 401."""
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "nobody@example.com",
            "password": "Test@1234",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user(client: AsyncClient, test_user: User):
    """GET /auth/me should return current user's profile."""
    # Login first
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "Test@1234"},
    )
    token = login_resp.json()["access_token"]

    response = await client.get(
        "/api/v1/auth/me",
        headers=get_auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "hashed_password" not in data


@pytest.mark.asyncio
async def test_get_me_without_token(client: AsyncClient):
    """GET /auth/me without a token should return 401."""
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, test_user: User):
    """Refresh endpoint should return a new token pair."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "Test@1234"},
    )
    refresh_token = login_resp.json()["refresh_token"]

    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_refresh_token_invalid(client: AsyncClient):
    """Refresh with an invalid token should return 401."""
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": "invalid-token"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_rotation_revokes_old(client: AsyncClient, test_user: User):
    """After refresh, the old refresh token should be revoked and rejected."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "Test@1234"},
    )
    old_refresh = login_resp.json()["refresh_token"]

    # Use the refresh token
    refresh_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_refresh},
    )
    assert refresh_resp.status_code == 200

    # Try to reuse the old refresh token (replay attack)
    replay_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_refresh},
    )
    assert replay_resp.status_code == 401


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, test_user: User):
    """Logout should revoke all refresh tokens."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "Test@1234"},
    )
    tokens = login_resp.json()
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    # Logout
    logout_resp = await client.post(
        "/api/v1/auth/logout",
        headers=get_auth_headers(access_token),
    )
    assert logout_resp.status_code == 200
    assert logout_resp.json()["message"] == "Successfully logged out"

    # Refresh token should now be revoked
    refresh_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_resp.status_code == 401


@pytest.mark.asyncio
async def test_deleted_user_token_returns_401(client: AsyncClient, admin_user: User, test_user: User):
    """A token from a deleted user should return 401 (not 404)."""
    # Login as test user
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "Test@1234"},
    )
    user_token = login_resp.json()["access_token"]

    # Admin deletes the test user
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "Admin@1234"},
    )
    admin_token = admin_login.json()["access_token"]

    delete_resp = await client.delete(
        f"/api/v1/users/{test_user.id}",
        headers=get_auth_headers(admin_token),
    )
    assert delete_resp.status_code == 200

    # Now try to use the deleted user's token — should get auth error, not 404
    me_resp = await client.get(
        "/api/v1/auth/me",
        headers=get_auth_headers(user_token),
    )
    assert me_resp.status_code in (401, 403)
    assert "hashed_password" not in me_resp.text
