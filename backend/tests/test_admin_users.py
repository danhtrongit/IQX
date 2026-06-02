"""Tests for admin user endpoints (T18): 360, bulk, reset-pw, export, login history."""
from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.models.admin_audit import AdminAuditLog
from app.models.login_history import UserLoginHistory
from app.models.premium import (
    PremiumPaymentOrder,
    PremiumPlan,
    PremiumSubscription,
    SubscriptionStatus,
    PaymentOrderStatus,
)
from app.models.user import User, UserRole, UserStatus
from app.models.virtual_trading import AccountStatus, VirtualTradingAccount

pytestmark = pytest.mark.asyncio


# ── helpers ───────────────────────────────────────────────────────────────────


async def _admin_headers(db: AsyncSession) -> dict[str, str]:
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
    return {"Authorization": f"Bearer {token}"}


async def _seed_user(
    db: AsyncSession,
    role: UserRole = UserRole.USER,
    last_login_at: datetime | None = None,
) -> User:
    u = User(
        email=f"u-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Test@1234"),
        full_name="Test User".strip(),
        role=role,
        status=UserStatus.ACTIVE,
        last_login_at=last_login_at,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


async def _seed_plan(db: AsyncSession, code: str = "MONTHLY") -> PremiumPlan:
    plan = PremiumPlan(
        code=code,
        name=code,
        price_vnd=50_000,
        duration_days=30,
        is_active=True,
        sort_order=0,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def _seed_sub(
    db: AsyncSession,
    user: User,
    plan: PremiumPlan,
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
    days_ahead: int = 30,
) -> PremiumSubscription:
    now = datetime.now(UTC)
    sub = PremiumSubscription(
        user_id=user.id,
        current_plan_id=plan.id,
        current_period_start=now,
        current_period_end=now + timedelta(days=days_ahead),
        status=status,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


async def _seed_payment(
    db: AsyncSession,
    user: User,
    plan: PremiumPlan,
    status: PaymentOrderStatus = PaymentOrderStatus.PAID,
) -> PremiumPaymentOrder:
    order = PremiumPaymentOrder(
        invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
        user_id=user.id,
        plan_id=plan.id,
        amount_vnd=50_000,
        status=status,
        paid_at=datetime.now(UTC) if status == PaymentOrderStatus.PAID else None,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


async def _seed_vt_account(db: AsyncSession, user: User) -> VirtualTradingAccount:
    now = datetime.now(UTC)
    acc = VirtualTradingAccount(
        user_id=user.id,
        status=AccountStatus.ACTIVE,
        initial_cash_vnd=1_000_000_000,
        cash_available_vnd=1_000_000_000,
        cash_reserved_vnd=0,
        cash_pending_vnd=0,
        activated_at=now,
    )
    db.add(acc)
    await db.commit()
    await db.refresh(acc)
    return acc


async def _seed_login_history(
    db: AsyncSession,
    user: User,
    count: int = 3,
) -> list[UserLoginHistory]:
    rows = []
    now = datetime.now(UTC)
    for i in range(count):
        row = UserLoginHistory(
            user_id=user.id,
            email=user.email,
            success=True,
            ip="127.0.0.1",
            login_at=now - timedelta(minutes=i),
        )
        db.add(row)
        rows.append(row)
    await db.commit()
    return rows


# ── Test: 360 endpoint ────────────────────────────────────────────────────────


async def test_360_basic_fields(db_session: AsyncSession, client: AsyncClient) -> None:
    """360 endpoint returns user brief + nullable sub/vt/payments/login-history."""
    user = await _seed_user(db_session)
    headers = await _admin_headers(db_session)

    resp = await client.get(f"/api/v1/admin/users/{user.id}/360", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["user"]["id"] == str(user.id)
    assert data["user"]["email"] == user.email
    assert data["subscription"] is None
    assert data["subscription_history"] == []
    assert data["payment_history"] == []
    assert data["trial_used"] is False
    assert data["vt_account"] is None
    assert data["vt_recent_orders"] == []
    assert data["login_history"] == []


async def test_360_with_full_seed(db_session: AsyncSession, client: AsyncClient) -> None:
    """360 returns all nested sections when data exists."""
    user = await _seed_user(db_session, role=UserRole.PREMIUM)
    plan = await _seed_plan(db_session)
    sub = await _seed_sub(db_session, user, plan)
    payment = await _seed_payment(db_session, user, plan)
    vt = await _seed_vt_account(db_session, user)
    login_rows = await _seed_login_history(db_session, user, count=3)
    headers = await _admin_headers(db_session)

    resp = await client.get(f"/api/v1/admin/users/{user.id}/360", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["user"]["email"] == user.email
    assert data["subscription"] is not None
    assert data["subscription"]["id"] == str(sub.id)
    assert len(data["subscription_history"]) == 1
    assert len(data["payment_history"]) == 1
    assert data["payment_history"][0]["invoice_number"] == payment.invoice_number
    assert data["vt_account"]["id"] == str(vt.id)
    assert len(data["login_history"]) == 3


async def test_360_trial_used_flag(db_session: AsyncSession, client: AsyncClient) -> None:
    """trial_used is True when a TRIAL_7D subscription exists."""
    user = await _seed_user(db_session, role=UserRole.PREMIUM)
    trial_plan = await _seed_plan(db_session, code="TRIAL_7D")
    await _seed_sub(db_session, user, trial_plan)
    headers = await _admin_headers(db_session)

    resp = await client.get(f"/api/v1/admin/users/{user.id}/360", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["trial_used"] is True


async def test_360_not_found(db_session: AsyncSession, client: AsyncClient) -> None:
    headers = await _admin_headers(db_session)
    resp = await client.get(f"/api/v1/admin/users/{uuid.uuid4()}/360", headers=headers)
    assert resp.status_code == 404


# ── Test: bulk update ─────────────────────────────────────────────────────────


async def test_bulk_set_role(db_session: AsyncSession, client: AsyncClient) -> None:
    """Bulk set_role updates role and creates one audit row per user."""
    u1 = await _seed_user(db_session, UserRole.USER)
    u2 = await _seed_user(db_session, UserRole.USER)
    headers = await _admin_headers(db_session)

    resp = await client.post(
        "/api/v1/admin/users/bulk",
        json={"user_ids": [str(u1.id), str(u2.id)], "op": "set_role", "value": "premium"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["affected"] == 2
    assert data["skipped"] == []
    assert data["errors"] == []

    await db_session.refresh(u1)
    await db_session.refresh(u2)
    assert u1.role == UserRole.PREMIUM
    assert u2.role == UserRole.PREMIUM

    # One audit row per user
    rows = (
        await db_session.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "user.bulk_update")
        )
    ).scalars().all()
    assert len(rows) == 2


async def test_bulk_with_missing_user_ids(db_session: AsyncSession, client: AsyncClient) -> None:
    """Non-existent user_ids are reported in skipped, not errors."""
    real_user = await _seed_user(db_session)
    fake_id = uuid.uuid4()
    headers = await _admin_headers(db_session)

    resp = await client.post(
        "/api/v1/admin/users/bulk",
        json={
            "user_ids": [str(real_user.id), str(fake_id)],
            "op": "set_status",
            "value": "inactive",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["affected"] == 1
    assert str(fake_id) in data["skipped"]
    assert data["errors"] == []


async def test_bulk_soft_delete(db_session: AsyncSession, client: AsyncClient) -> None:
    """soft_delete op sets user status to deleted."""
    user = await _seed_user(db_session)
    headers = await _admin_headers(db_session)

    resp = await client.post(
        "/api/v1/admin/users/bulk",
        json={"user_ids": [str(user.id)], "op": "soft_delete"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["affected"] == 1

    await db_session.refresh(user)
    assert user.status == UserStatus.DELETED
    assert user.deleted_at is not None


# ── Test: reset password ──────────────────────────────────────────────────────


async def test_reset_password_returns_temp_password(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    """reset-password returns a 16-char temporary password that actually works."""
    user = await _seed_user(db_session)
    headers = await _admin_headers(db_session)

    resp = await client.post(
        f"/api/v1/admin/users/{user.id}/reset-password", headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "temporary_password" in data
    assert len(data["temporary_password"]) == 16
    assert "warning" in data

    # The temp password must validate against the updated hash
    await db_session.refresh(user)
    assert verify_password(data["temporary_password"], user.hashed_password)

    # Audit row created
    rows = (
        await db_session.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "user.password_reset")
        )
    ).scalars().all()
    assert len(rows) >= 1


# ── Test: resend verification ─────────────────────────────────────────────────


async def test_resend_verification_202(db_session: AsyncSession, client: AsyncClient) -> None:
    """resend-verification returns 202 and records an audit row."""
    user = await _seed_user(db_session)
    headers = await _admin_headers(db_session)

    resp = await client.post(
        f"/api/v1/admin/users/{user.id}/resend-verification", headers=headers
    )
    assert resp.status_code == 202
    data = resp.json()
    assert "message" in data

    rows = (
        await db_session.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "user.verify_resend")
        )
    ).scalars().all()
    assert len(rows) >= 1


# ── Test: CSV export ──────────────────────────────────────────────────────────


async def test_export_csv_basic(db_session: AsyncSession, client: AsyncClient) -> None:
    """Export returns valid CSV with correct columns."""
    await _seed_user(db_session)
    await _seed_user(db_session)
    headers = await _admin_headers(db_session)

    resp = await client.get("/api/v1/admin/users/export", headers=headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]

    content = resp.content.decode("utf-8")
    reader = list(csv.reader(io.StringIO(content)))
    # Header row + at least the seeded users (plus admin user)
    assert reader[0] == [
        "id", "email", "full_name", "phone_e164",
        "role", "status", "is_email_verified",
        "last_login_at", "created_at",
    ]
    assert len(reader) >= 3  # header + 2 seeded users (plus possibly the admin)


async def test_export_csv_with_role_filter(db_session: AsyncSession, client: AsyncClient) -> None:
    """Export role filter returns only matching rows."""
    await _seed_user(db_session, UserRole.USER)
    await _seed_user(db_session, UserRole.PREMIUM)
    headers = await _admin_headers(db_session)

    resp = await client.get("/api/v1/admin/users/export?role=premium", headers=headers)
    assert resp.status_code == 200

    content = resp.content.decode("utf-8")
    reader = list(csv.reader(io.StringIO(content)))
    # Skip header; every data row should have role == premium
    for row in reader[1:]:
        if row:  # skip empty trailing lines
            # CSV columns: id, email, full_name, phone_e164, role, ... — role at idx 4.
            assert row[4] == "premium"


async def test_export_csv_cap_exceeded(
    db_session: AsyncSession, client: AsyncClient, monkeypatch
) -> None:
    """Export returns 400 when row count exceeds EXPORT_MAX_ROWS."""
    import app.services.admin_users as svc_module

    monkeypatch.setattr(svc_module, "EXPORT_MAX_ROWS", 0)

    await _seed_user(db_session)
    headers = await _admin_headers(db_session)

    resp = await client.get("/api/v1/admin/users/export", headers=headers)
    assert resp.status_code == 400


# ── Test: login history ───────────────────────────────────────────────────────


async def test_login_history_paginated(db_session: AsyncSession, client: AsyncClient) -> None:
    """Login history endpoint returns paginated rows."""
    user = await _seed_user(db_session)
    await _seed_login_history(db_session, user, count=5)
    headers = await _admin_headers(db_session)

    resp = await client.get(
        f"/api/v1/admin/users/{user.id}/login-history?page=1&page_size=3",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 3
    assert data["total_pages"] == 2


# ── Test: non-admin blocked ───────────────────────────────────────────────────


async def test_non_admin_blocked_on_all_endpoints(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    """Regular users receive 403 on all admin/users/* endpoints."""
    user = await _seed_user(db_session)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    headers = {"Authorization": f"Bearer {token}"}

    endpoints = [
        ("GET", f"/api/v1/admin/users/{user.id}/360"),
        ("POST", "/api/v1/admin/users/bulk"),
        ("POST", f"/api/v1/admin/users/{user.id}/reset-password"),
        ("POST", f"/api/v1/admin/users/{user.id}/resend-verification"),
        ("GET", "/api/v1/admin/users/export"),
        ("GET", f"/api/v1/admin/users/{user.id}/login-history"),
    ]
    for method, url in endpoints:
        if method == "GET":
            resp = await client.get(url, headers=headers)
        else:
            resp = await client.post(url, json={}, headers=headers)
        assert resp.status_code == 403, f"{method} {url} should return 403, got {resp.status_code}"
