"""Tests for user management endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.models.user import User
from tests.conftest import get_auth_headers


# ── Helper to get admin token ────────────────────────
async def _admin_token(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "Admin@1234"},
    )
    return resp.json()["access_token"]


async def _user_token(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "Test@1234"},
    )
    return resp.json()["access_token"]


# ── Self-profile tests ──────────────────────────────
@pytest.mark.asyncio
async def test_get_own_profile(client: AsyncClient, test_user: User):
    token = await _user_token(client)
    response = await client.get(
        "/api/v1/users/me",
        headers=get_auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "hashed_password" not in data


@pytest.mark.asyncio
async def test_update_own_profile(client: AsyncClient, test_user: User):
    token = await _user_token(client)
    response = await client.patch(
        "/api/v1/users/me",
        headers=get_auth_headers(token),
        json={"first_name": "Updated", "city": "Ho Chi Minh"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["first_name"] == "Updated"
    assert data["city"] == "Ho Chi Minh"


# ── Admin: List users ───────────────────────────────
@pytest.mark.asyncio
async def test_admin_list_users(client: AsyncClient, admin_user: User, test_user: User):
    token = await _admin_token(client)
    response = await client.get(
        "/api/v1/users/",
        headers=get_auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 2  # at least admin + test user


@pytest.mark.asyncio
async def test_non_admin_cannot_list_users(client: AsyncClient, test_user: User):
    token = await _user_token(client)
    response = await client.get(
        "/api/v1/users/",
        headers=get_auth_headers(token),
    )
    assert response.status_code == 403


# ── Admin: Get user by ID ───────────────────────────
@pytest.mark.asyncio
async def test_admin_get_user_by_id(client: AsyncClient, admin_user: User, test_user: User):
    token = await _admin_token(client)
    response = await client.get(
        f"/api/v1/users/{test_user.id}",
        headers=get_auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"


# ── Admin: Create user ──────────────────────────────
@pytest.mark.asyncio
async def test_admin_create_user(client: AsyncClient, admin_user: User):
    token = await _admin_token(client)
    response = await client.post(
        "/api/v1/users/",
        headers=get_auth_headers(token),
        json={
            "email": "created@example.com",
            "password": "Created@1234",
            "first_name": "Created",
            "last_name": "User",
            "role": "user",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "created@example.com"


# ── Admin: Update user ──────────────────────────────
@pytest.mark.asyncio
async def test_admin_update_user(client: AsyncClient, admin_user: User, test_user: User):
    token = await _admin_token(client)
    response = await client.patch(
        f"/api/v1/users/{test_user.id}",
        headers=get_auth_headers(token),
        json={"status": "suspended"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "suspended"


# ── Admin: Soft-delete user ─────────────────────────
@pytest.mark.asyncio
async def test_admin_delete_user(client: AsyncClient, admin_user: User, test_user: User):
    token = await _admin_token(client)
    response = await client.delete(
        f"/api/v1/users/{test_user.id}",
        headers=get_auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "User deleted successfully"


# ── Admin: List with filtering ───────────────────────
@pytest.mark.asyncio
async def test_admin_list_users_with_search(client: AsyncClient, admin_user: User, test_user: User):
    token = await _admin_token(client)
    response = await client.get(
        "/api/v1/users/?search=test&sort_by=email&sort_order=asc",
        headers=get_auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_admin_list_users_with_role_filter(client: AsyncClient, admin_user: User, test_user: User):
    token = await _admin_token(client)
    response = await client.get(
        "/api/v1/users/?role=admin",
        headers=get_auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    for item in data["items"]:
        assert item["role"] == "admin"


@pytest.mark.asyncio
async def test_patch_can_clear_nullable_fields(client: AsyncClient, test_user: User):
    """PATCH with null values should clear nullable fields."""
    token = await _user_token(client)

    # First set a city
    await client.patch(
        "/api/v1/users/me",
        headers=get_auth_headers(token),
        json={"city": "Ho Chi Minh"},
    )

    # Now clear it
    response = await client.patch(
        "/api/v1/users/me",
        headers=get_auth_headers(token),
        json={"city": None},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["city"] is None


@pytest.mark.asyncio
async def test_invalid_sort_by_returns_422(client: AsyncClient, admin_user: User):
    """sort_by with invalid column name should return 422, not 500."""
    token = await _admin_token(client)
    response = await client.get(
        "/api/v1/users/?sort_by=full_name",
        headers=get_auth_headers(token),
    )
    assert response.status_code == 422
