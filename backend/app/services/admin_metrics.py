"""Admin metrics aggregator. Pure SQL aggregates against existing tables."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.premium import (
    PaymentOrderStatus,
    PremiumPaymentOrder,
    PremiumPlan,
    PremiumSubscription,
    SubscriptionStatus,
)
from app.models.user import User, UserStatus
from app.models.virtual_trading import (
    AccountStatus,
    VirtualOrder,
    VirtualTradingAccount,
)
from app.schemas.admin_metrics import (
    DailyRevenuePoint,
    MetricsOverview,
    PlanDistributionPoint,
)

TRIAL_PLAN_CODE = "TRIAL_7D"


class AdminMetricsService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def overview(self) -> MetricsOverview:
        now = datetime.now(UTC)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        d7 = now - timedelta(days=7)
        d30 = now - timedelta(days=30)
        # User.created_at is a naive DateTime column; strip tzinfo for those comparisons.
        today_start_naive = today_start.replace(tzinfo=None)
        d7_naive = d7.replace(tzinfo=None)
        d30_naive = d30.replace(tzinfo=None)

        # ── Users ─────────────────────────────────────────────────
        total_users = await self._scalar(
            select(func.count()).select_from(User).where(User.status != UserStatus.DELETED)
        )
        active_users = await self._scalar(
            select(func.count()).select_from(User).where(User.status == UserStatus.ACTIVE)
        )
        new_users_today = await self._scalar(
            select(func.count()).select_from(User).where(User.created_at >= today_start_naive)
        )
        new_users_last_7d = await self._scalar(
            select(func.count()).select_from(User).where(User.created_at >= d7_naive)
        )
        new_users_last_30d = await self._scalar(
            select(func.count()).select_from(User).where(User.created_at >= d30_naive)
        )

        # ── Premium ───────────────────────────────────────────────
        active_subscribers = await self._scalar(
            select(func.count()).select_from(PremiumSubscription).where(
                and_(
                    PremiumSubscription.status == SubscriptionStatus.ACTIVE,
                    PremiumSubscription.current_period_end > now,
                )
            )
        )
        active_trial_count = await self._scalar(
            select(func.count())
            .select_from(PremiumSubscription)
            .join(PremiumPlan, PremiumPlan.id == PremiumSubscription.current_plan_id)
            .where(
                and_(
                    PremiumSubscription.status == SubscriptionStatus.ACTIVE,
                    PremiumSubscription.current_period_end > now,
                    PremiumPlan.code == TRIAL_PLAN_CODE,
                )
            )
        )
        active_paid_count = active_subscribers - active_trial_count

        # Plan distribution (active, paid plans only)
        dist_rows = (await self._session.execute(
            select(
                PremiumPlan.code,
                PremiumPlan.name,
                PremiumPlan.price_vnd,
                func.count(PremiumSubscription.id),
            )
            .join(PremiumSubscription, PremiumSubscription.current_plan_id == PremiumPlan.id)
            .where(
                and_(
                    PremiumPlan.code != TRIAL_PLAN_CODE,
                    PremiumSubscription.status == SubscriptionStatus.ACTIVE,
                    PremiumSubscription.current_period_end > now,
                )
            )
            .group_by(PremiumPlan.code, PremiumPlan.name, PremiumPlan.price_vnd)
            .order_by(PremiumPlan.price_vnd)
        )).all()
        plan_distribution = [
            PlanDistributionPoint(
                plan_code=row[0], plan_name=row[1], price_vnd=row[2], active_subscriptions=row[3],
            )
            for row in dist_rows
        ]

        # MRR — approximate: sum(price_vnd / duration_days * 30) over active paid subs.
        # Use the plan's price_vnd and duration_days as the rate basis.
        mrr_row = (await self._session.execute(
            select(func.coalesce(func.sum(
                PremiumPlan.price_vnd * 30.0 / func.nullif(PremiumPlan.duration_days, 0)
            ), 0))
            .select_from(PremiumSubscription)
            .join(PremiumPlan, PremiumPlan.id == PremiumSubscription.current_plan_id)
            .where(
                and_(
                    PremiumPlan.code != TRIAL_PLAN_CODE,
                    PremiumSubscription.status == SubscriptionStatus.ACTIVE,
                    PremiumSubscription.current_period_end > now,
                )
            )
        )).scalar_one()
        mrr_vnd = int(mrr_row or 0)

        # Revenue from paid orders (real money — exclude admin grants).
        revenue_today_vnd = await self._scalar(
            select(func.coalesce(func.sum(PremiumPaymentOrder.amount_vnd), 0))
            .where(
                and_(
                    PremiumPaymentOrder.status == PaymentOrderStatus.PAID,
                    PremiumPaymentOrder.paid_at >= today_start,
                    PremiumPaymentOrder.grant_type != "admin_grant",
                )
            )
        )
        revenue_last_7d_vnd = await self._scalar(
            select(func.coalesce(func.sum(PremiumPaymentOrder.amount_vnd), 0))
            .where(
                and_(
                    PremiumPaymentOrder.status == PaymentOrderStatus.PAID,
                    PremiumPaymentOrder.paid_at >= d7,
                    PremiumPaymentOrder.grant_type != "admin_grant",
                )
            )
        )
        revenue_last_30d_vnd = await self._scalar(
            select(func.coalesce(func.sum(PremiumPaymentOrder.amount_vnd), 0))
            .where(
                and_(
                    PremiumPaymentOrder.status == PaymentOrderStatus.PAID,
                    PremiumPaymentOrder.paid_at >= d30,
                    PremiumPaymentOrder.grant_type != "admin_grant",
                )
            )
        )

        # ── Virtual trading ───────────────────────────────────────
        vt_active_accounts = await self._scalar(
            select(func.count()).select_from(VirtualTradingAccount).where(
                VirtualTradingAccount.status == AccountStatus.ACTIVE
            )
        )
        vt_orders_today = await self._scalar(
            select(func.count()).select_from(VirtualOrder).where(
                VirtualOrder.created_at >= today_start_naive
            )
        )

        return MetricsOverview(
            total_users=total_users,
            active_users=active_users,
            new_users_today=new_users_today,
            new_users_last_7d=new_users_last_7d,
            new_users_last_30d=new_users_last_30d,
            active_subscribers=active_subscribers,
            active_trial_count=active_trial_count,
            active_paid_count=active_paid_count,
            plan_distribution=plan_distribution,
            mrr_vnd=mrr_vnd,
            revenue_today_vnd=int(revenue_today_vnd or 0),
            revenue_last_7d_vnd=int(revenue_last_7d_vnd or 0),
            revenue_last_30d_vnd=int(revenue_last_30d_vnd or 0),
            vt_active_accounts=vt_active_accounts,
            vt_orders_today=vt_orders_today,
            generated_at=now,
        )

    async def daily_revenue(self, days: int = 30) -> list[DailyRevenuePoint]:
        """Daily revenue series, oldest to newest, length=days. Days with no orders get 0."""
        now = datetime.now(UTC)
        start = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)

        # SQL: bucket by paid_at::date
        rows = (await self._session.execute(
            select(
                func.date(PremiumPaymentOrder.paid_at).label("d"),
                func.count(PremiumPaymentOrder.id).label("n"),
                func.coalesce(func.sum(PremiumPaymentOrder.amount_vnd), 0).label("sum"),
            )
            .where(
                and_(
                    PremiumPaymentOrder.status == PaymentOrderStatus.PAID,
                    PremiumPaymentOrder.paid_at >= start,
                    PremiumPaymentOrder.grant_type != "admin_grant",
                )
            )
            .group_by("d")
            .order_by("d")
        )).all()

        by_date: dict[date, tuple[int, int]] = {row[0]: (int(row[1]), int(row[2])) for row in rows}

        out: list[DailyRevenuePoint] = []
        # Build a continuous series so the chart has no gaps.
        for i in range(days):
            d = (start + timedelta(days=i)).date()
            n, s = by_date.get(d, (0, 0))
            out.append(DailyRevenuePoint(date=d, paid_orders=n, revenue_vnd=s))
        return out

    async def plan_distribution(self) -> list[PlanDistributionPoint]:
        """Return ALL active plans (incl. trial) with their active subscription counts."""
        now = datetime.now(UTC)
        rows = (await self._session.execute(
            select(
                PremiumPlan.code,
                PremiumPlan.name,
                PremiumPlan.price_vnd,
                func.count(PremiumSubscription.id),
            )
            .outerjoin(
                PremiumSubscription,
                and_(
                    PremiumSubscription.current_plan_id == PremiumPlan.id,
                    PremiumSubscription.status == SubscriptionStatus.ACTIVE,
                    PremiumSubscription.current_period_end > now,
                ),
            )
            .where(PremiumPlan.is_active.is_(True))
            .group_by(PremiumPlan.code, PremiumPlan.name, PremiumPlan.price_vnd, PremiumPlan.sort_order)
            .order_by(PremiumPlan.sort_order, PremiumPlan.price_vnd)
        )).all()
        return [
            PlanDistributionPoint(
                plan_code=row[0], plan_name=row[1], price_vnd=row[2], active_subscriptions=row[3],
            )
            for row in rows
        ]

    async def _scalar(self, stmt) -> int:
        return int((await self._session.execute(stmt)).scalar_one() or 0)
