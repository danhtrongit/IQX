"""Request/response schemas for the Cấp 4 «Thuần thục» API — đọc + tự chấm 5
lớp, vũ khí / điểm mù, Thách thức Thuần thục (§5/§7/§8/§10)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LopLiteral = Literal["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]
NhanDinhLiteral = Literal["ok", "neu", "bad"]
NhanVuKhiLiteral = Literal["vu_khi", "diem_mu", "chua_du_du_lieu"]


class Cap4ProgressOut(BaseModel):
    """Cấp 4 progress state for the current user."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    task_1_done_at: datetime | None = None
    task_2_done_at: datetime | None = None
    task_3_done_at: datetime | None = None
    so_lenh_doc_du_5lop: int
    vu_khi_lop: LopLiteral | None = None
    diem_mu_lop: LopLiteral | None = None
    ty_le_thang_dong_thuan_cao: float
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


class TaskRequest(BaseModel):
    task_no: int


class KehoachRequest(BaseModel):
    """``POST /cap4/kehoach`` — khối "Đọc 5 lớp" ghi thêm vào kế hoạch đã có.

    ``doc_5_lop``/``ai_5_lop`` are validated in the service layer (keys must be
    the 5 lớp, values one of ok/neu/bad) so bad payloads produce a single,
    Vietnamese ``BadRequestError`` message instead of a pydantic dump.

    ``so_lop_dong_thuan``/``so_lop_khac_ai`` are ADVISORY: the server always
    recomputes them from the two blobs above (never trust the client).
    """

    order_id: uuid.UUID
    doc_5_lop: dict | list | None = Field(
        default=None, description="Nhận định của user cho từng lớp: 'ok'|'neu'|'bad'"
    )
    ai_5_lop: dict | list | None = Field(
        default=None, description="Đánh giá AI rút về 3 mức cho từng lớp (nếu đã lộ)"
    )
    so_lop_dong_thuan: int | None = Field(
        default=None, description="Chỉ để tham chiếu — server tự tính lại"
    )
    so_lop_khac_ai: int | None = Field(
        default=None, description="Chỉ để tham chiếu — server tự tính lại"
    )


class OrderKehoachOut(BaseModel):
    """Cấp 4's view of ``order_kehoach`` — Cấp 1's fields + the đọc-5-lớp block."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    vung_mua: int
    doc_5_lop: dict[str, NhanDinhLiteral] | None = None
    ai_5_lop: dict[str, NhanDinhLiteral] | None = None
    so_lop_dong_thuan: int | None = None
    so_lop_khac_ai: int | None = None


class LopWinRate(BaseModel):
    """One lớp's REAL win rate when the user self-rated it Ủng hộ (§7 khối ⑨).

    §C12c: every number ships with its provenance — ``n_orders``/``n_wins`` are
    the raw counts the rate was computed from, ``giai_thich`` spells it out.
    """

    lop: LopLiteral
    ten: str
    n_orders: int
    n_wins: int
    win_rate: float | None
    nhan: NhanVuKhiLiteral | None
    giai_thich: str


class VuKhiDiemMuOut(BaseModel):
    """Response for ``GET /cap4/vu-khi-diem-mu`` (spec §7 khối ⑨) — per-lớp win
    rate sorted desc, plus the identified vũ khí / điểm mù."""

    lop: list[LopWinRate]
    vu_khi_lop: LopLiteral | None = None
    diem_mu_lop: LopLiteral | None = None
    so_lenh_toi_thieu: int
    nguong_vu_khi: float
    nguong_diem_mu: float
    giai_thich: str


class ThachThucDieuKien(BaseModel):
    """One of the 3 sub-conditions of nhiệm vụ ③ — Thách thức Thuần thục
    (§C12c: always shown with its current value + a short explanation)."""

    ten: str
    gia_tri_hien_tai: float
    muc_tieu: float
    dat: bool
    giai_thich: str


class ThachThucOut(BaseModel):
    """Response for ``GET /cap4/thach-thuc`` — the 3 sub-conditions of
    nhiệm vụ ③ (spec §2③)."""

    dat_ca_3: bool
    so_lenh_doc_du_5lop: ThachThucDieuKien
    vu_khi_diem_mu: ThachThucDieuKien
    ty_le_thang_dong_thuan_cao: ThachThucDieuKien
