"""Cấp 2 «Kỷ luật» models — progression (ĐÚNG MỘT nhiệm vụ).

Cấp 2 builds on a graduated Cấp 1: FREE, Thực chiến T+2,5-only mode. It adds
no new order-level tables of its own — the cắt lỗ/chốt lời commitment and the
4 measurable violations are recorded as new columns on Cấp 1's
``order_kehoach``/``order_ketso`` (see ``app.models.cap1.PhuongPhapSlTp`` and
the "Cấp 2 additions" blocks on ``OrderKehoach``/``OrderKetso``). This module
only owns the new ``cap2_progress`` table.

**1 nhiệm vụ** (mockup ``iqx-cap2-hanhtrinh.html`` — authoritative over the
older spec's task lists; the mockup's jbar reads ``CẤP 2 · 0/1`` and its
``.ck-head`` reads ``Trước khi lên Cấp 3 · 0/1``):

  ① «10 lệnh Thực chiến có đặt cắt lỗ / chốt lời»  → ``so_lenh_co_cl_tp`` ≥ 10

Tốt nghiệp là 1/1 — ``task_1_done_at`` is the whole gate.

★ **Nhiệm vụ ② «Thực hiện đúng khi giá chạm mốc» (2 lần) IS GONE.** Its own
completion stamp (``task_2_done_at``) is dropped by migration
``9c3f7ad10b52``. The level now teaches only the first half of the mechanism —
PLACING the two marks — and no longer gates graduation on the market happening
to reach one of them (which the user does not control).

★ **``so_lan_cat_lo_dung`` / ``so_lan_chot_loi_dung`` / ``so_lan_thuc_hien_dung``
STAY**, deliberately, even though no nhiệm vụ reads them any more. They are the
🛑 / 🎯 / ✅ numbers that block ④ of «Phân tích danh mục» renders (mockup
``iqx-cap2-phantich-danhmuc.html``, UNCHANGED by the 1-nhiệm-vụ decision) plus
the «Thực hiện đúng» stat in its block ①, and Cấp 3-8's own Phân tích pages
re-render that same block with this row as its source. They are DESCRIPTIVE
analytics ("how far did you get with the mechanism"), never a checklist item —
nothing in the product may present them as a nhiệm vụ, a target, or an ``x/2``.

The điểm-kỷ-luật / chuỗi-lệnh-kỷ-luật apparatus that shipped with the original
5-task build is GONE from this table. ``Cap2Service.diem_ky_luat`` still
computes the daily score on the fly because **Cấp 3 reads it**
(``Cap3Progress.diem_ky_luat_tb_cap3``) and the Cấp 6/7 trading pages still
call ``GET /cap2/diem-ky-luat`` — it simply has no persisted state here.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class Cap2Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user Cấp 2 progress. One row per user."""

    __tablename__ = "cap2_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap2_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # ① — the ONLY nhiệm vụ. Nullable until done, never un-set.
    task_1_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ① — lệnh MUA Thực chiến đã khớp có ĐỦ CẢ cắt lỗ VÀ chốt lời trong kế hoạch.
    so_lenh_co_cl_tp: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # ── Analytics only — NOT a nhiệm vụ (see the module docstring) ──────────
    # Số lần thực hiện đúng khi giá chạm mốc, tách 2 vế cho khối ④ của màn
    # «Phân tích danh mục» (🛑 cắt lỗ / 🎯 chốt lời / ✅ tổng).
    # Invariant: so_lan_thuc_hien_dung == so_lan_cat_lo_dung + so_lan_chot_loi_dung.
    so_lan_cat_lo_dung: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    so_lan_chot_loi_dung: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    so_lan_thuc_hien_dung: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
