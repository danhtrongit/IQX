"""Symbol database model — internal stock/company reference data."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Float, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class Symbol(UUIDMixin, TimestampMixin, Base):
    """Internal symbol/company reference table.

    Populated via the seed script from upstream sources (Vietcap, VNDirect).
    Used for DB-backed search instead of hitting upstream on every request.
    """

    __tablename__ = "symbols"

    # ── Core identifiers ────────────────────────────
    symbol: Mapped[str] = mapped_column(
        String(10), unique=True, index=True, nullable=False,
    )
    name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    short_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # ── Classification ──────────────────────────────
    exchange: Mapped[str | None] = mapped_column(String(20), nullable=True)
    asset_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default="stock", server_default="stock",
    )
    is_index: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False,
    )

    # ── Pricing ─────────────────────────────────────
    current_price_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    target_price_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    upside_pct: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ── Logo ────────────────────────────────────────
    logo_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    logo_source: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # ── Industry classification ─────────────────────
    icb_lv1: Mapped[str | None] = mapped_column(String(100), nullable=True)
    icb_lv2: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ── Provenance ──────────────────────────────────
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # ── Status ──────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False,
    )

    __table_args__ = (
        Index("ix_symbols_exchange", "exchange"),
        Index("ix_symbols_asset_type", "asset_type"),
        Index("ix_symbols_is_index", "is_index"),
    )

    def __repr__(self) -> str:
        return f"<Symbol {self.symbol} ({self.exchange})>"
