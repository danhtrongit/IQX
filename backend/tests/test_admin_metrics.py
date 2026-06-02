"""Tests for AdminMetricsService + admin metrics endpoints."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.premium import (
    PaymentOrderStatus,
    PremiumPaymentOrder,
    PremiumPlan,
    PremiumSubscription,
    SubscriptionStatus,
)
from app.models.user import User, UserRole, UserStatus
from app.services.admin_metrics import AdminMetricsService


pytestmark = pytest.mark.asyncio


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


async def _seed_plan(db: AsyncSession, code: str, price: int, duration: int) -> PremiumPlan:
    plan = PremiumPlan(
        code=code,
        name=code,
        price_vnd=price,
        duration_days=duration,
        is_active=True,
        sort_order=0,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def _seed_user(db: AsyncSession, **kwargs) -> User:
    defaults = dict(
        email=f"u-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="$2b$12$d",
        full_name="T U".strip(),
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    defaults.update(kwargs)
    u = User(**defaults)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


async def test_overview_empty_database(db_session, client):
    headers = await _admin_headers(db_session)
    resp = await client.get("/api/v1/admin/metrics/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_users"] >= 1  # the admin we just created
    assert data["active_subscribers"] == 0
    assert data["mrr_vnd"] == 0
    assert data["plan_distribution"] == []


async def test_overview_counts_active_subscribers_and_mrr(db_session, client):
    monthly = await _seed_plan(db_session, "MONTHLY", 50_000, 30)
    trial = await _seed_plan(db_session, "TRIAL_7D", 0, 7)

    # 2 active paid subs, 1 active trial
    now = datetime.now(UTC)
    for _ in range(2):
        u = await _seed_user(db_session)
        db_session.add(PremiumSubscription(
            user_id=u.id,
            current_plan_id=monthly.id,
            current_period_start=now,
            current_period_end=now + timedelta(days=15),
            status=SubscriptionStatus.ACTIVE,
        ))
    t_user = await _seed_user(db_session)
    db_session.add(PremiumSubscription(
        user_id=t_user.id,
        current_plan_id=trial.id,
        current_period_start=now,
        current_period_end=now + timedelta(days=3),
        status=SubscriptionStatus.ACTIVE,
    ))
    await db_session.commit()

    headers = await _admin_headers(db_session)
    resp = await client.get("/api/v1/admin/metrics/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["active_subscribers"] == 3
    assert data["active_trial_count"] == 1
    assert data["active_paid_count"] == 2
    # MRR = 2 subs * 50_000 * 30 / 30 = 100_000
    assert data["mrr_vnd"] == 100_000
    # Plan distribution excludes trial
    codes = {p["plan_code"] for p in data["plan_distribution"]}
    assert codes == {"MONTHLY"}


async def test_overview_revenue_excludes_admin_grants(db_session, client):
    plan = await _seed_plan(db_session, "MONTHLY", 50_000, 30)
    u = await _seed_user(db_session)
    now = datetime.now(UTC)
    # 1 PAID real order, 1 PAID admin_grant
    db_session.add(PremiumPaymentOrder(
        invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
        user_id=u.id,
        plan_id=plan.id,
        amount_vnd=50_000,
        currency="VND",
        status=PaymentOrderStatus.PAID,
        paid_at=now,
        grant_type="payment",
    ))
    db_session.add(PremiumPaymentOrder(
        invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
        user_id=u.id,
        plan_id=plan.id,
        amount_vnd=999_999,
        currency="VND",
        status=PaymentOrderStatus.PAID,
        paid_at=now,
        grant_type="admin_grant",
    ))
    await db_session.commit()

    headers = await _admin_headers(db_session)
    resp = await client.get("/api/v1/admin/metrics/overview", headers=headers)
    data = resp.json()
    assert data["revenue_today_vnd"] == 50_000  # admin grant excluded


async def test_daily_revenue_series_length(db_session, client):
    headers = await _admin_headers(db_session)
    resp = await client.get("/api/v1/admin/metrics/revenue?days=7", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 7
    # Every row has required fields
    for row in data:
        assert "date" in row
        assert "paid_orders" in row
        assert "revenue_vnd" in row


async def test_plan_distribution_lists_all_active_plans(db_session, client):
    await _seed_plan(db_session, "MONTHLY", 50_000, 30)
    await _seed_plan(db_session, "ANNUAL", 400_000, 365)

    headers = await _admin_headers(db_session)
    resp = await client.get("/api/v1/admin/metrics/plan-distribution", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    codes = {p["plan_code"] for p in data}
    # Trial plan exists from earlier seed migration too; OK if present.
    assert "MONTHLY" in codes and "ANNUAL" in codes


async def test_non_admin_cannot_access(db_session, client):
    """USER role is forbidden."""
    user = User(
        email=f"reg-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Pwd@1234"),
        full_name="Reg U".strip(),
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    resp = await client.get(
        "/api/v1/admin/metrics/overview",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
