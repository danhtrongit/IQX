"""Persistent state for the IQX standard Bot v1.

Bot accounts deliberately do not reuse ``virtual_trading_accounts``. That
table is the user's manual learning account and its order engine has settlement
and user-write semantics that the close-of-session Bot must never inherit.

``BotRunReceipt`` keeps its original name/table/legacy columns because the
journey identity module consumes it as the canonical animation receipt.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class BotAccount(UUIDMixin, TimestampMixin, Base):
    """One funded, backend-write-only Bot demo account per graduated user."""

    __tablename__ = "bot_accounts"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_bot_accounts_user_id"),
        CheckConstraint("initial_cash_vnd = 100000000", name="bot_initial_cash_v1"),
        CheckConstraint("cash_vnd >= 0", name="bot_cash_non_negative"),
        CheckConstraint("status IN ('active', 'suspended')", name="bot_account_status"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    initial_cash_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    cash_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default="active"
    )
    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class BotInstance(UUIDMixin, TimestampMixin, Base):
    """Frozen product configuration assigned to a user's Bot account."""

    __tablename__ = "bot_instances"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_bot_instances_user_id"),
        UniqueConstraint("bot_account_id", name="uq_bot_instances_account_id"),
        CheckConstraint("strategy_version > 0", name="bot_strategy_version_positive"),
        CheckConstraint(
            "execution_model = 'same_session_close'", name="bot_execution_model_v1"
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bot_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bot_accounts.id", ondelete="CASCADE"), nullable=False
    )
    strategy_id: Mapped[str] = mapped_column(String(64), nullable=False)
    strategy_version: Mapped[int] = mapped_column(Integer, nullable=False)
    execution_model: Mapped[str] = mapped_column(String(32), nullable=False)
    cap6_graduated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class BotCashLedger(UUIDMixin, Base):
    """Append-only Bot cash ledger; idempotency prevents duplicate funding/fills."""

    __tablename__ = "bot_cash_ledger"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_bot_cash_ledger_idempotency"),
        CheckConstraint("balance_after_vnd >= 0", name="bot_ledger_balance_non_negative"),
    )

    bot_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bot_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    execution_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "bot_executions.id",
            ondelete="RESTRICT",
            use_alter=True,
            name="fk_bot_cash_ledger_execution_id_bot_executions",
        ),
        nullable=True,
        unique=True,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    amount_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_after_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class BotRunReceipt(UUIDMixin, Base):
    """Canonical account/session run and the receipt consumed by mascot UI."""

    __tablename__ = "bot_run_receipts"
    __table_args__ = (
        UniqueConstraint("user_id", "trading_date"),
        UniqueConstraint("bot_account_id", "trading_date", name="uq_bot_run_account_date"),
        CheckConstraint(
            "status IN ('running', 'succeeded', 'failed')", name="status"
        ),
        CheckConstraint(
            "status = 'running' OR completed_at IS NOT NULL", name="completed_at"
        ),
        CheckConstraint("buy_count >= 0 AND sell_count >= 0", name="bot_run_counts"),
    )

    # Original receipt contract consumed by journey_identity.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trading_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    issues: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    # Nullable for legacy identity-only rows. New Bot runs populate every field.
    bot_account_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("bot_accounts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    strategy_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    strategy_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    execution_model: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_snapshot_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rule_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    rule_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    nav_basis_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    blocked_symbols_at_start: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    buy_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sell_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reconciled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BotMarketSnapshot(UUIDMixin, Base):
    """Immutable input envelope reused for every retry of one Bot run."""

    __tablename__ = "bot_market_snapshots"
    __table_args__ = (
        UniqueConstraint("bot_run_id", name="uq_bot_snapshot_run"),
    )

    bot_run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bot_run_receipts.id", ondelete="CASCADE"), nullable=False
    )
    trading_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    data_version: Mapped[str] = mapped_column(String(128), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    close_is_official: Mapped[bool] = mapped_column(Boolean, nullable=False)
    buy_inputs_complete: Mapped[bool] = mapped_column(Boolean, nullable=False)
    snapshot_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    source_refs: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class BotPosition(UUIDMixin, TimestampMixin, Base):
    """A Bot holding with entry evidence and immutable v1 exit thresholds."""

    __tablename__ = "bot_positions"
    __table_args__ = (
        CheckConstraint("qty_open >= 0", name="bot_position_qty_non_negative"),
        CheckConstraint("entry_price_vnd > 0", name="bot_position_entry_price"),
        CheckConstraint("amplitude_at_entry_vnd > 0", name="bot_position_amplitude"),
        CheckConstraint(
            "stop_loss_vnd > 0 AND stop_loss_vnd < entry_price_vnd",
            name="bot_position_stop",
        ),
        CheckConstraint(
            "take_profit_vnd > entry_price_vnd", name="bot_position_take_profit"
        ),
        CheckConstraint("status IN ('open', 'closed')", name="bot_position_status"),
        Index(
            "uq_bot_positions_open_symbol",
            "bot_account_id",
            "symbol",
            unique=True,
            postgresql_where=text("status = 'open'"),
            sqlite_where=text("status = 'open'"),
        ),
    )

    bot_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bot_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    qty_open: Mapped[int] = mapped_column(Integer, nullable=False)
    entry_price_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    entry_value_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    entry_fee_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    amplitude_at_entry_vnd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    amplitude_source_ref: Mapped[str] = mapped_column(String(500), nullable=False)
    stop_loss_vnd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    take_profit_vnd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    opened_session: Mapped[date] = mapped_column(Date, nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_session: Mapped[date | None] = mapped_column(Date, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    buy_execution_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, unique=True)
    sell_execution_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, unique=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    filter_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_refs: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class BotExecution(UUIDMixin, Base):
    """An immutable same-session-close simulated fill."""

    __tablename__ = "bot_executions"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_bot_execution_idempotency"),
        CheckConstraint("side IN ('buy', 'sell')", name="bot_execution_side"),
        CheckConstraint("qty > 0", name="bot_execution_qty"),
        CheckConstraint("price_vnd > 0", name="bot_execution_price"),
        CheckConstraint(
            "signal_session = price_session AND price_session = trading_date",
            name="bot_execution_same_session",
        ),
        CheckConstraint(
            "execution_model = 'same_session_close'", name="bot_execution_model"
        ),
    )

    bot_run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bot_run_receipts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bot_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bot_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bot_positions.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    side: Mapped[str] = mapped_column(String(8), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    price_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    signal_session: Mapped[date] = mapped_column(Date, nullable=False)
    price_session: Mapped[date] = mapped_column(Date, nullable=False)
    trading_date: Mapped[date] = mapped_column(Date, nullable=False)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    gross_value_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    fee_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    net_cash_delta_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    execution_model: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False)
    filter_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    supporting_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    layer_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    reason: Mapped[str] = mapped_column(String(1000), nullable=False)
    source_snapshot_id: Mapped[str] = mapped_column(String(64), nullable=False)


class BotDecision(UUIDMixin, Base):
    """Every hold/skip/buy/sell intent, separate from confirmed executions."""

    __tablename__ = "bot_decisions"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_bot_decision_idempotency"),
        CheckConstraint(
            "action IN ('buy', 'sell', 'hold', 'skip')", name="bot_decision_action"
        ),
    )

    bot_run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bot_run_receipts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    idempotency_key: Mapped[str] = mapped_column(String(180), nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(8), nullable=False)
    reason_code: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(String(1000), nullable=False)
    filter_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    rank_tuple: Mapped[list | None] = mapped_column(JSON, nullable=True)
    data_refs: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    budget_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    proposed_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    threshold_vnd: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    execution_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("bot_executions.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class BotNavDaily(UUIDMixin, Base):
    """End-of-session account valuation and optional VN-Index observation."""

    __tablename__ = "bot_nav_daily"
    __table_args__ = (
        UniqueConstraint(
            "bot_account_id", "trading_date", name="uq_bot_nav_account_date"
        ),
        CheckConstraint(
            "cash_vnd >= 0 AND (market_value_vnd IS NULL OR market_value_vnd >= 0) "
            "AND (nav_vnd IS NULL OR nav_vnd >= 0)",
            name="bot_nav_non_negative",
        ),
    )

    bot_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bot_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trading_date: Mapped[date] = mapped_column(Date, nullable=False)
    cash_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Unknown is distinct from zero. One missing position close makes the
    # portfolio value and NAV unavailable rather than partially valued.
    market_value_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    nav_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    valuation_complete: Mapped[bool] = mapped_column(Boolean, nullable=False)
    vnindex: Mapped[Decimal | None] = mapped_column(Numeric(20, 6), nullable=True)
    source_refs: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
