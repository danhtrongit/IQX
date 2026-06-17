"""Backtest strategy model — a user's saved buy/sell/risk configuration."""

from __future__ import annotations

import uuid

from sqlalchemy import JSON, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class BacktestStrategy(UUIDMixin, TimestampMixin, Base):
    """A saved strategy: factor selections + risk config, owned by a user.

    ``config`` holds ``{buy, sell, risk, symbol?, start?, end?, capital?}`` — the
    same shape the run endpoint accepts. One name per user.
    """

    __tablename__ = "backtest_strategies"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_backtest_strategies_user_name"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    # sa.JSON for SQLite test compatibility; migration uses JSONB on Postgres.
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
