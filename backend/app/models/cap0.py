"""Cấp 0 (Level 0) onboarding models — progress, placement, kế hoạch (chip lý do).

Cap 0 is a FREE gamified onboarding flow: a user "enters", gets a 250tr VND
virtual account seeded, works through **5 tasks** (spec v3.0 §4) and graduates
once all five are done plus the **single** behaviour gate — closing the màn Kết
sổ at nhiệm vụ ⑤ (§9).

Cấp 0 teaches pure mechanics. It has **NO cắt lỗ/chốt lời and no lý do phân
tích** (v3.0 states this in its preamble, §0, §8 and §13) — hence no
``sl_typed`` gate, no 6th task, and a chip vocabulary (``LyDoDoiThuong``) that
is deliberately disjoint from Cấp 1's analytical ``app.models.cap1.LyDo``.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class LyDoDoiThuong(enum.StrEnum):
    """5 chip "lý do đời thường" của khối Kế hoạch Cấp 0 — spec §4, thứ tự cố định.

    These are everyday, non-analytical reasons with **no right answer**. They are
    NOT ``app.models.cap1.LyDo`` (ký thuật / dòng tiền / nội bộ / tin tức / định
    giá), which is Cấp 1's analytical vocabulary — the two sets are intentionally
    disjoint, and ``tests/test_cap0.py`` asserts that they stay so.
    """

    CONG_TY_TOI_BIET = "cong_ty_toi_biet"
    NGUOI_QUEN_GIOI_THIEU = "nguoi_quen_gioi_thieu"
    THAY_TREN_MANG = "thay_tren_mang"
    GIA_DANG_TANG = "gia_dang_tang"
    THU_CHO_BIET = "thu_cho_biet"


#: Verbatim spec §4 chip labels, in the spec's fixed display order. Served on the
#: wire as ``ly_do_label`` so the Kết sổ can render the exact copy without the FE
#: keeping a second, drift-prone mapping.
LY_DO_DOI_THUONG_LABELS: dict[LyDoDoiThuong, str] = {
    LyDoDoiThuong.CONG_TY_TOI_BIET: "Công ty tôi biết",
    LyDoDoiThuong.NGUOI_QUEN_GIOI_THIEU: "Người quen giới thiệu",
    LyDoDoiThuong.THAY_TREN_MANG: "Thấy trên mạng",
    LyDoDoiThuong.GIA_DANG_TANG: "Giá đang tăng",
    LyDoDoiThuong.THU_CHO_BIET: "Thử cho biết",
}


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

    # Task completion timestamps (nullable until done) — spec v3.0 §10:
    #   ① lệnh đầu + Nắm giữ + Theo dõi   ② tour bảng điện
    #   ③ tour bản tin                    ④ tour "6 người chơi"
    #   ⑤ bán + kết sổ
    task_1_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_2_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_3_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_4_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_5_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Recorded fact — ① đã bấm ★. NOT a graduation gate (§9 lists exactly one).
    task1_star_clicked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # THE single behaviour gate — màn Kết sổ đã đóng ở nhiệm vụ ⑤ (§4 Chặng 3/§9).
    task5_debrief_done: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)


class Cap0OrderKehoach(UUIDMixin, TimestampMixin, Base):
    """Khối "Kế hoạch" Cấp 0 recorded at BUY time — one row per Sân tập buy order.

    Spec §10 sketches this as ``order_kehoach (order_id · mode='san_tap' ·
    ly_do_doi_thuong)``. It gets its **own physical table** rather than reusing
    Cấp 1's ``order_kehoach`` — see ``app.services.cap0.service.Cap0Service.
    record_kehoach`` for the four reasons why sharing that row would be unsafe.

    ``mode`` and the buy timestamp are deliberately NOT duplicated here: both are
    already on ``virtual_orders`` (``mode`` / ``created_at`` / ``trading_date``)
    and are derived on read, so they can never drift out of agreement with the
    order they describe.
    """

    __tablename__ = "cap0_order_kehoach"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_orders.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    ly_do_doi_thuong: Mapped[LyDoDoiThuong] = mapped_column(
        Enum(
            LyDoDoiThuong,
            name="cap0_ly_do_doi_thuong",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )


class UserPlacement(UUIDMixin, TimestampMixin, Base):
    """Placement result deciding a user's starting level. One row per user."""

    __tablename__ = "user_placement"
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_placement_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    has_traded_before: Mapped[bool] = mapped_column(Boolean, nullable=False)
    placed_level: Mapped[int] = mapped_column(Integer, nullable=False)  # 0/1/2
