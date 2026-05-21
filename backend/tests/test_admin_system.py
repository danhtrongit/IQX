"""Tests for admin system status + job trigger endpoints."""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole, UserStatus

pytestmark = pytest.mark.asyncio


# ── Helpers ───────────────────────────────────────────────────────────────


async def _create_admin(db: AsyncSession) -> tuple[User, dict[str, str]]:
    user = User(
        email=f"admin-sys-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Admin@1234"),
        first_name="Admin",
        last_name="Sys",
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    return user, {"Authorization": f"Bearer {token}"}


async def _create_regular_user(db: AsyncSession) -> tuple[User, dict[str, str]]:
    user = User(
        email=f"user-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("User@1234"),
        first_name="Regular",
        last_name="User",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    return user, {"Authorization": f"Bearer {token}"}


# ── Status endpoint ───────────────────────────────────────────────────────


async def test_get_status_returns_expected_shape(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """GET /admin/system/status returns SystemStatus shape."""
    _, headers = await _create_admin(db_session)
    resp = await client.get("/api/v1/admin/system/status", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert "version" in data
    assert "environment" in data
    assert isinstance(data["scheduler_running"], bool)
    assert isinstance(data["jobs"], list)
    assert isinstance(data["db_stats"], dict)
    assert "users" in data["db_stats"]
    assert "subscriptions" in data["db_stats"]
    assert "payment_orders" in data["db_stats"]
    assert "ipn_logs" in data["db_stats"]
    assert "audit_log" in data["db_stats"]
    assert "generated_at" in data


async def test_get_status_requires_admin(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Non-admin gets 403 on GET /admin/system/status."""
    _, headers = await _create_regular_user(db_session)
    resp = await client.get("/api/v1/admin/system/status", headers=headers)
    assert resp.status_code == 403


async def test_get_status_unauthenticated_returns_401(client: AsyncClient) -> None:
    """Unauthenticated request returns 401."""
    resp = await client.get("/api/v1/admin/system/status")
    assert resp.status_code == 401


# ── Job trigger endpoint ──────────────────────────────────────────────────


async def test_run_expiry_sweep_job(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST /admin/system/jobs/expiry_sweep/run succeeds and returns result."""
    _, headers = await _create_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/system/jobs/expiry_sweep/run", headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["job_id"] == "expiry_sweep"
    assert "result" in data
    assert "expired_count" in data["result"]
    assert "downgraded_count" in data["result"]
    assert "ran_at" in data


async def test_run_ipn_reconcile_job(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST /admin/system/jobs/ipn_reconcile_scan/run succeeds and returns result."""
    _, headers = await _create_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/system/jobs/ipn_reconcile_scan/run", headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["job_id"] == "ipn_reconcile_scan"
    assert "result" in data
    assert "attempted" in data["result"]
    assert "reconciled" in data["result"]
    assert "failed_old" in data["result"]


async def test_run_unknown_job_returns_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """POST /admin/system/jobs/nonexistent/run returns 404."""
    _, headers = await _create_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/system/jobs/nonexistent_job/run", headers=headers
    )
    assert resp.status_code == 404


async def test_run_job_requires_admin(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Non-admin gets 403 on job trigger."""
    _, headers = await _create_regular_user(db_session)
    resp = await client.post(
        "/api/v1/admin/system/jobs/expiry_sweep/run", headers=headers
    )
    assert resp.status_code == 403
