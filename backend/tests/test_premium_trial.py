"""Tests cho 7-day trial grant logic."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.premium import PremiumPlan, PremiumSubscription, SubscriptionStatus
from app.models.user import User, UserRole, UserStatus
from app.services.premium import PremiumService


pytestmark = pytest.mark.asyncio


async def _ensure_trial_plan(db: AsyncSession) -> PremiumPlan:
    """Ensure TRIAL_7D plan exists (idempotent for tests)."""
    res = await db.execute(select(PremiumPlan).where(PremiumPlan.code == "TRIAL_7D"))
    plan = res.scalar_one_or_none()
    if plan:
        return plan
    plan = PremiumPlan(
        code="TRIAL_7D",
        name="Dùng thử 7 ngày",
        price_vnd=0,
        duration_days=7,
        is_active=True,
        sort_order=-1,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def _make_user(db: AsyncSession, email: str = "trial@example.com") -> User:
    user = User(
        email=email,
        hashed_password="$2b$12$dummy",
        first_name="T",
        last_name="U",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def test_grant_trial_creates_7day_subscription(db_session: AsyncSession) -> None:
    await _ensure_trial_plan(db_session)
    user = await _make_user(db_session)

    service = PremiumService(db_session)
    sub = await service.grant_trial_if_eligible(user.id)

    assert sub is not None
    assert sub.status == SubscriptionStatus.ACTIVE
    now = datetime.now(UTC)
    end = sub.current_period_end
    if end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    delta = end - now
    assert timedelta(days=6, hours=23) < delta < timedelta(days=7, hours=1)


async def test_grant_trial_is_idempotent(db_session: AsyncSession) -> None:
    await _ensure_trial_plan(db_session)
    user = await _make_user(db_session, email="trial-idem@example.com")

    service = PremiumService(db_session)
    first = await service.grant_trial_if_eligible(user.id)
    assert first is not None

    second = await service.grant_trial_if_eligible(user.id)
    assert second is None

    res = await db_session.execute(
        select(PremiumSubscription).where(PremiumSubscription.user_id == user.id)
    )
    subs = res.scalars().all()
    assert len(subs) == 1


async def test_grant_trial_skipped_if_paid_sub_exists(db_session: AsyncSession) -> None:
    trial_plan = await _ensure_trial_plan(db_session)
    user = await _make_user(db_session, email="trial-paid@example.com")

    now = datetime.now(UTC)
    existing = PremiumSubscription(
        user_id=user.id,
        current_plan_id=trial_plan.id,
        current_period_start=now - timedelta(days=30),
        current_period_end=now - timedelta(days=10),
        status=SubscriptionStatus.EXPIRED,
    )
    db_session.add(existing)
    await db_session.commit()

    service = PremiumService(db_session)
    result = await service.grant_trial_if_eligible(user.id)
    assert result is None


async def test_grant_trial_sets_user_role_premium(db_session: AsyncSession) -> None:
    await _ensure_trial_plan(db_session)
    user = await _make_user(db_session, email="trial-role@example.com")

    service = PremiumService(db_session)
    await service.grant_trial_if_eligible(user.id)

    await db_session.refresh(user)
    assert user.role == UserRole.PREMIUM


async def test_register_grants_7day_trial(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    """POST /auth/register → user có sub TRIAL_7D ngay sau khi đăng ký."""
    await _ensure_trial_plan(db_session)

    payload = {
        "email": "newreg@example.com",
        "password": "StrongPass123!",
        "first_name": "New",
        "last_name": "Reg",
    }
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 201
    user_data = resp.json()
    user_id = uuid.UUID(user_data["id"])

    res = await db_session.execute(
        select(PremiumSubscription).where(PremiumSubscription.user_id == user_id)
    )
    sub = res.scalar_one_or_none()
    assert sub is not None
    assert sub.status == SubscriptionStatus.ACTIVE

    res = await db_session.execute(
        select(PremiumPlan).where(PremiumPlan.id == sub.current_plan_id)
    )
    plan = res.scalar_one()
    assert plan.code == "TRIAL_7D"


async def test_register_succeeds_even_if_trial_plan_missing(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    """Trial plan chưa seed → register vẫn 201, chỉ log warning."""
    import sqlalchemy as sa
    await db_session.execute(
        sa.text("DELETE FROM premium_plans WHERE code = 'TRIAL_7D'")
    )
    await db_session.commit()

    payload = {
        "email": "no-trial-plan@example.com",
        "password": "StrongPass123!",
        "first_name": "No",
        "last_name": "Trial",
    }
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 201

    user_id = uuid.UUID(resp.json()["id"])
    res = await db_session.execute(
        select(PremiumSubscription).where(PremiumSubscription.user_id == user_id)
    )
    assert res.scalar_one_or_none() is None
