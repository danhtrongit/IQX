"""Cấp 5 «Săn mã» — máy chạy 5 bộ lọc dữ liệu thô + lọc sàn (spec §5).

★★ **LUẬT SỐ 1 SỐNG Ở FILE NÀY.** Một bộ lọc chỉ được trả danh sách khi nó THẬT
SỰ chạy được trên dữ liệu thật. Bộ lọc thiếu nguồn dữ liệu phải trả
``trang_thai = "chua_du_du_lieu"`` kèm ``ly_do_thieu_du_lieu`` nói rõ thiếu gì —
và ``so_ma_thoa = None`` (KHÔNG phải 0), ``items = []``. "Không có mã nào thoả"
và "chưa lọc được" là hai câu khác hẳn nhau; gộp chúng vào một danh sách rỗng là
đúng lớp lỗi đã dính 5 lần.

Cùng lý do đó, mỗi tiêu chí của **lọc sàn** tự khai ``ap_dung``: tiêu chí nào
không có dữ liệu (xem ``LOC_SAN_CANH_BAO`` bên dưới) thì báo là CHƯA áp dụng
được, chứ không im lặng bỏ qua rồi để dòng minh bạch nói dối là đã lọc.

═══════════════════════════════════════════════════════════════════
BẢN KIỂM DỮ LIỆU (backend IQX, 08/2026) — nguồn của TỪNG bộ lọc
═══════════════════════════════════════════════════════════════════

Nến ngày (giá đóng cửa · khối lượng · giá trị khớp mỗi phiên) lấy hàng loạt qua
``HuntDataSource.daily_bars`` — bản cài đặt thật đọc VCI gap-chart
(``app.services.market_data.sources.vietcap.fetch_ohlcv``, trường
``accumulatedValue`` = GTGD phiên, đơn vị triệu đồng). ⇒ đủ dữ liệu cho:

  · 📊 ``kl``   — KL phiên ≥ 2× TB20  ....................... ✅ TÍNH ĐƯỢC
  · 🎯 ``dinh`` — đóng cửa > đỉnh 20 phiên trước ............. ✅ TÍNH ĐƯỢC
  · 📈 ``tang`` — tăng ≥3% & KL ≥1,5× TB20 .................. ✅ TÍNH ĐƯỢC
  · lọc sàn: HOSE (``symbols.exchange``) · giá ≥3.000đ · GTGD TB ≥1 tỷ/phiên

Mua ròng THEO TỪNG PHIÊN cho TỪNG mã lấy qua ``HuntDataSource.net_flow`` — bản
cài đặt thật đọc VNDIRECT finfo (``/v4/foreigns``, ``/v4/proprietary_trading``:
lọc ``floor:HOSE`` + khoảng ngày, MỘT lượt HTTP trả cả bảng ``(mã, phiên,
netVal)``, đơn vị VND). ⇒ đủ dữ liệu cho:

  · 💰 ``ngoai``    — mua ròng ≥3/5 phiên .................... ✅ TÍNH ĐƯỢC
  · 🏦 ``tudoanh``  — mua ròng ≥3/5 phiên .................... ✅ TÍNH ĐƯỢC

**Vì sao KHÔNG dùng nguồn VCI cho hai bộ lọc dòng tiền** (đã thử, đã loại):
  (a) ``vietcap.fetch_foreign_trade`` / ``fetch_proprietary_history`` — đúng dữ
      liệu cần, nhưng **mỗi lần gọi chỉ được 1 mã** ⇒ quét sàn HOSE (~405 mã)
      là 405 lượt HTTP cho một cú bấm bộ lọc;
  (b) ``vietcap_market_overview.fetch_foreign_top`` /
      ``fetch_proprietary_top`` — bulk nhưng chỉ trả **top 20 / top 10 mã của
      cả kỳ**, đã cộng gộp, không tách theo phiên ⇒ không đếm được "≥3/5
      phiên", và mã nằm ngoài top là "không biết" chứ không phải "bán ròng".
``net_flow`` vẫn được phép trả ``None`` (upstream lỗi / cửa sổ không đủ 5
phiên) — khi đó máy lọc dưới đây nói "chưa lọc được", KHÔNG nói "0 mã thoả".

**Tiêu chí lọc sàn "loại mã diện cảnh báo/kiểm soát/hạn chế giao dịch" cũng
THIẾU NGUỒN:** không có trường nào trong toàn backend mang trạng thái đó
(``app.models.symbol.Symbol`` chỉ có ``exchange``/``asset_type``/``is_index``/
``is_active``). Nó được liệt kê với ``ap_dung=False`` để FE nói thật rằng chưa
lọc được, thay vì để dòng "Đã lọc: …" hứa hão.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from app.models.cap5 import HUNT_FILTER_LABELS, HuntFilter

# ══════════════════════════════════════════════════════
# Lọc sàn (spec §5.2) — áp cho MỌI bộ lọc
# ══════════════════════════════════════════════════════

SAN_HOSE = "HOSE"
MIN_GTGD_TB_VND = 1_000_000_000  # 1 tỷ đồng/phiên
MIN_GIA_VND = 3_000
#: Số phiên lấy trung bình cho cả thanh khoản sàn lẫn TB20 khối lượng.
SO_PHIEN_TB = 20
#: Số nến cần để tính được TB20 + phiên hiện tại (và đỉnh 20 phiên TRƯỚC đó).
SO_NEN_CAN = SO_PHIEN_TB + 1

#: Tiêu chí lọc sàn CHƯA có nguồn dữ liệu trong backend — xem docstring module.
LOC_SAN_CANH_BAO = "canh_bao"

TOP_N = 10

# ── Ngưỡng 5 bộ lọc (spec §5.3, verbatim) ─────────────
NGUONG_GOM_PHIEN = 3  # mua ròng ≥3/5 phiên
SO_PHIEN_GOM = 5
NGUONG_KL_DOT_BIEN = 2.0  # KL ≥ 2× TB20
NGUONG_TANG_PCT = 3.0  # tăng ≥3%
NGUONG_TANG_KL = 1.5  # kèm KL ≥ 1,5× TB20


@dataclass(frozen=True)
class HuntBar:
    """Một nến ngày đã chuẩn hoá.

    ``gtgd_vnd`` (giá trị giao dịch phiên) là ``None`` khi nguồn không trả —
    mã đó KHÔNG được đem đi lọc sàn thanh khoản bằng cách đoán ``close ×
    volume`` (giá trị khớp lệnh thật khác tích đó vì giá khớp thay đổi trong
    phiên); nó bị bỏ qua và đếm vào ``so_ma_bo_qua_thieu_du_lieu``.
    """

    ngay: str
    close: float
    volume: float
    gtgd_vnd: float | None


class HuntDataSource(Protocol):
    """Nguồn dữ liệu thô cho máy săn mã.

    Tách khỏi máy lọc để (1) test chạy không cần mạng, (2) đổi nhà cung cấp dữ
    liệu chỉ phải sửa bản cài (``app.services.cap5.hunt_data``), máy lọc đứng yên.
    """

    async def daily_bars(
        self, symbols: Sequence[str], *, so_nen: int
    ) -> dict[str, list[HuntBar]]:
        """Nến ngày gần nhất của từng mã, tăng dần theo thời gian.

        Mã nào nguồn không trả thì VẮNG khỏi dict (không trả list rỗng giả).
        """
        ...

    async def net_flow(
        self, symbols: Sequence[str], *, ben: str, so_phien: int
    ) -> dict[str, list[float]] | None:
        """Giá trị mua ròng (VND) theo TỪNG phiên, tăng dần theo thời gian.

        ``ben`` ∈ {'ngoai', 'tudoanh'}. **Trả ``None`` khi nguồn không lấy được
        chuỗi đó** (upstream lỗi, chưa đủ ``so_phien`` phiên) — máy lọc dịch
        thẳng thành "chưa đủ dữ liệu", không bao giờ thành danh sách rỗng.

        Mã VẮNG khỏi dict = không đủ dữ liệu cho mã đó (≠ mua ròng 0đ). Nguồn
        nào có quyền dịch "không có hàng" thành 0đ là việc của bản cài — xem
        ``hunt_data._NguonDongTien.khuyet_la_khong``.
        """
        ...


# ══════════════════════════════════════════════════════
# Đặc tả 5 bộ lọc (spec §5.3 + mockup iqx-cap5-sanma.html)
# ══════════════════════════════════════════════════════


@dataclass(frozen=True)
class FilterSpec:
    ma: str
    icon: str
    ten: str
    mo_ta: str
    dieu_kien: str
    xep_hang_theo: str
    #: Nguồn dữ liệu — ghi thẳng vào response để không ai phải đoán (§C12c).
    nguon_du_lieu: str


FILTER_SPECS: dict[str, FilterSpec] = {
    HuntFilter.NGOAI.value: FilterSpec(
        ma=HuntFilter.NGOAI.value,
        icon="💰",
        ten=HUNT_FILTER_LABELS[HuntFilter.NGOAI.value],
        mo_ta="Nước ngoài mua ròng nhiều tiền nhất",
        dieu_kien=(
            f"Khối ngoại mua ròng ≥{NGUONG_GOM_PHIEN}/{SO_PHIEN_GOM} phiên gần nhất "
            f"VÀ tổng mua ròng {SO_PHIEN_GOM} phiên > 0"
        ),
        xep_hang_theo=f"Tổng giá trị mua ròng {SO_PHIEN_GOM} phiên",
        nguon_du_lieu="Mua ròng khối ngoại theo từng phiên",
    ),
    HuntFilter.TU_DOANH.value: FilterSpec(
        ma=HuntFilter.TU_DOANH.value,
        icon="🏦",
        ten=HUNT_FILTER_LABELS[HuntFilter.TU_DOANH.value],
        mo_ta="Tự doanh CTCK mua ròng nhiều nhất",
        dieu_kien=(
            f"Tự doanh mua ròng ≥{NGUONG_GOM_PHIEN}/{SO_PHIEN_GOM} phiên gần nhất "
            f"VÀ tổng mua ròng {SO_PHIEN_GOM} phiên > 0"
        ),
        xep_hang_theo=f"Tổng giá trị mua ròng {SO_PHIEN_GOM} phiên",
        nguon_du_lieu="Mua ròng tự doanh theo từng phiên",
    ),
    HuntFilter.KL.value: FilterSpec(
        ma=HuntFilter.KL.value,
        icon="📊",
        ten=HUNT_FILTER_LABELS[HuntFilter.KL.value],
        mo_ta="Khối lượng bùng nổ so với thường ngày",
        dieu_kien=(
            f"Khối lượng phiên gần nhất ≥ {NGUONG_KL_DOT_BIEN:.0f}× trung bình "
            f"{SO_PHIEN_TB} phiên"
        ),
        xep_hang_theo=f"Số lần vượt trung bình (KL ÷ TB{SO_PHIEN_TB})",
        nguon_du_lieu=f"Nến ngày {SO_NEN_CAN} phiên (khối lượng)",
    ),
    HuntFilter.DINH.value: FilterSpec(
        ma=HuntFilter.DINH.value,
        icon="🎯",
        ten=HUNT_FILTER_LABELS[HuntFilter.DINH.value],
        mo_ta="Giá vừa vượt đỉnh cao nhất gần đây",
        dieu_kien=f"Giá đóng cửa > đỉnh cao nhất {SO_PHIEN_TB} phiên trước đó",
        xep_hang_theo="% vượt trên đỉnh cũ",
        nguon_du_lieu=f"Nến ngày {SO_NEN_CAN} phiên (giá đóng cửa)",
    ),
    HuntFilter.TANG.value: FilterSpec(
        ma=HuntFilter.TANG.value,
        icon="📈",
        ten=HUNT_FILTER_LABELS[HuntFilter.TANG.value],
        mo_ta="Tăng giá mạnh kèm lực mua thật",
        dieu_kien=(
            f"Giá tăng ≥ {NGUONG_TANG_PCT:.0f}% trong phiên VÀ khối lượng ≥ "
            f"{NGUONG_TANG_KL:g}× trung bình {SO_PHIEN_TB} phiên"
        ),
        xep_hang_theo="% tăng giá",
        nguon_du_lieu=f"Nến ngày {SO_NEN_CAN} phiên (giá + khối lượng)",
    ),
}

#: Bộ lọc dựa trên chuỗi mua ròng theo phiên (cần ``net_flow``).
FILTER_DONG_TIEN = {HuntFilter.NGOAI.value: "ngoai", HuntFilter.TU_DOANH.value: "tudoanh"}

_THIEU_NGUON_DONG_TIEN = (
    "Nguồn mua ròng theo từng phiên không trả dữ liệu lúc này (upstream lỗi, "
    f"hoặc cửa sổ chưa đủ {SO_PHIEN_GOM} phiên đã chốt). Chưa lọc được, KHÔNG "
    "phải là không có mã nào thoả — thử lại sau ít phút."
)


def _thieu_chuoi_dong_tien(so_ma: int) -> str:
    """Lý do khi nguồn dòng tiền CÓ trả lời nhưng không mã nào có đủ chuỗi phiên.

    ★ Khác ``_THIEU_NGUON_DONG_TIEN`` (nguồn nói thẳng "không có dữ liệu") ở chỗ
    nguồn đã trả một dict — nhưng rỗng, hoặc chuỗi ngắn hơn ``SO_PHIEN_GOM``.
    Cả hai đều là "chưa lọc được", và KHÔNG được rơi xuống nhánh đếm để thành
    "0 mã thoả".
    """
    return (
        f"Nguồn dòng tiền không trả đủ chuỗi mua ròng {SO_PHIEN_GOM} phiên cho bất "
        f"kỳ mã nào trong rổ {so_ma} mã HOSE — chưa lọc được, KHÔNG phải là không "
        "có mã nào thoả."
    )


def _thieu_nen(so_ma: int) -> str:
    """Lý do khi KHÔNG mã nào trong rổ có đủ nến ngày để xét.

    ★ Đây là chỗ luật 1 dễ vỡ nhất mà không ai thấy: nguồn giá chết ⇒ mọi mã bị
    bỏ qua ⇒ ``so_ma_thoa`` ra 0 và popup in "0 mã HOSE thoả điều kiện" y như
    một phiên thị trường buồn. Hai câu đó khác nhau hoàn toàn.
    """
    if so_ma == 0:
        return (
            "Rổ mã HOSE đang rỗng — chưa lọc được, KHÔNG phải là không có mã nào thoả."
        )
    return (
        f"Không lấy được nến ngày cho bất kỳ mã nào trong rổ {so_ma} mã HOSE "
        f"(cần {SO_NEN_CAN} phiên/mã) — nguồn dữ liệu giá đang không trả về. "
        "Chưa lọc được, KHÔNG phải là không có mã nào thoả."
    )


@dataclass(frozen=True)
class HuntResult:
    """Kết quả một lần chạy bộ lọc.

    ``so_ma_thoa is None`` ⇔ ``trang_thai == "chua_du_du_lieu"``. Bất biến này
    được test giữ: không bao giờ có "0 mã thoả" khi thật ra là chưa lọc.

    ★★ **CỜ ``ket_qua_day_du`` LÀ LƯỚI THỨ HAI DƯỚI LUẬT 1.** Nhánh "chưa lọc
    được" chỉ nổ khi ``so_ma_bo_qua == TOÀN BỘ`` rổ, nhưng nguồn nến đọc theo LÔ
    40 mã (``hunt_data.VciHuntDataSource``) và một lô lỗi (VD 429 của VCI) là 40
    mã vắng mặt trong im lặng. Khi đó "N mã HOSE thoả điều kiện" vẫn là câu nói
    về 366/406 mã. Ba con số dưới đây cộng lại đúng bằng ``so_ma_trong_ro``, nên
    FE (và test) kiểm được kết quả có đầy đủ hay không thay vì phải tự suy:

      ``so_ma_xet`` + ``so_ma_truot_loc_san`` + ``so_ma_bo_qua_thieu_du_lieu``
      == ``so_ma_trong_ro``
    """

    bo_loc: FilterSpec
    trang_thai: str
    ly_do_thieu_du_lieu: str | None
    so_ma_thoa: int | None
    #: Số mã trong rổ HOSE đem vào lần chạy này — LUÔN biết, kể cả khi chưa lọc
    #: được (nó là mẫu số của mọi con số còn lại).
    so_ma_trong_ro: int
    so_ma_xet: int | None
    #: Số mã bị lọc sàn loại (giá/thanh khoản) — KHÁC hẳn "bỏ qua vì thiếu dữ
    #: liệu": mã này ta ĐÃ xét được và nó không đạt.
    so_ma_truot_loc_san: int | None
    so_ma_bo_qua_thieu_du_lieu: int | None
    #: ``True`` = mọi mã trong rổ đều xét được; ``False`` = có mã bị bỏ vì thiếu
    #: dữ liệu ⇒ danh sách CÓ THỂ CÒN SÓT mã thoả; ``None`` = chưa lọc được.
    ket_qua_day_du: bool | None
    #: Câu tường minh đi kèm ``ket_qua_day_du is False`` (§C12c: không để FE tự
    #: dựng câu về dữ liệu thiếu).
    canh_bao_thieu_du_lieu: str | None
    items: list[dict]


def loc_san_tieu_chi() -> list[dict]:
    """4 tiêu chí lọc sàn + tiêu chí nào đang áp dụng được thật (spec §5.2)."""
    return [
        {
            "ma": "san",
            "ten": f"Chỉ mã {SAN_HOSE}",
            "ap_dung": True,
            "giai_thich": "Sàn niêm yết lấy từ dữ liệu mã nội bộ (symbols.exchange).",
        },
        {
            "ma": "thanh_khoan",
            "ten": "Giá trị giao dịch TB ≥ 1 tỷ đồng/phiên",
            "ap_dung": True,
            "giai_thich": (
                f"Trung bình GTGD {SO_PHIEN_TB} phiên gần nhất, lấy từ giá trị khớp "
                "lệnh mỗi phiên (không ước lượng bằng giá × khối lượng)."
            ),
        },
        {
            "ma": "gia",
            "ten": f"Giá ≥ {MIN_GIA_VND:,}đ".replace(",", "."),
            "ap_dung": True,
            "giai_thich": "Giá đóng cửa phiên gần nhất.",
        },
        {
            "ma": LOC_SAN_CANH_BAO,
            "ten": "Loại mã diện cảnh báo / kiểm soát / hạn chế giao dịch",
            "ap_dung": False,
            "giai_thich": (
                "CHƯA lọc được: backend không lưu trạng thái diện cảnh báo/kiểm "
                "soát/hạn chế của mã. Danh sách dưới đây có thể còn sót mã thuộc "
                "các diện này."
            ),
        },
    ]


def _pct(a: float, b: float) -> float:
    """% của ``a`` so với ``b`` (b > 0 đã được gọi kiểm trước)."""
    return (a - b) / b * 100.0


def _fmt_lan(x: float) -> str:
    return f"{x:.1f}×".replace(".", ",")


def _fmt_pct(x: float) -> str:
    return f"{x:+.1f}%".replace(".", ",")


def _fmt_ty(vnd: float) -> str:
    return f"{vnd / 1_000_000_000:+.1f} tỷ".replace(".", ",")


def _finite(x: float | None) -> bool:
    return x is not None and math.isfinite(x)


class HuntEngine:
    """Chạy lọc sàn + 1 bộ lọc trên một rổ mã, thuần tính toán (không I/O).

    Rổ mã ``universe`` là danh sách mã HOSE đã lọc sẵn ở tầng service (từ bảng
    ``symbols``) — tiêu chí "chỉ HOSE" của lọc sàn được áp ở đó, các tiêu chí
    còn lại áp ở đây vì chúng cần nến ngày.
    """

    def __init__(self, source: HuntDataSource) -> None:
        self._source = source

    # ── Lọc sàn ───────────────────────────────────────

    @staticmethod
    def _qua_loc_san(bars: list[HuntBar]) -> bool | None:
        """``True/False`` = qua/không qua lọc sàn; ``None`` = thiếu dữ liệu.

        Thiếu dữ liệu KHÔNG được coi là trượt: mã đó bị bỏ ra khỏi rổ và được
        ĐẾM RIÊNG để dòng minh bạch nói đúng đã xét bao nhiêu mã.
        """
        if len(bars) < SO_NEN_CAN:
            return None
        gia = bars[-1].close
        if not _finite(gia) or gia <= 0:
            return None
        gtgd = [b.gtgd_vnd for b in bars[-SO_PHIEN_TB:]]
        if any(v is None or not math.isfinite(v) for v in gtgd):
            return None
        tb_gtgd = sum(float(v) for v in gtgd) / len(gtgd)  # type: ignore[arg-type]
        # ★ Biên là ``>=``, KHỚP VỚI NHÃN người dùng đọc ở `:308`
        # ("Giá ≥ 3.000đ" / "GTGD TB20 ≥ 1 tỷ"). Trước đây code dùng `>` nên mã
        # đúng 3.000đ hoặc đúng 1 tỷ bị loại oan trong khi nhãn nói nó ĐẠT —
        # màn hình và bộ lọc nói hai điều khác nhau về cùng một mã.
        return gia >= MIN_GIA_VND and tb_gtgd >= MIN_GTGD_TB_VND

    # ── 3 bộ lọc chạy trên nến ngày ───────────────────

    @staticmethod
    def _tb20_kl(bars: list[HuntBar]) -> float | None:
        truoc = [b.volume for b in bars[-SO_NEN_CAN:-1]]
        if len(truoc) < SO_PHIEN_TB or any(not _finite(v) for v in truoc):
            return None
        tb = sum(truoc) / len(truoc)
        return tb if tb > 0 else None

    @classmethod
    def _do_kl(cls, bars: list[HuntBar]) -> tuple[float, str] | None:
        tb = cls._tb20_kl(bars)
        if tb is None:
            return None
        lan = bars[-1].volume / tb
        if lan < NGUONG_KL_DOT_BIEN:
            return None
        return lan, f"KL {_fmt_lan(lan)} TB{SO_PHIEN_TB} phiên"

    @staticmethod
    def _do_dinh(bars: list[HuntBar]) -> tuple[float, str] | None:
        truoc = [b.close for b in bars[-SO_NEN_CAN:-1]]
        if len(truoc) < SO_PHIEN_TB or any(not _finite(v) for v in truoc):
            return None
        dinh_cu = max(truoc)
        if dinh_cu <= 0:
            return None
        close = bars[-1].close
        if close <= dinh_cu:
            return None
        vuot = _pct(close, dinh_cu)
        return vuot, f"Vượt đỉnh {SO_PHIEN_TB} phiên {_fmt_pct(vuot)}"

    @classmethod
    def _do_tang(cls, bars: list[HuntBar]) -> tuple[float, str] | None:
        tb = cls._tb20_kl(bars)
        if tb is None:
            return None
        truoc_close = bars[-2].close
        if not _finite(truoc_close) or truoc_close <= 0:
            return None
        tang = _pct(bars[-1].close, truoc_close)
        lan = bars[-1].volume / tb
        if tang < NGUONG_TANG_PCT or lan < NGUONG_TANG_KL:
            return None
        return tang, f"{_fmt_pct(tang)} · KL {_fmt_lan(lan)} TB{SO_PHIEN_TB} phiên"

    _DO_BARS = {
        HuntFilter.KL.value: "_do_kl",
        HuntFilter.DINH.value: "_do_dinh",
        HuntFilter.TANG.value: "_do_tang",
    }

    # ── Điểm vào ──────────────────────────────────────

    @staticmethod
    def _chua_du_du_lieu(spec: FilterSpec, ly_do: str, *, so_ma_trong_ro: int) -> HuntResult:
        """Kết quả "chưa lọc được" — bất biến ``so_ma_thoa is None`` ở MỘT chỗ."""
        return HuntResult(
            bo_loc=spec,
            trang_thai="chua_du_du_lieu",
            ly_do_thieu_du_lieu=ly_do,
            so_ma_thoa=None,
            so_ma_trong_ro=so_ma_trong_ro,
            so_ma_xet=None,
            so_ma_truot_loc_san=None,
            so_ma_bo_qua_thieu_du_lieu=None,
            ket_qua_day_du=None,
            canh_bao_thieu_du_lieu=None,
            items=[],
        )

    @staticmethod
    def _ket_qua(
        spec: FilterSpec,
        cham: list[tuple[float, str, str, float, float | None]],
        *,
        so_ma_trong_ro: int,
        so_xet: int,
        so_truot_loc_san: int,
        so_bo_qua: int,
    ) -> HuntResult:
        """Dựng kết quả "đã lọc" — MỘT chỗ cho cả 5 bộ lọc.

        ★ Trước đây hai nhánh (nến ngày / dòng tiền) tự dựng items + đếm riêng,
        nên một đột biến ở nhánh dòng tiền (VD bỏ ``[:TOP_N]``) không bị nhánh
        kia che. Gộp về đây để mọi bộ lọc dùng đúng một cách đếm.
        """
        cham.sort(key=lambda row: (-row[0], row[1]))
        items = [
            {
                "hang": i + 1,
                "symbol": symbol,
                "gia_vnd": round(gia),
                "pct_thay_doi": round(pct, 2) if pct is not None else None,
                "tin_hieu": tin_hieu,
                "gia_tri_xep_hang": round(diem, 4),
            }
            for i, (diem, symbol, tin_hieu, gia, pct) in enumerate(cham[:TOP_N])
        ]
        canh_bao = (
            None
            if so_bo_qua == 0
            else (
                f"Đã bỏ qua {so_bo_qua}/{so_ma_trong_ro} mã vì thiếu dữ liệu (không "
                f"đủ {SO_NEN_CAN} phiên nến, hoặc nguồn không trả giá trị giao dịch "
                "phiên). Danh sách này CÓ THỂ CÒN SÓT mã thoả điều kiện — con số "
                "dưới đây là kết quả trên số mã xét được, không phải cả sàn."
            )
        )
        return HuntResult(
            bo_loc=spec,
            trang_thai="ok",
            ly_do_thieu_du_lieu=None,
            so_ma_thoa=len(cham),
            so_ma_trong_ro=so_ma_trong_ro,
            so_ma_xet=so_xet,
            so_ma_truot_loc_san=so_truot_loc_san,
            so_ma_bo_qua_thieu_du_lieu=so_bo_qua,
            ket_qua_day_du=so_bo_qua == 0,
            canh_bao_thieu_du_lieu=canh_bao,
            items=items,
        )

    async def run(self, bo_loc: str, universe: Sequence[str]) -> HuntResult:
        spec = FILTER_SPECS[bo_loc]
        if bo_loc in FILTER_DONG_TIEN:
            return await self._run_dong_tien(spec, universe)
        return await self._run_bars(spec, universe)

    async def probe(self, bo_loc: str, universe: Sequence[str]) -> tuple[bool, str | None]:
        """Bộ lọc này có nguồn dữ liệu để chạy không — KHÔNG quét sàn.

        Dùng cho màn Săn mã (``GET /cap5/san-ma``) để user thấy ngay dòng "chưa
        đủ dữ liệu" thay vì bấm vào rồi nhận popup rỗng. Với 2 bộ lọc dòng tiền
        đây là câu trả lời CHẮC CHẮN (nguồn có hay không, không phụ thuộc mã).

        ★ Với 3 bộ lọc nến ngày, probe chỉ nói "có nguồn về nguyên tắc": nó
        KHÔNG gọi mạng, nên không thể biết trước nguồn giá có trả nến hay không.
        Nếu lúc chạy thật không mã nào có nến, ``run`` trả ``chua_du_du_lieu`` —
        NƠI DUY NHẤT nói sự thật cuối cùng là ``run``, và FE phải đọc
        ``kha_dung`` của chính kết quả đó, không được cache lại từ màn index.
        """
        FILTER_SPECS[bo_loc]  # noqa: B018 — KeyError sớm cho mã bộ lọc lạ
        if not universe:
            return False, _thieu_nen(0)
        if bo_loc in FILTER_DONG_TIEN:
            flows = await self._source.net_flow(
                universe, ben=FILTER_DONG_TIEN[bo_loc], so_phien=SO_PHIEN_GOM
            )
            if flows is None:
                return False, _THIEU_NGUON_DONG_TIEN
            # ★ Nguồn trả lời nhưng không mã nào có đủ chuỗi ⇒ vẫn là "chưa lọc
            # được". Dùng ĐÚNG phép thử của ``_run_dong_tien`` để màn index và
            # popup không nói hai câu khác nhau.
            if not self._co_chuoi_dung_duoc(flows, universe):
                return False, _thieu_chuoi_dong_tien(len(universe))
        return True, None

    async def _run_bars(self, spec: FilterSpec, universe: Sequence[str]) -> HuntResult:
        bars_map = await self._source.daily_bars(universe, so_nen=SO_NEN_CAN)
        do = getattr(self, self._DO_BARS[spec.ma])

        cham: list[tuple[float, str, str, float, float | None]] = []
        so_bo_qua = 0
        so_xet = 0
        so_truot_san = 0
        for symbol in universe:
            bars = bars_map.get(symbol)
            if not bars:
                so_bo_qua += 1
                continue
            qua_san = self._qua_loc_san(bars)
            if qua_san is None:
                so_bo_qua += 1
                continue
            if not qua_san:
                so_truot_san += 1
                continue
            so_xet += 1
            hit = do(bars)
            if hit is None:
                continue
            diem, tin_hieu = hit
            truoc = bars[-2].close
            pct_ngay = _pct(bars[-1].close, truoc) if truoc > 0 else None
            cham.append((diem, symbol, tin_hieu, bars[-1].close, pct_ngay))

        # ★ LUẬT 1: không mã nào có dữ liệu để XÉT ⇒ chưa lọc được. Nếu để rơi
        # xuống dưới, ``so_ma_thoa`` = 0 và popup sẽ nói "0 mã thoả điều kiện".
        if so_bo_qua == len(universe):
            return self._chua_du_du_lieu(
                spec, _thieu_nen(len(universe)), so_ma_trong_ro=len(universe)
            )
        return self._ket_qua(
            spec,
            cham,
            so_ma_trong_ro=len(universe),
            so_xet=so_xet,
            so_truot_loc_san=so_truot_san,
            so_bo_qua=so_bo_qua,
        )

    @staticmethod
    def _co_chuoi_dung_duoc(
        flows: dict[str, list[float]], universe: Sequence[str]
    ) -> bool:
        """Có mã nào trong rổ có chuỗi mua ròng đủ ``SO_PHIEN_GOM`` phiên không."""
        return any(len(flows.get(s) or ()) >= SO_PHIEN_GOM for s in universe)

    async def _run_dong_tien(self, spec: FilterSpec, universe: Sequence[str]) -> HuntResult:
        ben = FILTER_DONG_TIEN[spec.ma]
        flows = await self._source.net_flow(universe, ben=ben, so_phien=SO_PHIEN_GOM)
        if flows is None:
            # ★ LUẬT 1: chưa lọc được ≠ không có mã nào thoả.
            return self._chua_du_du_lieu(
                spec, _THIEU_NGUON_DONG_TIEN, so_ma_trong_ro=len(universe)
            )
        # ★ Dừng TRƯỚC khi quét nến cả sàn: nguồn dòng tiền không dùng được thì
        # 406 mã nến cũng không giúp gì, và kết luận đã chắc chắn là "chưa lọc
        # được". (Bất biến này được canh bằng ``bars_calls`` trong test.)
        if not self._co_chuoi_dung_duoc(flows, universe):
            return self._chua_du_du_lieu(
                spec, _thieu_chuoi_dong_tien(len(universe)), so_ma_trong_ro=len(universe)
            )

        bars_map = await self._source.daily_bars(universe, so_nen=SO_NEN_CAN)
        cham: list[tuple[float, str, str, float, float | None]] = []
        so_bo_qua = 0
        so_xet = 0
        so_truot_san = 0
        for symbol in universe:
            bars = bars_map.get(symbol)
            chuoi = flows.get(symbol)
            if not bars or chuoi is None or len(chuoi) < SO_PHIEN_GOM:
                so_bo_qua += 1
                continue
            qua_san = self._qua_loc_san(bars)
            if qua_san is None:
                so_bo_qua += 1
                continue
            if not qua_san:
                so_truot_san += 1
                continue
            so_xet += 1
            gan_nhat = list(chuoi)[-SO_PHIEN_GOM:]
            so_phien_gom = sum(1 for v in gan_nhat if v > 0)
            tong = sum(gan_nhat)
            if so_phien_gom < NGUONG_GOM_PHIEN or tong <= 0:
                continue
            tin_hieu = f"{_fmt_ty(tong)} ròng · {so_phien_gom}/{SO_PHIEN_GOM} phiên"
            truoc = bars[-2].close
            pct_ngay = _pct(bars[-1].close, truoc) if truoc > 0 else None
            cham.append((tong, symbol, tin_hieu, bars[-1].close, pct_ngay))

        # ★ LUẬT 1 — xem chú thích cùng chỗ trong ``_run_bars``.
        if so_bo_qua == len(universe):
            return self._chua_du_du_lieu(
                spec, _thieu_nen(len(universe)), so_ma_trong_ro=len(universe)
            )
        return self._ket_qua(
            spec,
            cham,
            so_ma_trong_ro=len(universe),
            so_xet=so_xet,
            so_truot_loc_san=so_truot_san,
            so_bo_qua=so_bo_qua,
        )
