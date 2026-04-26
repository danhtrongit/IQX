"""Vietcap Sector (IQ Insight) source connector.

Fetches sector ranking and sector information data from iq.vietcap.com.vn.

Upstream APIs:
- Sector ranking trading dates: GET .../sector-ranking/trading-date
- Sector ranking scores:        GET .../sector-ranking/sectors
- Sector information:           GET .../sector-information

Exception hierarchy:
- SectorUpstreamShapeError → 502
- SectorUpstreamError      → 503
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.market_data.http import fetch_json, get_headers

logger = logging.getLogger(__name__)

_IQ_BASE = "https://iq.vietcap.com.vn/api/iq-insight-service"

# ── Enums ────────────────────────────────────────────

ICB_LEVELS = {1, 2, 3, 4}
ADTV_VALUES = {1, 3, 6}
VALUE_THRESHOLDS = {3, 5, 10}


# ── Exceptions ───────────────────────────────────────


class SectorUpstreamShapeError(Exception):
    """Upstream returned data in unexpected shape."""


class SectorUpstreamError(Exception):
    """Upstream transport/connection failure."""


# ── Headers ──────────────────────────────────────────


def _iq_headers() -> dict[str, str]:
    h = get_headers("VCI")
    h["Accept"] = "application/json"
    h["Referer"] = "https://trading.vietcap.com.vn/iq/sector"
    return h


# ── Shape validators ────────────────────────────────


def _unwrap(data: Any, url: str) -> Any:
    """Unwrap IQ API response: {status, successful, data}."""
    if not isinstance(data, dict):
        raise SectorUpstreamShapeError(
            f"Expected dict from {url}, got {type(data).__name__}",
        )
    if not data.get("successful"):
        raise SectorUpstreamShapeError(
            f"API unsuccessful: {data.get('msg', 'unknown')}",
        )
    return data.get("data")


def _require_list(data: Any, label: str) -> list[Any]:
    if not isinstance(data, list):
        raise SectorUpstreamShapeError(
            f"Expected list from {label}, got {type(data).__name__}",
        )
    return data


# ── Transport ────────────────────────────────────────


async def _get_iq(
    path: str, params: dict[str, Any] | None = None,
) -> tuple[Any, str]:
    url = f"{_IQ_BASE}{path}"
    try:
        data = await fetch_json(url, params=params, headers=_iq_headers())
    except Exception as exc:
        raise SectorUpstreamError(f"GET {path}: {exc}") from exc
    return data, url


# ── Numeric helpers ──────────────────────────────────


def _to_float(v: Any) -> float | None:
    """Convert to float. Returns None for null/non-numeric."""
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    try:
        return float(str(v).strip())
    except (ValueError, TypeError):
        return None


def _to_int(v: Any) -> int | None:
    """Convert to int. Returns None for null/non-numeric."""
    if v is None:
        return None
    if isinstance(v, int) and not isinstance(v, bool):
        return v
    try:
        return int(float(str(v).strip()))
    except (ValueError, TypeError):
        return None


# ══════════════════════════════════════════════════════
# 1. Trading Dates
# ══════════════════════════════════════════════════════


async def fetch_trading_dates() -> tuple[list[str], str]:
    """Fetch last 20 trading dates for sector ranking heatmap.

    Returns list of date strings (YYYY-MM-DD) sorted descending.
    """
    data, url = await _get_iq("/v1/sector-ranking/trading-date")
    inner = _unwrap(data, url)
    dates = _require_list(inner, "trading-date")
    return [str(d) for d in dates if isinstance(d, str)], url


# ══════════════════════════════════════════════════════
# 2. Sector Ranking Scores
# ══════════════════════════════════════════════════════


async def fetch_sector_ranking(
    *,
    icb_level: int = 2,
    adtv: int = 3,
    value: int = 3,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch sector ranking scores (strength score per sector per day).

    Each sector returns 20 daily scores.
    Fields per value entry: date, value (0-100 int),
    optional sectorTrend (UP/DOWN), extremeValue, trendStartValue.
    """
    params = {"icbLevel": icb_level, "adtv": adtv, "value": value}
    data, url = await _get_iq("/v1/sector-ranking/sectors", params)
    inner = _unwrap(data, url)
    items = _require_list(inner, "sector-ranking")

    result: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        values = item.get("values", [])
        norm_values: list[dict[str, Any]] = []
        for v in values:
            if not isinstance(v, dict):
                continue
            entry: dict[str, Any] = {
                "date": v.get("date", ""),
                "value": _to_int(v.get("value")),
            }
            if "sectorTrend" in v:
                entry["sector_trend"] = v["sectorTrend"]
            if "extremeValue" in v:
                entry["extreme_value"] = _to_int(v["extremeValue"])
            if "trendStartValue" in v:
                entry["trend_start_value"] = _to_int(v["trendStartValue"])
            norm_values.append(entry)
        result.append({
            "icb_code": item.get("name", ""),
            "values": norm_values,
        })
    return result, url


# ══════════════════════════════════════════════════════
# 3. Sector Information
# ══════════════════════════════════════════════════════


async def fetch_sector_information(
    *,
    icb_level: int = 2,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch sector information (market cap, price changes, sparkline).

    Returns list of sectors with market cap, percent changes, and 20-day index.
    """
    params = {"icbLevel": icb_level}
    data, url = await _get_iq("/v1/sector-information", params)
    inner = _unwrap(data, url)
    items = _require_list(inner, "sector-information")

    result: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        last20 = item.get("last20DayIndex", [])
        result.append({
            "icb_code": item.get("icbCode", ""),
            "market_cap": _to_int(item.get("marketCap")),
            "last_close_index": _to_float(item.get("lastCloseIndex")),
            "last_20_day_index": [
                _to_float(v) for v in last20
            ] if isinstance(last20, list) else [],
            "percent_price_change_1d": _to_float(item.get("percentPriceChange1Day")),
            "percent_price_change_1w": _to_float(item.get("percentPriceChange1Week")),
            "percent_price_change_1m": _to_float(item.get("percentPriceChange1Month")),
            "percent_price_change_6m": _to_float(item.get("percentPriceChange6Month")),
            "percent_price_change_ytd": _to_float(item.get("percentPriceChangeYTD")),
            "percent_price_change_1y": _to_float(item.get("percentPriceChange1Year")),
            "percent_price_change_2y": _to_float(item.get("percentPriceChange2Year")),
            "percent_price_change_5y": _to_float(item.get("percentPriceChange5Year")),
        })
    return result, url
