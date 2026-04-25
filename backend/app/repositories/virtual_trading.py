"""Virtual Trading repository — data access for all virtual trading models.

Uses SELECT ... FOR UPDATE where needed for race condition protection.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.virtual_trading import (
    AccountStatus,
    OrderSide,
    OrderStatus,
    SettlementMode,
    SettlementStatus,
    VirtualCashLedger,
    VirtualOrder,
    VirtualPosition,
    VirtualSettlement,
    VirtualTrade,
    VirtualTradingAccount,
    VirtualTradingConfig,
)


class VirtualTradingRepository:
    """Data access for virtual trading models."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── Config ───────────────────────────────────────

    async def get_active_config(self) -> VirtualTradingConfig | None:
        result = await self._session.execute(
            select(VirtualTradingConfig).where(VirtualTradingConfig.is_active.is_(True))
        )
        return result.scalar_one_or_none()

    async def create_default_config(self, created_by: uuid.UUID | None = None) -> VirtualTradingConfig:
        """Create default config if none exists."""
        config = VirtualTradingConfig(
            initial_cash_vnd=1_000_000_000,
            buy_fee_rate_bps=15,
            sell_fee_rate_bps=15,
            sell_tax_rate_bps=10,
            settlement_mode=SettlementMode.T0,
            board_lot_size=100,
            trading_enabled=True,
            is_active=True,
            created_by=created_by,
        )
        self._session.add(config)
        await self._session.flush()
        await self._session.refresh(config)
        return config

    async def update_config(
        self, config: VirtualTradingConfig, data: dict[str, object], updated_by: uuid.UUID
    ) -> VirtualTradingConfig:
        for key, value in data.items():
            if key == "holidays" and isinstance(value, list):
                setattr(config, key, json.dumps(value))
            elif key == "settlement_mode" and isinstance(value, str):
                setattr(config, key, SettlementMode(value))
            else:
                setattr(config, key, value)
        config.updated_by = updated_by
        await self._session.flush()
        await self._session.refresh(config)
        return config

    # ── Account ──────────────────────────────────────

    async def get_account_by_user_id(self, user_id: uuid.UUID) -> VirtualTradingAccount | None:
        result = await self._session.execute(
            select(VirtualTradingAccount).where(VirtualTradingAccount.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_account_by_user_id_for_update(self, user_id: uuid.UUID) -> VirtualTradingAccount | None:
        """SELECT ... FOR UPDATE to lock the account row during order operations."""
        result = await self._session.execute(
            select(VirtualTradingAccount)
            .where(VirtualTradingAccount.user_id == user_id)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def get_account_for_update(self, account_id: uuid.UUID) -> VirtualTradingAccount | None:
        result = await self._session.execute(
            select(VirtualTradingAccount)
            .where(VirtualTradingAccount.id == account_id)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def create_account(
        self, user_id: uuid.UUID, initial_cash_vnd: int
    ) -> VirtualTradingAccount:
        now = datetime.now(UTC)
        account = VirtualTradingAccount(
            user_id=user_id,
            status=AccountStatus.ACTIVE,
            initial_cash_vnd=initial_cash_vnd,
            cash_available_vnd=initial_cash_vnd,
            cash_reserved_vnd=0,
            cash_pending_vnd=0,
            activated_at=now,
        )
        self._session.add(account)
        await self._session.flush()
        await self._session.refresh(account)
        return account

    async def list_all_accounts(self) -> list[VirtualTradingAccount]:
        result = await self._session.execute(
            select(VirtualTradingAccount).order_by(VirtualTradingAccount.activated_at.desc())
        )
        return list(result.scalars().all())

    async def list_active_accounts(self) -> list[VirtualTradingAccount]:
        result = await self._session.execute(
            select(VirtualTradingAccount)
            .where(VirtualTradingAccount.status == AccountStatus.ACTIVE)
            .order_by(VirtualTradingAccount.activated_at.desc())
        )
        return list(result.scalars().all())

    # ── Position ─────────────────────────────────────

    async def get_position(
        self, account_id: uuid.UUID, symbol: str
    ) -> VirtualPosition | None:
        result = await self._session.execute(
            select(VirtualPosition).where(
                VirtualPosition.account_id == account_id,
                VirtualPosition.symbol == symbol,
            )
        )
        return result.scalar_one_or_none()

    async def get_position_for_update(
        self, account_id: uuid.UUID, symbol: str
    ) -> VirtualPosition | None:
        result = await self._session.execute(
            select(VirtualPosition)
            .where(
                VirtualPosition.account_id == account_id,
                VirtualPosition.symbol == symbol,
            )
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def list_positions(self, account_id: uuid.UUID) -> list[VirtualPosition]:
        result = await self._session.execute(
            select(VirtualPosition)
            .where(VirtualPosition.account_id == account_id)
            .order_by(VirtualPosition.symbol)
        )
        return list(result.scalars().all())

    async def upsert_position(
        self,
        account_id: uuid.UUID,
        symbol: str,
        *,
        quantity_total: int,
        quantity_sellable: int,
        quantity_pending: int,
        quantity_reserved: int,
        avg_cost_vnd: int,
    ) -> VirtualPosition:
        pos = await self.get_position(account_id, symbol)
        if pos is None:
            pos = VirtualPosition(
                account_id=account_id,
                symbol=symbol,
                quantity_total=quantity_total,
                quantity_sellable=quantity_sellable,
                quantity_pending=quantity_pending,
                quantity_reserved=quantity_reserved,
                avg_cost_vnd=avg_cost_vnd,
            )
            self._session.add(pos)
        else:
            pos.quantity_total = quantity_total
            pos.quantity_sellable = quantity_sellable
            pos.quantity_pending = quantity_pending
            pos.quantity_reserved = quantity_reserved
            pos.avg_cost_vnd = avg_cost_vnd
        await self._session.flush()
        await self._session.refresh(pos)
        return pos

    async def delete_positions(self, account_id: uuid.UUID) -> None:
        await self._session.execute(
            delete(VirtualPosition).where(VirtualPosition.account_id == account_id)
        )

    # ── Order ────────────────────────────────────────

    async def create_order(self, order: VirtualOrder) -> VirtualOrder:
        self._session.add(order)
        await self._session.flush()
        await self._session.refresh(order)
        return order

    async def get_order_by_id(self, order_id: uuid.UUID) -> VirtualOrder | None:
        result = await self._session.execute(
            select(VirtualOrder).where(VirtualOrder.id == order_id)
        )
        return result.scalar_one_or_none()

    async def get_order_for_update(self, order_id: uuid.UUID) -> VirtualOrder | None:
        result = await self._session.execute(
            select(VirtualOrder)
            .where(VirtualOrder.id == order_id)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def list_orders(
        self,
        account_id: uuid.UUID,
        *,
        status: OrderStatus | None = None,
        symbol: str | None = None,
        side: OrderSide | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[VirtualOrder], int]:
        query = select(VirtualOrder).where(VirtualOrder.account_id == account_id)
        count_query = select(func.count()).select_from(VirtualOrder).where(
            VirtualOrder.account_id == account_id
        )

        if status:
            query = query.where(VirtualOrder.status == status)
            count_query = count_query.where(VirtualOrder.status == status)
        if symbol:
            query = query.where(VirtualOrder.symbol == symbol.upper())
            count_query = count_query.where(VirtualOrder.symbol == symbol.upper())
        if side:
            query = query.where(VirtualOrder.side == side)
            count_query = count_query.where(VirtualOrder.side == side)

        total_result = await self._session.execute(count_query)
        total = total_result.scalar() or 0

        query = query.order_by(VirtualOrder.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self._session.execute(query)
        return list(result.scalars().all()), int(total)

    async def get_pending_orders(self, account_id: uuid.UUID) -> list[VirtualOrder]:
        result = await self._session.execute(
            select(VirtualOrder).where(
                VirtualOrder.account_id == account_id,
                VirtualOrder.status == OrderStatus.PENDING,
            )
        )
        return list(result.scalars().all())

    async def delete_orders(self, account_id: uuid.UUID) -> None:
        await self._session.execute(
            delete(VirtualOrder).where(VirtualOrder.account_id == account_id)
        )

    # ── Trade ────────────────────────────────────────

    async def create_trade(self, trade: VirtualTrade) -> VirtualTrade:
        self._session.add(trade)
        await self._session.flush()
        await self._session.refresh(trade)
        return trade

    async def list_trades(
        self,
        account_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[VirtualTrade], int]:
        count_result = await self._session.execute(
            select(func.count()).select_from(VirtualTrade).where(
                VirtualTrade.account_id == account_id
            )
        )
        total = count_result.scalar() or 0

        result = await self._session.execute(
            select(VirtualTrade)
            .where(VirtualTrade.account_id == account_id)
            .order_by(VirtualTrade.traded_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), int(total)

    async def delete_trades(self, account_id: uuid.UUID) -> None:
        await self._session.execute(
            delete(VirtualTrade).where(VirtualTrade.account_id == account_id)
        )

    # ── Settlement ───────────────────────────────────

    async def create_settlement(self, settlement: VirtualSettlement) -> VirtualSettlement:
        self._session.add(settlement)
        await self._session.flush()
        await self._session.refresh(settlement)
        return settlement

    async def get_due_settlements(
        self, account_id: uuid.UUID, as_of: date
    ) -> list[VirtualSettlement]:
        result = await self._session.execute(
            select(VirtualSettlement).where(
                VirtualSettlement.account_id == account_id,
                VirtualSettlement.status == SettlementStatus.PENDING,
                VirtualSettlement.due_date <= as_of,
            )
        )
        return list(result.scalars().all())

    async def delete_settlements(self, account_id: uuid.UUID) -> None:
        await self._session.execute(
            delete(VirtualSettlement).where(VirtualSettlement.account_id == account_id)
        )

    # ── Cash Ledger ──────────────────────────────────

    async def add_ledger_entry(
        self,
        account_id: uuid.UUID,
        amount_vnd: int,
        balance_after_vnd: int,
        kind: str,
        reference_type: str | None = None,
        reference_id: uuid.UUID | None = None,
        note: str | None = None,
    ) -> VirtualCashLedger:
        entry = VirtualCashLedger(
            account_id=account_id,
            amount_vnd=amount_vnd,
            balance_after_vnd=balance_after_vnd,
            kind=kind,
            reference_type=reference_type,
            reference_id=reference_id,
            note=note,
            created_at=datetime.now(UTC),
        )
        self._session.add(entry)
        await self._session.flush()
        return entry

    async def delete_ledger(self, account_id: uuid.UUID) -> None:
        await self._session.execute(
            delete(VirtualCashLedger).where(VirtualCashLedger.account_id == account_id)
        )
