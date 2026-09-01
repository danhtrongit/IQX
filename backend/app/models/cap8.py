"""Cấp 8 plan-compliant exit evidence models.

Evidence is deliberately derived and persisted on the server.  A position keeps
only its currently governing BUY plan; every filled SELL can create at most one
immutable ``Cap8Exit`` row, which is the sole source of task credit.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class Cap8Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user terminal Cấp 8 progress."""

    __tablename__ = "cap8_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap8_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    so_lenh_thoat_dung_ke_hoach: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)


class Cap8Exit(UUIDMixin, TimestampMixin, Base):
    """One classified filled SELL; uniqueness makes exit recording idempotent."""

    __tablename__ = "cap8_exits"
    __table_args__ = (UniqueConstraint("sell_order_id", name="uq_cap8_exits_sell_order_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_trading_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    matched_buy_order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("virtual_orders.id", ondelete="SET NULL"), nullable=True
    )
    sell_order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_orders.id", ondelete="CASCADE"), nullable=False
    )
    exited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    filled_price_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    remaining_position_pct: Mapped[float] = mapped_column(Float, nullable=False)
    exit_method: Mapped[str] = mapped_column(String(16), nullable=False)
    original_stop_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    original_take_profit_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    effective_stop_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    dung_ke_hoach: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ban_cam_xuc: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    classification_reason: Mapped[str] = mapped_column(String(128), nullable=False)
