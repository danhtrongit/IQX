"""Request/response schemas cho API Cấp 5 «Lão luyện — Săn mã» — màn Săn mã
(§5), Watchlist + điểm đồng thuận 5 lớp (§6), nguồn săn cho Kết sổ (§8), Phân
tích danh mục khối ⑫/⑬ (§9), 2 nhiệm vụ song song (§2).

★★ **ĐÃ GỠ cùng Cấp 5 cũ:** ``VerdictOut``/``VerdictSignal``/``KetsoRequest``/
``KetsoCap5Out``/``DungNgoai*``/``ChamDungNgoaiOut``/``ThachThuc*`` và các
literal ``VerdictLiteral``/``O4Literal``/``LyDoDungNgoaiLiteral``/
``KetQuaLiteral``. Bỏ HẲN (chứ không để optional) là cố ý: một trường chết còn
sót ở dạng optional sẽ im lặng trả ``None`` cho FE suốt nhiều tháng.

★★ **LUẬT 1 SỐNG Ở CÁC ``| None`` DƯỚI ĐÂY.** Mọi ô đếm/tỷ lệ mà server có thể
CHƯA biết đều nullable, và ``None`` luôn mang nghĩa "chưa đủ dữ liệu", không bao
giờ là 0:

  · ``tong_so_ma``           — bộ lọc chưa chạy được (``kha_dung=False``)
  · ``ty_le_thang``          — bộ lọc chưa đủ 3 lệnh đã đóng (khối ⑫)
  · ``best_filter``          — chưa đủ lệnh để kết luận bộ lọc nào hợp nhất
  · ``consensus_*``          — hệ chưa chấm được 5 lớp cho mã đó
  · ``so_ma_cho_du_lop``     — tầng giữa phễu ⑬ chưa đo được
  · ``so_phien_tu_khi_san``  — mã không đến từ săn mã (không có mốc săn)

Ngược lại ``so_ma_da_san``/``so_ma_mua_tu_watchlist``/``so_lenh`` là ``int``
không nullable: 0 ở đó là con số THẬT (đếm hàng trong bảng do ta sở hữu).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

#: 5 bộ lọc săn mã (spec §5.3 — khớp ``app.models.cap5.HuntFilter``).
HuntFilterLiteral = Literal["ngoai", "tudoanh", "kl", "dinh", "tang"]
#: Trạng thái một mã trong Watchlist (§6.1). NULL khi chưa chấm được 5 lớp.
WatchStatusLiteral = Literal["watching", "notable"]
#: Mức hiển thị một lớp (§6.2 cụm icon): ủng hộ / trung tính / ngược chiều.
MucLopLiteral = Literal["ok", "neu", "bad"]


# ══════════════════════════════════════════════════════
# Tiến trình + 2 nhiệm vụ (§2/§3)
# ══════════════════════════════════════════════════════


class Cap5ProgressOut(BaseModel):
    """Tiến trình Cấp 5 của user hiện tại — **2 nhiệm vụ song song, độc lập**.

    ① ``so_ma_da_san >= muc_tieu_so_ma_san`` (10 mã vào Watchlist)
    ② ``so_ma_mua_tu_watchlist >= muc_tieu_so_ma_mua`` (5 mã săn đã mua)

    ② KHÔNG bị gác sau ①. Tốt nghiệp = 2/2. Cả hai con số đều được server tính
    lại ở MỌI lần đọc — client không gửi lên.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    task_1_done_at: datetime | None = None
    task_2_done_at: datetime | None = None
    so_ma_da_san: int
    so_ma_mua_tu_watchlist: int
    #: Tầng giữa của phễu ⑬. ★ NULL = CHƯA ĐO ĐƯỢC (mẻ chấm 5 lớp chưa có kết
    #: quả cho mã săn nào), tuyệt đối không phải "0 mã chín".
    so_ma_cho_du_lop: int | None = None
    #: ★★ MẪU SỐ của ``so_ma_cho_du_lop``: số mã ĐÃ SĂN mà hệ thực sự chấm được
    #: điểm đồng thuận. Nhỏ hơn ``so_ma_da_san`` ⇒ con số tầng giữa là CẬN DƯỚI
    #: (mã chưa có bản phân tích 5 lớp, hoặc mã đã bị bỏ khỏi Watchlist sau khi
    #: chín). FE PHẢI nói "ít nhất N" trong trường hợp đó, không được nói "N".
    so_ma_da_cham_diem: int = 0
    #: True ⇔ mọi mã đã săn đều chấm được ⇒ ``so_ma_cho_du_lop`` là con số ĐỦ.
    so_ma_cho_du_lop_day_du: bool = False
    muc_tieu_so_ma_san: int
    muc_tieu_so_ma_mua: int
    #: Cờ tour Săn mã (§7) — KHÔNG phải nhiệm vụ, chỉ để tour tự bật một lần.
    da_xem_tour_sanma: bool
    #: Khối ⑫. NULL = chưa đủ lệnh đã đóng để kết luận (≠ một bộ lọc bất kỳ).
    best_filter: HuntFilterLiteral | None = None
    best_filter_ten: str | None = None
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


class TaskRequest(BaseModel):
    """``PATCH /cap5/task`` — chỉ kích hoạt tính lại (1 hoặc 2)."""

    task_no: int


# ══════════════════════════════════════════════════════
# Màn Săn mã (§5)
# ══════════════════════════════════════════════════════


class LocSanDieuKienOut(BaseModel):
    """Một tiêu chí của LỌC SÀN (§5.2).

    ``ap_dung=False`` = server CHƯA lọc được tiêu chí này (hiện có: "loại mã diện
    cảnh báo / kiểm soát / hạn chế giao dịch" — backend không lưu trạng thái đó).
    FE phải nói thẳng, không được để dòng "Đã lọc: …" hứa hão.
    """

    ma: str
    ten: str
    ap_dung: bool
    giai_thich: str


class HuntFilterStatusOut(BaseModel):
    """Tình trạng một bộ lọc trên màn Săn mã (``GET /cap5/san-ma``).

    ★ ``kha_dung`` ở đây là PHÉP THỬ RẺ (không quét sàn, không gọi mạng): nó
    chắc chắn đúng cho 2 bộ lọc dòng tiền (thiếu nguồn là thuộc tính của
    backend, không phụ thuộc mã), nhưng với 3 bộ lọc nến ngày nó chỉ nói "có
    nguồn về nguyên tắc". Sự thật cuối cùng nằm ở ``kha_dung`` của
    ``GET /cap5/san-ma/{ma}`` — FE không được cache lại giá trị từ đây.
    """

    ma: HuntFilterLiteral
    icon: str
    ten: str
    mo_ta: str
    dieu_kien: str
    xep_hang_theo: str
    nguon_du_lieu: str
    kha_dung: bool
    ly_do_chua_kha_dung: str | None = None


class SanMaIndexOut(BaseModel):
    """``GET /cap5/san-ma`` — lọc sàn + 5 bộ lọc (chưa mở popup nào)."""

    loc_san: list[LocSanDieuKienOut]
    #: Số mã HOSE trong rổ sau tiêu chí "chỉ HOSE". 0 = bảng mã chưa được nạp,
    #: và khi đó mọi bộ lọc đều ``kha_dung=False``.
    so_ma_trong_ro: int
    bo_loc: list[HuntFilterStatusOut]
    hien_thi_toi_da: int


class HuntItemOut(BaseModel):
    """Một dòng kết quả trong popup (§5.4).

    ``tin_hieu`` là chuỗi thô do SERVER dựng từ dữ liệu thật (VD "+45,2 tỷ ròng
    · 4/5 phiên"). ``pct_thay_doi`` nullable vì phiên trước có thể thiếu giá.
    """

    hang: int
    symbol: str
    gia_vnd: int
    pct_thay_doi: float | None = None
    tin_hieu: str
    gia_tri_xep_hang: float


class HuntResultOut(BaseModel):
    """``GET /cap5/san-ma/{ma}`` — kết quả một bộ lọc.

    ★ BẤT BIẾN: ``kha_dung=False`` ⇔ ``tong_so_ma is None`` ⇔ ``items == []``.
    "Chưa lọc được" (kèm ``ly_do_chua_kha_dung``) và "đã lọc, hôm nay không mã
    nào thoả" (``kha_dung=True``, ``tong_so_ma=0``) là HAI câu khác hẳn nhau.
    """

    ma: HuntFilterLiteral
    icon: str
    ten: str
    mo_ta: str
    dieu_kien: str
    xep_hang_theo: str
    nguon_du_lieu: str
    kha_dung: bool
    ly_do_chua_kha_dung: str | None = None
    tong_so_ma: int | None = None
    #: Số mã đã QUA lọc sàn và được đem đi xét. NULL khi chưa lọc được.
    so_ma_xet: int | None = None
    #: Số mã bị bỏ ra vì thiếu dữ liệu (không đủ nến / thiếu GTGD phiên).
    so_ma_bo_qua_thieu_du_lieu: int | None = None
    hien_thi_toi_da: int
    loc_san: list[LocSanDieuKienOut]
    items: list[HuntItemOut]


# ══════════════════════════════════════════════════════
# Watchlist (§6)
# ══════════════════════════════════════════════════════


class AddWatchlistRequest(BaseModel):
    """``POST /cap5/watchlist`` — thêm mã kèm NGUỒN SĂN (§5.4/§10).

    ``hunt_signal`` được nhận cho khớp wire của FE nhưng **BỊ BỎ QUA**: server tự
    tính lại tín hiệu từ dữ liệu thị trường. Tin một chuỗi số do client gửi là
    mở cửa cho một dòng "+45,2 tỷ ròng" không ai kiểm được.
    """

    symbol: str
    hunt_filter: HuntFilterLiteral = Field(description="Bộ lọc đã săn ra mã")
    hunt_signal: str | None = Field(
        default=None, description="BỊ BỎ QUA — server tự tính tín hiệu lúc săn"
    )


class LopChiTietOut(BaseModel):
    """Chấm một lớp trong 5 lớp.

    ``ung_ho=None``/``muc=None`` = CHƯA chấm được lớp này. ★ Lớp 💎 Định giá LUÔN
    ở trạng thái này: AI Insight v2 không có lớp Định giá (L2 là Thanh khoản —
    ánh xạ vào đó là bịa), nên mỗi mã chỉ chấm được tối đa 4/5 lớp.
    """

    lop: str
    ten: str
    ung_ho: bool | None = None
    muc: MucLopLiteral | None = None
    nhan: str | None = None
    giai_thich: str


class Cap5WatchlistItemOut(BaseModel):
    """Một thẻ mã trong Watchlist Cấp 5 (§6.2)."""

    symbol: str
    added_at: datetime | None = None
    #: NULL = mã KHÔNG đến từ săn mã (user tự thêm) — FE hiện "—", không đoán.
    hunt_filter: HuntFilterLiteral | None = None
    hunt_filter_ten: str | None = None
    hunt_signal: str | None = None
    hunt_at: datetime | None = None
    so_phien_tu_khi_san: int | None = None
    #: Số lớp ỦNG HỘ. ★ NULL = hệ chưa chấm được mã này, KHÔNG phải 0/5.
    consensus_today: int | None = None
    consensus_prev: int | None = None
    #: Số lớp hệ THỰC SỰ chấm được — mẫu số thật của ``consensus_today``.
    consensus_da_cham: int | None = None
    consensus_at: datetime | None = None
    status: WatchStatusLiteral | None = None
    tong_so_lop: int
    nguong_dang_chu_y: int
    #: Câu nhắc "Quyết định mua vẫn là của bạn" — chỉ có ở mã ★ Đáng chú ý.
    nhac: str | None = None
    #: Cụm 5 icon. NULL = chưa nạp chi tiết trong lần đọc này (mẻ chấm 1
    #: lần/ngày không lưu chi tiết từng lớp) — KHÔNG phải "5 lớp đều trống".
    lop: dict[str, MucLopLiteral | None] | None = None
    lop_chi_tiet: list[LopChiTietOut] | None = None


class Cap5WatchlistOut(BaseModel):
    """``GET /cap5/watchlist`` — Watchlist + 2 tab đếm sẵn (§6.3)."""

    items: list[Cap5WatchlistItemOut]
    so_luong: int
    so_dang_chu_y: int
    toi_da: int


# ══════════════════════════════════════════════════════
# Nguồn săn cho Kết sổ (§8)
# ══════════════════════════════════════════════════════


class NguonSanOut(BaseModel):
    """``GET /cap5/nguon-san/{symbol}`` — dòng "mã này săn từ bộ lọc nào".

    ★ ``so_lop_luc_vao`` LUÔN NULL kèm ``ly_do_thieu_so_lop``: điểm đồng thuận
    tại thời điểm đặt lệnh chưa từng được lưu. Dựng câu "vào lệnh khi lên 4/5
    lớp" từ điểm HÔM NAY là gán một con số hiện tại cho một quyết định quá khứ.
    """

    symbol: str
    tu_san_ma: bool
    hunt_filter: HuntFilterLiteral | None = None
    hunt_filter_ten: str | None = None
    hunt_signal: str | None = None
    first_hunted_at: datetime | None = None
    so_phien_trong_watchlist: int | None = None
    so_lop_luc_vao: int | None = None
    giai_thich: str
    ly_do_thieu_so_lop: str | None = None


# ══════════════════════════════════════════════════════
# Phân tích danh mục — khối ⑫ + ⑬ (§9)
# ══════════════════════════════════════════════════════


class Khoi12ItemOut(BaseModel):
    """Một bộ lọc ở khối ⑫ — "bộ lọc nào ra mã thắng nhiều nhất".

    ``ty_le_thang=None`` ⇔ ``du_mau=False`` = chưa đủ lệnh đã đóng để kết luận
    (≠ 0%). ``so_lenh``/``so_lenh_thang`` là số THẬT (ta sở hữu dữ liệu lệnh).
    """

    ma: HuntFilterLiteral
    ten: str
    so_lenh: int
    so_lenh_thang: int
    ty_le_thang: float | None = None
    du_mau: bool
    nhan: str | None = None
    canh_bao: str | None = None
    giai_thich: str


class Khoi12Out(BaseModel):
    items: list[Khoi12ItemOut]
    best_filter: HuntFilterLiteral | None = None
    so_lenh_toi_thieu: int
    #: Số lệnh đã đóng KHÔNG đến từ săn mã — đếm riêng, không gán vào bộ lọc nào.
    so_lenh_khong_tu_san: int
    du_de_ket_luan: bool
    giai_thich: str


class Khoi13Out(BaseModel):
    """Phễu kỷ luật săn mã: săn → chờ đủ lớp → vào lệnh."""

    so_ma_da_san: int
    #: ★ NULL = tầng giữa CHƯA ĐO ĐƯỢC, không phải "0 mã chín".
    so_ma_cho_du_lop: int | None = None
    #: Mẫu số thật của tầng giữa (xem ``Cap5ProgressOut.so_ma_da_cham_diem``).
    so_ma_da_cham_diem: int = 0
    #: True ⇔ ``so_ma_cho_du_lop`` đã đếm hết mã săn; False ⇒ nó là CẬN DƯỚI.
    so_ma_cho_du_lop_day_du: bool = False
    so_ma_vao_lenh: int
    giai_thich: str
    loi_ket: str


class Cap5PhanTichOut(BaseModel):
    """``GET /cap5/phan-tich`` — 2 khối THÊM MỚI của Cấp 5 (§9)."""

    khoi_12: Khoi12Out
    khoi_13: Khoi13Out
