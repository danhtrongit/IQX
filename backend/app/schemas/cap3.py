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


