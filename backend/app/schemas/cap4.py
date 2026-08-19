"""Request/response schemas for the Cấp 4 «Thuần thục» API — đọc + tự chấm 5
lớp, vũ khí / điểm mù.

★ Cấp 4 có ĐÚNG MỘT nhiệm vụ («Đọc và chấm đủ 5 lớp qua 20 lệnh») — khối
"Thách thức Thuần thục" (3 điều kiện) và hai nhiệm vụ cũ đã bị gỡ cùng
``ThachThucOut``/``ThachThucDieuKien``. Xem ``app.models.cap4``.
"""

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
    #: Nhiệm vụ DUY NHẤT — «Đọc và chấm đủ 5 lớp qua 20 lệnh».
    task_1_done_at: datetime | None = None
    so_lenh_doc_du_5lop: int
    #: NULL = chưa đủ dữ liệu để kết luận (≥3 lệnh đã đóng mỗi lớp) — KHÔNG
    #: được hiển thị thành 0/"không có".
    vu_khi_lop: LopLiteral | None = None
    diem_mu_lop: LopLiteral | None = None
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


class TaskRequest(BaseModel):
    """``PATCH /cap4/task`` — Cấp 4 chỉ còn nhiệm vụ ①, nên ``task_no`` hợp lệ
    duy nhất là 1 (service ném ``BadRequestError`` cho mọi giá trị khác)."""

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
