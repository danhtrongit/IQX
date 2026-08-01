"""Request/response schemas for the Cấp 6 «Đối chiếu» API — kiểu cổ phiếu +
trọng số gợi ý (kèm "vì sao"), bước Đối chiếu, Thách thức Đối chiếu
(§2/§4/§5/§9)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

KieuLiteral = Literal[
    "ngan_hang",
    "tang_truong",
    "chu_ky",
    "phong_thu",
    "bat_dong_san",
    "dau_co_nho",
]
LopLiteral = Literal["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]


class Cap6ProgressOut(BaseModel):
    """Cấp 6 progress state for the current user."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    task_1_done_at: datetime | None = None
    task_2_done_at: datetime | None = None
    task_3_done_at: datetime | None = None
    so_lenh_doi_chieu: int
    so_kieu_da_gap: int
    ty_le_thang_khop: float
    ty_le_thang_lech: float
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


class TaskRequest(BaseModel):
    task_no: int


# ── Kiểu cổ phiếu + trọng số gợi ý (§4/§5/§C12c) ──────


class GoiYOut(BaseModel):
    """Response for ``GET /cap6/goi-y?symbol=`` — which lớp to prioritise for
    this symbol's kiểu cổ phiếu, and **why**.

    ★ This is a SUGGESTION, never a rule (spec §5/§10). ``kieu = None`` means
    "chưa phân loại" (ngành missing or deliberately unmapped): ``lop_uu_tien`` /
    ``lop_it_tin`` come back empty and ``giai_thich`` says so honestly — the FE
    still lets the user pick a lớp quyết định.
    """

    symbol: str
    #: The ICB ngành the kiểu was derived FROM (provenance; null when unknown).
    nganh: str | None = None
    kieu: KieuLiteral | None = None
    kieu_ten: str | None = None
    lop_uu_tien: list[LopLiteral] = Field(default_factory=list)
    lop_uu_tien_ten: list[str] = Field(default_factory=list)
    lop_it_tin: list[LopLiteral] = Field(default_factory=list)
    lop_it_tin_ten: list[str] = Field(default_factory=list)
    #: The "vì sao" sentence — shown VERBATIM (§C12c: never a bare suggestion).
    giai_thich: str


# ── Bước Đối chiếu (§4) ───────────────────────────────


class KehoachRequest(BaseModel):
    """``POST /cap6/kehoach`` — the user's Đối chiếu decision for one BUY order.

    ``lop_quyet_dinh`` + ``ly_do_doi_chieu`` are the user's OWN judgement and the
    only truly authoritative inputs; ``ly_do_doi_chieu`` is required (422 when
    blank). ``kieu_co_phieu`` is re-derived server-side from the symbol's ngành
    and the server's value wins — the client's is a fallback for symbols with no
    ngành, and is re-validated against the 6-kiểu enum. ``lop_mau_thuan`` is
    re-derived from the row's persisted ``doc_5_lop``. ``trong_so_goi_y`` and
    ``khop_goi_y`` are NEVER accepted from the client at all — the server derives
    both from the kiểu table.
    """

    order_id: uuid.UUID
    lop_quyet_dinh: str = Field(description="Lớp user chọn tin: 1 trong 5 lớp")
    ly_do_doi_chieu: str | None = Field(
        default=None, description="1 dòng vì sao — BẮT BUỘC"
    )
    kieu_co_phieu: str | None = Field(
        default=None, description="Chỉ dùng khi server không xác định được ngành"
    )
    lop_mau_thuan: dict | None = Field(
        default=None, description="{lop: 'ok'|'neu'|'bad'} — dự phòng, server ưu tiên doc_5_lop"
    )


class KehoachCap6Out(BaseModel):
    """Cấp 6's view of ``order_kehoach`` — the Đối chiếu block + its labels."""

    id: uuid.UUID
    order_id: uuid.UUID
    kieu_co_phieu: KieuLiteral | None = None
    kieu_ten: str | None = None
    lop_mau_thuan: dict | None = None
    trong_so_goi_y: dict | None = None
    lop_quyet_dinh: LopLiteral | None = None
    lop_quyet_dinh_ten: str | None = None
    #: ★ ``False`` is a NEUTRAL fact (spec §5/§10), never "sai". ``None`` = kiểu
    #: chưa phân loại, so there was no suggestion to match.
    khop_goi_y: bool | None = None
    ly_do_doi_chieu: str | None = None


class KehoachCap6DetailOut(KehoachCap6Out):
    """Response for ``GET /cap6/kehoach/{order_id}`` — the Đối chiếu block
    RECORDED on one order, everything the Kết sổ needs to render it, and nothing
    recomputed.

    ★ Why this exists next to ``GoiYOut``: ``/cap6/goi-y`` re-derives the kiểu
    from the symbol's ngành *now*, so for a symbol the server cannot classify it
    keeps answering "chưa phân loại" — even for an order whose kiểu came from the
    client and whose ``khop_goi_y`` the server DID record. This endpoint reads the
    stored columns instead, so the Kết sổ can show khớp/lệch honestly.

    ``co_du_lieu = False`` marks an order with no Cấp 6 data at all (placed
    before the level existed, or the lớp never conflicted so the step never
    appeared). That is a normal 200, NOT a 404: the FE must be able to tell it
    apart from a failed call. Every other field is then null/empty and
    ``giai_thich`` says so.

    ``khop_goi_y`` keeps its three states: ``True`` khớp · ``False`` lệch (a
    NEUTRAL fact, never "sai") · ``None`` kiểu chưa phân loại, so no suggestion
    existed to match.
    """

    #: ``None`` only when the order has no ``order_kehoach`` row at all.
    id: uuid.UUID | None = None
    symbol: str
    #: The ICB ngành recorded in ``trong_so_goi_y`` (provenance; null when the
    #: kiểu was unknown or came from the client).
    nganh: str | None = None
    #: Read out of the STORED ``trong_so_goi_y``, not re-derived — same shape as
    #: ``GoiYOut`` so the FE reuses one component.
    lop_uu_tien: list[LopLiteral] = Field(default_factory=list)
    lop_uu_tien_ten: list[str] = Field(default_factory=list)
    lop_it_tin: list[LopLiteral] = Field(default_factory=list)
    lop_it_tin_ten: list[str] = Field(default_factory=list)
    #: "Khớp gợi ý" / "Lệch gợi ý" / null. Neither label says đúng or sai.
    khop_goi_y_ten: str | None = None
    #: False = lệnh này không có dữ liệu Cấp 6 (không phải lỗi).
    co_du_lieu: bool
    #: §C12c — shown VERBATIM; never a bare khớp/lệch badge.
    giai_thich: str


# ── Thách thức Đối chiếu (§2③ / §7 khối ⑮) ────────────


class ThachThucDieuKien(BaseModel):
    """One of the 3 sub-conditions of nhiệm vụ ③ (§C12c: always shown with its
    current value + a short explanation — never a bare number).

    ``du_du_lieu = False`` marks a condition that cannot be judged yet (the
    win-rate leg needs ≥3 closed lệnh in EACH group) — it is neither passed nor
    held against the user.
    """

    ten: str
    gia_tri_hien_tai: float
    muc_tieu: float
    dat: bool
    du_du_lieu: bool = True
    giai_thich: str


class NhomDoiChieu(BaseModel):
    """One side of the khớp-vs-lệch comparison (spec §7 khối ⑮).

    ``ty_le_thang`` is ``None`` when the group has no closed lệnh at all;
    ``du_du_lieu`` is ``False`` below ``so_lenh_toi_thieu`` closed lệnh.
    """

    khop: bool
    ten: str
    so_lenh: int
    so_thang: int
    ty_le_thang: float | None = None
    du_du_lieu: bool
    so_lenh_toi_thieu: int
    giai_thich: str


class ThachThucOut(BaseModel):
    """Response for ``GET /cap6/thach-thuc`` — the 3 sub-conditions of nhiệm vụ
    ③ (spec §2③) + both comparison groups, all recomputed server-side."""

    dat_ca_3: bool
    so_lenh_doi_chieu: ThachThucDieuKien
    so_kieu_da_gap: ThachThucDieuKien
    doi_chieu_giup_ich: ThachThucDieuKien
    nhom_khop: NhomDoiChieu
    nhom_lech: NhomDoiChieu
