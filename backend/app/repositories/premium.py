"""Premium repository — data access for plans, subscriptions, and payment orders."""

from __future__ import annotations

import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.premium import (
    PaymentOrderStatus,
    PremiumPaymentOrder,
    PremiumPlan,
    PremiumSubscription,
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

    async def upsert(self, sub: PremiumSubscription) -> PremiumSubscription:
        """Insert or update subscription (merge by user_id unique constraint)."""
        merged = await self._session.merge(sub)
        await self._session.flush()
        await self._session.refresh(merged)
        return merged

    async def create(self, sub: PremiumSubscription) -> PremiumSubscription:
        self._session.add(sub)
        await self._session.flush()
        await self._session.refresh(sub)
        return sub

    async def update_period(
        self,
        sub: PremiumSubscription,
        plan_id: uuid.UUID,
        period_start: object,
        period_end: object,
        status: object,
    ) -> PremiumSubscription:
        sub.current_plan_id = plan_id
        sub.current_period_start = period_start  # type: ignore[assignment]
        sub.current_period_end = period_end  # type: ignore[assignment]
        sub.status = status  # type: ignore[assignment]
        await self._session.flush()
        await self._session.refresh(sub)
        return sub


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

    async def mark_paid(
        self,
        order: PremiumPaymentOrder,
        sepay_transaction_id: str,
        raw_ipn: str,
        paid_at: object,
    ) -> PremiumPaymentOrder:
        order.status = PaymentOrderStatus.PAID
        order.sepay_transaction_id = sepay_transaction_id
        order.raw_ipn = raw_ipn
        order.paid_at = paid_at  # type: ignore[assignment]
        order.grant_type = "payment"
        await self._session.flush()
        await self._session.refresh(order)
        return order

    async def mark_admin_grant(
        self,
        order: PremiumPaymentOrder,
        admin_id: uuid.UUID,
        note: str | None,
        paid_at: object,
    ) -> PremiumPaymentOrder:
        order.status = PaymentOrderStatus.PAID
        order.paid_at = paid_at  # type: ignore[assignment]
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
