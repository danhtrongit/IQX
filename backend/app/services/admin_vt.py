"""Admin VT operations: freeze, unfreeze, cash-adjust, account 360 (Phase 3)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps_audit import AuditContext
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.virtual_trading import (
    AccountStatus,
    VirtualCashLedger,
    VirtualTradingAccount,
)
from app.services.admin_audit import AdminAuditService


CASH_ADJUST_KIND = "admin_adjust"


class AdminVTService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._audit = AdminAuditService(session)

    async def freeze(
        self,
        account_id: uuid.UUID,
        ctx: AuditContext,
        reason: str,
    ) -> VirtualTradingAccount:
        if not reason or not reason.strip():
            raise BadRequestError("Lý do (reason) bắt buộc")
        acct = await self._get(account_id)
        if acct.frozen_at is not None:
            raise BadRequestError("Tài khoản đã bị tạm khóa")
        before = {
            "frozen_at": None,
            "freeze_reason": None,
            "status": acct.status.value,
        }
        acct.frozen_at = datetime.now(UTC)
        acct.frozen_by_user_id = ctx.admin_id
        acct.freeze_reason = reason.strip()
        # AccountStatus has SUSPENDED — flip status
        acct.status = AccountStatus.SUSPENDED
        await self._session.flush()
        after = {
            "frozen_at": acct.frozen_at.isoformat(),
            "freeze_reason": reason.strip(),
            "status": acct.status.value,
        }
        await self._audit.record(
            ctx,
            action="vt.account.freeze",
            target_entity="vt_account",
            target_id=str(acct.id),
            before=before,
            after=after,
            note=reason.strip(),
        )
        return acct

    async def unfreeze(
        self,
        account_id: uuid.UUID,
        ctx: AuditContext,
        reason: str,
    ) -> VirtualTradingAccount:
        acct = await self._get(account_id)
        if acct.frozen_at is None:
            raise BadRequestError("Tài khoản đang không bị khóa")
        before = {
            "frozen_at": acct.frozen_at.isoformat(),
            "freeze_reason": acct.freeze_reason,
            "status": acct.status.value,
        }
        acct.frozen_at = None
        acct.frozen_by_user_id = None
        acct.freeze_reason = None
        acct.status = AccountStatus.ACTIVE
        await self._session.flush()
        after = {
            "frozen_at": None,
            "freeze_reason": None,
            "status": acct.status.value,
        }
        await self._audit.record(
            ctx,
            action="vt.account.unfreeze",
            target_entity="vt_account",
            target_id=str(acct.id),
            before=before,
            after=after,
            note=reason.strip() if reason else None,
        )
        return acct

    async def cash_adjust(
        self,
        account_id: uuid.UUID,
        ctx: AuditContext,
        *,
        amount_vnd: int,
        reason: str,
    ) -> tuple[VirtualTradingAccount, VirtualCashLedger]:
        if amount_vnd == 0:
            raise BadRequestError("Số tiền điều chỉnh khác 0")
        if not reason or not reason.strip():
            raise BadRequestError("Lý do (reason) bắt buộc khi điều chỉnh tiền")
        acct = await self._get(account_id)
        # No negative cash result allowed
        new_cash = acct.cash_available_vnd + amount_vnd
        if new_cash < 0:
            raise BadRequestError(
                f"Số dư không đủ để trừ {abs(amount_vnd):,} VND "
                f"(hiện tại: {acct.cash_available_vnd:,})"
            )
        before = {"cash_available_vnd": acct.cash_available_vnd}
        acct.cash_available_vnd = new_cash
        # Insert ledger row — VirtualCashLedger.kind is a String column
        ledger = VirtualCashLedger(
            account_id=acct.id,
            amount_vnd=amount_vnd,
            balance_after_vnd=new_cash,
            kind=CASH_ADJUST_KIND,
            reference_type="admin_audit",
            note=reason.strip(),
        )
        self._session.add(ledger)
        await self._session.flush()
        after = {
            "cash_available_vnd": new_cash,
            "ledger_id": str(ledger.id),
        }
        await self._audit.record(
            ctx,
            action="vt.cash.adjust",
            target_entity="vt_account",
            target_id=str(acct.id),
            before=before,
            after=after,
            note=reason.strip(),
        )
        return acct, ledger

    async def _get(self, account_id: uuid.UUID) -> VirtualTradingAccount:
        acct = (
            await self._session.execute(
                select(VirtualTradingAccount).where(
                    VirtualTradingAccount.id == account_id
                )
            )
        ).scalar_one_or_none()
        if acct is None:
            raise NotFoundError("Tài khoản giao dịch ảo")
        return acct
