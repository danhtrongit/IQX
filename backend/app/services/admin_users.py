"""Admin user operations: 360, bulk, reset, export, login history."""
from __future__ import annotations

import csv
import io
import secrets
import string
import uuid
from datetime import UTC, datetime
from typing import AsyncGenerator

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps_audit import AuditContext
from app.core.exceptions import BadRequestError, NotFoundError
from app.core.security import hash_password
from app.models.login_history import UserLoginHistory
from app.models.premium import (
    PremiumPaymentOrder,
    PremiumPlan,
    PremiumSubscription,
    SubscriptionStatus,
)
from app.models.user import User, UserRole, UserStatus
from app.models.virtual_trading import VirtualOrder, VirtualTradingAccount
from app.schemas.admin_users import (
    BulkOp,
    BulkUpdateError,
    BulkUpdateRequest,
    BulkUpdateResponse,
    LoginHistoryRow,
    PaymentOrderBrief,
    PlanBrief,
    ResetPasswordResponse,
    SubscriptionBrief,
    User360Response,
    UserBriefForAdmin,
    UserExportParams,
    VTAccountBrief,
    VTOrderBrief,
)
from app.services.admin_audit import AdminAuditService, diff_dict
from app.services.email import EmailService


TRIAL_PLAN_CODE = "TRIAL_7D"
EXPORT_MAX_ROWS = 50_000


class AdminUserService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._audit = AdminAuditService(session)

    # ── 360 ───────────────────────────────────────────────────────────────

    async def get_360(self, user_id: uuid.UUID) -> User360Response:
        user = (await self._session.execute(
            select(User).where(User.id == user_id)
        )).scalar_one_or_none()
        if user is None:
            raise NotFoundError("Người dùng")

        # Subscription history (newest first) — also captures current.
        sub_rows = list((await self._session.execute(
            select(PremiumSubscription, PremiumPlan)
            .outerjoin(PremiumPlan, PremiumPlan.id == PremiumSubscription.current_plan_id)
            .where(PremiumSubscription.user_id == user_id)
            .order_by(PremiumSubscription.current_period_start.desc())
        )).all())

        now = datetime.now(UTC)
        current_sub_brief: SubscriptionBrief | None = None
        sub_history: list[SubscriptionBrief] = []
        trial_used = False
        for sub, plan in sub_rows:
            brief = _sub_brief(sub, plan)
            sub_history.append(brief)
            end = sub.current_period_end
            if end and end.tzinfo is None:
                end = end.replace(tzinfo=UTC)
            if (
                current_sub_brief is None
                and sub.status == SubscriptionStatus.ACTIVE
                and end is not None
                and end > now
            ):
                current_sub_brief = brief
            if plan and plan.code == TRIAL_PLAN_CODE:
                trial_used = True

        # Payment history (last 20)
        order_rows = list((await self._session.execute(
            select(PremiumPaymentOrder, PremiumPlan)
            .outerjoin(PremiumPlan, PremiumPlan.id == PremiumPaymentOrder.plan_id)
            .where(PremiumPaymentOrder.user_id == user_id)
            .order_by(PremiumPaymentOrder.created_at.desc())
            .limit(20)
        )).all())
        payment_history = [
            PaymentOrderBrief(
                id=o.id,
                invoice_number=o.invoice_number,
                amount_vnd=o.amount_vnd,
                status=o.status.value,
                grant_type=o.grant_type,
                plan_code=plan.code if plan else None,
                paid_at=o.paid_at,
                created_at=o.created_at,
            )
            for o, plan in order_rows
        ]

        # VT account (1 per user via UniqueConstraint)
        vt_account = (await self._session.execute(
            select(VirtualTradingAccount).where(VirtualTradingAccount.user_id == user_id)
        )).scalar_one_or_none()
        vt_account_brief: VTAccountBrief | None = None
        if vt_account is not None:
            vt_account_brief = VTAccountBrief(
                id=vt_account.id,
                status=vt_account.status.value,
                initial_cash_vnd=vt_account.initial_cash_vnd,
                cash_available_vnd=vt_account.cash_available_vnd,
                cash_reserved_vnd=vt_account.cash_reserved_vnd,
                cash_pending_vnd=vt_account.cash_pending_vnd,
                activated_at=vt_account.activated_at,
                frozen_at=vt_account.frozen_at,
                freeze_reason=vt_account.freeze_reason,
            )

        vt_recent_orders: list[VTOrderBrief] = []
        if vt_account is not None:
            vt_order_rows = (await self._session.execute(
                select(VirtualOrder)
                .where(VirtualOrder.account_id == vt_account.id)
                .order_by(VirtualOrder.created_at.desc())
                .limit(10)
            )).scalars().all()
            vt_recent_orders = [
                VTOrderBrief(
                    id=o.id,
                    symbol=o.symbol,
                    side=o.side.value,
                    status=o.status.value,
                    quantity=o.quantity,
                    price_vnd=o.limit_price_vnd,
                    created_at=o.created_at,
                )
                for o in vt_order_rows
            ]

        # Login history
        login_rows = (await self._session.execute(
            select(UserLoginHistory)
            .where(UserLoginHistory.user_id == user_id)
            .order_by(UserLoginHistory.login_at.desc())
            .limit(20)
        )).scalars().all()
        login_history = [LoginHistoryRow.model_validate(r) for r in login_rows]

        return User360Response(
            user=UserBriefForAdmin.model_validate(user),
            subscription=current_sub_brief,
            subscription_history=sub_history,
            payment_history=payment_history,
            trial_used=trial_used,
            vt_account=vt_account_brief,
            vt_recent_orders=vt_recent_orders,
            login_history=login_history,
        )

    # ── Bulk ──────────────────────────────────────────────────────────────

    async def bulk_update(
        self,
        ctx: AuditContext,
        req: BulkUpdateRequest,
    ) -> BulkUpdateResponse:
        skipped: list[uuid.UUID] = []
        errors: list[BulkUpdateError] = []
        affected = 0

        for uid in req.user_ids:
            user = (await self._session.execute(
                select(User).where(User.id == uid)
            )).scalar_one_or_none()
            if user is None:
                skipped.append(uid)
                continue

            try:
                before = {"role": user.role.value, "status": user.status.value}
                if req.op == BulkOp.SET_ROLE:
                    try:
                        new_role = UserRole(req.value)
                    except ValueError:
                        errors.append(BulkUpdateError(user_id=uid, message=f"invalid role: {req.value}"))
                        continue
                    user.role = new_role
                    after = {"role": new_role.value, "status": user.status.value}
                elif req.op == BulkOp.SET_STATUS:
                    try:
                        new_status = UserStatus(req.value)
                    except ValueError:
                        errors.append(BulkUpdateError(user_id=uid, message=f"invalid status: {req.value}"))
                        continue
                    user.status = new_status
                    after = {"role": user.role.value, "status": new_status.value}
                elif req.op == BulkOp.SOFT_DELETE:
                    user.status = UserStatus.DELETED
                    user.deleted_at = datetime.now(UTC)
                    after = {"role": user.role.value, "status": UserStatus.DELETED.value}
                else:
                    errors.append(BulkUpdateError(user_id=uid, message="unknown op"))
                    continue
                await self._session.flush()
                b_diff, a_diff = diff_dict(before, after)
                await self._audit.record(
                    ctx,
                    action="user.bulk_update",
                    target_entity="user",
                    target_id=str(uid),
                    before=b_diff,
                    after=a_diff,
                    note=req.op.value,
                )
                affected += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(BulkUpdateError(user_id=uid, message=str(exc)))

        return BulkUpdateResponse(affected=affected, skipped=skipped, errors=errors)

    # ── Reset password ────────────────────────────────────────────────────

    async def reset_password(
        self, ctx: AuditContext, user_id: uuid.UUID
    ) -> ResetPasswordResponse:
        user = (await self._session.execute(
            select(User).where(User.id == user_id)
        )).scalar_one_or_none()
        if user is None:
            raise NotFoundError("Người dùng")
        # 16-char alphanumeric + symbols subset — cryptographically random
        alphabet = string.ascii_letters + string.digits + "@#$%&*"
        temp = "".join(secrets.choice(alphabet) for _ in range(16))
        user.hashed_password = hash_password(temp)
        await self._session.flush()
        # Email the user a self-service reset link (best-effort). Signed against
        # the NEW hash so it stays valid until they set their own password.
        sent = await EmailService().send_password_reset_email(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            hashed_password=user.hashed_password,
        )
        await self._audit.record(
            ctx,
            action="user.password_reset",
            target_entity="user",
            target_id=str(user.id),
            note="admin reset; temp password issued; reset email "
            + ("sent" if sent else "skipped/failed"),
        )
        return ResetPasswordResponse(temporary_password=temp)

    # ── Resend verification ───────────────────────────────────────────────

    async def resend_verification(
        self, ctx: AuditContext, user_id: uuid.UUID
    ) -> None:
        user = (await self._session.execute(
            select(User).where(User.id == user_id)
        )).scalar_one_or_none()
        if user is None:
            raise NotFoundError("Người dùng")
        sent = await EmailService().send_verification_email(
            user_id=user.id, email=user.email, full_name=user.full_name
        )
        await self._audit.record(
            ctx,
            action="user.verify_resend",
            target_entity="user",
            target_id=str(user.id),
            note="verification email " + ("sent" if sent else "skipped/failed"),
        )

    # ── Login history (paginated) ─────────────────────────────────────────

    async def login_history(
        self,
        user_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[UserLoginHistory], int]:
        total = (await self._session.execute(
            select(func.count()).select_from(UserLoginHistory)
            .where(UserLoginHistory.user_id == user_id)
        )).scalar_one()
        rows = (await self._session.execute(
            select(UserLoginHistory)
            .where(UserLoginHistory.user_id == user_id)
            .order_by(UserLoginHistory.login_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )).scalars().all()
        return list(rows), int(total)

    # ── CSV export ────────────────────────────────────────────────────────

    async def count_for_export(self, params: UserExportParams) -> int:
        stmt = select(func.count()).select_from(User)
        stmt = _apply_user_filters(stmt, params)
        return int((await self._session.execute(stmt)).scalar_one())

    async def stream_csv(
        self, ctx: AuditContext, params: UserExportParams
    ) -> AsyncGenerator[bytes, None]:
        # Count is already verified by the endpoint before streaming begins.
        # Re-count here for the audit row (single source of truth).
        total = await self.count_for_export(params)
        await self._audit.record(
            ctx,
            action="user.export",
            target_entity="user",
            after={"row_count": total, "filters": params.model_dump(mode="json")},
        )
        # Stream rows in batches of 500
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "id", "email", "full_name", "phone_e164",
            "role", "status", "is_email_verified",
            "last_login_at", "created_at",
        ])
        yield buf.getvalue().encode("utf-8")
        buf.seek(0)
        buf.truncate(0)

        page_size = 500
        offset = 0
        while True:
            stmt = (
                select(User)
                .order_by(User.created_at.desc())
                .limit(page_size)
                .offset(offset)
            )
            stmt = _apply_user_filters(stmt, params)
            chunk = (await self._session.execute(stmt)).scalars().all()
            if not chunk:
                break
            for u in chunk:
                writer.writerow([
                    str(u.id),
                    u.email,
                    u.full_name,
                    u.phone_e164 or "",
                    u.role.value,
                    u.status.value,
                    "1" if u.is_email_verified else "0",
                    u.last_login_at.isoformat() if u.last_login_at else "",
                    u.created_at.isoformat() if u.created_at else "",
                ])
            yield buf.getvalue().encode("utf-8")
            buf.seek(0)
            buf.truncate(0)
            offset += page_size
            if len(chunk) < page_size:
                break


# ── Filter helper (module-level so count_for_export can share it) ─────────


def _apply_user_filters(stmt, params: UserExportParams):
    if params.role:
        stmt = stmt.where(User.role == UserRole(params.role))
    if params.status:
        stmt = stmt.where(User.status == UserStatus(params.status))
    if params.search:
        term = f"%{params.search}%"
        stmt = stmt.where(
            (User.email.ilike(term))
            | (User.full_name.ilike(term))
        )
    if params.last_login_from:
        stmt = stmt.where(User.last_login_at >= params.last_login_from)
    if params.last_login_to:
        stmt = stmt.where(User.last_login_at < params.last_login_to)
    return stmt


# ── Helpers ───────────────────────────────────────────────────────────────


def _sub_brief(sub: PremiumSubscription, plan: PremiumPlan | None) -> SubscriptionBrief:
    is_trial = plan is not None and plan.code == TRIAL_PLAN_CODE
    plan_brief = (
        PlanBrief(
            id=plan.id,
            code=plan.code,
            name=plan.name,
            price_vnd=plan.price_vnd,
            duration_days=plan.duration_days,
        )
        if plan
        else None
    )
    return SubscriptionBrief(
        id=sub.id,
        status=sub.status.value,
        plan=plan_brief,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        is_trial=is_trial,
        cancelled_at=sub.cancelled_at,
        cancelled_by_user_id=sub.cancelled_by_user_id,
        cancel_reason=sub.cancel_reason,
    )
