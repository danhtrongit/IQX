"""Request/response schemas for the Cấp 2 «Kỷ luật» API.

NOTE: ``cham_SL_*`` / ``cham_TP_*`` field names intentionally keep the spec's
exact (mixed-case) wire names — see ``app.models.cap1`` "Cấp 2 additions".
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.cap1 import TradeHistoryOut

PhuongPhapSlTpLiteral = Literal["ho_tro_khang_cu", "bien_do_dao_dong"]
XepLoaiLiteral = Literal["xanh", "vang", "do"]


class Cap2ProgressOut(BaseModel):
    """Cấp 2 progress state for the current user — ĐÚNG MỘT nhiệm vụ.

    ``so_lenh_co_cl_tp`` drives the only nhiệm vụ, ① («n/10 lệnh»), and
    ``task_1_done_at`` is the whole tốt-nghiệp gate.

    ★ ``task_2_done_at`` is GONE from the wire: nhiệm vụ ② «Thực hiện đúng khi
    giá chạm mốc» no longer exists (migration ``9c3f7ad10b52``). Leaving an
    always-null field on the payload would invite a client to draw a second
    checklist row for a nhiệm vụ that cannot be completed.

    ★ ``so_lan_cat_lo_dung`` / ``so_lan_chot_loi_dung`` / ``so_lan_thuc_hien_dung``
    stay on the payload as ANALYTICS, not as a nhiệm vụ: they are the 🛑/🎯/✅
    numbers «Phân tích danh mục» block ④ renders (and Cấp 3-8's Phân tích pages
    re-render). ✅ always equals 🛑 + 🎯.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    task_1_done_at: datetime | None = None
    so_lenh_co_cl_tp: int
    so_lan_cat_lo_dung: int
    so_lan_chot_loi_dung: int
    so_lan_thuc_hien_dung: int
    chuoi_current: int
    chuoi_record: int
    last_chuoi_reset_at: datetime | None = None
    so_lenh_7_ngay: int
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


class TaskRequest(BaseModel):
    task_no: int


class KehoachRequest(BaseModel):
    order_id: uuid.UUID
    phuong_phap_sl_tp: PhuongPhapSlTpLiteral
    cat_lo: int
    chot_loi: int


class OrderKehoachOut(BaseModel):
    """Cấp 2's view of ``order_kehoach`` — Cấp 1's fields + the SL/TP commitment."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    vung_mua: int
    phuong_phap_sl_tp: PhuongPhapSlTpLiteral | None = None
    cat_lo: int | None = None
    chot_loi: int | None = None


class KetsoRequest(BaseModel):
    order_id: uuid.UUID
    cham_SL_cuoi_phien: bool = False  # noqa: N815 — spec §13 verbatim
    cham_SL_cat_dung_phien_ke: bool = False  # noqa: N815 — spec §13 verbatim
    cham_SL_khong_cat: bool = False  # noqa: N815 — spec §13 verbatim
    giu_cham_SL_bao_nhieu_phien: int | None = None  # noqa: N815 — spec §13 verbatim
    cham_TP_giu_lam_hut: bool = False  # noqa: N815 — spec §13 verbatim
    ban_som_khi_lo_nhe: bool = False
    nhoi_lenh_khi_lo: bool = False
    ghi_chu_nhin_lai: str | None = None


class OrderKetsoOut(BaseModel):
    """Cấp 2's view of ``order_ketso`` — Cấp 1's fields + the 7 discipline flags."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    gia_ra: int
    pnl_pct: float
    pnl_vnd: int
    closed_at: datetime
    cham_SL_cuoi_phien: bool  # noqa: N815 — spec §13 verbatim
    cham_SL_cat_dung_phien_ke: bool  # noqa: N815 — spec §13 verbatim
    cham_SL_khong_cat: bool  # noqa: N815 — spec §13 verbatim
    giu_cham_SL_bao_nhieu_phien: int | None = None  # noqa: N815 — spec §13 verbatim
    cham_TP_giu_lam_hut: bool  # noqa: N815 — spec §13 verbatim
    ban_som_khi_lo_nhe: bool
    nhoi_lenh_khi_lo: bool
    ghi_chu_nhin_lai: str | None = None


class DiemKyLuatThanhPhan(BaseModel):
    """Breakdown of the 0-100 điểm kỷ luật formula — §C12c "số đến từ đâu"."""

    ke_hoach: float
    ke_hoach_toi_da: float = 40
    cat_lo_dung: float
    cat_lo_dung_toi_da: float = 40
    khong_nhoi: float
    khong_nhoi_toi_da: float = 30
    chot_loi_dung: float
    chot_loi_dung_toi_da: float = 30


class DiemKyLuatOut(BaseModel):
    """Response for ``GET /cap2/diem-ky-luat`` — score + explanation + breakdown."""

    ngay: date
    co_giao_dich: bool
    co_tinh_huong: bool
    diem: float | None = None
    xep_loai: XepLoaiLiteral | None = None
    giai_thich: str
    thanh_phan: DiemKyLuatThanhPhan | None = None


class TradeHistoryListOut(BaseModel):
    trades: list[TradeHistoryOut]
    total: int


class DiemKyLuatHistoryOut(BaseModel):
    scores: list[DiemKyLuatOut]
    from_date: date
    to_date: date


ViolationLiteral = Literal[
    "cat_lo_cham", "chot_loi_hut", "ban_som_lo_nhe", "nhoi_lenh_khi_lo"
]


class DisciplineWindowRow(BaseModel):
    sell_order_id: uuid.UUID
    symbol: str
    closed_at: datetime
    compliant: bool
    violations: list[ViolationLiteral]


class WeeklyViolationRow(BaseModel):
    week_start: date
    week_end: date
    cat_lo_cham: int
    chot_loi_hut: int
    ban_som_lo_nhe: int
    nhoi_lenh_khi_lo: int
    total: int
    trend: Literal["tang", "giam", "on_dinh"] | None = None


class Score30DaySummary(BaseModel):
    scores: list[DiemKyLuatOut]
    average_7d: float | None = None
    average_30d: float | None = None
    xanh_days: int
    vang_days: int
    do_days: int


class ReflectionInsight(BaseModel):
    pattern: Literal[
        "loss_aversion", "chi_so_hoa", "fomo", "tin_tuc",
        "khong_tin_phan_tich", "cam_xuc_manh",
    ]
    matches: int
    note_count: int
    interpretation: str
    next_step: str


class ReflectionSummary(BaseModel):
    eligible: bool
    note_count: int
    violation_count: int
    insights: list[ReflectionInsight]


class DetectedPattern(BaseModel):
    pattern_id: Literal[9, 10, 11, 12]
    message: str
    data: dict


class Cap2AnalysisOut(BaseModel):
    score_30d: Score30DaySummary
    weekly_violations: list[WeeklyViolationRow]
    window20: list[DisciplineWindowRow]
    reflection: ReflectionSummary
    patterns: list[DetectedPattern]
