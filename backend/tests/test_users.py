"""Tests for user management endpoints."""

import pytest
from httpx import AsyncClient

from tests.conftest import (
    TEST_USER,
    create_admin,
    get_auth_header,
    register_user,
)

# ---------------------------------------------------------------------------
# Admin: list users
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_list_users(client: AsyncClient) -> None:
    """Admin can list all users."""
    admin_headers = await create_admin(client)
    # Create a regular user too
    await register_user(client, TEST_USER)

    resp = await client.get("/api/v1/users", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 2
    assert len(data["items"]) >= 2


@pytest.mark.asyncio
async def test_regular_user_cannot_list_users(client: AsyncClient) -> None:
    """Regular user gets 403 when trying to list users."""
    headers = await get_auth_header(client)
    resp = await client.get("/api/v1/users", headers=headers)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Admin: get / update user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_get_user_by_id(client: AsyncClient) -> None:
    """Admin can fetch a user by ID."""
    admin_headers = await create_admin(client)
    user_data = await register_user(client, TEST_USER)
    user_id = user_data["id"]

    resp = await client.get(f"/api/v1/users/{user_id}", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == TEST_USER["email"]


@pytest.mark.asyncio
async def test_admin_deactivate_user(client: AsyncClient) -> None:
    """Admin can deactivate a user via PATCH."""
    admin_headers = await create_admin(client)
    user_data = await register_user(client, TEST_USER)
    user_id = user_data["id"]

    resp = await client.patch(
        f"/api/v1/users/{user_id}",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


# ---------------------------------------------------------------------------
# Self-service: update own profile
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_own_profile(client: AsyncClient) -> None:
    """User can update their own full_name."""
    headers = await get_auth_header(client)
    resp = await client.patch(
        "/api/v1/users/me",
        json={"full_name": "Updated Name"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Updated Name"


# ---------------------------------------------------------------------------
# Deactivated user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_deactivated_user_cannot_login(client: AsyncClient) -> None:
    """A deactivated user gets 403 on login."""
    admin_headers = await create_admin(client)
    user_data = await register_user(client, TEST_USER)
    user_id = user_data["id"]

    # Deactivate
    await client.patch(
        f"/api/v1/users/{user_id}",
        json={"is_active": False},
        headers=admin_headers,
    )

    # Try login
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": TEST_USER["email"], "password": TEST_USER["password"]},
    )
    assert resp.status_code == 403
