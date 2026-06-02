"""Tests for T35: Request-ID middleware.

Verifies that:
- Every response carries an X-Request-ID header.
- A client-supplied X-Request-ID is echoed back unchanged.
- Admin mutations produce audit rows whose request_id matches the header.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.admin_audit import AdminAuditLog
from app.models.user import User, UserRole, UserStatus

pytestmark = pytest.mark.asyncio


# ── helpers ───────────────────────────────────────────────────────────────────


async def _make_admin(db: AsyncSession) -> tuple[User, dict[str, str]]:
    user = User(
        email=f"adm-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Adm@1234"),
        full_name="Adm In".strip(),
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    return user, {"Authorization": f"Bearer {token}"}


async def _make_target_user(db: AsyncSession) -> User:
    user = User(
        email=f"target-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Target@1234"),
        full_name="Target User".strip(),
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ── tests ──────────────────────────────────────────────────────────────────────


async def test_login_response_has_request_id_header(client: AsyncClient, db_session: AsyncSession):
    """POST /auth/login → response must carry X-Request-ID header."""
    # Seed a user for login
    user = User(
        email="rid-login@example.com",
        hashed_password=hash_password("Login@1234"),
        full_name="RID Test".strip(),
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "rid-login@example.com", "password": "Login@1234"},
    )
    assert resp.status_code == 200
    assert "x-request-id" in resp.headers
    # The value must be a non-empty string (UUID4 or client-supplied)
    assert len(resp.headers["x-request-id"]) > 0


async def test_login_echoes_client_request_id(client: AsyncClient, db_session: AsyncSession):
    """Client-supplied X-Request-ID header must be echoed back in response."""
    user = User(
        email="rid-echo@example.com",
        hashed_password=hash_password("Login@1234"),
        full_name="RID Echo".strip(),
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()

    custom_id = "my-test-123"
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "rid-echo@example.com", "password": "Login@1234"},
        headers={"X-Request-ID": custom_id},
    )
    assert resp.status_code == 200
    assert resp.headers.get("x-request-id") == custom_id


async def test_non_login_endpoint_has_request_id_header(client: AsyncClient):
    """Any response (even 404) should carry X-Request-ID from the middleware."""
    resp = await client.get("/api/v1/health")
    # health may return 200 or any status — the key thing is the header
    assert "x-request-id" in resp.headers
    assert len(resp.headers["x-request-id"]) > 0


async def test_admin_mutation_audit_row_has_request_id(
    production_client: AsyncClient,
    fresh_session: AsyncSession,
):
    """Admin mutation should produce an audit row whose request_id matches X-Request-ID.

    Uses production_client exclusively so both the seed writes and the mutation
    all go through the same committed session pool — visible to fresh_session.
    """
    # Seed via the API so rows are committed and visible across sessions.
    # Register admin user
    admin_email = f"adm-{uuid.uuid4().hex[:6]}@example.com"
    admin_password = "Adm@Req1234"
    reg_resp = await production_client.post(
        "/api/v1/auth/register",
        json={
            "email": admin_email,
            "password": admin_password,
            "full_name": "Adm In".strip(),
        },
    )
    assert reg_resp.status_code == 201
    admin_id = reg_resp.json()["id"]

    # Promote to admin directly via DB
    from app.models.user import UserRole
    from sqlalchemy import update as _update

    await fresh_session.execute(
        _update(User)
        .where(User.id == uuid.UUID(admin_id))
        .values(role=UserRole.ADMIN)
    )
    await fresh_session.commit()

    # Login to get token
    login_resp = await production_client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": admin_password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # Register target user
    target_email = f"target-{uuid.uuid4().hex[:6]}@example.com"
    target_resp = await production_client.post(
        "/api/v1/auth/register",
        json={
            "email": target_email,
            "password": "Target@1234",
            "full_name": "Target User".strip(),
        },
    )
    assert target_resp.status_code == 201
    target_id = target_resp.json()["id"]

    custom_req_id = f"audit-test-{uuid.uuid4().hex[:8]}"
    headers = {**auth_headers, "X-Request-ID": custom_req_id}

    # Trigger an admin mutation: reset password (no body needed), which produces an audit row
    resp = await production_client.post(
        f"/api/v1/admin/users/{target_id}/reset-password",
        headers=headers,
    )
    assert resp.status_code in (200, 201)
    # Response header must echo our request ID
    assert resp.headers.get("x-request-id") == custom_req_id

    # Verify audit row captured the request_id
    result = await fresh_session.execute(
        select(AdminAuditLog).where(AdminAuditLog.action == "user.password_reset")
    )
    rows = result.scalars().all()
    assert len(rows) >= 1
    audit_row = rows[-1]
    assert audit_row.request_id == custom_req_id
