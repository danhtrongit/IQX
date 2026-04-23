"""Subscription lifecycle service."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import Subscription


async def get_active_subscription(
    session: AsyncSession, user_id: uuid.UUID
) -> Subscription | None:
    """Return the user's currently active subscription, if any."""
    result = await session.execute(
        select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.status == "active",
        )
    )
    return result.scalar_one_or_none()


async def get_subscription_by_id(
    session: AsyncSession, sub_id: uuid.UUID
) -> Subscription | None:
    """Fetch a subscription by primary key."""
    return await session.get(Subscription, sub_id)


async def list_subscriptions(
    session: AsyncSession, *, skip: int = 0, limit: int = 50
) -> tuple[list[Subscription], int]:
    """Admin: paginated list of all subscriptions."""
    from sqlalchemy import func

    total = (await session.execute(select(func.count(Subscription.id)))).scalar_one()
    result = await session.execute(
        select(Subscription)
        .order_by(Subscription.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all()), total


async def activate_subscription(
    session: AsyncSession,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    payment_order_id: uuid.UUID,
) -> Subscription:
    """Activate or renew a subscription after successful payment.

    Rules:
    - If no active sub: create new, period = now -> now + 1 month
    - If active sub with same plan: extend period_end by 1 month
    - If active sub with different plan: expire old, create new from now
    """
    now = datetime.now(UTC)
    existing = await get_active_subscription(session, user_id)

    if existing is None:
        # New subscription
        sub = Subscription(
            user_id=user_id,
            plan_id=plan_id,
            status="active",
            started_at=now,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
            last_payment_order_id=payment_order_id,
        )
        session.add(sub)
        await session.flush()
        await session.refresh(sub)
        return sub

    if existing.plan_id == plan_id:
        # Renew same plan: extend from max(current_period_end, now)
        base = max(existing.current_period_end or now, now)
        existing.current_period_end = base + timedelta(days=30)
        existing.last_payment_order_id = payment_order_id
        await session.flush()
        await session.refresh(existing)
        return existing

    # Switch to different plan: expire old, create new
    existing.status = "expired"
    existing.ended_at = now

    sub = Subscription(
        user_id=user_id,
        plan_id=plan_id,
        status="active",
        started_at=now,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        last_payment_order_id=payment_order_id,
    )
    session.add(sub)
    await session.flush()
    await session.refresh(sub)
    return sub
