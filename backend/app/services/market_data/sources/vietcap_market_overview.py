"""Vietcap Market Overview source connector.

Fetches market overview data from trading.vietcap.com.vn and iq.vietcap.com.vn.
No dependency on vnstock_*.

Numeric helpers:
- _to_int_amount(): for money (VND), shares, counts — uses Decimal, integer-only.
- _to_float_ratio(): for ratios, percent, impact points — float.

Exception hierarchy:
- MarketOverviewUpstreamShapeError → 502
- MarketOverviewUpstreamError → 503
"""

from __future__ import annotations

import logging
import time
from decimal import Decimal, InvalidOperation
from typing import Any

from app.services.market_data.http import fetch_json, get_headers

logger = logging.getLogger(__name__)

_TRADING_BASE = "https://trading.vietcap.com.vn"
_IQ_BASE = "https://iq.vietcap.com.vn"


# ── Enums ────────────────────────────────────────────

GROUPS = {"ALL", "HOSE", "HNX", "UPCOM"}
TIME_FRAMES_IMPACT = {"ONE_DAY", "ONE_WEEK", "ONE_MONTH", "YTD", "ONE_YEAR"}
TIME_FRAMES_LIQUIDITY = {
    "ONE_MINUTE", "ONE_DAY", "ONE_WEEK", "ONE_MONTH", "ONE_YEAR",
}
TIME_FRAMES_VALUATION = {
    "SIX_MONTHS", "YTD", "ONE_YEAR", "TWO_YEAR", "FIVE_YEAR", "ALL",
}
BREADTH_PERIODS = {"M6", "YTD", "Y1", "Y2", "Y5", "ALL"}
BREADTH_CONDITIONS = {"EMA50", "EMA20", "SMA50", "SMA200"}
VALUATION_TYPES = {"pe", "pb"}
COM_GROUP_CODES = {"VNINDEX", "HNX30", "VN30", "VNMIDCAP", "VNSMALLCAP", "VN100"}
HEATMAP_SECTORS = {"icb_code_1", "icb_code_2", "icb_code_3", "icb_code_4"}
HEATMAP_SIZES = {"MKC", "VOL", "VAL"}
LIQUIDITY_SYMBOLS = {"ALL", "VNINDEX", "HNXIndex", "HNXUpcomIndex"}
EXCHANGES_BREADTH = {"HSX", "HNX", "UPCOM"}


# ── Exceptions ───────────────────────────────────────

class MarketOverviewUpstreamShapeError(Exception):
    """Upstream returned data in unexpected shape."""


class MarketOverviewUpstreamError(Exception):
    """Upstream transport/connection failure."""


# ── Headers ──────────────────────────────────────────


def _trading_headers() -> dict[str, str]:
    h = get_headers("VCI")
    h["Accept"] = "application/json"
    h["Content-Type"] = "application/json"
    h["Referer"] = "https://trading.vietcap.com.vn/iq/market"
    return h


def _iq_headers() -> dict[str, str]:
    h = get_headers("VCI")
    h["Accept"] = "application/json"
    h["Referer"] = "https://trading.vietcap.com.vn/iq/market"
    return h


# ── Numeric helpers ──────────────────────────────────


def _to_int_amount(v: Any) -> int | None:
    """Convert to integer amount (VND, shares, counts).

    Accepts int, float with zero fractional, or numeric string like "50300.0".
    Returns None for null/empty/non-numeric.
    """
    if v is None:
        return None
    if isinstance(v, int) and not isinstance(v, bool):
        return v
    try:
        d = Decimal(str(v).strip())
        if d != d.to_integral_value():
            # Non-zero fractional — log and truncate
            logger.warning("_to_int_amount: truncating %s", v)
        return int(d)
    except (InvalidOperation, ValueError, TypeError):
        return None


def _to_float_ratio(v: Any) -> float | None:
    """Convert to float ratio/percent/impact.

    For fields like P/E value, percent, impact points.
    Returns None for null/empty/non-numeric.
    """
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    try:
        return float(str(v).strip())
    except (ValueError, TypeError):
        return None


# ── Transport helpers ────────────────────────────────


def _default_from_to() -> tuple[int, int]:
    """Default time range: 1 year back to now."""
    now = int(time.time())
    return now - 365 * 86400, now


async def _post_trading(
    path: str, body: dict[str, Any],
) -> tuple[Any, str]:
    url = f"{_TRADING_BASE}{path}"
    try:
        data = await fetch_json(
            url, method="POST", json_body=body,
            headers=_trading_headers(),
        )
    except Exception as exc:
        raise MarketOverviewUpstreamError(f"POST {path}: {exc}") from exc
    return data, url


async def _get_trading(
    path: str, params: dict[str, Any] | None = None,
) -> tuple[Any, str]:
    url = f"{_TRADING_BASE}{path}"
    try:
        data = await fetch_json(url, params=params, headers=_trading_headers())
    except Exception as exc:
        raise MarketOverviewUpstreamError(f"GET {path}: {exc}") from exc
    return data, url


async def _get_iq(
    path: str, params: dict[str, Any] | None = None,
) -> tuple[Any, str]:
    url = f"{_IQ_BASE}{path}"
    try:
        data = await fetch_json(url, params=params, headers=_iq_headers())
    except Exception as exc:
        raise MarketOverviewUpstreamError(f"GET {path}: {exc}") from exc
    return data, url


def _unwrap_iq(data: Any, url: str) -> Any:
    """Unwrap IQ API response: {status, successful, data}."""
    if not isinstance(data, dict):
        raise MarketOverviewUpstreamShapeError(
            f"Expected dict from {url}, got {type(data).__name__}",
        )
    if not data.get("successful"):
        raise MarketOverviewUpstreamShapeError(
            f"API unsuccessful: {data.get('msg', 'unknown')}",
        )
    return data.get("data")


def _require_dict(data: Any, label: str) -> dict[str, Any]:
    """Validate data is dict, raise shape error otherwise."""
    if not isinstance(data, dict):
        raise MarketOverviewUpstreamShapeError(
            f"Expected dict from {label}, got {type(data).__name__}",
        )
    return data


def _require_list(data: Any, label: str) -> list[Any]:
    """Validate data is list, raise shape error otherwise."""
    if not isinstance(data, list):
        raise MarketOverviewUpstreamShapeError(
            f"Expected list from {label}, got {type(data).__name__}",
        )
    return data


def _require_key(d: dict[str, Any], key: str, label: str) -> Any:
    """Validate required key exists in dict."""
    if key not in d:
        raise MarketOverviewUpstreamShapeError(
            f"Missing required key '{key}' in {label}",
        )
    return d[key]


# ── 1. Liquidity ─────────────────────────────────────


async def fetch_liquidity(
    *,
    symbols: str = "ALL",
    time_frame: str = "ONE_MINUTE",
    from_ts: int | None = None,
    to_ts: int | None = None,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch liquidity data.

    Units: accumulatedValue = million VND, accumulatedVolume = shares.
    """
    _from, _to = from_ts or _default_from_to()[0], to_ts or _default_from_to()[1]
    body = {
        "from": _from, "to": _to,
        "symbols": [symbols], "timeFrame": time_frame,
    }
    data, url = await _post_trading(
        "/api/chart/v3/OHLCChart/gap-liquidity", body,
    )
    items = _require_list(data, "liquidity")
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        result.append({
            "symbols": item.get("symbol", []),
            "timestamps": [_to_int_amount(t) for t in item.get("t", [])],
            "accumulated_volume": [
                _to_int_amount(v) for v in item.get("accumulatedVolume", [])
            ],
            "accumulated_value_million_vnd": [
                _to_float_ratio(v) for v in item.get("accumulatedValue", [])
            ],
            "min_batch_trunc_time": _to_int_amount(
                item.get("minBatchTruncTime"),
            ),
        })
    return result, url


# ── 2. Index Impact ──────────────────────────────────


def _norm_impact_item(i: dict[str, Any]) -> dict[str, Any]:
    return {
        "symbol": i.get("symbol", ""),
        "impact": _to_float_ratio(i.get("impact")),
        "exchange": i.get("exchange", ""),
        "company_name": i.get("organName", ""),
        "match_price": _to_int_amount(i.get("matchPrice")),
        "ref_price": _to_float_ratio(i.get("refPrice")),
    }


async def fetch_index_impact(
    *, group: str = "ALL", time_frame: str = "ONE_DAY",
) -> tuple[dict[str, Any], str]:
    """Fetch top index impact stocks. Units: impact = index points."""
    body = {"group": group, "timeFrame": time_frame}
    data, url = await _post_trading(
        "/api/market-watch/v2/IndexImpactChart/getData", body,
    )
    d = _require_dict(data, "index-impact")
    top_up_raw = _require_key(d, "topUp", "index-impact")
    top_down_raw = _require_key(d, "topDown", "index-impact")
    _require_list(top_up_raw, "index-impact.topUp")
    _require_list(top_down_raw, "index-impact.topDown")

    return {
        "top_up": [
            _norm_impact_item(i) for i in top_up_raw
            if isinstance(i, dict)
        ],
        "top_down": [
            _norm_impact_item(i) for i in top_down_raw
            if isinstance(i, dict)
        ],
        "group": group, "time_frame": time_frame,
    }, url


# ── 3. Foreign Trading ──────────────────────────────


async def fetch_foreign(
    *, group: str = "ALL", time_frame: str = "ONE_MONTH",
    from_ts: int | None = None, to_ts: int | None = None,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch foreign volume/value. Units: *Value = VND, *Volume = shares."""
    _from, _to = from_ts or _default_from_to()[0], to_ts or _default_from_to()[1]
    body = {"from": _from, "to": _to, "group": group, "timeFrame": time_frame}
    data, url = await _post_trading(
        "/api/market-watch/v3/ForeignVolumeChart/getAll", body,
    )
    items = _require_list(data, "foreign")
    return [
        {
            "trunc_time": _to_int_amount(i.get("truncTime")),
            "foreign_buy_volume": _to_int_amount(i.get("foreignBuyVolume")),
            "foreign_sell_volume": _to_int_amount(i.get("foreignSellVolume")),
            "foreign_buy_value_vnd": _to_int_amount(i.get("foreignBuyValue")),
            "foreign_sell_value_vnd": _to_int_amount(i.get("foreignSellValue")),
            "group": i.get("group", ""), "time_frame": i.get("timeFrame", ""),
        }
        for i in items if isinstance(i, dict)
    ], url


def _norm_foreign_top_item(i: dict[str, Any]) -> dict[str, Any]:
    return {
        "symbol": i.get("symbol", ""),
        "exchange": i.get("exchange", ""),
        "company_name": i.get("organName", ""),
        "net_value_vnd": _to_int_amount(i.get("net")),
        "buy_value_vnd": _to_int_amount(i.get("foreignBuyValue")),
        "sell_value_vnd": _to_int_amount(i.get("foreignSellValue")),
        "match_price": _to_int_amount(i.get("matchPrice")),
        "ref_price": _to_float_ratio(i.get("refPrice")),
    }


async def fetch_foreign_top(
    *, group: str = "ALL", time_frame: str = "ONE_YEAR",
    from_ts: int | None = None, to_ts: int | None = None,
) -> tuple[dict[str, Any], str]:
    """Fetch top foreign net buy/sell. Units: net/value = VND."""
    _from, _to = from_ts or _default_from_to()[0], to_ts or _default_from_to()[1]
    body = {"from": _from, "to": _to, "group": group, "timeFrame": time_frame}
    data, url = await _post_trading(
        "/api/market-watch/v3/ForeignNetValue/top", body,
    )
    d = _require_dict(data, "foreign/top")
    net_buy = _require_key(d, "netBuy", "foreign/top")
    net_sell = _require_key(d, "netSell", "foreign/top")
    _require_list(net_buy, "foreign/top.netBuy")
    _require_list(net_sell, "foreign/top.netSell")

    return {
        "net_buy": [_norm_foreign_top_item(i) for i in net_buy
                    if isinstance(i, dict)],
        "net_sell": [_norm_foreign_top_item(i) for i in net_sell
                     if isinstance(i, dict)],
        "total_net_buy_vnd": _to_int_amount(d.get("totalNetBuy")),
        "total_net_sell_vnd": _to_int_amount(d.get("totalNetSell")),
        "group": group,
    }, url


# ── 4. Proprietary Trading ──────────────────────────


async def fetch_proprietary(
    *, market: str = "ALL", time_frame: str = "ONE_YEAR",
) -> tuple[list[dict[str, Any]], str]:
    """Fetch proprietary trading data. Units: *Value = VND, *Volume = shares."""
    params = {"timeFrame": time_frame, "market": market}
    data, url = await _get_trading(
        "/api/fiin-api-service/v3/proprietary-trading-value", params,
    )
    inner = _unwrap_iq(data, url)
    inner = _require_dict(inner, "proprietary.data")
    items_raw = _require_key(inner, "data", "proprietary")
    items = _require_list(items_raw, "proprietary.data.data")
    return [
        {
            "trading_date": i.get("tradingDate", ""),
            "total_buy_value_vnd": _to_int_amount(i.get("totalBuyValue")),
            "total_sell_value_vnd": _to_int_amount(i.get("totalSellValue")),
            "total_buy_volume": _to_int_amount(i.get("totalBuyVolume")),
            "total_sell_volume": _to_int_amount(i.get("totalSellVolume")),
            "total_deal_buy_volume": _to_int_amount(i.get("totalDealBuyVolume")),
            "total_deal_sell_volume": _to_int_amount(i.get("totalDealSellVolume")),
        }
        for i in items if isinstance(i, dict)
    ], url


async def fetch_proprietary_top(
    *, exchange: str = "ALL", time_frame: str = "ONE_YEAR",
) -> tuple[dict[str, Any], str]:
    """Fetch top proprietary net buy/sell. Units: totalValue = VND."""
    params = {"timeFrame": time_frame, "exchange": exchange}
    data, url = await _get_iq(
        "/api/iq-insight-service/v1/market-watch/top-proprietary", params,
    )
    inner = _unwrap_iq(data, url)
    inner = _require_dict(inner, "proprietary/top")
    dd = _require_key(inner, "data", "proprietary/top")
    dd = _require_dict(dd, "proprietary/top.data")

    def _norm(i: dict[str, Any]) -> dict[str, Any]:
        return {
            "ticker": i.get("ticker", ""),
            "exchange": i.get("exchange", ""),
            "company_name": i.get("organName", ""),
            "total_value_vnd": _to_int_amount(i.get("totalValue")),
            "total_volume": _to_int_amount(i.get("totalVolume")),
            "match_price": _to_int_amount(i.get("matchPrice")),
            "ref_price": _to_float_ratio(i.get("refPrice")),
        }

    return {
        "buy": [_norm(i) for i in dd.get("BUY", []) if isinstance(i, dict)],
        "sell": [_norm(i) for i in dd.get("SELL", []) if isinstance(i, dict)],
        "trading_date": inner.get("tradingDate", ""),
    }, url


# ── 5. Market Allocation ────────────────────────────


async def fetch_allocation(
    *, group: str = "ALL", time_frame: str = "ONE_YEAR",
) -> tuple[list[dict[str, Any]], str]:
    """Fetch market allocation (up/down/flat). Units: values = VND."""
    body = {"group": group, "timeFrame": time_frame}
    data, url = await _post_trading(
        "/api/market-watch/AllocatedValue/getAllocatedValue", body,
    )
    items = _require_list(data, "allocation")
    results = []
    for block in items:
        if not isinstance(block, dict):
            continue
        entry: dict[str, Any] = {}
        for section_key in ("totalIncrease", "totalNochange", "totalDecrease",
                            "totalSymbolIncrease", "totalSymbolNochange",
                            "totalSymbolDecrease"):
            section_items = block.get(section_key, [])
            for item in (section_items if isinstance(section_items, list) else []):
                if isinstance(item, dict):
                    g = item.get("group", "")
                    for k, v in item.items():
                        if k != "group":
                            entry[f"{section_key}_{g}"] = _to_int_amount(v)
        results.append(entry)
    return results, url


# ── 6. Sector Allocation ────────────────────────────


async def fetch_sectors_allocation(
    *, group: str = "ALL", time_frame: str = "ONE_YEAR",
) -> tuple[list[dict[str, Any]], str]:
    """Fetch ICB sector allocation. Units: totalValue = VND."""
    body = {"group": group, "timeFrame": time_frame}
    data, url = await _post_trading(
        "/api/market-watch/AllocatedICB/getAllocated", body,
    )
    items = _require_list(data, "sectors")
    return [
        {
            "icb_code": _to_int_amount(i.get("icb_code")),
            "icb_change_percent": _to_float_ratio(i.get("icbChangePercent")),
            "total_value_vnd": _to_int_amount(i.get("totalValue")),
            "total_stock_increase": _to_int_amount(i.get("totalStockIncrease")),
            "total_stock_decrease": _to_int_amount(i.get("totalStockDecrease")),
            "total_stock_no_change": _to_int_amount(i.get("totalStockNoChange")),
            "icb_code_parent": i.get("icbCodeParent"),
        }
        for i in items if isinstance(i, dict)
    ], url


# ── 7. Valuation ────────────────────────────────────


async def fetch_valuation(
    *, val_type: str = "pe", com_group_code: str = "VNINDEX",
    time_frame: str = "ONE_YEAR",
) -> tuple[list[dict[str, Any]], str]:
    """Fetch P/E or P/B valuation. Units: value = ratio."""
    params = {
        "type": val_type, "comGroupCode": com_group_code,
        "timeFrame": time_frame,
    }
    data, url = await _get_trading(
        "/api/iq-insight-service/v1/market-watch/index-valuation", params,
    )
    inner = _unwrap_iq(data, url)
    inner = _require_dict(inner, "valuation")
    values_raw = _require_key(inner, "values", "valuation")
    values = _require_list(values_raw, "valuation.values")
    return [
        {"date": v.get("date", ""), "value": _to_float_ratio(v.get("value"))}
        for v in values if isinstance(v, dict)
    ], url


# ── 8. Market Breadth ───────────────────────────────


async def fetch_breadth(
    *, condition: str = "EMA50",
    exchange: str = "HSX,HNX,UPCOM",
    period: str = "Y1",
) -> tuple[list[dict[str, Any]], str]:
    """Fetch market breadth. Units: percent = 0-1 ratio, count/total = integer."""
    params = {
        "condition": condition, "exchange": exchange,
        "enNumberOfDays": period,
    }
    data, url = await _get_iq(
        "/api/iq-insight-service/v1/market-watch/breadth", params,
    )
    inner = _unwrap_iq(data, url)
    items = _require_list(inner, "breadth")
    return [
        {
            "condition": i.get("condition", ""),
            "count": _to_int_amount(i.get("count")),
            "total": _to_int_amount(i.get("total")),
            "percent": _to_float_ratio(i.get("percent")),
            "trading_date": i.get("tradingDate", ""),
        }
        for i in items if isinstance(i, dict)
    ], url


# ── 9. Heatmap ──────────────────────────────────────


async def fetch_heatmap(
    *, group: str = "ALL", sector: str = "icb_code_2", size: str = "MKC",
) -> tuple[list[dict[str, Any]], str]:
    """Fetch heatmap by ICB. Units: value = million VND, price/cap = VND."""
    body = {"group": group, "sector": sector, "size": size}
    data, url = await _post_trading(
        "/api/market-watch/HeatMapChart/getByIcb", body,
    )
    items = _require_list(data, "heatmap")
    result = []
    for sector_item in items:
        if not isinstance(sector_item, dict):
            continue
        stocks = []
        for s in sector_item.get("data", []):
            if not isinstance(s, dict):
                continue
            stocks.append({
                "symbol": s.get("symbol", ""),
                "volume": _to_int_amount(s.get("volume")),
                "value_million_vnd": _to_float_ratio(s.get("value")),
                "price": _to_int_amount(s.get("price")),
                "ref_price": _to_int_amount(s.get("refPrice")),
                "market_cap_vnd": _to_int_amount(s.get("marketCap")),
                "ceiling_price": _to_int_amount(s.get("ceilingPrice")),
                "floor_price": _to_int_amount(s.get("floorPrice")),
            })
        result.append({
            "icb_code": _to_int_amount(sector_item.get("icb_code")),
            "icb_name": sector_item.get("icb_name", ""),
            "en_icb_name": sector_item.get("en_icb_name", ""),
            "icb_change_percent": _to_float_ratio(
                sector_item.get("icbChangePercent"),
            ),
            "total_market_cap_vnd": _to_int_amount(
                sector_item.get("totalMarketCap"),
            ),
            "stocks": stocks,
        })
    return result, url


async def fetch_heatmap_index() -> tuple[dict[str, Any], str]:
    """Fetch heatmap index summary. Units: value = million VND, price = VND."""
    data, url = await _get_trading("/api/market-watch/HeatMapChart/getIndex")
    d = _require_dict(data, "heatmap/index")
    idx_data = _require_key(d, "indexData", "heatmap/index")
    _require_list(idx_data, "heatmap/index.indexData")

    return {
        "total_stock": _to_int_amount(d.get("totalStock")),
        "total_trading_volume": _to_int_amount(d.get("totalTradingVolume")),
        "total_trading_value_million_vnd": _to_float_ratio(
            d.get("totalTradingValue"),
        ),
        "total_foreign_buy_volume": _to_int_amount(d.get("totalFrBuyVolume")),
        "total_foreign_sell_volume": _to_int_amount(d.get("totalFrSellVolume")),
        "total_foreign_buy_value_vnd": _to_int_amount(d.get("totalFrBuyValue")),
        "total_foreign_sell_value_vnd": _to_int_amount(
            d.get("totalFrSellValue"),
        ),
        "index_data": [
            {
                "symbol": idx.get("symbol", ""),
                "price": _to_float_ratio(idx.get("price")),
                "ref_price": _to_float_ratio(idx.get("refPrice")),
            }
            for idx in idx_data if isinstance(idx, dict)
        ],
    }, url
