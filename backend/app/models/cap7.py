"""Cấp 7 live portfolio-balance progression model."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class Cap7Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user Cấp 7 progress; balance is always recomputed from live holdings."""

    __tablename__ = "cap7_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap7_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    can_doi_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
