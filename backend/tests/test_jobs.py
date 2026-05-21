"""Tests for expiry_sweep + ipn_reconcile_scan background jobs."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.premium import (
    PaymentOrderStatus,
    PremiumPaymentOrder,
    PremiumPlan,
    PremiumSubscription,
    SubscriptionStatus,
)
from app.models.user import User, UserRole, UserStatus
from app.services.jobs.expiry_sweep import run_expiry_sweep
from app.services.jobs.ipn_reconcile import run_ipn_reconcile_scan

pytestmark = pytest.mark.asyncio


# ── Helpers ───────────────────────────────────────────────────────────────


async def _create_user(db: AsyncSession, role: UserRole = UserRole.PREMIUM) -> User:
    from app.core.security import hash_password

    user = User(
        email=f"testjob-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("Test@1234"),
        first_name="Job",
        last_name="Test",
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _create_plan(db: AsyncSession, code: str = "PLAN_30D") -> PremiumPlan:
    plan = PremiumPlan(
        code=code,
        name="Test Plan 30D",
        price_vnd=99000,
        duration_days=30,
        is_active=True,
        sort_order=0,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def _create_subscription(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    *,
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
    days_offset: int = -5,  # negative = in the past
) -> PremiumSubscription:
    now = datetime.now(UTC)
    start = now + timedelta(days=days_offset - 30)
    end = now + timedelta(days=days_offset)
    sub = PremiumSubscription(
        user_id=user_id,
        current_plan_id=plan_id,
        current_period_start=start,
        current_period_end=end,
        status=status,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


async def _create_payment_order(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    *,
    status: PaymentOrderStatus = PaymentOrderStatus.PENDING,
    created_hours_ago: int = 2,
) -> PremiumPaymentOrder:
    order = PremiumPaymentOrder(
        invoice_number=f"IQX_{uuid.uuid4().hex[:12].upper()}",
        user_id=user_id,
        plan_id=plan_id,
        amount_vnd=99000,
        currency="VND",
        status=status,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    # Manually update created_at to simulate old order
    from sqlalchemy import update as _update
    from app.models.premium import PremiumPaymentOrder as _PPO
    ago = datetime.now(UTC) - timedelta(hours=created_hours_ago)
    await db.execute(
        _update(_PPO).where(_PPO.id == order.id).values(created_at=ago)
    )
    await db.commit()
    await db.refresh(order)
    return order


# ── Expiry sweep tests ────────────────────────────────────────────────────


async def test_expiry_sweep_marks_expired_and_downgrades(db_session: AsyncSession) -> None:
    """Active sub with end in past → EXPIRED; user role → USER."""
    plan = await _create_plan(db_session)
    user = await _create_user(db_session, role=UserRole.PREMIUM)
    sub = await _create_subscription(db_session, user.id, plan.id, days_offset=-1)

    assert sub.status == SubscriptionStatus.ACTIVE

    result = await run_expiry_sweep(db_session)

    assert result["expired_count"] == 1
    assert result["downgraded_count"] == 1

    await db_session.refresh(sub)
    assert sub.status == SubscriptionStatus.EXPIRED

    await db_session.refresh(user)
    assert user.role == UserRole.USER


async def test_expiry_sweep_skips_active_future_subs(db_session: AsyncSession) -> None:
    """Active sub with end in the future → untouched."""
    plan = await _create_plan(db_session)
    user = await _create_user(db_session, role=UserRole.PREMIUM)
    # end in +30 days
    sub = await _create_subscription(db_session, user.id, plan.id, days_offset=30)

    result = await run_expiry_sweep(db_session)

    assert result["expired_count"] == 0
    assert result["downgraded_count"] == 0
    await db_session.refresh(sub)
    assert sub.status == SubscriptionStatus.ACTIVE


async def test_expiry_sweep_skips_admin_role(db_session: AsyncSession) -> None:
    """User with ADMIN role — even if sub expired, role stays ADMIN."""
    plan = await _create_plan(db_session)
    # Create an admin user who somehow got a premium subscription
    user = await _create_user(db_session, role=UserRole.ADMIN)
    await _create_subscription(db_session, user.id, plan.id, days_offset=-1)

    result = await run_expiry_sweep(db_session)

    # The subscription is expired, but user role is NOT changed
    assert result["expired_count"] == 1
    assert result["downgraded_count"] == 0  # admin role not touched
    await db_session.refresh(user)
    assert user.role == UserRole.ADMIN


async def test_expiry_sweep_user_not_downgraded_when_sub_still_active(db_session: AsyncSession) -> None:
    """Active sub with end in future → user role stays PREMIUM (no downgrade)."""
    plan = await _create_plan(db_session, code="PLAN_FUTURE")
    user = await _create_user(db_session, role=UserRole.PREMIUM)
    # Subscription ends in 10 days — NOT expired.
    await _create_subscription(db_session, user.id, plan.id, days_offset=10)

    result = await run_expiry_sweep(db_session)

    assert result["downgraded_count"] == 0
    await db_session.refresh(user)
    assert user.role == UserRole.PREMIUM


async def test_expiry_sweep_returns_summary_keys(db_session: AsyncSession) -> None:
    """Summary dict always has expected keys."""
    result = await run_expiry_sweep(db_session)
    assert "expired_count" in result
    assert "downgraded_count" in result
    assert "ran_at" in result


# ── IPN reconcile scan tests ──────────────────────────────────────────────


async def test_ipn_reconcile_marks_very_old_pending_as_failed(db_session: AsyncSession) -> None:
    """PENDING order > 24h old with no matching IPN → FAILED."""
    plan = await _create_plan(db_session)
    user = await _create_user(db_session, role=UserRole.USER)
    order = await _create_payment_order(
        db_session, user.id, plan.id,
        status=PaymentOrderStatus.PENDING,
        created_hours_ago=25,  # > 24h
    )

    result = await run_ipn_reconcile_scan(db_session)

    assert result["attempted"] == 1
    assert result["failed_old"] == 1
    await db_session.refresh(order)
    assert order.status == PaymentOrderStatus.FAILED


async def test_ipn_reconcile_skips_fresh_pending_orders(db_session: AsyncSession) -> None:
    """PENDING order < 30min old → not touched at all."""
    plan = await _create_plan(db_session)
    user = await _create_user(db_session, role=UserRole.USER)

    # Create a fresh order (just now) — note the cutoff is 30min, so we need
    # to NOT set created_hours_ago to something > 30min.
    # _create_payment_order sets created_hours_ago=2 by default → > 30min,
    # so use 0 hours to simulate very fresh order.
    order = PremiumPaymentOrder(
        invoice_number=f"IQX_{uuid.uuid4().hex[:12].upper()}",
        user_id=user.id,
        plan_id=plan.id,
        amount_vnd=99000,
        currency="VND",
        status=PaymentOrderStatus.PENDING,
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)

    result = await run_ipn_reconcile_scan(db_session)

    # Fresh order should not be in "stuck" list (created_at is NOW, not older than 30min)
    assert result["attempted"] == 0
    await db_session.refresh(order)
    assert order.status == PaymentOrderStatus.PENDING


async def test_ipn_reconcile_returns_summary_keys(db_session: AsyncSession) -> None:
    """Summary dict always has expected keys."""
    result = await run_ipn_reconcile_scan(db_session)
    assert "attempted" in result
    assert "reconciled" in result
    assert "failed_old" in result
