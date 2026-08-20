"""Nguồn dữ liệu THẬT cho máy săn mã Cấp 5 (bản cài ``HuntDataSource``).

Nến ngày lấy hàng loạt qua VCI gap-chart (``vietcap.fetch_ohlcv_multi``) theo
lô, có cache Redis ngắn: một cú bấm bộ lọc quét cả sàn HOSE (~400 mã) tốn
khoảng ``ceil(400 / BATCH)`` lượt HTTP chứ không phải 400.

``net_flow`` trả ``None`` — xem bản kiểm dữ liệu ở đầu ``app.services.cap5.hunt``:
backend chưa có nguồn mua ròng khối ngoại / tự doanh **theo từng phiên cho toàn
sàn**. Trả ``None`` (chứ không phải ``{}``) là điều bắt buộc: ``{}`` sẽ được máy
lọc hiểu là "đã lọc, không mã nào thoả" và in ra một con số 0 bịa.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import date, datetime, timedelta, timezone

from app.services.cache.redis_cache import cache_get_json, cache_set_json
from app.services.cap5.hunt import HuntBar
from app.services.market_data.sources import vietcap

logger = logging.getLogger(__name__)

_VN_TZ = timezone(timedelta(hours=7))
#: Số mã mỗi lượt gọi gap-chart.
BATCH = 40
#: Nến ngày đổi tối đa 1 lần/phiên ⇒ cache 30 phút là dư an toàn.
_CACHE_TTL = 1800
#: Đơn vị ``accumulatedValue`` của VCI là TRIỆU đồng.
_TRIEU = 1_000_000


def _ts(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=_VN_TZ).timestamp())


def _iso(raw: object) -> str | None:
    if isinstance(raw, (int, float)):
        return datetime.fromtimestamp(int(raw), tz=_VN_TZ).date().isoformat()
    if isinstance(raw, str):
        if raw.isdigit():
            return datetime.fromtimestamp(int(raw), tz=_VN_TZ).date().isoformat()
        return raw[:10]
    return None


def _to_bars(records: list[dict]) -> list[HuntBar]:
    """Chuẩn hoá + sắp tăng dần + khử trùng ngày.

    Nến có giá đóng cửa không hợp lệ bị BỎ (không thay bằng 0) — một nến 0 đồng
    sẽ kéo trung bình xuống và làm lọc sàn nói dối.
    """
    by_date: dict[str, HuntBar] = {}
    for r in records:
        ngay = _iso(r.get("time"))
        if ngay is None:
            continue
        try:
            close = float(r["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if close <= 0:
            continue
        try:
            volume = float(r.get("volume") or 0.0)
        except (TypeError, ValueError):
            volume = 0.0
        raw_value = r.get("value")
        try:
            gtgd = float(raw_value) * _TRIEU if raw_value is not None else None
        except (TypeError, ValueError):
            gtgd = None
        by_date[ngay] = HuntBar(ngay=ngay, close=close, volume=volume, gtgd_vnd=gtgd)
    return [by_date[k] for k in sorted(by_date)]


class VciHuntDataSource:
    """``HuntDataSource`` chạy trên dữ liệu VCI thật."""

    def __init__(self, *, use_cache: bool = True, today: date | None = None) -> None:
        self._use_cache = use_cache
        self._today = today or datetime.now(_VN_TZ).date()

    async def daily_bars(
        self, symbols: Sequence[str], *, so_nen: int
    ) -> dict[str, list[HuntBar]]:
        wanted = [s.upper() for s in symbols]
        end_ts = _ts(self._today + timedelta(days=1))
        # Xin dư nến để bù ngày nghỉ/lễ; máy lọc chỉ dùng ``so_nen`` cuối.
        count_back = so_nen + 10

        out: dict[str, list[HuntBar]] = {}
        for i in range(0, len(wanted), BATCH):
            lo = wanted[i : i + BATCH]
            key = f"cap5:hunt:bars:{self._today.isoformat()}:{so_nen}:{'-'.join(lo)}"
            raw: dict[str, list[dict]] | None = None
            if self._use_cache:
                cached = await cache_get_json(key)
                if isinstance(cached, dict) and cached:
                    raw = cached
            if raw is None:
                try:
                    raw, _url = await vietcap.fetch_ohlcv_multi(
                        lo, end_ts=end_ts, interval="1D", count_back=count_back
                    )
                except Exception as exc:  # noqa: BLE001 — lô hỏng ⇒ mã vắng mặt
                    # Mã của lô này sẽ VẮNG khỏi kết quả ⇒ máy lọc đếm chúng
                    # vào "bỏ qua vì thiếu dữ liệu", không coi là trượt lọc.
                    logger.warning("Cấp 5 săn mã: lô %s lỗi: %s", lo[:3], exc)
                    continue
                if self._use_cache and raw:
                    await cache_set_json(key, raw, _CACHE_TTL)

            for symbol, records in raw.items():
                bars = _to_bars(records)
                if bars:
                    out[symbol.upper()] = bars
        return out

    async def net_flow(
        self, symbols: Sequence[str], *, ben: str, so_phien: int
    ) -> dict[str, list[float]] | None:
        """★ Luôn ``None`` cho tới khi có nguồn bulk theo phiên — xem docstring
        module và bản kiểm dữ liệu trong ``app.services.cap5.hunt``."""
        return None
