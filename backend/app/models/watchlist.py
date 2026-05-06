"""Watchlist model — single favorites list per user."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class WatchlistItem(UUIDMixin, TimestampMixin, Base):
    """A single symbol in a user's watchlist (favorites)."""

    __tablename__ = "watchlist_items"
    __table_args__ = (
        UniqueConstraint("user_id", "symbol", name="uq_watchlist_items_user_symbol"),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
