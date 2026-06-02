"""Admin VT operations: freeze, unfreeze, cash-adjust, account 360 (Phase 3)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps_audit import AuditContext
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.virtual_trading import (
    AccountStatus,
    VirtualCashLedger,
    VirtualOrder,
    VirtualPosition,
    VirtualSettlement,
    VirtualTrade,
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

    # ── Account 360 methods ────────────────────────────────────────────────────

    async def get_account(self, account_id: uuid.UUID) -> VirtualTradingAccount:
        """Fetch single account by ID (admin — no user scoping)."""
        return await self._get(account_id)

    async def list_positions(self, account_id: uuid.UUID) -> list[VirtualPosition]:
        """Return all positions for the given account."""
        result = await self._session.execute(
            select(VirtualPosition)
            .where(VirtualPosition.account_id == account_id)
            .order_by(VirtualPosition.symbol)
        )
        return list(result.scalars().all())

    async def list_orders(
        self,
        account_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 50,
        status: str | None = None,
        symbol: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> dict[str, Any]:
        """Paginated orders for an account with optional filters."""
        # Ensure account exists
        await self._get(account_id)

        base = select(VirtualOrder).where(VirtualOrder.account_id == account_id)
        count_base = select(func.count()).select_from(VirtualOrder).where(
            VirtualOrder.account_id == account_id
        )

        if status:
            base = base.where(VirtualOrder.status == status)
            count_base = count_base.where(VirtualOrder.status == status)
        if symbol:
            base = base.where(VirtualOrder.symbol == symbol.upper())
            count_base = count_base.where(VirtualOrder.symbol == symbol.upper())
        if date_from:
            from datetime import date as _date
            df = _date.fromisoformat(date_from)
            base = base.where(VirtualOrder.trading_date >= df)
            count_base = count_base.where(VirtualOrder.trading_date >= df)
        if date_to:
            from datetime import date as _date
            dt = _date.fromisoformat(date_to)
            base = base.where(VirtualOrder.trading_date <= dt)
            count_base = count_base.where(VirtualOrder.trading_date <= dt)

        total = (await self._session.execute(count_base)).scalar() or 0
        items = list(
            (
                await self._session.execute(
                    base.order_by(VirtualOrder.created_at.desc())
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            )
            .scalars()
            .all()
        )
        return {
            "items": items,
            "total": int(total),
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (int(total) + page_size - 1) // page_size),
        }

    async def list_trades(
        self,
        account_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 50,
        symbol: str | None = None,
    ) -> dict[str, Any]:
        """Paginated trades for an account."""
        await self._get(account_id)

        base = select(VirtualTrade).where(VirtualTrade.account_id == account_id)
        count_base = select(func.count()).select_from(VirtualTrade).where(
            VirtualTrade.account_id == account_id
        )

        if symbol:
            base = base.where(VirtualTrade.symbol == symbol.upper())
            count_base = count_base.where(VirtualTrade.symbol == symbol.upper())

        total = (await self._session.execute(count_base)).scalar() or 0
        items = list(
            (
                await self._session.execute(
                    base.order_by(VirtualTrade.traded_at.desc())
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            )
            .scalars()
            .all()
        )
        return {
            "items": items,
            "total": int(total),
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (int(total) + page_size - 1) // page_size),
        }

    async def list_ledger(
        self,
        account_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 50,
        kind: str | None = None,
    ) -> dict[str, Any]:
        """Paginated cash ledger for an account."""
        await self._get(account_id)

        base = select(VirtualCashLedger).where(VirtualCashLedger.account_id == account_id)
        count_base = select(func.count()).select_from(VirtualCashLedger).where(
            VirtualCashLedger.account_id == account_id
        )

        if kind:
            base = base.where(VirtualCashLedger.kind == kind)
            count_base = count_base.where(VirtualCashLedger.kind == kind)

        total = (await self._session.execute(count_base)).scalar() or 0
        items = list(
            (
                await self._session.execute(
                    base.order_by(VirtualCashLedger.created_at.desc())
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            )
            .scalars()
            .all()
        )
        return {
            "items": items,
            "total": int(total),
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (int(total) + page_size - 1) // page_size),
        }

    async def list_settlements(
        self,
        account_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 50,
        status: str | None = None,
    ) -> dict[str, Any]:
        """Paginated settlements for an account."""
        await self._get(account_id)

        base = select(VirtualSettlement).where(VirtualSettlement.account_id == account_id)
        count_base = select(func.count()).select_from(VirtualSettlement).where(
            VirtualSettlement.account_id == account_id
        )

        if status:
            base = base.where(VirtualSettlement.status == status)
            count_base = count_base.where(VirtualSettlement.status == status)

        total = (await self._session.execute(count_base)).scalar() or 0
        items = list(
            (
                await self._session.execute(
                    base.order_by(VirtualSettlement.created_at.desc())
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            )
            .scalars()
            .all()
        )
        return {
            "items": items,
            "total": int(total),
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (int(total) + page_size - 1) // page_size),
        }

    async def get_stats(self, account_id: uuid.UUID) -> dict[str, Any]:
        """Compute account-level stats.

        Simplification: realized PnL approximated from cash ledger sums.
        The ledger kind for trades is 'buy' (negative cash flow) and 'sell'
        (positive cash flow), as written by VirtualTradingService._fill_order_at_price.
        PnL ≈ sum(sell ledger amounts) + sum(buy ledger amounts) since buy amounts
        are negative and sell amounts are positive.
        win_rate is not computed (stubbed as None — requires per-symbol cost basis
        tracking at fill time).
        """
        await self._get(account_id)

        # Total orders count
        total_orders = (
            await self._session.execute(
                select(func.count()).select_from(VirtualOrder).where(
                    VirtualOrder.account_id == account_id
                )
            )
        ).scalar() or 0

        # Total trades count
        total_trades = (
            await self._session.execute(
                select(func.count()).select_from(VirtualTrade).where(
                    VirtualTrade.account_id == account_id
                )
            )
        ).scalar() or 0

        # Gross buy: sum of |net_amount_vnd| for BUY trades (net is negative for buys)
        buy_sum_result = (
            await self._session.execute(
                select(func.sum(VirtualTrade.net_amount_vnd)).where(
                    VirtualTrade.account_id == account_id,
                    VirtualTrade.side == "buy",
                )
            )
        ).scalar()
        gross_buy_vnd = abs(int(buy_sum_result or 0))

        # Gross sell: sum of net_amount_vnd for SELL trades (positive)
        sell_sum_result = (
            await self._session.execute(
                select(func.sum(VirtualTrade.net_amount_vnd)).where(
                    VirtualTrade.account_id == account_id,
                    VirtualTrade.side == "sell",
                )
            )
        ).scalar()
        gross_sell_vnd = int(sell_sum_result or 0)

        # Realized PnL ≈ proceeds from sells minus cost of buys
        realized_pnl_vnd = gross_sell_vnd - gross_buy_vnd

        # Turnover = gross buy + gross sell (both sides)
        turnover_vnd = gross_buy_vnd + gross_sell_vnd

        return {
            "account_id": account_id,
            "total_orders": int(total_orders),
            "total_trades": int(total_trades),
            "gross_buy_vnd": gross_buy_vnd,
            "gross_sell_vnd": gross_sell_vnd,
            "realized_pnl_vnd": realized_pnl_vnd,
            "turnover_vnd": turnover_vnd,
            "win_rate": None,  # Stubbed — requires per-fill cost basis tracking
        }

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
