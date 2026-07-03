"""International market data snapshot model.

Stores one row per (snapshot_date, symbol) representing a point-in-time
price snapshot fetched from an external data source (default: Yahoo Finance).
Used by the pre-market international data pipeline.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class MarketDataSnapshot(Base):
    """One price snapshot per (snapshot_date, symbol)."""

    __tablename__ = "market_data_snapshot"
    __table_args__ = (
        UniqueConstraint("snapshot_date", "symbol", name="uq_snapshot_date_symbol"),
        Index("ix_market_data_snapshot_snapshot_date", "snapshot_date"),
        Index("ix_market_data_snapshot_asset_category", "asset_category"),
    )

    # Primary key — simple auto-increment integer
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Identity
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    asset_category: Mapped[str] = mapped_column(String(32), nullable=False)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)

    # Pricing
    last_price: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False)
    previous_close: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False)
    change_value: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False)
    change_percent: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    day_high: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    day_low: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)

    # Volume / market metadata
    volume: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    market_state: Mapped[str | None] = mapped_column(String(16), nullable=True)
    market_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Provenance
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="yahoo")
    stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
