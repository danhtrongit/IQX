"""AI Insight History model — per-symbol daily insight persistence."""

from __future__ import annotations

from datetime import date

from sqlalchemy import JSON, Date, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class AIInsightHistory(UUIDMixin, TimestampMixin, Base):
    """Stores one AI-generated insight payload per symbol per session date."""

    __tablename__ = "ai_insight_history"

    symbol: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    session_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    # Use sa.JSON here so SQLite tests work; migration uses JSONB on Postgres.
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)

    __table_args__ = (
        UniqueConstraint("symbol", "session_date", name="uq_ai_insight_symbol_date"),
    )

    def __repr__(self) -> str:
        return f"<AIInsightHistory {self.symbol} {self.session_date}>"
