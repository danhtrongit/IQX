"""Request/response schemas cho API Cấp 6 «Bậc thầy» — bảng mâu thuẫn 5 lớp,
ô nhận định 4 mức, nút «Không mua lần này», khối ⑭/⑮ (spec §5/§6/§7/§9/§11).

★ Cấp 6 CŨ («Đối chiếu» — ``GoiYOut``/``KehoachCap6DetailOut``/``ThachThucOut``
+ 6 kiểu cổ phiếu) đã nghỉ hưu cùng revision ``c7f1b9d34a80``.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LopLiteral = Literal["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]
#: 4 mức nhận định mâu thuẫn (spec §6) — khớp ``app.models.cap6.MucMauThuan``.
MucLiteral = Literal["nhe", "ngai", "nghiem", "chua_ro"]


class Cap6ProgressOut(BaseModel):
    """``GET /cap6/progress`` — tiến trình Cấp 6 của user hiện tại.

    ★ ``muc_tieu_nhat_quan``/``muc_tieu_veto`` lên wire để FE không hard-code
    lại hai ngưỡng của cổng.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    so_lan_xu_ly_nhat_quan: int
    so_lan_xu_ly_veto_nhat_quan: int
    muc_tieu_nhat_quan: int
    muc_tieu_veto: int
    #: ★ ``null`` = CHƯA có lệnh Cấp-6 nào đóng — **KHÔNG phải 0**. ``0.0`` là
    #: một câu khác hẳn ("đã đóng lệnh, hoà vốn"), và FE phải hiện hai trạng
    #: thái đó khác nhau. CHỈ để hiển thị — không bao giờ là cổng (spec §2).
    tong_lai_lenh_cap6_pct: float | None = None
    da_xem_tour_mauthuan: bool
    #: Cổng 1/1 đã đạt chưa — suy từ đúng 2 bộ đếm ở trên, không đọc lãi.
    dat_nhiem_vu: bool
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


# ── Bảng mâu thuẫn (§5) ───────────────────────────────


class LopUngHoOut(BaseModel):
    """Một lớp thuộc phe «Ủng hộ mua» (bậc 4-5 của thang 5 bậc)."""

    lop: LopLiteral
    ten: str
    #: Nhãn trạng thái nguyên văn của AI Insight (VD "Rất mạnh").
    nhan: str
    #: Bậc 1-5 — 1 là xấu nhất, 5 là tốt nhất.
    bac: int


class LopNguocOut(LopUngHoOut):
    """Một lớp thuộc phe «Ngược chiều» (bậc 1-2).

    ★ ``la_phu_quyet`` = lớp này **thuộc NHÓM có quyền phủ quyết** (📰 Tin tức ·
    👤 Nội bộ) — thuộc tính của LỚP, không phụ thuộc bậc; nó quyết định tag đỏ
    "PHỦ QUYẾT". Việc lớp đó có ĐANG KÍCH HOẠT hay không là chuyện khác, nằm ở
    ``phu_quyet_kich_hoat``/``lop_phu_quyet_xau`` (spec §5.3: "tiêu cực nhẹ"
    KHÔNG phải phủ quyết kích hoạt).
    """

    la_phu_quyet: bool


class LopTrungTinhOut(BaseModel):
    """Một lớp ở bậc 3 — không nghiêng bên nào, không vẽ vào phe nào."""

    lop: LopLiteral
    ten: str
    nhan: str


class MauThuanOut(BaseModel):
    """``GET /cap6/mau-thuan/{symbol}`` — bảng mâu thuẫn 2 phe của một mã.

    ★ ``chua_du_du_lieu = True`` là một TRẠNG THÁI THẬT (mã chưa có bản AI
    Insight còn hiệu lực), KHÔNG phải "0 mâu thuẫn": khi đó mọi phe rỗng và FE
    phải hiện ``ly_do_chua_du`` thay vì dựng một bảng mâu thuẫn trống.
    """

    symbol: str
    co_mau_thuan: bool
    ung_ho: list[LopUngHoOut] = Field(default_factory=list)
    nguoc: list[LopNguocOut] = Field(default_factory=list)
    trung_tinh: list[LopTrungTinhOut] = Field(default_factory=list)
    phu_quyet_kich_hoat: bool
    lop_phu_quyet_xau: list[LopLiteral] = Field(default_factory=list)
    lop_phu_quyet_xau_ten: list[str] = Field(default_factory=list)
    #: SERVER dựng câu, FE in NGUYÊN VĂN (§C12c). ``null`` khi không có mâu thuẫn.
    canh_bao: str | None = None
    chua_du_du_lieu: bool
    ly_do_chua_du: str | None = None
    #: Mẫu số thật. ★ Tối đa là **4**, không phải 5: AI Insight v2 không có lớp
    #: 💎 Định giá (xem ``app.services.cap6.mau_thuan``).
    so_lop_da_cham: int
    #: Phiên của bản phân tích đã dùng — để user biết dữ liệu của ngày nào.
    session_date: date | None = None
    #: Khung phân loại (spec §5.2 chú thích) — "khung tham khảo, không bắt buộc".
    lop_phu_quyet: list[LopLiteral] = Field(default_factory=list)
    lop_diem_tru: list[LopLiteral] = Field(default_factory=list)


# ── Ô nhận định trên lệnh mua (§6) ────────────────────


class KehoachRequest(BaseModel):
    """``POST /cap6/kehoach`` — mức nhận định mâu thuẫn cho 1 lệnh MUA.

    ★ ``conflict_level`` là thứ DUY NHẤT client được gửi.
    ``had_conflict``/``had_veto``/``veto_layers`` do SERVER suy lại từ AI
    Insight của mã — client khai được chúng là client tự cấp cho mình điều kiện
    tốt nghiệp.
    """

    order_id: uuid.UUID
    conflict_level: MucLiteral


class KehoachCap6Out(BaseModel):
    """Khối Cấp 6 đã ghi trên ``order_kehoach`` — cho panel/Kết sổ đọc lại."""

    id: uuid.UUID
    order_id: uuid.UUID
    #: ★ ``null`` = chưa chấm được mã (không có bản AI Insight còn hiệu lực),
    #: KHÔNG phải "không có mâu thuẫn".
    had_conflict: bool | None = None
    conflict_level: MucLiteral | None = None
    conflict_level_ten: str | None = None
    had_veto: bool | None = None
    veto_layers: list[LopLiteral] | None = None
    veto_layers_ten: list[str] | None = None
    #: Hành động thật để Kết sổ đối chiếu với nhận định (spec §8) — CHỈ khối
    #: lượng + tự tin, KHÔNG nhắc cắt lỗ (§4.3).
    khoi_luong_pct_von: float | None = None
    muc_tu_tin: int | None = None
    #: ★ Ba trạng thái: ``true`` nhất quán · ``false`` lệch · ``null`` không xét
    #: được (không mâu thuẫn, chưa chấm được mã, mức ``ngai``/``chua_ro``, hoặc
    #: chưa biết khối lượng). ``null`` KHÔNG BAO GIỜ bị đọc là ``false``.
    nhat_quan: bool | None = None


# ── Nút «Không mua lần này» (§7) ──────────────────────


class SkipRequest(BaseModel):
    """``POST /cap6/skip`` — quyết định đứng ngoài, lấy mức nhận định làm lý do."""

    symbol: str
    conflict_level: MucLiteral


class SkipOut(BaseModel):
    """Một lần «Không mua lần này» đã ghi."""

    id: uuid.UUID
    symbol: str
    at: datetime
    conflict_level: MucLiteral
    conflict_level_ten: str
    #: ★ ``null`` = chưa chấm được mã lúc bấm (≠ "không có phủ quyết").
    had_veto: bool | None = None


# ── Phân tích danh mục: khối ⑭ + ⑮ (§9) ───────────────


class Khoi14Row(BaseModel):
    """Một mức nhận định → khối lượng trung bình đã mua.

    ★ ``kl_tb_pct_von = null`` ⇔ mức này chưa có lệnh nào (≠ "mua 0% vốn").
    ★ ``khop = null`` = KHÔNG so được: mức chưa có dữ liệu, mức ``chua_ro``
    (không nằm trên thang nặng dần), hoặc mức nhẹ nhất đang có dữ liệu (chưa có
    mức nào nhẹ hơn để so).
    """

    muc: MucLiteral
    muc_ten: str
    so_lenh: int
    kl_tb_pct_von: float | None = None
    khop: bool | None = None


class Khoi14Out(BaseModel):
    """Khối ⑭ — nhận định của bạn có khớp hành động không (CHỈ soi khối lượng)."""

    rows: list[Khoi14Row] = Field(default_factory=list)
    #: ``False`` = chưa đủ 2 mức có dữ liệu để so với nhau.
    du_mau: bool
    giai_thich: str
    #: SERVER dựng câu, FE in nguyên văn. ``null`` khi chưa đủ dữ liệu để nói.
    nhan_xet: str | None = None


class Khoi15Row(BaseModel):
    """Một mức nhận định → tỷ lệ thắng của các lệnh đã đóng ở mức đó.

    ★ ``ty_le_thang_pct = null`` khi ``du_mau = False`` (< số lệnh tối thiểu) —
    "chưa đủ dữ liệu", KHÔNG phải 0%.
    """

    muc: MucLiteral
    muc_ten: str
    so_lenh: int
    so_lenh_thang: int
    ty_le_thang_pct: float | None = None
    du_mau: bool


class Khoi15Out(BaseModel):
    """Khối ⑮ — kết quả theo mức nhận định + số lần đứng ngoài."""

    rows: list[Khoi15Row] = Field(default_factory=list)
    #: Dòng "Nghiêm trọng → không mua: N lần" của mockup.
    so_lan_nghiem_khong_mua: int
    #: Tổng số lần bấm «Không mua» ở MỌI mức (mẫu số của con số trên).
    so_lan_khong_mua: int
    so_lenh_toi_thieu: int
    giai_thich: str
    nhan_xet: str | None = None


class PhanTichOut(BaseModel):
    """``GET /cap6/phan-tich`` — 2 khối mới của Phân tích danh mục Cấp 6."""

    khoi_14: Khoi14Out
    khoi_15: Khoi15Out
