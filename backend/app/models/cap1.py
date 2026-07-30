"""Cấp 1 «Học việc» models — progression, order kế hoạch (plan), order kết sổ
(close-out reconciliation).

Cấp 1 builds on a graduated Cấp 0: FREE, Thực chiến-only mode. It adds a
mandatory "Form Kế hoạch" (lý do mua + vùng mua) at buy time and a "Kết sổ"
reconciliation at sell time. See
``~/Downloads/DEMO TRADING/LEVEL 1/IQX-Cap1-Spec.md`` §9 for the verbatim
data model this mirrors.

NOTE: ``lyDo`` / ``trangThai_luc_dat`` intentionally keep the spec's exact
(mixed-case) field names — §9 lists this schema as VERBATIM.

Cấp 2 «Kỷ luật» (``~/Downloads/DEMO TRADING/LEVEL 2/IQX-Cap2-Spec.md``) EXTENDS
``OrderKehoach``/``OrderKetso`` in place (same physical tables, new columns
added by a later migration) rather than creating new tables — see
``PhuongPhapSlTp`` and the "Cấp 2 additions" column blocks below. Cấp 2's own
new table (``cap2_progress``) lives in ``app.models.cap2``. Cấp 3 «Bản lĩnh»
and Cấp 4 «Thuần thục» follow the same pattern (``cap3_progress`` /
``cap4_progress`` in ``app.models.cap3``/``app.models.cap4``, plus the "Cấp 3
additions" / "Cấp 4 additions" column blocks on ``OrderKehoach``). Cấp 5
«Lão luyện» extends ``OrderKetso`` the same way (the "Cấp 5 additions" column
block below — verdict hệ/user + provenance + 4 ô) and owns ``cap5_progress`` +
``standby_decision`` in ``app.models.cap5``.
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
    String,
    Text,
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


class PhuongPhapSlTp(enum.StrEnum):
    """Cấp 2 addition (spec §5) — 2 cách chọn 1 for cắt lỗ/chốt lời, recorded
    on ``OrderKehoach``. Lives here (not in ``app.models.cap2``) because it
    decorates a column on this module's ``OrderKehoach`` class — same
    physical ``order_kehoach`` table, extended by Cấp 2's migration."""

    HO_TRO_KHANG_CU = "ho_tro_khang_cu"
    BIEN_DO_DAO_DONG = "bien_do_dao_dong"


class KhauViRuiRo(enum.StrEnum):
    """Cấp 3 addition (spec §5) — 3-mức khẩu vị rủi ro (% vốn tối đa/lệnh).

    Lives here (not in ``app.models.cap3``) because it decorates a column on
    this module's ``OrderKehoach`` class (the per-order snapshot of the
    khẩu vị active when the order was placed — spec §7 "Khẩu vị rủi ro lúc
    đặt"). It is ALSO the canonical enum for ``Cap3Progress.khau_vi`` (the
    live profile setting) — see ``app.models.cap3`` for why no separate
    ``khau_vi_rui_ro`` column exists.
    """

    THAN_TRONG = "than_trong"  # trần 10%
    CAN_BANG = "can_bang"  # trần 20% (mặc định gợi ý)
    TAN_CONG = "tan_cong"  # trần 30%


class CachKhoiLuong(enum.StrEnum):
    """Cấp 3 addition (spec §6.3) — 2 cách chọn 1 for khối lượng mua,
    recorded on ``OrderKehoach``. Lives here for the same reason as
    ``PhuongPhapSlTp``/``KhauViRuiRo`` above.

    NOTE: the implementation task's literal instructions specify these two
    wire values (matching the human-readable "linh hoạt"/"kỷ luật" labels
    used throughout §6.3's headers); §10's data-model sketch alternatively
    names them ``khau_vi_tu_tin``/``chia_deu`` — we follow the task's
    explicit values since it is the operative directive for this build.
    """

    LINH_HOAT = "linh_hoat"  # Cách 1 — khẩu vị × tự tin
    KY_LUAT = "ky_luat"  # Cách 2 — chia đều theo khẩu vị


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

    # ── Cấp 2 additions (spec §5) — cắt lỗ/chốt lời, 2 cách chọn 1 ────
    phuong_phap_sl_tp: Mapped[PhuongPhapSlTp | None] = mapped_column(
        Enum(
            PhuongPhapSlTp,
            name="cap2_phuong_phap_sl_tp",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=True,
    )
    cat_lo: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    chot_loi: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # ── Cấp 3 additions (spec §6/§10) — quản lý vốn: khẩu vị + tự tin + khối lượng ──
    khau_vi: Mapped[KhauViRuiRo | None] = mapped_column(
        Enum(
            KhauViRuiRo,
            name="cap3_khau_vi_rui_ro",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=True,
    )
    muc_tu_tin: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1/2/3 = Thấp/Vừa/Cao
    cach_khoi_luong: Mapped[CachKhoiLuong | None] = mapped_column(
        Enum(
            CachKhoiLuong,
            name="cap3_cach_khoi_luong",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=True,
    )
    khoi_luong: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pct_von: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ── Cấp 4 additions (spec §5/§8) — "Đọc 5 lớp": user tự chấm cả 5 lớp
    # (thay trường "chọn 1 lý do" của Cấp 1) + đánh giá AI rút về 3 mức.
    # ``doc_5_lop`` / ``ai_5_lop``: {lop: 'ok'|'neu'|'bad'} với lop ∈ 5 giá trị
    # của ``LyDo`` — xem ``app.models.cap4`` (LOP_KEYS/NhanDinhLop) cho lý do
    # dùng JSON thay vì 10 cột enum. Tất cả nullable để lệnh Cấp 1/2/3 cũ
    # (chưa từng đọc 5 lớp) vẫn hợp lệ.
    doc_5_lop: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ai_5_lop: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Số lớp AI đánh giá Ủng hộ (0-5) — "điểm đồng thuận" §5.2.
    so_lop_dong_thuan: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Số lớp user đọc khác AI — COUNT TRUNG TÍNH (§4.2/§9: không bao giờ được
    # dùng để chấm đúng/sai; chất lượng đọc chỉ đo bằng kết quả thật).
    so_lop_khac_ai: Mapped[int | None] = mapped_column(Integer, nullable=True)


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

    # ── Cấp 2 additions (spec §8/§9/§13) — 4 vi phạm kỷ luật đo được ──
    cham_SL_cuoi_phien: Mapped[bool] = mapped_column(  # noqa: N815 — spec §13 verbatim
        Boolean, nullable=False, default=False, server_default="false"
    )
    cham_SL_cat_dung_phien_ke: Mapped[bool] = mapped_column(  # noqa: N815 — spec §13 verbatim
        Boolean, nullable=False, default=False, server_default="false"
    )
    cham_SL_khong_cat: Mapped[bool] = mapped_column(  # noqa: N815 — spec §13 verbatim
        Boolean, nullable=False, default=False, server_default="false"
    )
    giu_cham_SL_bao_nhieu_phien: Mapped[int | None] = mapped_column(  # noqa: N815
        Integer, nullable=True, default=0, server_default="0"
    )
    cham_TP_giu_lam_hut: Mapped[bool] = mapped_column(  # noqa: N815 — spec §13 verbatim
        Boolean, nullable=False, default=False, server_default="false"
    )
    ban_som_khi_lo_nhe: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    nhoi_lenh_khi_lo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # ── Cấp 5 additions (spec §4/§8) — "phân loại 4 ô": tách QUYẾT ĐỊNH khỏi
    # KẾT QUẢ. ``verdict_he`` là gợi ý của hệ suy ra từ dữ liệu quy trình Cấp
    # 1-4 đã ghi trên chính lệnh này; ``verdict_user`` là chốt của user (hybrid
    # §C12c — user luôn sửa được, sửa thì bắt ghi ``ly_do_sua``);
    # ``verdict_provenance`` là JSON các tín hiệu dẫn tới verdict hệ (FE hiện
    # nguyên văn, KHÔNG bao giờ hiện verdict trơ); ``o_4`` = verdict cuối ×
    # thắng/thua. Xem ``app.models.cap5`` (Verdict/O4) cho lý do dùng String +
    # JSON thay vì PG enum. Tất cả nullable để lệnh Cấp 1-4 cũ vẫn hợp lệ.
    #
    # ★ ``pnl_pct`` KHÔNG bao giờ ảnh hưởng verdict — nó chỉ chọn CỘT của ma
    # trận 4 ô (lệnh thua mà làm đúng quy trình là ``dung_thua``).
    verdict_he: Mapped[str | None] = mapped_column(String(8), nullable=True)
    verdict_user: Mapped[str | None] = mapped_column(String(8), nullable=True)
    verdict_provenance: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    o_4: Mapped[str | None] = mapped_column(String(16), nullable=True)
    ly_do_sua: Mapped[str | None] = mapped_column(Text, nullable=True)
