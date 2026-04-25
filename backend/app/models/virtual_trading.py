"""Virtual Trading models — accounts, orders, positions, trades, settlements, config.

All monetary values stored as integer VND (BigInteger).
Fee/tax rates stored as basis points (1 bps = 0.01%).
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin

# ══════════════════════════════════════════════════════
# Enums
# ══════════════════════════════════════════════════════


class SettlementMode(enum.StrEnum):
    T0 = "T0"
    T2 = "T2"


class AccountStatus(enum.StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class OrderSide(enum.StrEnum):
    BUY = "buy"
    SELL = "sell"


class OrderType(enum.StrEnum):
    MARKET = "market"
    LIMIT = "limit"


class OrderStatus(enum.StrEnum):
    PENDING = "pending"
    FILLED = "filled"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    REJECTED = "rejected"


class SettlementKind(enum.StrEnum):
    BUY_QTY_RELEASE = "buy_qty_release"
    SELL_CASH_RELEASE = "sell_cash_release"


class SettlementStatus(enum.StrEnum):
    PENDING = "pending"
    SETTLED = "settled"


# ══════════════════════════════════════════════════════
# Models
# ══════════════════════════════════════════════════════


class VirtualTradingConfig(UUIDMixin, TimestampMixin, Base):
    """System-wide virtual trading configuration. Only one active row at a time."""

    __tablename__ = "virtual_trading_configs"

    initial_cash_vnd: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=1_000_000_000
    )
    buy_fee_rate_bps: Mapped[int] = mapped_column(
        Integer, nullable=False, default=15
    )  # 0.15%
    sell_fee_rate_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    sell_tax_rate_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=10)  # 0.1%
    settlement_mode: Mapped[SettlementMode] = mapped_column(
        Enum(SettlementMode, name="settlement_mode", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=SettlementMode.T0,
        server_default=SettlementMode.T0.value,
    )
    board_lot_size: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    trading_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    holidays: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list of "YYYY-MM-DD"
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class VirtualTradingAccount(UUIDMixin, TimestampMixin, Base):
    """Per-user virtual trading account with cash tracking."""

    __tablename__ = "virtual_trading_accounts"
    __table_args__ = (UniqueConstraint("user_id", name="uq_vt_accounts_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[AccountStatus] = mapped_column(
        Enum(AccountStatus, name="vt_account_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=AccountStatus.ACTIVE,
        server_default=AccountStatus.ACTIVE.value,
    )
    initial_cash_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    cash_available_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    cash_reserved_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cash_pending_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    # Future: competition/season scope
    scope_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)

    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class VirtualPosition(UUIDMixin, TimestampMixin, Base):
    """Portfolio position for a single symbol in a virtual account."""

    __tablename__ = "virtual_positions"
    __table_args__ = (UniqueConstraint("account_id", "symbol", name="uq_vt_positions_account_symbol"),)

    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_trading_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(10), nullable=False)
    quantity_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quantity_sellable: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quantity_pending: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quantity_reserved: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_cost_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


class VirtualOrder(UUIDMixin, TimestampMixin, Base):
    """Virtual trading order with config snapshot and fill details."""

    __tablename__ = "virtual_orders"

    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_trading_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    side: Mapped[OrderSide] = mapped_column(
        Enum(OrderSide, name="vt_order_side", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    order_type: Mapped[OrderType] = mapped_column(
        Enum(OrderType, name="vt_order_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="vt_order_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=OrderStatus.PENDING,
        server_default=OrderStatus.PENDING.value,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    limit_price_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # Reserves
    reserved_cash_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    reserved_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Fill details (populated on fill)
    filled_price_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    gross_amount_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    fee_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    tax_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    net_amount_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # Lifecycle
    trading_date: Mapped[date] = mapped_column(Date, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Config snapshot at order creation time
    config_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON


class VirtualTrade(UUIDMixin, Base):
    """Executed trade record."""

    __tablename__ = "virtual_trades"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_trading_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(10), nullable=False)
    side: Mapped[OrderSide] = mapped_column(
        Enum(OrderSide, name="vt_order_side", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    price_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    gross_amount_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    fee_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    net_amount_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    price_source: Mapped[str] = mapped_column(String(50), nullable=False)
    price_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    traded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class VirtualSettlement(UUIDMixin, TimestampMixin, Base):
    """T2 settlement tracking — pending quantity/cash releases."""

    __tablename__ = "virtual_settlements"

    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_trading_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trade_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_trades.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[SettlementKind] = mapped_column(
        Enum(SettlementKind, name="vt_settlement_kind", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(10), nullable=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[SettlementStatus] = mapped_column(
        Enum(SettlementStatus, name="vt_settlement_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=SettlementStatus.PENDING,
        server_default=SettlementStatus.PENDING.value,
    )
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class VirtualCashLedger(UUIDMixin, Base):
    """Immutable cash audit ledger for virtual accounts."""

    __tablename__ = "virtual_cash_ledger"

    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_trading_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)  # Signed
    balance_after_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)  # activate, buy, sell, fee, tax, ...
    reference_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # order, trade, settlement
    reference_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=sa_func.now()
    )
