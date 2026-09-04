"""Nguồn dữ liệu THẬT cho máy săn mã Cấp 5 (bản cài ``HuntDataSource``).

Màn Săn mã quét CẢ sàn HOSE (~405 mã) mỗi cú bấm, nên mọi thứ ở đây phải là
BULK — một lượt HTTP cho cả bảng, không phải một lượt mỗi mã. Cả hai loại dữ
liệu lấy từ VNDIRECT finfo (``api-finfo.vndirect.com.vn/v4``), lọc thẳng theo
``floor:HOSE`` + khoảng ngày:

  · **Nến ngày** — ``/v4/stock_prices`` → ``adClose`` (nghìn đồng, đã điều
    chỉnh), ``nmVolume`` (cổ phiếu), ``nmValue`` (GTGD khớp lệnh, VND).
  · **Mua ròng theo TỪNG phiên** — ``/v4/foreigns`` (khối ngoại) và
    ``/v4/proprietary_trading`` (tự doanh) → ``netVal`` (VND).

★★ **VÌ SAO KHÔNG CÒN DÙNG VCI GAP-CHART CHO NẾN.** Bản trước gọi
``vietcap.fetch_ohlcv_multi`` (POST ``chart/OHLCChart/gap-chart`` với mảng
``symbols``) theo lô 40 mã. Upstream nay CHỈ trả dữ liệu khi mảng có ĐÚNG 1 mã;
gửi 2 mã trở lên nó trả ``[]`` — không lỗi HTTP, không cảnh báo. Hệ quả trên
production: mọi mã "vắng nến" ⇒ cả 5 bộ lọc rơi vào nhánh "chưa lọc được".
Quét sàn bằng endpoint 1-mã là 405 lượt HTTP mỗi cú bấm, nên nguồn nến chuyển
hẳn sang finfo (một lượt cho cả bảng, cùng lịch phiên với dữ liệu dòng tiền).

★★ **Luật số 1 (xem ``app.services.cap5.hunt``) sống cả ở đây:** khi nguồn
không trả lời được, ``net_flow`` trả ``None`` — KHÔNG BAO GIỜ ``{}``. ``{}`` sẽ
được máy lọc hiểu là "đã lọc, không mã nào thoả" và in ra một con số 0 bịa.

★ **Khuyết dữ liệu của hai nguồn dòng tiền KHÔNG cùng nghĩa nhau:**
  · ``/v4/foreigns`` trả ĐỦ 405 mã HOSE mỗi phiên (kể cả mã ``netVal = 0``).
    Mã vắng mặt ⇒ LỖ HỔNG dữ liệu ⇒ bỏ mã đó ra khỏi lần chạy (máy lọc đếm vào
    "bỏ qua vì thiếu dữ liệu"), không được coi là 0.
  · ``/v4/proprietary_trading`` chỉ có hàng cho mã tự doanh CÓ giao dịch trong
    phiên (~60-90 mã/phiên). Mã vắng mặt ⇒ phiên đó tự doanh không giao dịch mã
    đó ⇒ mua ròng = 0 đồng, đây là số THẬT chứ không phải chỗ trống.
Đó là lý do ``_NguonDongTien.khuyet_la_khong`` tồn tại; gộp hai ca này làm một
là hoặc bịa 300 mã "0 đồng" cho khối ngoại, hoặc vứt cả bộ lọc tự doanh đi.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.services.cache.redis_cache import cache_get_json, cache_set_json
from app.services.cap5.hunt import SAN_HOSE, HuntBar
from app.services.market_data.http import fetch_json, get_headers

logger = logging.getLogger(__name__)

_VN_TZ = timezone(timedelta(hours=7))

_FINFO_BASE = "https://api-finfo.vndirect.com.vn/v4"
_FINFO_SOURCE = "VND"
#: Trần số hàng xin mỗi lượt. 405 mã × ~30 phiên vẫn lọt (upstream nhận tới
#: 20.000 và trả đủ); nếu vẫn bị cắt thì xem ``_gom_theo_phien(bi_cat=…)``.
_FINFO_SIZE = 20_000
#: Nến ngày đổi tối đa 1 lần/phiên ⇒ cache 30 phút là dư an toàn.
_CACHE_TTL = 1800
#: Dòng tiền chạy TRONG phiên ⇒ cache ngắn hơn nến ngày.
_FLOW_CACHE_TTL = 900
#: Đơn vị giá của finfo là NGHÌN đồng (HPG "21.7" = 21.700đ).
_NGHIN = 1_000
#: Đổi "số phiên cần" sang "số ngày lịch phải xin": 7/5 ngày lịch mỗi phiên
#: (nghỉ cuối tuần) + 12 ngày bù nghỉ lễ dài (Tết nghỉ liền 9 ngày vẫn không
#: thủng). Xin thiếu ngày là mã bị đếm nhầm vào "thiếu dữ liệu" sau mỗi kỳ nghỉ.
_BU_NGAY_NGHI = 12


def _so_ngay_lich(so_phien: int) -> int:
    return math.ceil(so_phien * 7 / 5) + _BU_NGAY_NGHI


@dataclass(frozen=True)
class _NguonDongTien:
    """Một endpoint finfo + cách đọc chỗ khuyết của nó."""

    path: str
    #: Tên trường ngày (hai endpoint đặt tên khác nhau: ``tradingDate`` / ``date``).
    truong_ngay: str
    #: ``True`` = mã vắng mặt trong phiên nghĩa là mua ròng 0đ (xem docstring module).
    khuyet_la_khong: bool


_NGUON_DONG_TIEN: dict[str, _NguonDongTien] = {
    "ngoai": _NguonDongTien("foreigns", "tradingDate", khuyet_la_khong=False),
    "tudoanh": _NguonDongTien("proprietary_trading", "date", khuyet_la_khong=True),
}


def _iso(raw: object) -> str | None:
    if isinstance(raw, (int, float)):
        return datetime.fromtimestamp(int(raw), tz=_VN_TZ).date().isoformat()
    if isinstance(raw, str):
        if raw.isdigit():
            return datetime.fromtimestamp(int(raw), tz=_VN_TZ).date().isoformat()
        return raw[:10]
    return None


def _so(raw: object) -> float | None:
    try:
        gia_tri = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return gia_tri if math.isfinite(gia_tri) else None


def _phien_dung_duoc(ngay_co: Sequence[str], *, so_can: int, bi_cat: bool) -> list[str]:
    """Chọn ``so_can`` phiên gần nhất trong các phiên nguồn trả về.

    ★ ``bi_cat`` = upstream trả ít hàng hơn ``totalElements`` (đụng trần
    ``size``). Vì ta luôn xin ``sort=<ngày>:desc``, chỗ bị cắt là phiên CŨ NHẤT
    — phiên đó chỉ có một phần số mã. Bỏ nó đi, nếu không mã bị cắt sẽ bị đọc
    thành "phiên đó không mua ròng" / "phiên đó không có nến".
    """
    phien = sorted(set(ngay_co))
    if bi_cat and phien:
        phien.pop(0)
    return phien[-so_can:]


class LiveHuntDataSource:
    """``HuntDataSource`` chạy trên dữ liệu thị trường thật (VNDIRECT finfo).

    Một bảng cho cả sàn, cache Redis ngắn: màn Săn mã hỏi 405 mã còn
    ``_tin_hieu_san`` hỏi đúng 1 mã — cả hai dùng chung bảng đã cache nên lần
    hỏi 1 mã không tốn thêm lượt HTTP nào.
    """

    def __init__(self, *, use_cache: bool = True, today: date | None = None) -> None:
        self._use_cache = use_cache
        self._today = today or datetime.now(_VN_TZ).date()

    # ── Nến ngày ──────────────────────────────────────

    async def daily_bars(
        self, symbols: Sequence[str], *, so_nen: int
    ) -> dict[str, list[HuntBar]]:
        bang = await self._bang_nen(so_nen)
        if not bang:
            return {}
        wanted = {s.upper() for s in symbols}
        return {ma: bars for ma, bars in bang.items() if ma in wanted}

    async def _bang_nen(self, so_nen: int) -> dict[str, list[HuntBar]]:
        """``{mã: nến tăng dần}`` cho cả sàn HOSE — rỗng khi nguồn không trả."""
        key = f"cap5:hunt:bars:{self._today.isoformat()}:{so_nen}"
        if self._use_cache:
            cached = await cache_get_json(key)
            if isinstance(cached, dict) and cached:
                return {
                    ma: [
                        HuntBar(ngay=r[0], close=r[1], volume=r[2], gtgd_vnd=r[3])
                        for r in hang
                    ]
                    for ma, hang in cached.items()
                }

        rows, bi_cat = await self._finfo(
            "stock_prices",
            truong_ngay="date",
            so_phien=so_nen,
            fields="code,date,close,adClose,nmVolume,nmValue",
        )
        if rows is None:
            return {}

        phien = _phien_dung_duoc(
            [ngay for r in rows if (ngay := _iso(r.get("date")))],
            so_can=so_nen,
            bi_cat=bi_cat,
        )
        giu = set(phien)
        theo_ma: dict[str, dict[str, HuntBar]] = {}
        for r in rows:
            ngay = _iso(r.get("date"))
            ma = str(r.get("code") or "").upper()
            if not ma or ngay is None or ngay not in giu:
                continue
            # ``adClose`` = giá đã điều chỉnh cổ tức/chia tách: so đỉnh 20 phiên
            # trên giá thô sẽ hụt đúng vào ngày GDKHQ. Phiên gần nhất adClose ==
            # close nên nhãn "Giá ≥ 3.000đ" vẫn nói về giá thị trường thật.
            gia = _so(r.get("adClose"))
            if gia is None:
                gia = _so(r.get("close"))
            if gia is None or gia <= 0:
                continue
            klg = _so(r.get("nmVolume"))
            gtgd = _so(r.get("nmValue"))
            theo_ma.setdefault(ma, {})[ngay] = HuntBar(
                ngay=ngay,
                close=gia * _NGHIN,
                volume=klg if klg is not None else 0.0,
                gtgd_vnd=gtgd,
            )

        out = {
            ma: [nen[ngay] for ngay in sorted(nen)]
            for ma, nen in theo_ma.items()
            if nen
        }
        if self._use_cache and out:
            await cache_set_json(
                key,
                {
                    ma: [[b.ngay, b.close, b.volume, b.gtgd_vnd] for b in bars]
                    for ma, bars in out.items()
                },
                _CACHE_TTL,
            )
        return out

    # ── Mua ròng theo phiên ───────────────────────────

    async def net_flow(
        self, symbols: Sequence[str], *, ben: str, so_phien: int
    ) -> dict[str, list[float]] | None:
        """Mua ròng (VND) theo TỪNG phiên — một lượt HTTP cho CẢ sàn HOSE.

        ★★ **Lịch phiên KHÔNG lấy từ chính nguồn dòng tiền** mà từ bảng giá
        (``/v4/stock_prices``, 405 mã mỗi phiên). Nguồn tự doanh thưa (chỉ mã có
        giao dịch mới có hàng), nên đọc lịch từ nó là: một phiên tự doanh im
        lặng, hoặc nguồn trễ EOD, sẽ âm thầm đẩy cửa sổ lùi lại và "5 phiên gần
        nhất" nói về những phiên khác hẳn — không dấu vết nào trên giao diện.

        Trả ``None`` khi chưa lọc được: bên lạ, rổ rỗng, upstream lỗi/đổi shape,
        lịch chưa đủ ``so_phien`` phiên, hoặc (với nguồn thưa) có phiên trong
        lịch mà nguồn KHÔNG phủ. KHÔNG BAO GIỜ trả ``{}`` để nói "không mã nào
        thoả" thay cho "chưa lọc được".
        """
        nguon = _NGUON_DONG_TIEN.get(ben)
        if nguon is None or so_phien <= 0:
            return None
        wanted = {s.upper() for s in symbols}
        if not wanted:
            return None

        phien = await self._lich_phien(so_phien)
        if phien is None:
            return None
        theo_phien = await self._bang_dong_tien(nguon, ben=ben, so_phien=so_phien)
        if theo_phien is None:
            return None
        # Nguồn thưa: "mã vắng = 0đ" chỉ đúng khi nguồn CÓ phủ phiên đó. Phiên
        # nguồn chưa có hàng nào là nguồn chưa về, không phải cả sàn nghỉ mua.
        if nguon.khuyet_la_khong and any(not theo_phien.get(p) for p in phien):
            return None

        out: dict[str, list[float]] = {}
        for ma in wanted:
            chuoi: list[float] = []
            thieu = False
            for ngay in phien:
                gia_tri = theo_phien.get(ngay, {}).get(ma)
                if gia_tri is None:
                    if not nguon.khuyet_la_khong:
                        thieu = True
                        break
                    gia_tri = 0.0
                chuoi.append(gia_tri)
            if not thieu:
                out[ma] = chuoi
        return out

    async def _lich_phien(self, so_phien: int) -> list[str] | None:
        """``so_phien`` phiên giao dịch gần nhất, tăng dần — ``None`` nếu chưa đủ.

        Đọc từ bảng giá vì mọi mã HOSE đều có hàng mỗi phiên; đây là thứ duy
        nhất trong ba nguồn nói được "phiên nào ĐÃ diễn ra".
        """
        key = f"cap5:hunt:lich:{self._today.isoformat()}:{so_phien}"
        if self._use_cache:
            cached = await cache_get_json(key)
            if isinstance(cached, list) and len(cached) == so_phien:
                return [str(x) for x in cached]

        rows, bi_cat = await self._finfo(
            "stock_prices", truong_ngay="date", so_phien=so_phien, fields="code,date"
        )
        if rows is None:
            return None
        phien = _phien_dung_duoc(
            [ngay for r in rows if (ngay := _iso(r.get("date")))],
            so_can=so_phien,
            bi_cat=bi_cat,
        )
        if len(phien) < so_phien:
            return None
        if self._use_cache:
            await cache_set_json(key, phien, _FLOW_CACHE_TTL)
        return phien

    async def _bang_dong_tien(
        self, nguon: _NguonDongTien, *, ben: str, so_phien: int
    ) -> dict[str, dict[str, float]] | None:
        """Bảng ``phiên → {mã: mua ròng}`` cho cả sàn, có cache Redis ngắn."""
        key = f"cap5:hunt:flow:{ben}:{self._today.isoformat()}:{so_phien}"
        if self._use_cache:
            cached = await cache_get_json(key)
            if isinstance(cached, dict) and cached:
                return {p: dict(v) for p, v in cached.items()}

        rows, bi_cat = await self._finfo(
            nguon.path,
            truong_ngay=nguon.truong_ngay,
            so_phien=so_phien,
            fields=f"code,{nguon.truong_ngay},netVal",
        )
        if rows is None:
            return None

        theo_phien: dict[str, dict[str, float]] = {}
        for r in rows:
            ma = str(r.get("code") or "").upper()
            ngay = _iso(r.get(nguon.truong_ngay))
            net = _so(r.get("netVal"))
            if not ma or ngay is None or net is None:
                continue
            theo_phien.setdefault(ngay, {})[ma] = net
        if not theo_phien:
            return None
        # Phiên cũ nhất bị cắt giữa chừng ⇒ bỏ hẳn, xem ``_phien_dung_duoc``.
        if bi_cat:
            theo_phien.pop(min(theo_phien), None)

        if self._use_cache and theo_phien:
            await cache_set_json(key, theo_phien, _FLOW_CACHE_TTL)
        return theo_phien or None

    # ── Transport ─────────────────────────────────────

    async def _finfo(
        self, path: str, *, truong_ngay: str, so_phien: int, fields: str
    ) -> tuple[list[dict] | None, bool]:
        """Một lượt gọi finfo cho CẢ sàn HOSE. ``(None, …)`` = chưa lọc được.

        Cờ thứ hai là "kết quả bị cắt vì đụng trần ``size``" — người gọi phải bỏ
        phiên cũ nhất khi nó bật (xem ``_phien_dung_duoc``).
        """
        tu_ngay = self._today - timedelta(days=_so_ngay_lich(so_phien))
        params: dict[str, Any] = {
            "q": f"type:STOCK~floor:{SAN_HOSE}~{truong_ngay}:gte:{tu_ngay.isoformat()}",
            "sort": f"{truong_ngay}:desc",
            "size": _FINFO_SIZE,
            "fields": fields,
        }
        try:
            data = await fetch_json(
                f"{_FINFO_BASE}/{path}",
                params=params,
                headers=get_headers(_FINFO_SOURCE),
                source=_FINFO_SOURCE,
            )
        except Exception as exc:  # noqa: BLE001 — upstream chết ⇒ "chưa lọc được"
            logger.warning("Cấp 5 săn mã: nguồn %s lỗi: %s", path, exc)
            return None, False

        rows = data.get("data") if isinstance(data, dict) else None
        if not isinstance(rows, list) or not rows:
            logger.warning("Cấp 5 săn mã: nguồn %s trả shape lạ", path)
            return None, False
        tong = data.get("totalElements")
        bi_cat = isinstance(tong, (int, float)) and tong > len(rows)
        if bi_cat:
            logger.warning(
                "Cấp 5 săn mã: nguồn %s bị cắt (%s/%s hàng) — bỏ phiên cũ nhất",
                path,
                len(rows),
                tong,
            )
        return rows, bi_cat
