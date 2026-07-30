"""Request/response schemas for the Cấp 5 «Lão luyện» API — verdict hệ gợi ý +
provenance, phân loại 4 ô, đứng ngoài có chủ đích, Thách thức Lão luyện
(§2/§4/§5/§8/§10)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

VerdictLiteral = Literal["dung", "sai"]
O4Literal = Literal["dung_thang", "dung_thua", "sai_thang", "sai_thua"]
LyDoDungNgoaiLiteral = Literal[
    "chua_du_co_so",
    "dinh_gia_dat",
    "cho_vung_mua_tot_hon",
    "du_lieu_nguoc_chieu",
    "du_vi_the_nhom",
]
KetQuaLiteral = Literal["ne_dung", "ne_hut", "trung_tinh"]


class Cap5ProgressOut(BaseModel):
    """Cấp 5 progress state for the current user."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    task_1_done_at: datetime | None = None
    task_2_done_at: datetime | None = None
    task_3_done_at: datetime | None = None
    so_lenh_phan_loai: int
    so_lan_dung_ngoai_da_cham: int
    ty_le_quyet_dinh_dung: float
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


class TaskRequest(BaseModel):
    task_no: int


# ── Verdict hệ gợi ý + provenance (§4/§C12c) ──────────


class VerdictSignal(BaseModel):
    """One tín hiệu behind the suggested verdict — the FE shows these verbatim
    (spec §4: "Provenance bắt buộc — không hiện verdict trơ").

    ``dat=None`` means the source data for this signal was never recorded, so it
    is reported as unknown rather than silently counted as passed; unknown
    signals are excluded from the verdict (see the service).
    """

    ma: str
    ten: str
    dat: bool | None
    giai_thich: str


class VerdictOut(BaseModel):
    """Response for ``GET /cap5/verdict/{order_id}`` — the SUGGESTED verdict
    plus every signal it was derived from.

    ★ ``pnl_pct`` is echoed for display and to explain ``o_4_du_kien``; it never
    influences ``verdict`` (spec §1: đúng/sai đo QUY TRÌNH).
    """

    order_id: uuid.UUID
    verdict: VerdictLiteral
    giai_thich: str
    signals: list[VerdictSignal]
    pnl_pct: float
    thang: bool
    o_4_du_kien: O4Literal


class KetsoRequest(BaseModel):
    """``POST /cap5/ketso`` — the user confirms or overrides the hệ verdict.

    ``ly_do_sua`` is REQUIRED when ``verdict_user`` differs from the server's
    own ``verdict_he`` (422 otherwise). ``verdict_he``/``o_4`` are NOT accepted
    from the client — the server recomputes both at write time.
    """

    order_id: uuid.UUID
    verdict_user: str = Field(description="Chốt của user: 'dung' | 'sai'")
    ly_do_sua: str | None = Field(
        default=None, description="Bắt buộc khi user sửa khác verdict hệ"
    )


class KetsoCap5Out(BaseModel):
    """Cấp 5's view of ``order_ketso`` — Cấp 1/2's fields + the 4-ô block."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    pnl_pct: float
    verdict_he: VerdictLiteral | None = None
    verdict_user: VerdictLiteral | None = None
    verdict_provenance: dict | None = None
    o_4: O4Literal | None = None
    ly_do_sua: str | None = None


# ── Đứng ngoài có chủ đích (§5) ───────────────────────


class DungNgoaiRequest(BaseModel):
    """``POST /cap5/dung-ngoai`` — logs a non-trade decision. The price snapshot
    is resolved server-side (never client-supplied)."""

    symbol: str
    reason: str = Field(description="1 trong 5 lý do đứng ngoài")


class DungNgoaiOut(BaseModel):
    """One logged đứng-ngoài decision + its score (once tới hạn)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    symbol: str
    decided_at: datetime
    reason: LyDoDungNgoaiLiteral
    ly_do_ten: str
    gia_luc_dung_ngoai: float
    han_cham_date: date
    da_toi_han: bool
    cham_at: datetime | None = None
    gia_sau_5_phien: float | None = None
    ket_qua: KetQuaLiteral | None = None
    ket_qua_ten: str | None = None
    pct_thay_doi: float | None = None
    giai_thich: str


class LyDoHayDung(BaseModel):
    """Most-used lý do (khối ⑬)."""

    ma: LyDoDungNgoaiLiteral
    ten: str
    so_lan: int


class DungNgoaiListOut(BaseModel):
    """Response for ``GET /cap5/dung-ngoai`` — the nhật ký + its counts.

    Any decision whose 5-phiên window has elapsed is scored during this call
    (lazy compute-on-read, no cron).
    """

    so_lan: int
    so_ne_dung: int
    so_ne_hut: int
    so_trung_tinh: int
    so_chua_toi_han: int
    so_lan_da_cham: int
    du_de_phan_tich: bool
    so_lan_toi_thieu_phan_tich: int
    ly_do_hay_dung: LyDoHayDung | None = None
    so_phien_cham: int
    nguong_ne_dung_pct: float
    nguong_ne_hut_pct: float
    giai_thich: str
    items: list[DungNgoaiOut]


class ChamDungNgoaiOut(BaseModel):
    """Response for ``POST /cap5/dung-ngoai/cham`` — same routine the reads run,
    exposed explicitly."""

    so_moi_cham: int
    so_lan_da_cham: int
    so_chua_toi_han: int
    giai_thich: str
    items: list[DungNgoaiOut]


# ── Thách thức Lão luyện (§2③) ────────────────────────


class ThachThucDieuKien(BaseModel):
    """One of the 3 sub-conditions of nhiệm vụ ③ (§C12c: always shown with its
    current value + a short explanation — never a bare number)."""

    ten: str
    gia_tri_hien_tai: float
    muc_tieu: float
    dat: bool
    giai_thich: str


class ThachThucOut(BaseModel):
    """Response for ``GET /cap5/thach-thuc`` — the 3 sub-conditions of
    nhiệm vụ ③ (spec §2③), all recomputed server-side."""

    dat_ca_3: bool
    so_lenh_phan_loai: ThachThucDieuKien
    so_lan_dung_ngoai_da_cham: ThachThucDieuKien
    ty_le_quyet_dinh_dung: ThachThucDieuKien
