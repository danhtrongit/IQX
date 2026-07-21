"""Cấp 0 (Level 0) onboarding models — progress tracking + placement.

Cap 0 is a FREE gamified onboarding flow: a user "enters", gets a 250tr VND
virtual account seeded, works through 6 tasks (three of which have gates), and
graduates once all tasks + the required gates are complete.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class Cap0Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user Cấp 0 onboarding progress. One row per user."""

    __tablename__ = "cap0_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap0_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    virtual_balance_init: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=250_000_000, server_default="250000000"
    )

    # Task completion timestamps (nullable until done)
    task_1_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_2_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_3_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_4_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_5_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_6_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Gates
    task1_star_clicked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    task5_sl_typed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    task6_debrief_done: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)


class UserPlacement(UUIDMixin, TimestampMixin, Base):
    """Placement result deciding a user's starting level. One row per user."""

    __tablename__ = "user_placement"
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_placement_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    has_traded_before: Mapped[bool] = mapped_column(Boolean, nullable=False)
    placed_level: Mapped[int] = mapped_column(Integer, nullable=False)  # 0/1/2
