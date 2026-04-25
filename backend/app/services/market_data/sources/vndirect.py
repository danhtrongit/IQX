"""VNDIRECT data source connector.

Upstream APIs:
- Chart: https://dchart-api.vndirect.com.vn/
- Insights: https://api-finfo.vndirect.com.vn/v4/
"""

from __future__ import annotations

from typing import Any

from app.services.market_data.http import fetch_json, get_headers

_SOURCE = "VND"
_CHART_BASE = "https://dchart-api.vndirect.com.vn"
_INSIGHT_BASE = "https://api-finfo.vndirect.com.vn/v4"

# Interval mapping (from vnstock_data/explorer/vnd/const.py)
INTERVAL_MAP = {
    "1m": "1",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1H": "60",
    "1D": "D",
    "1W": "W",
    "1M": "M",
}

_INDEX_MAP = {
    "VNINDEX": "VNIndex",
    "HNX": "HNX",
    "VN30": "VN30",
}

_TOP_STOCK_COLS = {
    "code": "symbol",
    "index": "index",
    "lastPrice": "last_price",
    "lastUpdated": "last_updated",
    "priceChgCr1D": "price_change_1d",
    "priceChgPctCr1D": "price_change_pct_1d",
    "accumulatedVal": "accumulated_value",
    "nmVolumeAvgCr20D": "avg_volume_20d",
    "nmVolNmVolAvg20DPctCr": "volume_spike_20d_pct",
}


# ══════════════════════════════════════════════════════
# Reference data (listing)
# ══════════════════════════════════════════════════════


async def fetch_symbols(
    exchange: str = "HOSE,HNX,UPCOM",
) -> tuple[list[dict[str, Any]], str]:
    """Fetch stock listing from VNDIRECT."""
    url = f"{_INSIGHT_BASE}/stocks?q=type:stock,ifc~floor:{exchange}&size=9999"
    headers = get_headers(_SOURCE)
    raw = await fetch_json(url, headers=headers, source=_SOURCE)

    records: list[dict[str, Any]] = []
    items = raw.get("data", []) if isinstance(raw, dict) else raw
    for item in items:
        records.append(
            {
                "symbol": item.get("code", ""),
                "name": item.get("companyName", ""),
                "exchange": item.get("floor", ""),
                "asset_type": item.get("type", "").lower() if item.get("type") else None,
            }
        )

    return records, url


# ══════════════════════════════════════════════════════
# OHLCV quotes
# ══════════════════════════════════════════════════════


async def fetch_ohlcv(
    symbol: str,
    *,
    start_ts: int,
    end_ts: int,
    interval: str = "1D",
) -> tuple[list[dict[str, Any]], str]:
    """Fetch OHLCV data from VNDIRECT dchart API."""
    resolution = INTERVAL_MAP.get(interval, "D")
    url = (
        f"{_CHART_BASE}/dchart/history"
        f"?resolution={resolution}&symbol={symbol.upper()}"
        f"&from={start_ts}&to={end_ts}"
    )
    headers = get_headers(_SOURCE)
    data = await fetch_json(url, headers=headers, source=_SOURCE)

    records: list[dict[str, Any]] = []
    if isinstance(data, dict):
        times = data.get("t", [])
        opens = data.get("o", [])
        highs = data.get("h", [])
        lows = data.get("l", [])
        closes = data.get("c", [])
        volumes = data.get("v", [])

        for i in range(len(times)):
            records.append(
                {
                    "time": times[i],
                    "open": opens[i] if i < len(opens) else 0,
                    "high": highs[i] if i < len(highs) else 0,
                    "low": lows[i] if i < len(lows) else 0,
                    "close": closes[i] if i < len(closes) else 0,
                    "volume": volumes[i] if i < len(volumes) else 0,
                }
            )

    return records, url


# ══════════════════════════════════════════════════════
# Insights / Rankings
# ══════════════════════════════════════════════════════


async def fetch_top_stocks(
    kind: str,
    *,
    index: str = "VNINDEX",
    limit: int = 10,
    date: str | None = None,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch top stock rankings from VNDIRECT.

    kind: gainer, loser, value, volume, deal, foreign-buy, foreign-sell
    """
    idx = _INDEX_MAP.get(index.upper(), "VNIndex")
    headers = get_headers(_SOURCE)

    url_map: dict[str, str] = {
        "gainer": (
            f"{_INSIGHT_BASE}/top_stocks"
            f"?q=index:{idx}~nmVolumeAvgCr20D:gte:10000~priceChgPctCr1D:gt:0"
            f"&size={limit}&sort=priceChgPctCr1D"
        ),
        "loser": (
            f"{_INSIGHT_BASE}/top_stocks"
            f"?q=index:{idx}~nmVolumeAvgCr20D:gte:10000~priceChgPctCr1D:lt:0"
            f"&size={limit}&sort=priceChgPctCr1D:asc"
        ),
        "value": (
            f"{_INSIGHT_BASE}/top_stocks"
            f"?q=index:{idx}~accumulatedVal:gt:0"
            f"&size={limit}&sort=accumulatedVal"
        ),
        "volume": (
            f"{_INSIGHT_BASE}/top_stocks"
            f"?q=index:{idx}~nmVolumeAvgCr20D:gte:10000~nmVolNmVolAvg20DPctCr:gte:100"
            f"&size={limit}&sort=nmVolNmVolAvg20DPctCr"
        ),
        "deal": (
            f"{_INSIGHT_BASE}/top_stocks"
            f"?size={limit}&q=index:{idx}~nmVolumeAvgCr20D:gte:10000"
            f"&sort=ptVolTotalVolAvg20DPctCr"
        ),
    }

    # Foreign buy/sell use a different endpoint
    if kind == "foreign-buy":
        trading_date = date or ""
        url = (
            f"{_INSIGHT_BASE}/foreigns"
            f"?q=type:STOCK,IFC,ETF~netVal:gt:0~tradingDate:{trading_date}"
            f"&sort=tradingDate~netVal:desc&size={limit}"
            f"&fields=code,netVal,tradingDate"
        )
        raw = await fetch_json(url, headers=headers, source=_SOURCE)
        records = _normalize_foreign(raw)
        return records, url

    if kind == "foreign-sell":
        trading_date = date or ""
        url = (
            f"{_INSIGHT_BASE}/foreigns"
            f"?q=type:STOCK,IFC,ETF~netVal:lt:0~tradingDate:{trading_date}"
            f"&sort=tradingDate~netVal:asc&size={limit}"
            f"&fields=code,netVal,tradingDate"
        )
        raw = await fetch_json(url, headers=headers, source=_SOURCE)
        records = _normalize_foreign(raw)
        return records, url

    url = url_map.get(kind, "")
    if not url:
        msg = f"Unknown ranking kind: {kind}"
        raise ValueError(msg)

    raw = await fetch_json(url, headers=headers, source=_SOURCE)
    records = _normalize_top_stocks(raw)
    return records, url


def _normalize_top_stocks(raw: dict[str, Any]) -> list[dict[str, Any]]:
    items = raw.get("data", []) if isinstance(raw, dict) else []
    records: list[dict[str, Any]] = []
    for item in items:
        record: dict[str, Any] = {}
        for src_key, dst_key in _TOP_STOCK_COLS.items():
            if src_key in item:
                record[dst_key] = item[src_key]
        records.append(record)
    return records


def _normalize_foreign(raw: dict[str, Any]) -> list[dict[str, Any]]:
    items = raw.get("data", []) if isinstance(raw, dict) else []
    records: list[dict[str, Any]] = []
    for item in items:
        records.append(
            {
                "symbol": item.get("code", ""),
                "date": item.get("tradingDate", ""),
                "net_value": item.get("netVal", 0),
            }
        )
    return records
