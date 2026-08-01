"""Request/response schemas for the Cấp 8 «Quản trị rủi ro danh mục» API — bước
Kiểm tra danh mục (dồn ngành · tương quan · tổng vốn ở rủi ro), khối Cấp 8 trên
``order_kehoach``, Thách thức Quản trị rủi ro danh mục (§2/§4/§7/§8/§9).

★ Every "chưa tính được" state in this module is an EXPLICIT ``None`` +
``*_du_lieu: bool`` pair, never a 0. Cấp 8's whole subject is that an unknown
risk is not a zero risk, so the wire format must be able to say "we do not
know" — see ``app.services.cap8.service``'s four honesty notes.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

HanhViCanhBaoLiteral = Literal["van_mua", "giam_kl", "chon_ma_khac", "khong_canh_bao"]
LoaiCanhBaoLiteral = Literal["don_nganh", "tuong_quan", "tong_rui_ro"]


class Cap8ProgressOut(BaseModel):
    """Cấp 8 progress state for the current user.

    ★ ``so_lan_mua_bat_chap_canh_bao`` is the LIFETIME figure; graduation
    condition ② measures ``bat_chap_gan_day`` over the last ``cua_so_gan_day``
    checked orders (spec §2③ — "trong 15 lệnh gần nhất"). Both ride in the same
    payload precisely so the FE cannot mistake one for the other.

    ★ ``don_nganh_max_pct`` / ``tong_rui_ro_pct`` are NULL until the portfolio
    has actually been priced. NULL means "chưa tính được" — never 0.0, which
    would be a *passing* value for both.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    task_1_done_at: datetime | None = None
    task_2_done_at: datetime | None = None
    task_3_done_at: datetime | None = None
    so_lenh_kiem_tra: int
    so_lan_mua_bat_chap_canh_bao: int
    don_nganh_max_pct: float | None = None
    tong_rui_ro_pct: float | None = None
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None

    # ── derived (never stored) ────────────────────────
    so_lan_co_canh_bao: int
    bat_chap_gan_day: int
    cua_so_gan_day: int
    so_lenh_da_ket_so: int


class TaskRequest(BaseModel):
    task_no: int


# ── Hằng số công khai (§4) ────────────────────────────


class QuyTacOut(BaseModel):
    """Every Cấp 8 threshold, published by the SERVER.

    ★ The FE renders THESE values and never invents its own cut-offs — the only
    way the warning the user sees, the copy that explains it and the graduation
    rule are guaranteed to agree.
    """

    #: Ngành chiếm hơn ngần này % NAV sau lệnh → cảnh báo dồn ngành.
    nguong_don_nganh_pct: float
    #: Hệ số tương quan trên mức này với một vị thế ĐÁNG KỂ → cảnh báo.
    nguong_tuong_quan: float
    #: Tỷ trọng tối thiểu để một vị thế được coi là "đáng kể" khi so tương quan.
    tuong_quan_min_ty_trong_pct: float
    #: ★ Số phiên khớp ngày tối thiểu trước khi một hệ số tương quan được báo ra
    #: (dưới mức này câu trả lời trung thực là "chưa đủ dữ liệu", không phải 0).
    tuong_quan_min_phien: int
    #: Số phiên lịch sử dùng để tính tương quan.
    so_phien_lich_su: int
    #: khẩu vị → trần %. ★ Trần này vốn đặt cho MỘT lệnh (Cấp 3); Cấp 8 mượn lại
    #: làm mức trần cho cả danh mục — hai nghĩa khác nhau, copy phải nói rõ.
    khau_vi_tran_pct: dict[str, float]
    #: Cửa sổ trượt của điều kiện ② (số lệnh gần nhất).
    cua_so_bat_chap: int
    bat_chap_toi_da: int
    so_lenh_kiem_tra_min: int
    #: Spec §9 — Cấp 8 KHÔNG dựng lại báo cáo Người quản lý danh mục.
    cross_ref_pm: str


# ── GET /cap8/kiem-tra (§4) ───────────────────────────


class TuongQuanOut(BaseModel):
    """The highest-correlation ĐÁNG KỂ partner of the candidate.

    ★ Absent (``null``) means "chưa tính được / chưa đủ dữ liệu" — see
    ``tuong_quan_du_lieu``. It NEVER means "hệ số bằng 0".
    """

    symbol: str
    he_so: float


class CanhBaoOut(BaseModel):
    """One warning that ACTUALLY fired, with the copy the FE shows verbatim.

    ★ Cảnh báo MỀM (spec §9/§C8): nothing here blocks MUA. The FE offers Vẫn mua
    / Giảm khối lượng / Chọn mã khác, all three equally available.
    """

    ma: LoaiCanhBaoLiteral
    ten: str
    text: str


class GiaiThichKiemTraOut(BaseModel):
    """§C12c — every measure ships with its own plain-Vietnamese explanation
    stating the number AND where it came from. The FE renders these VERBATIM and
    invents no wording of its own."""

    don_nganh: str
    tuong_quan: str
    tong_rui_ro: str
    #: ★ Spells out that the khẩu vị ceiling means two different things (trần
    #: cho MỘT lệnh vs trần cho CẢ danh mục) so the user cannot read them as one.
    tran_khau_vi: str


class KiemTraOut(BaseModel):
    """Response for ``GET /cap8/kiem-tra`` — the whole pre-trade check.

    ★ Each measure has an explicit unknown state, never a fabricated 0:
      · ``nganh is None`` ⇒ dồn ngành chưa tính được (không đoán ngành);
      · ``tuong_quan_du_lieu is False`` ⇒ chưa đủ dữ liệu / không có vị thế đáng
        kể để so — NOT "không tương quan";
      · ``tong_rui_ro_pct_sau is None`` ⇒ lệnh này chưa có cắt lỗ nên phần đóng
        góp của nó CHƯA BIẾT (không phải 0);
      · ``so_vi_the_thieu_cat_lo`` / ``so_vi_the_thieu_gia`` ⇒ số vị thế bị LOẠI
        khỏi tổng vì rủi ro/tỷ trọng của chúng chưa biết.
    """

    symbol: str
    khoi_luong: int
    gia: int
    cat_lo: int | None = None
    gia_tri_lenh_vnd: float
    nav_vnd: float

    so_vi_the: int
    so_vi_the_thieu_cat_lo: int
    so_vi_the_thieu_gia: int

    #: ``None`` = chưa xác định được ngành ICB của mã.
    nganh: str | None = None
    don_nganh_pct_truoc: float | None = None
    don_nganh_pct_sau: float | None = None
    don_nganh_canh_bao: bool

    tuong_quan: TuongQuanOut | None = None
    tuong_quan_canh_bao: bool
    #: False = chưa tính được (chưa đủ phiên, hoặc không có vị thế đáng kể nào).
    tuong_quan_du_lieu: bool

    tong_rui_ro_pct_truoc: float | None = None
    tong_rui_ro_pct_sau: float | None = None
    tong_rui_ro_canh_bao: bool

    khau_vi: str | None = None
    khau_vi_ten: str | None = None
    tran_khau_vi_pct: float | None = None

    canh_bao: list[CanhBaoOut]
    giai_thich: GiaiThichKiemTraOut
    cross_ref_pm: str
    quy_tac: QuyTacOut


# ── POST /cap8/kehoach (§4/§8) ────────────────────────


class KehoachRequest(BaseModel):
    """``POST /cap8/kehoach`` — the Kiểm tra danh mục block for one BUY order.

    ★ HONESTY: ``don_nganh_pct`` / ``tuong_quan_cao_voi`` / ``tong_rui_ro_pct``
    / ``danh_muc_canh_bao`` are accepted for wire compatibility with the check
    payload the FE just rendered, and then **DISCARDED** — the server recomputes
    all four from the real portfolio and stores its own values. Otherwise a
    client could post an empty warning list and keep its
    ``so_lan_mua_bat_chap_canh_bao`` permanently clean.

    ``hanh_vi_canh_bao`` IS the client's to report (only the user knows which
    button they pressed) but must agree with what actually fired:
    ``khong_canh_bao`` while warnings are present — or ``van_mua`` while none
    are — is rejected (400), never silently normalised.

    ★ The block is WRITE-ONCE. Re-posting the same ``hanh_vi_canh_bao`` returns
    the stored row unchanged (a retried call must not 409, and must not re-price
    the snapshot against a newer portfolio either); re-posting a different one is
    a 409. The record is a snapshot of the danh mục at the moment of the order,
    and graduation condition ② is computed from it.
    """

    order_id: uuid.UUID
    hanh_vi_canh_bao: str = Field(
        description="'van_mua' | 'giam_kl' | 'chon_ma_khac' | 'khong_canh_bao'"
    )
    canh_bao_da_hien: list[str] | None = Field(
        default=None,
        description=(
            "Các ``canh_bao[].ma`` của CHÍNH lần ``GET /cap8/kiem-tra`` mà user "
            "đã phản hồi. BẮT BUỘC gửi khi hanh_vi_canh_bao là 'giam_kl' hoặc "
            "'chon_ma_khac': giảm khối lượng / đổi mã chính là thứ làm cảnh báo "
            "tắt đi, nên server không thể suy lại cảnh báo đó từ lệnh đã điều "
            "chỉnh. Bị BỎ QUA với 'van_mua' và 'khong_canh_bao' — hai giá trị đó "
            "luôn do server tự suy lại quyết định."
        ),
    )
    don_nganh_pct: float | None = Field(default=None, description="Bỏ qua — server tự tính")
    tuong_quan_cao_voi: dict | None = Field(
        default=None, description="Bỏ qua — server tự tính"
    )
    tong_rui_ro_pct: float | None = Field(
        default=None, description="Bỏ qua — server tự tính"
    )
    danh_muc_canh_bao: list[str] | None = Field(
        default=None, description="Bỏ qua — server tự tính"
    )


class KehoachCap8Out(BaseModel):
    """Cấp 8's view of ``order_kehoach`` — the Kiểm tra danh mục block."""

    id: uuid.UUID
    order_id: uuid.UUID
    don_nganh_pct: float | None = None
    #: ★ ``None`` = không tính được / không có cặp nào vượt ngưỡng. NEVER "0".
    tuong_quan_cao_voi: TuongQuanOut | None = None
    tong_rui_ro_pct: float | None = None
    #: ``[]`` = đã kiểm tra và KHÔNG có cảnh báo nào; ``None`` = lệnh chưa qua
    #: bước Kiểm tra danh mục.
    danh_muc_canh_bao: list[str] | None = None
    danh_muc_canh_bao_ten: list[str] | None = None
    canh_bao_text: str
    hanh_vi_canh_bao: HanhViCanhBaoLiteral | None = None
    hanh_vi_canh_bao_ten: str | None = None
    #: §C12c — one sentence on what was checked and what the user did about it.
    giai_thich: str


# ── GET /cap8/thach-thuc (§2③ / §7) ───────────────────


class ThachThucDieuKien(BaseModel):
    """One of the 3 sub-conditions of nhiệm vụ ③ (§C12c: always shown with its
    current value + a short explanation — never a bare number).

    ``du_du_lieu = False`` marks a condition that cannot be judged yet (the
    portfolio could not be priced, or no khẩu vị has been set at Cấp 3) — it is
    neither passed nor held against the user.
    """

    ten: str
    gia_tri_hien_tai: float
    muc_tieu: float
    dat: bool
    du_du_lieu: bool = True
    giai_thich: str


class PhanBoNganhOut(BaseModel):
    """One bucket of khối ⑱'s PHÂN BỔ NGÀNH line. Cash is a bucket of its own —
    not a rounding gap."""

    nganh: str
    pct: float


class DonNganhMaxOut(BaseModel):
    nganh: str
    pct: float


class CapTuongQuanOut(BaseModel):
    """A high-correlation pair among the ĐÁNG KỂ positions (khối ⑱)."""

    a: str
    b: str
    he_so: float


class DanhMucOut(BaseModel):
    """The closing-state block khối ⑱ renders.

    ★ ``tuong_quan_du_lieu = False`` means no pair could be computed at all
    (fewer than 2 significant positions, or not enough aligned history) — the FE
    renders "chưa đủ dữ liệu", NOT "không có cặp nào tương quan cao".

    ★ ``caveat`` is the "{N} vị thế chưa có cắt lỗ" sentence and must be shown
    wherever ``tong_rui_ro_pct`` is shown: the number is the part we KNOW, not
    the whole.
    """

    nav_vnd: float
    so_vi_the: int
    so_vi_the_thieu_cat_lo: int
    so_vi_the_thieu_gia: int
    phan_bo_nganh: list[PhanBoNganhOut]
    don_nganh_max: DonNganhMaxOut | None = None
    tong_rui_ro_pct: float | None = None
    khau_vi: str | None = None
    khau_vi_ten: str | None = None
    tran_khau_vi_pct: float | None = None
    cap_tuong_quan_cao: list[CapTuongQuanOut]
    tuong_quan_du_lieu: bool
    caveat: str
    cross_ref_pm: str


class ThachThucOut(BaseModel):
    """Response for ``GET /cap8/thach-thuc`` — the 3 sub-conditions of nhiệm vụ
    ③ (spec §2③), all recomputed server-side on read.

    ★ ``mua_bat_chap`` is measured over a ROLLING window of the last
    ``cua_so_gan_day`` checked orders, not over the whole account history —
    ``so_lan_mua_bat_chap_canh_bao`` (lifetime) rides alongside so both figures
    stay visible and distinguishable.

    ``danh_muc`` is ``None`` when the portfolio could not be priced — an
    explicit "chưa tính được", never an empty-but-confident payload.
    """

    dat_ca_3: bool
    so_lenh_kiem_tra: ThachThucDieuKien
    mua_bat_chap: ThachThucDieuKien
    danh_muc_an_toan: ThachThucDieuKien
    so_lenh_da_ket_so: int
    so_lan_co_canh_bao: int
    so_lan_mua_bat_chap_canh_bao: int
    cua_so_gan_day: int
    danh_muc: DanhMucOut | None = None
