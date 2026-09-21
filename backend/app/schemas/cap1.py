"""Request/response schemas for the Cấp 1 «Học việc» API.

NOTE: ``lyDo`` / ``trangThai_luc_dat`` intentionally keep the spec's exact
(mixed-case) wire field names — see ``app.models.cap1`` module docstring.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

LyDoLiteral = Literal["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]
TrangThaiLiteral = Literal["ung_ho", "trung_tinh", "can_chu_y", "nguoc_chieu"]
CamXucLiteral = Literal["binh_tinh", "so", "hoi_tiec", "khong_ro"]
CachKhoiLuongLiteral = Literal["khau_vi_tu_tin", "chia_deu"]


class Cap1ProgressOut(BaseModel):
    """Cấp 1 progress state for the current user — **5 nhiệm vụ**.

    ⑤ is «10 lệnh Thực chiến» (``so_lenh_thuc_chien``). The removed ⑤
    («Xem lại danh mục») took ``task_6_done_at`` and ``so_lan_xem_danh_muc``
    off the wire with it — see ``app.models.cap1.Cap1Progress``.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    da_xem_tour: bool
    task_1_done_at: datetime | None = None
    task_2_done_at: datetime | None = None
    task_3_done_at: datetime | None = None
    task_4_done_at: datetime | None = None
    task_5_done_at: datetime | None = None
    so_ly_do_da_dung: int
    so_lenh_ly_do_ung_ho: int
    so_lenh_thuc_chien: int
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


class TaskRequest(BaseModel):
    task_no: int


class KehoachRequest(BaseModel):
    order_id: uuid.UUID
    lyDo: LyDoLiteral  # noqa: N815 — spec §9 verbatim field name
    trangThai_luc_dat: TrangThaiLiteral  # noqa: N815 — spec §9 verbatim field name
    vung_mua: int
    co_bam_doc_chi_tiet: bool = False
    snapshot: dict[str, Any] | None = None


class OrderKehoachOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    lyDo: LyDoLiteral  # noqa: N815 — spec §9 verbatim field name
    trangThai_luc_dat: TrangThaiLiteral  # noqa: N815 — spec §9 verbatim field name
    vung_mua: int
    co_bam_doc_chi_tiet: bool
    snapshot_lop_du_lieu: dict[str, Any] | None = None


class KetsoRequest(BaseModel):
    order_id: uuid.UUID
    cam_xuc: CamXucLiteral | None = None


class OrderKetsoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    gia_ra: int
    so_phien_giu: int
    so_ngay_lich: int
    pnl_pct: float
    pnl_vnd: int
    cam_xuc: CamXucLiteral | None = None
    closed_at: datetime


class TradeHistoryOut(BaseModel):
    """One durable BUY-plan → SELL closeout row shared by Cấp 1–3."""

    buy_order_id: uuid.UUID
    sell_order_id: uuid.UUID
    matched_by: Literal["snapshot", "symbol_fallback"]
    symbol: str
    quantity: int
    bought_at: datetime
    closed_at: datetime
    gia_vao: int | None = None
    gia_ra: int
    pnl_pct: float
    pnl_vnd: int
    lyDo: LyDoLiteral  # noqa: N815
    trangThai_luc_dat: TrangThaiLiteral  # noqa: N815
    vung_mua: int
    cam_xuc: CamXucLiteral | None = None
    phuong_phap_sl_tp: Literal["ho_tro_khang_cu", "bien_do_dao_dong"] | None = None
    cat_lo: int | None = None
    chot_loi: int | None = None
    cham_SL_cuoi_phien: bool = False  # noqa: N815
    cham_SL_cat_dung_phien_ke: bool = False  # noqa: N815
    cham_SL_khong_cat: bool = False  # noqa: N815
    giu_cham_SL_bao_nhieu_phien: int | None = None  # noqa: N815
    cham_TP_giu_lam_hut: bool = False  # noqa: N815
    ban_som_khi_lo_nhe: bool = False
    nhoi_lenh_khi_lo: bool = False
    ghi_chu_nhin_lai: str | None = None
    khau_vi: Literal["than_trong", "can_bang", "tan_cong"] | None = None
    muc_tu_tin: Literal[1, 2, 3] | None = None
    cach_khoi_luong: CachKhoiLuongLiteral | None = None
    khoi_luong: int | None = None
    pct_von: float | None = None


class TradeHistoryListOut(BaseModel):
    trades: list[TradeHistoryOut]
    total: int
