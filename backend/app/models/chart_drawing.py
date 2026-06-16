"""Chart drawing model — per-user TradingView line-tool state, keyed by symbol."""

from __future__ import annotations

import uuid

from sqlalchemy import JSON, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class ChartDrawing(UUIDMixin, TimestampMixin, Base):
    """A user's saved TradingView drawings for one symbol.

    `state` is the serialized ``LineToolsAndGroupsState`` produced by the
    Charting Library (``getLineToolsState()``). One row per (user, symbol);
    upserted on every auto-save so a refresh restores the drawings.
    """

    __tablename__ = "chart_drawings"
    __table_args__ = (
        UniqueConstraint("user_id", "symbol", name="uq_chart_drawings_user_symbol"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    # Use sa.JSON here so tests (SQLite) work; migration uses JSONB on Postgres.
    state: Mapped[dict] = mapped_column(JSON, nullable=False)
