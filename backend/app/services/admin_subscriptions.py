"""Admin subscription service — list, get, cancel, extend."""

from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps_audit import AuditContext
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.premium import PremiumPlan, PremiumSubscription, SubscriptionStatus
from app.models.user import User, UserRole
from app.schemas.admin_subscriptions import AdminSubscriptionBrief, AdminSubscriptionDetail
from app.schemas.common import PaginatedResponse
from app.services.admin_audit import AdminAuditService


def _ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


class AdminSubscriptionService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── list ────────────────────────────────────────────────────────────────

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        plan_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        expiring_within_days: int | None = None,
    ) -> PaginatedResponse[AdminSubscriptionBrief]:
        conditions: list[Any] = []
        if status:
            conditions.append(PremiumSubscription.status == status)
        if plan_id:
            conditions.append(PremiumSubscription.current_plan_id == plan_id)
        if user_id:
            conditions.append(PremiumSubscription.user_id == user_id)
        if expiring_within_days is not None:
            now = datetime.now(UTC)
            cutoff = now + timedelta(days=expiring_within_days)
            conditions.append(PremiumSubscription.status == SubscriptionStatus.ACTIVE)
            conditions.append(PremiumSubscription.current_period_end < cutoff)

        where = and_(*conditions) if conditions else None

        base = (
            select(
                PremiumSubscription,
                PremiumPlan.name.label("plan_name"),
                PremiumPlan.code.label("plan_code"),
                User.email.label("user_email"),
            )
            .join(PremiumPlan, PremiumPlan.id == PremiumSubscription.current_plan_id, isouter=True)
            .join(User, User.id == PremiumSubscription.user_id, isouter=True)
        )
        if where is not None:
            base = base.where(where)

        count_stmt = select(func.count()).select_from(base.subquery())
        total: int = (await self._session.execute(count_stmt)).scalar_one()

        items_stmt = (
            base.order_by(PremiumSubscription.created_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        rows = (await self._session.execute(items_stmt)).all()

        items = [self._row_to_brief(r) for r in rows]
        total_pages = math.ceil(total / page_size) if total > 0 else 0
        return PaginatedResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    # ── get ─────────────────────────────────────────────────────────────────

    async def get(self, sub_id: uuid.UUID) -> AdminSubscriptionDetail:
        row = await self._fetch_detail_row(sub_id)
        return self._row_to_detail(row)

    # ── list_user_history ────────────────────────────────────────────────────

    async def list_user_history(self, user_id: uuid.UUID) -> list[AdminSubscriptionDetail]:
        """All subscriptions for a user, newest first.

        Note: Since PremiumSubscription has a unique constraint on user_id,
        only one row will ever exist per user in the current schema.
        This returns a list for forward-compatibility with history tracking.
        """
        stmt = (
            select(
                PremiumSubscription,
                PremiumPlan.name.label("plan_name"),
                PremiumPlan.code.label("plan_code"),
                User.email.label("user_email"),
            )
            .join(PremiumPlan, PremiumPlan.id == PremiumSubscription.current_plan_id, isouter=True)
            .join(User, User.id == PremiumSubscription.user_id, isouter=True)
            .where(PremiumSubscription.user_id == user_id)
            .order_by(PremiumSubscription.created_at.desc())
        )
        rows = (await self._session.execute(stmt)).all()
        return [self._row_to_detail(r) for r in rows]

    # ── cancel ───────────────────────────────────────────────────────────────

    async def cancel(
        self,
        sub_id: uuid.UUID,
        ctx: AuditContext,
        reason: str,
    ) -> AdminSubscriptionDetail:
        sub = await self._get_sub_or_404(sub_id)

        if sub.status == SubscriptionStatus.CANCELLED:
            raise BadRequestError("Subscription đã ở trạng thái CANCELLED")

        now = datetime.now(UTC)

        before_status = sub.status.value if hasattr(sub.status, "value") else str(sub.status)
        sub.status = SubscriptionStatus.CANCELLED
        sub.cancelled_at = now
        sub.cancelled_by_user_id = ctx.admin_id
        sub.cancel_reason = reason
        await self._session.flush()

        # Downgrade user role if period is still in future (NEVER touch ADMIN)
        end = _ensure_aware(sub.current_period_end)
        if end > now:
            await self._session.execute(
                update(User)
                .where(User.id == sub.user_id, User.role == UserRole.PREMIUM)
                .values(role=UserRole.USER)
            )

        await AdminAuditService(self._session).record(
            ctx,
            action="subscription.cancel",
            target_entity="subscription",
            target_id=str(sub.id),
            before={"status": before_status},
            after={"status": "cancelled"},
            note=reason,
        )

        return await self.get(sub_id)

    # ── extend ───────────────────────────────────────────────────────────────

    async def extend(
        self,
        sub_id: uuid.UUID,
        ctx: AuditContext,
        days: int,
        reason: str | None,
    ) -> AdminSubscriptionDetail:
        sub = await self._get_sub_or_404(sub_id)

        now = datetime.now(UTC)
        before_end = _ensure_aware(sub.current_period_end)
        before_status = sub.status.value if hasattr(sub.status, "value") else str(sub.status)

        new_end = before_end + timedelta(days=days)
        sub.current_period_end = new_end

        # If subscription was EXPIRED and now valid → flip to ACTIVE
        was_expired = sub.status == SubscriptionStatus.EXPIRED or before_end <= now
        if was_expired and new_end > now:
            sub.status = SubscriptionStatus.ACTIVE
            # Upgrade user.role back to PREMIUM (NEVER touch ADMIN)
            await self._session.execute(
                update(User)
                .where(User.id == sub.user_id, User.role == UserRole.USER)
                .values(role=UserRole.PREMIUM)
            )

        await self._session.flush()

        await AdminAuditService(self._session).record(
            ctx,
            action="subscription.extend",
            target_entity="subscription",
            target_id=str(sub.id),
            before={"status": before_status, "current_period_end": str(before_end)},
            after={"status": sub.status.value, "current_period_end": str(new_end), "days_added": days},
            note=reason,
        )

        return await self.get(sub_id)

    # ── helpers ──────────────────────────────────────────────────────────────

    async def _get_sub_or_404(self, sub_id: uuid.UUID) -> PremiumSubscription:
        sub = (
            await self._session.execute(
                select(PremiumSubscription).where(PremiumSubscription.id == sub_id)
            )
        ).scalar_one_or_none()
        if sub is None:
            raise NotFoundError("subscription")
        return sub

    async def _fetch_detail_row(self, sub_id: uuid.UUID):
        stmt = (
            select(
                PremiumSubscription,
                PremiumPlan.name.label("plan_name"),
                PremiumPlan.code.label("plan_code"),
                User.email.label("user_email"),
            )
            .join(PremiumPlan, PremiumPlan.id == PremiumSubscription.current_plan_id, isouter=True)
            .join(User, User.id == PremiumSubscription.user_id, isouter=True)
            .where(PremiumSubscription.id == sub_id)
        )
        row = (await self._session.execute(stmt)).one_or_none()
        if row is None:
            raise NotFoundError("subscription")
        return row

    @staticmethod
    def _row_to_brief(r) -> AdminSubscriptionBrief:
        sub = r.PremiumSubscription
        return AdminSubscriptionBrief(
            id=sub.id,
            user_id=sub.user_id,
            user_email=r.user_email,
            current_plan_id=sub.current_plan_id,
            plan_name=r.plan_name,
            plan_code=r.plan_code,
            current_period_start=sub.current_period_start,
            current_period_end=sub.current_period_end,
            status=sub.status,
            cancelled_at=sub.cancelled_at,
            cancel_reason=sub.cancel_reason,
            created_at=sub.created_at,
        )

    @staticmethod
    def _row_to_detail(r) -> AdminSubscriptionDetail:
        sub = r.PremiumSubscription
        return AdminSubscriptionDetail(
            id=sub.id,
            user_id=sub.user_id,
            user_email=r.user_email,
            current_plan_id=sub.current_plan_id,
            plan_name=r.plan_name,
            plan_code=r.plan_code,
            current_period_start=sub.current_period_start,
            current_period_end=sub.current_period_end,
            status=sub.status,
            cancelled_at=sub.cancelled_at,
            cancel_reason=sub.cancel_reason,
            cancelled_by_user_id=sub.cancelled_by_user_id,
            created_at=sub.created_at,
            updated_at=sub.updated_at,
        )
