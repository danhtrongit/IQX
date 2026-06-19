"""Daily market-analysis persistence + memory continuity models.

`analysis_history` stores one generated VN-Index analysis per session date.
`analysis_claims` stores the verifiable scenario claims extracted from each
article so the next day's article can confirm / refute them.

NOTE: the spec's `embedding VECTOR(1536)` column is intentionally OMITTED in v1
(pgvector not installed; ENABLE_PATTERN_SEARCH=false). Add it when pattern
search is enabled in v2+.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class AnalysisHistory(UUIDMixin, TimestampMixin, Base):
    """One published daily VN-Index analysis, keyed by session_date."""

    __tablename__ = "analysis_history"

    # human-readable id used for URLs, e.g. "vnindex-2026-06-18"
    public_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    session_date: Mapped[date] = mapped_column(Date, unique=True, index=True, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    session_type: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    headline: Mapped[str] = mapped_column(Text, nullable=False)
    tagline: Mapped[dict] = mapped_column(JSON, nullable=False)
    paragraphs: Mapped[dict] = mapped_column(JSON, nullable=False)
    scenarios: Mapped[list] = mapped_column(JSON, nullable=False)
    watchlist: Mapped[list | None] = mapped_column(JSON, nullable=True)
    unexplained: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)


class AnalysisClaim(UUIDMixin, TimestampMixin, Base):
    """A verifiable claim (scenario) extracted from an analysis, tracked over time."""

    __tablename__ = "analysis_claims"
    __table_args__ = (
        Index("ix_analysis_claims_status_date", "status", "session_date"),
    )

    analysis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("analysis_history.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    session_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    claim_text: Mapped[str] = mapped_column(Text, nullable=False)
    claim_type: Mapped[str] = mapped_column(String(30), nullable=False)
    conditions: Mapped[dict] = mapped_column(JSON, nullable=False)
    predicted_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), server_default="pending", nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[date | None] = mapped_column(Date, nullable=True)
