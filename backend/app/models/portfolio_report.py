"""Persisted portfolio-manager report, keyed by (account_id, session_date) — the day-cache."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import JSON, Boolean, Date, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class PortfolioReport(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "portfolio_reports"
    __table_args__ = (
        UniqueConstraint("account_id", "session_date", name="uq_portfolio_reports_account_date"),
        Index("ix_portfolio_reports_account_date", "account_id", "session_date"),
    )

    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_trading_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    period_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)
    analysis_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    narrative_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    recommended_actions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    watch_conditions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    holdings_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(50), nullable=True)
    generation_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    valid: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", default=True)
