"""Request/response schemas for the Cấp 3 «Bản lĩnh» API — khẩu vị rủi ro +
mức tự tin + khối lượng mua (§6/§10)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.cap1 import TradeHistoryOut

KhauViLiteral = Literal["than_trong", "can_bang", "tan_cong"]
MucTuTinLiteral = Literal[1, 2, 3]
CachKhoiLuongLiteral = Literal["khau_vi_tu_tin", "chia_deu"]
TaskNoLiteral = Literal[1, 2]


class Cap3ProgressOut(BaseModel):
    """Cấp 3 progress state for the current user."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    khau_vi_da_dat: bool
    khau_vi: KhauViLiteral | None = None
    von_ban_dau: int
    task_1_done_at: datetime | None = None
    task_2_done_at: datetime | None = None
    so_lenh_quan_ly_von: int
    muc_tu_tin_da_dung: list[MucTuTinLiteral]
    so_muc_tu_tin_da_dung: int
    # Non-gating analytics, retained for portfolio/learning views.
    so_lenh_cap3: int
    lai_pct_cap3: float
    diem_ky_luat_tb_cap3: float | None = None
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


class KhauViRequest(BaseModel):
    khau_vi: KhauViLiteral


class TaskRequest(BaseModel):
    task_no: TaskNoLiteral


class KehoachRequest(BaseModel):
    order_id: uuid.UUID
    khau_vi: KhauViLiteral
    muc_tu_tin: MucTuTinLiteral
    cach_khoi_luong: CachKhoiLuongLiteral
    khoi_luong: int
    pct_von: float

    @field_validator("cach_khoi_luong", mode="before")
    @classmethod
    def normalize_legacy_method(cls, value: str) -> str:
        return {"linh_hoat": "khau_vi_tu_tin", "ky_luat": "chia_deu"}.get(value, value)


class OrderKehoachOut(BaseModel):
    """Cấp 3's view of ``order_kehoach`` — Cấp 1's fields + the quản lý vốn block."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    vung_mua: int
    khau_vi: KhauViLiteral | None = None
    muc_tu_tin: int | None = None
    cach_khoi_luong: CachKhoiLuongLiteral | None = None
    khoi_luong: int | None = None
    pct_von: float | None = None


class Cap3PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    symbol: str
    quantity: int
    bought_at: datetime
    gia_vao: int
    lyDo: Literal["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]  # noqa: N815
    trangThai_luc_dat: Literal["ung_ho", "trung_tinh", "can_chu_y", "nguoc_chieu"]  # noqa: N815
    vung_mua: int
    phuong_phap_sl_tp: Literal["ho_tro_khang_cu", "bien_do_dao_dong"] | None = None
    cat_lo: int | None = None
    chot_loi: int | None = None
    khau_vi: KhauViLiteral | None = None
    muc_tu_tin: MucTuTinLiteral | None = None
    cach_khoi_luong: CachKhoiLuongLiteral | None = None
    khoi_luong: int | None = None
    pct_von: float | None = None


class Cap3TradeListOut(BaseModel):
    trades: list[TradeHistoryOut]
    total: int


class ConfidenceAnalysisRow(BaseModel):
    muc_tu_tin: MucTuTinLiteral
    count: int
    wins: int
    win_rate: float | None = None
    avg_pnl_pct: float | None = None
    avg_khoi_luong: float | None = None
    avg_pct_von: float | None = None


class Cap3TradeAnalysisOut(Cap3TradeListOut):
    by_confidence: list[ConfidenceAnalysisRow]
