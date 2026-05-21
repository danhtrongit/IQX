"""Hourly: mark expired subscriptions + downgrade affected users."""
from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.models.premium import PremiumSubscription, SubscriptionStatus
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)


async def run_expiry_sweep(session: AsyncSession | None = None) -> dict:
    """Returns a summary dict for logging / manual-trigger response.

    Accepts an optional ``session`` for testability — when omitted, opens its
    own session via the app session factory (production path).
    """
    if session is None:
        factory = get_session_factory()
        async with factory() as db:
            return await _do_expiry_sweep(db)
    return await _do_expiry_sweep(session)


async def _do_expiry_sweep(db: AsyncSession) -> dict:
    now = datetime.now(UTC)
    # Use a naive datetime for SQL comparisons so that SQLite (which stores
    # naive datetimes) and PostgreSQL (with timezone-aware columns) both work.
    now_naive = now.replace(tzinfo=None)

    # 1. Find active subs whose period_end has passed — use SELECT first so
    #    we get the user_ids without RETURNING (which triggers Python-side
    #    evaluator issues in SQLite with timezone-aware vs naive datetimes).
    expired_subs_result = await db.execute(
        select(PremiumSubscription).where(
            and_(
                PremiumSubscription.status == SubscriptionStatus.ACTIVE,
                PremiumSubscription.current_period_end < now_naive,
            )
        )
    )
    expired_subs = expired_subs_result.scalars().all()
    expired_user_ids = [sub.user_id for sub in expired_subs]

    # 2. Mark them as EXPIRED.
    for sub in expired_subs:
        sub.status = SubscriptionStatus.EXPIRED

    downgraded_count = 0
    # 3. For each user, downgrade role if no other active sub.
    if expired_user_ids:
        for uid in expired_user_ids:
            # Check for any remaining active sub for this user.
            still_active = (await db.execute(
                select(PremiumSubscription.id).where(
                    and_(
                        PremiumSubscription.user_id == uid,
                        PremiumSubscription.status == SubscriptionStatus.ACTIVE,
                        PremiumSubscription.current_period_end >= now_naive,
                    )
                ).limit(1)
            )).scalar_one_or_none()
            if still_active is not None:
                continue
            # Downgrade premium → user; NEVER touch admin.
            update_result = await db.execute(
                update(User)
                .where(and_(User.id == uid, User.role == UserRole.PREMIUM))
                .values(role=UserRole.USER)
            )
            if update_result.rowcount and update_result.rowcount > 0:
                downgraded_count += 1

    # 3. Audit row (admin_user_id=NULL, system action).
    db.add(AdminAuditLog(
        admin_user_id=None,
        action="system.expiry_sweep",
        target_entity=None, target_id=None,
        payload_after={
            "expired_count": len(expired_user_ids),
            "downgraded_count": downgraded_count,
            "ran_at": now.isoformat(),
        },
        note=f"Auto-expired {len(expired_user_ids)} subs; downgraded {downgraded_count} users",
    ))
    await db.commit()

    summary = {
        "expired_count": len(expired_user_ids),
        "downgraded_count": downgraded_count,
        "ran_at": now.isoformat(),
    }
    logger.info("Expiry sweep: %s", summary)
    return summary
