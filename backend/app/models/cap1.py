"""Cấp 1 «Học việc» models — progression, order kế hoạch (plan), order kết sổ
(close-out reconciliation).

Cấp 1 builds on a graduated Cấp 0: FREE, Thực chiến-only mode. It adds a
mandatory "Form Kế hoạch" (lý do mua + vùng mua) at buy time and a "Kết sổ"
reconciliation at sell time. See
``~/Downloads/DEMO TRADING/LEVEL 1/IQX-Cap1-Spec.md`` §9 for the verbatim
data model this mirrors.

NOTE: ``lyDo`` / ``trangThai_luc_dat`` intentionally keep the spec's exact
(mixed-case) field names — §9 lists this schema as VERBATIM.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class LyDo(enum.StrEnum):
    """5 lý do mua — spec §4/§9."""

    KY_THUAT = "ky_thuat"
    DONG_TIEN = "dong_tien"
    NOI_BO = "noi_bo"
    TIN_TUC = "tin_tuc"
    DINH_GIA = "dinh_gia"


class TrangThaiLucDat(enum.StrEnum):
    """AI Thanh tra verdict at order-placement time — spec §5."""

    UNG_HO = "ung_ho"
    TRUNG_TINH = "trung_tinh"
    CAN_CHU_Y = "can_chu_y"
    NGUOC_CHIEU = "nguoc_chieu"


class CamXuc(enum.StrEnum):
    """Emotion tag on Kết sổ for orders "có chuyện" — spec §6."""

    BINH_TINH = "binh_tinh"
    SO = "so"
    HOI_TIEC = "hoi_tiec"
    KHONG_RO = "khong_ro"


class Cap1Progress(UUIDMixin, TimestampMixin, Base):
    """Per-user Cấp 1 onboarding progress. One row per user."""

    __tablename__ = "cap1_progress"
    __table_args__ = (UniqueConstraint("user_id", name="uq_cap1_progress_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    da_xem_tour: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # Task completion timestamps (nullable until done)
    task_1_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_2_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_3_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_4_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_5_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_6_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Recomputed counters (source of truth = order_kehoach/order_ketso/virtual_orders)
    so_ly_do_da_dung: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    so_lenh_ly_do_ung_ho: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    so_lan_xem_danh_muc: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    so_lenh_thuc_chien: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    # Bookkeeping only (not a spec field): last calendar day nhiệm vụ ⑤ was
    # bumped, so repeated same-day views don't double-count.
    last_danh_muc_view_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_to_graduate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)


class OrderKehoach(UUIDMixin, TimestampMixin, Base):
    """Form Kế hoạch recorded at BUY time — one row per (thực chiến) buy order."""

    __tablename__ = "order_kehoach"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_orders.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    lyDo: Mapped[LyDo] = mapped_column(  # noqa: N815 — spec §9 verbatim field name
        Enum(LyDo, name="cap1_ly_do", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    trangThai_luc_dat: Mapped[TrangThaiLucDat] = mapped_column(  # noqa: N815 — spec §9 verbatim field name
        Enum(
            TrangThaiLucDat,
            name="cap1_trang_thai_luc_dat",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    vung_mua: Mapped[int] = mapped_column(BigInteger, nullable=False)
    co_bam_doc_chi_tiet: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    snapshot_lop_du_lieu: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class OrderKetso(UUIDMixin, TimestampMixin, Base):
    """Kết sổ reconciliation recorded at SELL time — one row per sell order."""

    __tablename__ = "order_ketso"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_orders.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    gia_ra: Mapped[int] = mapped_column(BigInteger, nullable=False)
    so_phien_giu: Mapped[int] = mapped_column(Integer, nullable=False)
    so_ngay_lich: Mapped[int] = mapped_column(Integer, nullable=False)
    pnl_pct: Mapped[float] = mapped_column(Float, nullable=False)
    pnl_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    cam_xuc: Mapped[CamXuc | None] = mapped_column(
        Enum(CamXuc, name="cap1_cam_xuc", values_callable=lambda e: [m.value for m in e]),
        nullable=True,
    )
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
