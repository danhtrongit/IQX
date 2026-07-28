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


class Cap1ProgressOut(BaseModel):
    """Cấp 1 progress state for the current user."""

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
    task_6_done_at: datetime | None = None
    so_ly_do_da_dung: int
    so_lenh_ly_do_ung_ho: int
    so_lan_xem_danh_muc: int
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
