"""Cấp 3 «Bản lĩnh» models — progression (khẩu vị rủi ro + mức tự tin + khối
lượng mua tính tự động).

Cấp 3 builds on a graduated Cấp 2: FREE, Thực chiến-only mode. Like Cấp 2, it
adds no new order-level tables of its own — khẩu vị/mức tự tin/cách khối
lượng/khối lượng/%vốn are recorded as new columns on Cấp 1's
``order_kehoach`` (see ``app.models.cap1.KhauViRuiRo``/``CachKhoiLuong`` and
the "Cấp 3 additions" column block on ``OrderKehoach``). This module only
owns the new ``cap3_progress`` table: khẩu vị rủi ro (hồ sơ, đặt 1 lần) +
vốn ban đầu + 3 nhiệm vụ timestamps + the recomputed "Thách thức Bản lĩnh"
metrics. See ``~/Downloads/DEMO TRADING/LEVEL 3/IQX-Cap3-Spec.md`` §2/§5/§10
for the verbatim data model this mirrors.

**Storage decision — khẩu vị rủi ro + vốn ban đầu** (§10 sketches these as
``users.khau_vi_rui_ro`` / ``users.von_ban_dau``): kept on ``Cap3Progress``
below, NOT added to the shared ``users`` table. Rationale:
  - This codebase has no separate Profile/Settings model — ``users`` doubles
    as the profile table (address, gender, avatar, etc. all live there
    directly). It IS a "profile table" in the sense the task's storage
    decision asks about.
  - However ``users`` is a foundational model touched by auth, admin,
    phone-verification and telegram-linking flows across the whole app.
    Adding level-3-only gamification fields to it increases blast radius
    (migrations, serializers, admin tooling) for no shared benefit, when a
    one-row-per-user home for exactly this purpose already exists by
    construction: ``Cap3Progress`` (``UniqueConstraint(user_id)``, mirroring
    ``Cap1Progress``/``Cap2Progress``).
  - ``khau_vi`` (this table) IS the canonical, live, editable "khẩu vị rủi ro
    profile setting" — there is deliberately no separate
    ``khau_vi_rui_ro`` column anywhere. ``OrderKehoach.khau_vi`` (added by
    this level's migration) is a DIFFERENT thing: a per-order SNAPSHOT of
    whatever khẩu vị was active at the moment that order was placed (spec §7
    "Khẩu vị rủi ro lúc đặt" shown in Kết sổ) — it is expected to usually
    match ``Cap3Progress.khau_vi`` but is intentionally independent so a
    later profile change doesn't rewrite history.
  - ``von_ban_dau`` is a fixed spec constant (100,000,000đ, §4/§C12b) that
    never changes (no nạp thêm / reset) — it is recorded here (not
    hardcoded inline at every call site) purely so the P&L-base is an
    explicit, inspectable, per-user value rather than a scattered magic
    number, and so a future level could in principle vary it per user
    without a schema change.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin
from app.models.cap1 import KhauViRuiRo

VON_BAN_DAU_MAC_DINH = 100_000_000  # spec §4/§C12b — vốn ban đầu demo, không nạp thêm/reset


class Cap3Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user Cấp 3 capital-management progress. One row per user."""

    __tablename__ = "cap3_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap3_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Khẩu vị rủi ro — hồ sơ, đặt 1 lần khi vào Cấp 3, sửa được (spec §5).
    khau_vi_da_dat: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    khau_vi: Mapped[KhauViRuiRo | None] = mapped_column(
        Enum(
            KhauViRuiRo,
            name="cap3_khau_vi_rui_ro",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=True,
    )
    von_ban_dau: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=VON_BAN_DAU_MAC_DINH, server_default=str(VON_BAN_DAU_MAC_DINH)
    )

    # 3 nhiệm vụ completion timestamps (nullable until done, never un-set)
    task_1_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_2_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_3_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Recomputed metrics (spec §2③ "Thách thức Bản lĩnh") — source of truth =
    # order_ketso rows closed since entered_at + Cấp 2's daily điểm kỷ luật.
    so_lenh_cap3: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    lai_pct_cap3: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    diem_ky_luat_tb_cap3: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
