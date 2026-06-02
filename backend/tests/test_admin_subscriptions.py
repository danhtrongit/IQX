"""Tests for admin subscription endpoints (T8)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.admin_audit import AdminAuditLog
from app.models.premium import (
    PremiumPlan,
    PremiumSubscription,
    SubscriptionStatus,
)
from app.models.user import User, UserRole, UserStatus

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


async def _seed_user(db: AsyncSession, role: UserRole = UserRole.USER) -> User:
    u = User(
        email=f"u-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="$2b$12$x",
        full_name="T U".strip(),
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


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


# ── tests ──────────────────────────────────────────────────────────────────────


async def test_list_subscriptions_empty(db_session, client):
    headers = await _admin_headers(db_session)
    resp = await client.get("/api/v1/admin/subscriptions", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0


async def test_list_subscriptions_returns_items(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session, UserRole.PREMIUM)
    sub = await _seed_sub(db_session, user, plan)

    headers = await _admin_headers(db_session)
    resp = await client.get("/api/v1/admin/subscriptions", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    item = data["items"][0]
    assert item["user_email"] == user.email
    assert item["plan_code"] == "MONTHLY"


async def test_list_filter_by_status(db_session, client):
    plan = await _seed_plan(db_session)
    user1 = await _seed_user(db_session, UserRole.PREMIUM)
    user2 = await _seed_user(db_session)
    await _seed_sub(db_session, user1, plan, SubscriptionStatus.ACTIVE)
    await _seed_sub(db_session, user2, plan, SubscriptionStatus.CANCELLED)

    headers = await _admin_headers(db_session)
    resp = await client.get("/api/v1/admin/subscriptions?status=active", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert all(i["status"] == "active" for i in data["items"])


async def test_list_filter_expiring_within_days(db_session, client):
    plan = await _seed_plan(db_session)
    # One expiring in 3 days, one in 60 days
    u1 = await _seed_user(db_session, UserRole.PREMIUM)
    u2 = await _seed_user(db_session, UserRole.PREMIUM)
    await _seed_sub(db_session, u1, plan, days_ahead=3)
    await _seed_sub(db_session, u2, plan, days_ahead=60)

    headers = await _admin_headers(db_session)
    resp = await client.get(
        "/api/v1/admin/subscriptions?expiring_within_days=7", headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["user_email"] == u1.email


async def test_list_filter_by_plan(db_session, client):
    plan1 = await _seed_plan(db_session, "PLAN_A")
    plan2 = await _seed_plan(db_session, "PLAN_B")
    u1 = await _seed_user(db_session, UserRole.PREMIUM)
    u2 = await _seed_user(db_session, UserRole.PREMIUM)
    await _seed_sub(db_session, u1, plan1)
    await _seed_sub(db_session, u2, plan2)

    headers = await _admin_headers(db_session)
    resp = await client.get(
        f"/api/v1/admin/subscriptions?plan_id={plan1.id}", headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["plan_code"] == "PLAN_A"


async def test_get_subscription_detail(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session, UserRole.PREMIUM)
    sub = await _seed_sub(db_session, user, plan)

    headers = await _admin_headers(db_session)
    resp = await client.get(f"/api/v1/admin/subscriptions/{sub.id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(sub.id)
    assert data["plan_code"] == "MONTHLY"
    assert data["user_email"] == user.email


async def test_get_subscription_not_found(db_session, client):
    headers = await _admin_headers(db_session)
    resp = await client.get(f"/api/v1/admin/subscriptions/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


async def test_cancel_active_subscription(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session, UserRole.PREMIUM)
    sub = await _seed_sub(db_session, user, plan)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/subscriptions/{sub.id}/cancel",
        json={"reason": "Admin cancel test"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "cancelled"
    assert data["cancel_reason"] == "Admin cancel test"

    # User role should be downgraded
    await db_session.refresh(user)
    assert user.role == UserRole.USER

    # Audit row created
    rows = (
        await db_session.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "subscription.cancel")
        )
    ).scalars().all()
    assert len(rows) >= 1


async def test_cancel_already_cancelled(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    sub = await _seed_sub(db_session, user, plan, SubscriptionStatus.CANCELLED)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/subscriptions/{sub.id}/cancel",
        json={"reason": "double cancel"},
        headers=headers,
    )
    assert resp.status_code == 400


async def test_cancel_admin_role_not_downgraded(db_session, client):
    """Admin user's role must never be touched when cancelling their subscription."""
    plan = await _seed_plan(db_session)
    admin_user = await _seed_user(db_session, UserRole.ADMIN)
    sub = await _seed_sub(db_session, admin_user, plan)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/subscriptions/{sub.id}/cancel",
        json={"reason": "admin sub cancel"},
        headers=headers,
    )
    assert resp.status_code == 200

    await db_session.refresh(admin_user)
    # ADMIN role must not be changed
    assert admin_user.role == UserRole.ADMIN


async def test_extend_active_subscription(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session, UserRole.PREMIUM)
    sub = await _seed_sub(db_session, user, plan, days_ahead=10)
    original_end = sub.current_period_end

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/subscriptions/{sub.id}/extend",
        json={"days": 30, "reason": "Customer loyalty bonus"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "active"

    # Verify end date advanced by 30 days
    new_end_str = data["current_period_end"]
    from datetime import datetime as _dt
    new_end = _dt.fromisoformat(new_end_str)
    if new_end.tzinfo is None:
        new_end = new_end.replace(tzinfo=UTC)
    if original_end.tzinfo is None:
        original_end = original_end.replace(tzinfo=UTC)
    assert (new_end - original_end).days >= 29  # allow 1-second rounding

    # Audit row
    rows = (
        await db_session.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "subscription.extend")
        )
    ).scalars().all()
    assert len(rows) >= 1


async def test_extend_expired_subscription_flips_to_active(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session, UserRole.USER)
    # Expired subscription (past)
    now = datetime.now(UTC)
    sub = PremiumSubscription(
        user_id=user.id,
        current_plan_id=plan.id,
        current_period_start=now - timedelta(days=60),
        current_period_end=now - timedelta(days=10),
        status=SubscriptionStatus.EXPIRED,
    )
    db_session.add(sub)
    await db_session.commit()
    await db_session.refresh(sub)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/subscriptions/{sub.id}/extend",
        json={"days": 30},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "active"

    # User role should be upgraded to premium
    await db_session.refresh(user)
    assert user.role == UserRole.PREMIUM


async def test_user_subscription_history(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session, UserRole.PREMIUM)
    sub = await _seed_sub(db_session, user, plan)

    headers = await _admin_headers(db_session)
    resp = await client.get(
        f"/api/v1/admin/users/{user.id}/subscriptions/history", headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["id"] == str(sub.id)


async def test_non_admin_blocked(db_session, client):
    user = await _seed_user(db_session)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get("/api/v1/admin/subscriptions", headers=headers)
    assert resp.status_code == 403
