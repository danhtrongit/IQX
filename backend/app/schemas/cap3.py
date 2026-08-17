"""Request/response schemas for the Cấp 3 «Bản lĩnh» API — khẩu vị rủi ro +
mức tự tin + khối lượng mua (§6/§10)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

KhauViLiteral = Literal["than_trong", "can_bang", "tan_cong"]
MucTuTinLiteral = Literal[1, 2, 3]
CachKhoiLuongLiteral = Literal["linh_hoat", "ky_luat"]


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
    task_3_done_at: datetime | None = None
    so_lenh_cap3: int
    lai_pct_cap3: float
    #: ``None`` = chưa biết (chưa có ngày nào ở Cấp 3 có tình huống để chấm)
    #: — KHÔNG phải 0. Xem ``Cap3Service._diem_ky_luat_tb``.
    diem_ky_luat_tb_cap3: float | None = None
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


class KhauViRequest(BaseModel):
    khau_vi: KhauViLiteral


class TaskRequest(BaseModel):
    task_no: int


class KehoachRequest(BaseModel):
    order_id: uuid.UUID
    khau_vi: KhauViLiteral
    muc_tu_tin: MucTuTinLiteral
    cach_khoi_luong: CachKhoiLuongLiteral
    khoi_luong: int
    pct_von: float


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


class ThachThucDieuKien(BaseModel):
    """One of the 3 sub-conditions of nhiệm vụ ③ — Thách thức Bản lĩnh
    (§C12c: always shown with its current value + a short explanation)."""

    ten: str
    #: ``None`` = **chưa biết** (chỉ có ở điều kiện điểm kỷ luật khi chưa có
    #: ngày nào chấm được) — FE hiện "—", không hiện 0.
    gia_tri_hien_tai: float | None
    muc_tieu: float
    dat: bool
    giai_thich: str


class ThachThucOut(BaseModel):
    """Response for ``GET /cap3/thach-thuc`` — the 3 sub-conditions of
    nhiệm vụ ③ (spec §2③)."""

    dat_ca_3: bool
    lai_pct: ThachThucDieuKien
    so_lenh: ThachThucDieuKien
    diem_ky_luat: ThachThucDieuKien
