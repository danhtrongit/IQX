"""Request/response schemas for the Cấp 7 «Đọc sổ lệnh» API — chỉ số Lực (bands
+ the documented thresholds the FE renders), giờ giao dịch from the SERVER clock,
bước đọc lực, chấm "đọc lực đúng", Thách thức Đọc sổ lệnh (§2/§4/§5/§8/§9)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LucDocLiteral = Literal["manh", "can", "yeu"]
HanhViCoLiteral = Literal["cho_xac_nhan", "mua_duoi_theo"]
BandLucLiteral = Literal["cau_ap_dao", "can_bang", "cung_ap_dao"]


class Cap7ProgressOut(BaseModel):
    """Cấp 7 progress state for the current user.

    Carries three DERIVED fields the columns do not hold:

    · ``trong_phien`` — from the server's own ``is_trading_session()``. The FE
      must NEVER compute market-open from the browser clock (a user in another
      timezone would get the wrong answer).
    · ``so_lenh_da_cham`` / ``so_lenh_chua_cham`` — how many đọc-lực orders have
      been scored and how many are still waiting. ★ The unscored ones are NOT in
      ``ty_le_doc_luc_dung``'s denominator, so the count must be visible or the
      rate would look like it was computed over everything.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    task_1_done_at: datetime | None = None
    task_2_done_at: datetime | None = None
    task_3_done_at: datetime | None = None
    so_lenh_doc_luc: int
    so_lan_khong_duoi_theo_co: int
    ty_le_doc_luc_dung: float
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None

    # ── derived (never stored) ────────────────────────
    trong_phien: bool
    so_lenh_da_cham: int
    so_lenh_chua_cham: int
    so_lan_gap_co: int
    so_lan_mua_duoi_theo: int
    so_phien_cham: int


class TaskRequest(BaseModel):
    task_no: int


# ── Giờ giao dịch + hằng số công khai (§4/§5) ──────────


class BandOut(BaseModel):
    """One gauge band of the chỉ số Lực + the "vì sao" the FE shows verbatim."""

    ma: BandLucLiteral
    ten: str
    dieu_kien_text: str
    giai_thich: str


class QuyTacOut(BaseModel):
    """Every Cấp 7 constant the reading block needs, published by the SERVER.

    ★ The FE must render THESE values and never invent its own cut-offs — that is
    the only way the gauge the user sees, the copy that explains it, and the
    server-side chấm can be guaranteed to agree.
    """

    #: ratio ≥ this → Cầu áp đảo.
    nguong_cau_ap_dao: float
    #: ratio ≤ this → Cung áp đảo (reciprocal of the above — see the service).
    nguong_cung_ap_dao: float
    bands: list[BandOut]
    #: One level's volume > ``co_canh_giac_he_so`` × the mean of the remaining
    #: levels → show the cờ (spec §5's own suggestion, fixed here).
    co_canh_giac_he_so: float
    #: Below this many levels the rule stays silent rather than crying wolf.
    co_canh_giac_min_muc: int
    #: The cờ copy — heuristic and honest. NEVER a detection claim (spec §9).
    co_canh_giac_copy: str
    #: Trading sessions after the buy that count as "diễn biến ngay sau".
    so_phien_cham: int
    #: |%| inside which the price counts as unchanged (so ``can`` is falsifiable
    #: and ``manh``/``yeu`` are not decided by noise).
    dead_band_pct: float
    #: How ``doc_luc_dung`` is decided, in one plain-Vietnamese sentence.
    cham_giai_thich: str


class PhienOut(BaseModel):
    """Response for ``GET /cap7/phien`` — cheap and re-fetchable.

    The panel can stay open across the 11:30 boundary, so ``trong_phien`` must be
    refreshable independently of ``/cap7/progress``.
    """

    trong_phien: bool
    gio_giao_dich_text: str
    giai_thich: str
    quy_tac: QuyTacOut


# ── Bước đọc lực (§4/§5) ──────────────────────────────


class KehoachRequest(BaseModel):
    """``POST /cap7/kehoach`` — the user's order-book reading for one BUY order.

    ``luc_chi_so`` is the ONLY client-computed number Cấp 7 accepts, because the
    order book it comes from is realtime data the server does not hold at request
    time (see ``app.models.cap7``'s ★3). It must be finite and > 0.

    ``hanh_vi_co`` must be non-null **if and only if**
    ``co_canh_giac_lenh_gia`` is true — the inconsistent combination is rejected
    (400), never silently normalised.
    """

    order_id: uuid.UUID
    luc_chi_so: float = Field(description="Tổng dư MUA / tổng dư BÁN (3 mức) lúc mua")
    luc_doc_user: str = Field(description="User tự đoán: 'manh' | 'can' | 'yeu'")
    co_canh_giac_lenh_gia: bool = Field(
        default=False, description="Cờ cảnh giác heuristic có hiện hay không"
    )
    hanh_vi_co: str | None = Field(
        default=None,
        description="'cho_xac_nhan' | 'mua_duoi_theo' — bắt buộc KHI VÀ CHỈ KHI có cờ",
    )


class KehoachCap7Out(BaseModel):
    """Cấp 7's view of ``order_kehoach`` — the đọc-lực block + its labels."""

    id: uuid.UUID
    order_id: uuid.UUID
    luc_chi_so: float | None = None
    #: Derived from ``luc_chi_so`` with the server's own cut-offs; ``None`` when
    #: the ratio is missing or unreadable — never a fabricated band.
    luc_band: BandLucLiteral | None = None
    luc_band_ten: str | None = None
    luc_doc_user: LucDocLiteral | None = None
    luc_doc_user_ten: str | None = None
    #: ``None`` = chưa tới hạn chấm, or the price for that session is still
    #: unavailable. ★ Never rendered as a verdict.
    doc_luc_dung: bool | None = None
    dien_bien_pct: float | None = None
    co_canh_giac_lenh_gia: bool | None = None
    hanh_vi_co: HanhViCoLiteral | None = None
    hanh_vi_co_ten: str | None = None
    so_phien_cham: int
    #: §C12c — the one-sentence explanation of what was recorded and how it will
    #: be judged. Shown verbatim.
    giai_thich: str


class KehoachCap7DetailOut(KehoachCap7Out):
    """Response for ``GET /cap7/kehoach/{order_id}`` — the đọc-lực block recorded
    on one order + the scoring context the Kết sổ needs.

    ★ Reading this endpoint RUNS the lazy chấm pass (the same one every Cấp 7
    read runs), so an order whose ``so_phien_cham`` sessions have elapsed comes
    back SCORED. Without it the Kết sổ could only ever say "chưa tới hạn chấm".

    ★ ``doc_luc_dung`` has THREE meanings and they must never be collapsed:
    ``True`` đọc đúng · ``False`` đọc sai · ``None`` chưa chấm. ``None`` is NOT
    "sai" — it means the deadline has not arrived, or the price for that session
    is still unavailable. ``da_toi_han_cham`` separates those two ``None`` cases.

    ``co_du_lieu = False`` marks an order with no Cấp 7 data at all (placed
    before the level existed, or the user simply skipped the optional step). That
    is a normal 200, NOT a 404.
    """

    #: ``None`` only when the order has no ``order_kehoach`` row at all.
    id: uuid.UUID | None = None
    symbol: str
    #: False = lệnh này không có dữ liệu Cấp 7 (không phải lỗi, và không phải
    #: thiếu sót — đọc lực chưa bao giờ là điều kiện để mua).
    co_du_lieu: bool
    #: |%| inside which the close counts as unchanged — published here so the Kết
    #: sổ explains the verdict with the SERVER's threshold, not its own.
    dead_band_pct: float
    #: The trading session this reading is (or will be) judged against.
    han_cham_ngay: date | None = None
    #: Has that session arrived? ``doc_luc_dung is None`` + ``False`` = chưa tới
    #: hạn; ``doc_luc_dung is None`` + ``True`` = tới hạn nhưng chưa lấy được giá.
    da_toi_han_cham: bool


class ChamOut(BaseModel):
    """Response for ``POST /cap7/cham`` — the same lazy scoring pass every read
    performs, exposed explicitly (idempotent)."""

    so_moi_cham: int
    so_lenh_doc_luc: int
    so_lenh_da_cham: int
    so_lenh_chua_cham: int
    ty_le_doc_luc_dung: float
    so_phien_cham: int
    giai_thich: str


# ── Thách thức Đọc sổ lệnh (§2③ / §7) ─────────────────


class ThachThucDieuKien(BaseModel):
    """One of the 3 sub-conditions of nhiệm vụ ③ (§C12c: always shown with its
    current value + a short explanation — never a bare number).

    ``du_du_lieu = False`` marks a condition that cannot be judged yet (the rate
    leg needs ≥3 SCORED đọc-lực orders, spec §7) — it is neither passed nor held
    against the user.
    """

    ten: str
    gia_tri_hien_tai: float
    muc_tieu: float
    dat: bool
    du_du_lieu: bool = True
    giai_thich: str


class ThachThucOut(BaseModel):
    """Response for ``GET /cap7/thach-thuc`` — the 3 sub-conditions of nhiệm vụ
    ③ (spec §2③), all recomputed server-side on read.

    ``so_lenh_chua_cham`` is part of the contract: the rate is computed over
    scored orders only, so the FE must be able to say how many are still waiting.
    """

    dat_ca_3: bool
    so_lenh_doc_luc: ThachThucDieuKien
    so_lan_khong_duoi_theo_co: ThachThucDieuKien
    ty_le_doc_luc_dung: ThachThucDieuKien
    so_lenh_da_cham: int
    so_lenh_chua_cham: int
    so_lan_gap_co: int
    so_lan_mua_duoi_theo: int
    so_phien_cham: int
