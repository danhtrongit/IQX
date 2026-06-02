"""Admin payment order service — list, detail, refund, reconcile."""

from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps_audit import AuditContext
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.ipn_log import SePayIPNLog
from app.models.premium import (
    PaymentOrderStatus,
    PremiumPaymentOrder,
    PremiumPlan,
    PremiumSubscription,
    SubscriptionStatus,
)
from app.models.user import User
from app.schemas.admin_payments import AdminPaymentOrderBrief, AdminPaymentOrderDetail
from app.schemas.common import PaginatedResponse
from app.services.admin_audit import AdminAuditService


class AdminPaymentService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── list ────────────────────────────────────────────────────────────────

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        grant_type: str | None = None,
        user_id: uuid.UUID | None = None,
        plan_id: uuid.UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        search: str | None = None,
    ) -> PaginatedResponse[AdminPaymentOrderBrief]:
        conditions: list[Any] = []
        if status:
            conditions.append(PremiumPaymentOrder.status == status)
        if grant_type:
            conditions.append(PremiumPaymentOrder.grant_type == grant_type)
        if user_id:
            conditions.append(PremiumPaymentOrder.user_id == user_id)
        if plan_id:
            conditions.append(PremiumPaymentOrder.plan_id == plan_id)
        if date_from:
            conditions.append(PremiumPaymentOrder.created_at >= date_from)
        if date_to:
            conditions.append(PremiumPaymentOrder.created_at < date_to)
        if search:
            conditions.append(
                or_(
                    PremiumPaymentOrder.invoice_number.ilike(f"%{search}%"),
                    User.email.ilike(f"%{search}%"),
                )
            )

        where = and_(*conditions) if conditions else None

        # Subquery: count IPN logs per order
        ipn_count_sq = (
            select(
                SePayIPNLog.matched_order_id,
                func.count(SePayIPNLog.id).label("cnt"),
            )
            .group_by(SePayIPNLog.matched_order_id)
            .subquery()
        )

        base = (
            select(
                PremiumPaymentOrder,
                PremiumPlan.name.label("plan_name"),
                PremiumPlan.code.label("plan_code"),
                User.email.label("user_email"),
                func.coalesce(ipn_count_sq.c.cnt, 0).label("ipn_log_count"),
            )
            .join(PremiumPlan, PremiumPlan.id == PremiumPaymentOrder.plan_id, isouter=True)
            .join(User, User.id == PremiumPaymentOrder.user_id, isouter=True)
            .outerjoin(ipn_count_sq, ipn_count_sq.c.matched_order_id == PremiumPaymentOrder.id)
        )
        if where is not None:
            base = base.where(where)

        # total count
        count_stmt = select(func.count()).select_from(base.subquery())
        total: int = (await self._session.execute(count_stmt)).scalar_one()

        items_stmt = (
            base.order_by(PremiumPaymentOrder.created_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        rows = (await self._session.execute(items_stmt)).all()

        items = [
            AdminPaymentOrderBrief(
                id=r.PremiumPaymentOrder.id,
                invoice_number=r.PremiumPaymentOrder.invoice_number,
                amount_vnd=r.PremiumPaymentOrder.amount_vnd,
                currency=r.PremiumPaymentOrder.currency,
                status=r.PremiumPaymentOrder.status,
                grant_type=r.PremiumPaymentOrder.grant_type,
                paid_at=r.PremiumPaymentOrder.paid_at,
                created_at=r.PremiumPaymentOrder.created_at,
                plan_id=r.PremiumPaymentOrder.plan_id,
                plan_name=r.plan_name,
                plan_code=r.plan_code,
                user_id=r.PremiumPaymentOrder.user_id,
                user_email=r.user_email,
                ipn_log_count=r.ipn_log_count,
            )
            for r in rows
        ]

        total_pages = math.ceil(total / page_size) if total > 0 else 0
        return PaginatedResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    # ── get ─────────────────────────────────────────────────────────────────

    async def get(self, order_id: uuid.UUID) -> AdminPaymentOrderDetail:
        order = await self._get_order_or_404(order_id)

        # plan
        plan = None
        if order.plan_id:
            plan = (
                await self._session.execute(
                    select(PremiumPlan).where(PremiumPlan.id == order.plan_id)
                )
            ).scalar_one_or_none()

        # user
        user = (
            await self._session.execute(select(User).where(User.id == order.user_id))
        ).scalar_one_or_none()

        # subscription
        sub = (
            await self._session.execute(
                select(PremiumSubscription).where(
                    PremiumSubscription.user_id == order.user_id
                )
            )
        ).scalar_one_or_none()

        # recent IPN logs
        ipn_rows = list(
            (
                await self._session.execute(
                    select(SePayIPNLog)
                    .where(SePayIPNLog.matched_order_id == order_id)
                    .order_by(SePayIPNLog.received_at.desc())
                    .limit(10)
                )
            ).scalars()
        )

        ipn_logs = [
            {
                "id": str(r.id),
                "received_at": r.received_at.isoformat() if r.received_at else None,
                "secret_key_valid": r.secret_key_valid,
                "result_status": r.result_status,
                "sepay_transaction_id": r.sepay_transaction_id,
                "error_message": r.error_message,
            }
            for r in ipn_rows
        ]

        return AdminPaymentOrderDetail(
            id=order.id,
            invoice_number=order.invoice_number,
            amount_vnd=order.amount_vnd,
            currency=order.currency,
            status=order.status,
            grant_type=order.grant_type,
            grant_note=order.grant_note,
            paid_at=order.paid_at,
            created_at=order.created_at,
            updated_at=order.updated_at,
            plan_id=order.plan_id,
            plan_name=plan.name if plan else None,
            plan_code=plan.code if plan else None,
            plan_price_vnd=plan.price_vnd if plan else None,
            user_id=order.user_id,
            user_email=user.email if user else None,
            subscription_id=sub.id if sub else None,
            subscription_status=sub.status if sub else None,
            subscription_period_end=sub.current_period_end if sub else None,
            ipn_logs=ipn_logs,
        )

    # ── refund ───────────────────────────────────────────────────────────────

    async def refund(
        self,
        order_id: uuid.UUID,
        ctx: AuditContext,
        reason: str,
    ) -> AdminPaymentOrderDetail:
        """Refund a PAID order. Cancels active subscription if still in future."""
        order = await self._get_order_or_404(order_id)

        if order.status != PaymentOrderStatus.PAID:
            raise BadRequestError(
                f"Chỉ có thể hoàn tiền cho đơn hàng ở trạng thái PAID (hiện tại: {order.status})"
            )

        now = datetime.now(UTC)

        # Refund the order
        order.status = PaymentOrderStatus.REFUNDED
        await self._session.flush()

        audit = AdminAuditService(self._session)
        await audit.record(
            ctx,
            action="premium.order.refund",
            target_entity="payment_order",
            target_id=str(order.id),
            before={"status": "paid"},
            after={"status": "refunded"},
            note=reason,
        )

        # Cancel linked active subscription
        sub = (
            await self._session.execute(
                select(PremiumSubscription).where(
                    PremiumSubscription.user_id == order.user_id
                )
            )
        ).scalar_one_or_none()

        if sub and sub.status == SubscriptionStatus.ACTIVE:
            end = sub.current_period_end
            if end.tzinfo is None:
                end = end.replace(tzinfo=UTC)
            if end > now:
                sub.status = SubscriptionStatus.CANCELLED
                sub.cancelled_at = now
                sub.cancelled_by_user_id = ctx.admin_id
                sub.cancel_reason = f"Refund of order {order.invoice_number}: {reason}"
                await self._session.flush()

                await audit.record(
                    ctx,
                    action="premium.subscription.cancel",
                    target_entity="subscription",
                    target_id=str(sub.id),
                    before={"status": "active"},
                    after={"status": "cancelled"},
                    note=f"Cancelled due to refund of order {order.invoice_number}",
                )

                # Downgrade user role
                from sqlalchemy import update as _update

                from app.models.user import UserRole

                await self._session.execute(
                    _update(User)
                    .where(User.id == order.user_id, User.role == UserRole.PREMIUM)
                    .values(role=UserRole.USER)
                )

        return await self.get(order_id)

    # ── reconcile ────────────────────────────────────────────────────────────

    async def reconcile(
        self,
        order_id: uuid.UUID,
        ctx: AuditContext,
        note: str | None,
    ) -> dict:
        """Attempt to reconcile a stale PENDING order via matching IPN logs.

        Limitations:
            - Only works when a matching SePayIPNLog row exists with
              secret_key_valid=True for this order_id or the order's
              invoice_number / sepay_transaction_id.
            - If no valid IPN log is found → returns status='no_match'.
            - Full re-invocation of PremiumService.process_ipn() is NOT done
              here because the raw IPN payload may differ from the stored
              raw_body shape. Instead we apply a manual mark-as-PAID when
              all checks pass.
        """
        order = await self._get_order_or_404(order_id)

        if order.status != PaymentOrderStatus.PENDING:
            raise BadRequestError(
                f"Chỉ có thể reconcile đơn hàng PENDING (hiện tại: {order.status})"
            )

        now = datetime.now(UTC)
        created = order.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)

        if (now - created) < timedelta(minutes=30):
            raise BadRequestError("Đơn hàng chưa đủ 30 phút để reconcile")

        # Look for a matching valid IPN log
        ipn_log = (
            await self._session.execute(
                select(SePayIPNLog)
                .where(
                    SePayIPNLog.secret_key_valid.is_(True),
                    or_(
                        SePayIPNLog.matched_order_id == order_id,
                        and_(
                            SePayIPNLog.sepay_transaction_id.isnot(None),
                            SePayIPNLog.sepay_transaction_id
                            == order.sepay_transaction_id,
                        ),
                    ),
                )
                .order_by(SePayIPNLog.received_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        audit = AdminAuditService(self._session)

        if ipn_log is None:
            await audit.record(
                ctx,
                action="premium.order.reconcile",
                target_entity="payment_order",
                target_id=str(order.id),
                before={"status": order.status},
                after={"status": "no_match"},
                note=note,
            )
            return {"status": "no_match", "order_id": str(order_id)}

        # Found a valid IPN log — mark order PAID and extend subscription
        sepay_txn_id = ipn_log.sepay_transaction_id or f"reconcile_{order.invoice_number}"
        order.status = PaymentOrderStatus.PAID
        order.paid_at = now
        order.sepay_transaction_id = order.sepay_transaction_id or sepay_txn_id
        order.grant_type = order.grant_type or "payment"
        await self._session.flush()

        # Extend subscription
        plan = (
            await self._session.execute(
                select(PremiumPlan).where(PremiumPlan.id == order.plan_id)
            )
        ).scalar_one_or_none()
        if plan:
            from app.services.premium import PremiumService

            svc = PremiumService(self._session)
            await svc._extend_subscription(user_id=order.user_id, plan=plan)

        await audit.record(
            ctx,
            action="premium.order.reconcile",
            target_entity="payment_order",
            target_id=str(order.id),
            before={"status": "pending"},
            after={"status": "paid"},
            note=note,
        )

        return {"status": "reconciled", "order_id": str(order_id)}

    # ── helpers ──────────────────────────────────────────────────────────────

    async def _get_order_or_404(self, order_id: uuid.UUID) -> PremiumPaymentOrder:
        order = (
            await self._session.execute(
                select(PremiumPaymentOrder).where(PremiumPaymentOrder.id == order_id)
            )
        ).scalar_one_or_none()
        if order is None:
            raise NotFoundError("đơn hàng")
        return order
