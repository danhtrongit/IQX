"""Adjusted daily OHLCV fetch for the TA engine (backtester + alerts).

Primary source: VCI gap-chart (adjusted OHLC **with** volume); fallback: VND
dchart. Fetches enough warmup history before ``start`` so indicators are valid
from the first traded bar. Results are normalized (ISO date, ascending, deduped)
and Redis-cached.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from app.services.cache.redis_cache import cache_get_json, cache_set_json
from app.services.market_data.fallback import fetch_with_fallback
from app.services.market_data.sources import vietcap, vndirect
from app.services.ta.indicators import OHLCV

logger = logging.getLogger(__name__)

_VN_TZ = timezone(timedelta(hours=7))
#: Trading sessions of warmup needed before the first traded bar (ma_200/52w).
WARMUP_SESSIONS = 300
_CACHE_TTL = 1800  # seconds


def _to_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _ts(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=_VN_TZ).timestamp())


def _iso_from_epoch(t: int | float) -> str:
    return datetime.fromtimestamp(int(t), tz=_VN_TZ).date().isoformat()


def _normalize(records: list[dict]) -> list[dict]:
    """Coerce to ascending, deduped ``{time(ISO), o,h,l,c,v}`` dropping bad rows."""
    by_date: dict[str, dict] = {}
    for r in records:
        raw_t = r.get("time")
        if raw_t is None:
            continue
        iso = _iso_from_epoch(raw_t) if isinstance(raw_t, (int, float)) else str(raw_t)[:10]
        try:
            close = float(r["close"])
        except (TypeError, ValueError, KeyError):
            continue
        if close <= 0:
            continue
        by_date[iso] = {
            "time": iso,
            "open": float(r.get("open") or close),
            "high": float(r.get("high") or close),
            "low": float(r.get("low") or close),
            "close": close,
            "volume": float(r.get("volume") or 0.0),
        }
    return [by_date[k] for k in sorted(by_date)]


async def _fetch_records(symbol: str, start: date, end: date) -> list[dict]:
    fetch_from = start - timedelta(days=int(WARMUP_SESSIONS * 1.6) + 30)
    end_ts = _ts(end + timedelta(days=1))
    start_ts = _ts(fetch_from)
    count_back = (end - fetch_from).days + 30

    async def _vci() -> tuple[list[dict], str]:
        return await vietcap.fetch_ohlcv(symbol, start_ts=start_ts, end_ts=end_ts, interval="1D", count_back=count_back)

    async def _vnd() -> tuple[list[dict], str]:
        return await vndirect.fetch_ohlcv(symbol, start_ts=start_ts, end_ts=end_ts, interval="1D")

    resp = await fetch_with_fallback([("VCI", _vci), ("VND", _vnd)])
    return _normalize(resp.data)


async def get_adjusted_ohlcv(
    symbol: str,
    start: str | date,
    end: str | date,
    *,
    use_cache: bool = True,
) -> tuple[OHLCV, int]:
    """Return ``(OHLCV, start_index)`` — the first bar at/after ``start``.

    ``OHLCV`` includes ~300 warmup sessions before ``start`` so all indicators
    are valid from ``start_index`` onward. Raises ``ValueError`` if no data.
    """
    symbol = symbol.upper()
    start_d = _to_date(start)
    end_d = _to_date(end)
    cache_key = f"ta:ohlcv:{symbol}:{start_d.isoformat()}:{end_d.isoformat()}"

    records: list[dict] | None = None
    if use_cache:
        cached = await cache_get_json(cache_key)
        if isinstance(cached, list) and cached:
            records = cached
    if records is None:
        records = await _fetch_records(symbol, start_d, end_d)
        if use_cache and records:
            await cache_set_json(cache_key, records, _CACHE_TTL)

    if not records:
        raise ValueError(f"Không có dữ liệu giá cho mã {symbol}")

    data = OHLCV.from_records(records)
    start_iso = start_d.isoformat()
    start_index = next((i for i, t in enumerate(data.time) if t >= start_iso), len(data.time))
    return data, start_index
