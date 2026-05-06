"""Premium repository — data access for plans, subscriptions, and payment orders."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.premium import (
    PaymentOrderStatus,
    PremiumPaymentOrder,
    PremiumPlan,
    PremiumSubscription,
    SubscriptionStatus,
)


class PremiumPlanRepository:
    """Data access for PremiumPlan."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, plan_id: uuid.UUID) -> PremiumPlan | None:
        result = await self._session.execute(select(PremiumPlan).where(PremiumPlan.id == plan_id))
        return result.scalar_one_or_none()

    async def get_by_code(self, code: str) -> PremiumPlan | None:
        result = await self._session.execute(select(PremiumPlan).where(PremiumPlan.code == code))
        return result.scalar_one_or_none()

    async def list_active(self) -> list[PremiumPlan]:
        result = await self._session.execute(
            select(PremiumPlan)
            .where(PremiumPlan.is_active.is_(True))
            .order_by(PremiumPlan.sort_order, PremiumPlan.price_vnd)
        )
        return list(result.scalars().all())

    async def list_all(self) -> list[PremiumPlan]:
        result = await self._session.execute(
            select(PremiumPlan).order_by(PremiumPlan.sort_order, PremiumPlan.price_vnd)
        )
        return list(result.scalars().all())

    async def create(self, plan: PremiumPlan) -> PremiumPlan:
        self._session.add(plan)
        await self._session.flush()
        await self._session.refresh(plan)
        return plan

    async def update(self, plan: PremiumPlan, data: dict[str, object]) -> PremiumPlan:
        for key, value in data.items():
            setattr(plan, key, value)
        await self._session.flush()
        await self._session.refresh(plan)
        return plan


class PremiumSubscriptionRepository:
    """Data access for PremiumSubscription."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_user_id(self, user_id: uuid.UUID) -> PremiumSubscription | None:
        result = await self._session.execute(
            select(PremiumSubscription).where(PremiumSubscription.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_by_user_id_for_update(self, user_id: uuid.UUID) -> PremiumSubscription | None:
        """Get subscription with row lock (FOR UPDATE on PostgreSQL).

        On SQLite this degrades to a plain SELECT because SQLite uses
        database-level locking rather than row-level locks.
        """
        stmt = (
            select(PremiumSubscription)
            .where(PremiumSubscription.user_id == user_id)
            .with_for_update()
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, sub: PremiumSubscription) -> PremiumSubscription:
        self._session.add(sub)
        await self._session.flush()
        await self._session.refresh(sub)
        return sub

    async def update_period(
        self,
        sub: PremiumSubscription,
        plan_id: uuid.UUID,
        period_start: datetime,
        period_end: datetime,
        status: SubscriptionStatus,
    ) -> PremiumSubscription:
        sub.current_plan_id = plan_id
        sub.current_period_start = period_start
        sub.current_period_end = period_end
        sub.status = status
        await self._session.flush()
        await self._session.refresh(sub)
        return sub

    async def atomic_extend_period(
        self,
        user_id: uuid.UUID,
        plan_id: uuid.UUID,
        duration_days: int,
        now: datetime,
    ) -> int:
        """Extend subscription period under a row lock (FOR UPDATE).

        Acquires a row-level lock on PostgreSQL (degrades to db-level
        lock on SQLite) before reading the current period, preventing
        concurrent IPN/admin-grant requests from losing purchased time.

        If the subscription is still active (``current_period_end > now``),
        the duration is stacked on top of the existing end. Otherwise a
        fresh period starts from *now*.

        Returns:
            Number of rows updated (0 = no subscription found, 1 = success).
        """
        sub = await self.get_by_user_id_for_update(user_id)
        if sub is None:
            return 0

        duration = timedelta(days=duration_days)
        current_end = sub.current_period_end
        if current_end.tzinfo is None:
            current_end = current_end.replace(tzinfo=UTC)
        current_start = sub.current_period_start
        if current_start.tzinfo is None:
            current_start = current_start.replace(tzinfo=UTC)

        if current_end > now:
            new_start = current_start
            new_end = current_end + duration
        else:
            new_start = now
            new_end = now + duration

        await self.update_period(
            sub=sub,
            plan_id=plan_id,
            period_start=new_start,
            period_end=new_end,
            status=SubscriptionStatus.ACTIVE,
        )
        return 1


class PremiumPaymentOrderRepository:
    """Data access for PremiumPaymentOrder."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, order_id: uuid.UUID) -> PremiumPaymentOrder | None:
        result = await self._session.execute(
            select(PremiumPaymentOrder).where(PremiumPaymentOrder.id == order_id)
        )
        return result.scalar_one_or_none()

    async def get_by_invoice(self, invoice_number: str) -> PremiumPaymentOrder | None:
        result = await self._session.execute(
            select(PremiumPaymentOrder).where(PremiumPaymentOrder.invoice_number == invoice_number)
        )
        return result.scalar_one_or_none()

    async def get_by_sepay_txn_id(self, txn_id: str) -> PremiumPaymentOrder | None:
        result = await self._session.execute(
            select(PremiumPaymentOrder).where(PremiumPaymentOrder.sepay_transaction_id == txn_id)
        )
        return result.scalar_one_or_none()

    async def create(self, order: PremiumPaymentOrder) -> PremiumPaymentOrder:
        self._session.add(order)
        await self._session.flush()
        await self._session.refresh(order)
        return order

    async def claim_pending_order(
        self,
        invoice_number: str,
        sepay_transaction_id: str,
        raw_ipn: str,
        paid_at: datetime,
    ) -> int:
        """Atomically claim a PENDING order by setting it to PAID.

        Uses a conditional UPDATE to prevent race conditions: only one
        concurrent request can successfully transition PENDING -> PAID.

        Returns the number of rows updated (0 or 1).
        """
        result = await self._session.execute(
            update(PremiumPaymentOrder)
            .where(
                PremiumPaymentOrder.invoice_number == invoice_number,
                PremiumPaymentOrder.status == PaymentOrderStatus.PENDING,
            )
            .values(
                status=PaymentOrderStatus.PAID,
                sepay_transaction_id=sepay_transaction_id,
                raw_ipn=raw_ipn,
                paid_at=paid_at,
                grant_type="payment",
            )
        )
        return int(result.rowcount)  # type: ignore[attr-defined]

    async def mark_admin_grant(
        self,
        order: PremiumPaymentOrder,
        admin_id: uuid.UUID,
        note: str | None,
        paid_at: datetime,
    ) -> PremiumPaymentOrder:
        order.status = PaymentOrderStatus.PAID
        order.paid_at = paid_at
        order.grant_type = "admin_grant"
        order.granted_by_user_id = admin_id
        order.grant_note = note
        await self._session.flush()
        await self._session.refresh(order)
        return order

    async def cancel_pending_for_user(self, user_id: uuid.UUID) -> None:
        """Cancel all pending orders for a user (housekeeping)."""
        await self._session.execute(
            update(PremiumPaymentOrder)
            .where(
                PremiumPaymentOrder.user_id == user_id,
                PremiumPaymentOrder.status == PaymentOrderStatus.PENDING,
            )
            .values(status=PaymentOrderStatus.CANCELLED)
        )
