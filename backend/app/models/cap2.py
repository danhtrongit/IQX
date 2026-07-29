"""Cấp 2 «Kỷ luật» models — progression (chuỗi lệnh kỷ luật + 5 nhiệm vụ).

Cấp 2 builds on a graduated Cấp 1: FREE, Thực chiến T+2,5-only mode. It adds
no new order-level tables of its own — the cắt lỗ/chốt lời commitment and the
4 measurable violations are recorded as new columns on Cấp 1's
``order_kehoach``/``order_ketso`` (see ``app.models.cap1.PhuongPhapSlTp`` and
the "Cấp 2 additions" blocks on ``OrderKehoach``/``OrderKetso``). This module
only owns the new ``cap2_progress`` table: chuỗi lệnh kỷ luật (consecutive
violation-free closed orders) + the 5 nhiệm vụ timestamps. See
``~/Downloads/DEMO TRADING/LEVEL 2/IQX-Cap2-Spec.md`` §2/§6/§13 for the
verbatim data model this mirrors.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class Cap2Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user Cấp 2 discipline-tracking progress. One row per user."""

    __tablename__ = "cap2_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap2_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # 5 nhiệm vụ completion timestamps (nullable until done, never un-set)
    task_1_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_2_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_3_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_4_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_5_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Chuỗi lệnh kỷ luật (spec §6) — recomputed server-side from order_ketso
    chuoi_current: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    chuoi_record: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_chuoi_reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
