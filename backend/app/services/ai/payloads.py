"""Build JSON payloads for each AI analysis type.

Each builder function collects data from existing market-data services
and assembles a structured payload for the AI prompt.

All data fetching uses the internal market-data HTTP helpers / source modules.
No new external data sources are introduced.

Payload caching:
- Dashboard payload: cached 60s in Redis (key: iqx:ai:payload:dashboard:{lang})
- Industry payload: cached 600s in Redis (key: iqx:ai:payload:industry:{icb}:{lang})
- Redis down → fallback to uncached fetch, never crashes the API.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)

def _get_dashboard_ttl() -> int:
    """Get dashboard payload cache TTL from settings."""
    try:
        from app.core.config import get_settings
        return get_settings().REDIS_TTL_AI_DASHBOARD_SECONDS
    except Exception:
        return 60


def _get_industry_ttl() -> int:
    """Get industry payload cache TTL from settings."""
    try:
        from app.core.config import get_settings
        return get_settings().REDIS_TTL_AI_INDUSTRY_SECONDS
    except Exception:
        return 600


# ─── Cache helpers (fail-safe) ──────────────────────────


async def _cache_get(key: str) -> Any | None:
    """Get from Redis cache, returning None on miss or Redis unavailability."""
    try:
        from app.services.cache.redis_cache import cache_get_json
        return await cache_get_json(key)
    except Exception:
        logger.debug("AI payload cache GET failed for %s", key)
        return None


async def _cache_set(key: str, value: Any, ttl: int) -> None:
    """Set in Redis cache, silently failing on Redis unavailability."""
    try:
        from app.services.cache.redis_cache import cache_set_json
        await cache_set_json(key, value, ttl)
    except Exception:
        logger.debug("AI payload cache SET failed for %s", key)


# ─── Safe async fetch helper ────────────────────────────


async def _safe_fetch(
    label: str, coro: Any,
) -> tuple[str, Any]:
    """Execute a coroutine safely, returning (label, result|None).

    On exception, logs a warning and returns None for this source,
    so one failing source never crashes the entire payload build.
    """
    try:
        result = await coro
        return (label, result)
    except Exception as exc:
        logger.warning("Payload source '%s' failed: %s", label, exc)
        return (label, None)


# ═══════════════════════════════════════════════════════
# Dashboard Payload
# ═══════════════════════════════════════════════════════


async def build_dashboard_payload(*, language: str = "vi") -> dict[str, Any]:
    """Collect market overview data and assemble dashboard AI payload.

    Data sources:
    - /overview/market-index
    - /overview/liquidity
    - /overview/breadth
    - /overview/sectors/allocation
    - /overview/index-impact
    - /overview/foreign
    - /overview/foreign/top
    - /overview/proprietary
    - /overview/proprietary/top
    - /news/ai
    """
    # ── Check Redis cache ───────────────────────────
    cache_key = f"iqx:ai:payload:dashboard:{language}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        logger.debug("Dashboard payload cache HIT")
        return cached

    # ── Fetch all sources in parallel ───────────────
    from app.services.market_data.sources.vietcap_ai_news import fetch_news_list
    from app.services.market_data.sources.vietcap_market_overview import (
        fetch_breadth,
        fetch_foreign,
        fetch_foreign_top,
        fetch_index_impact,
        fetch_liquidity,
        fetch_market_index,
        fetch_proprietary,
        fetch_proprietary_top,
        fetch_sectors_allocation,
    )

    async def _fetch_news() -> tuple[list, int, str]:
        return await fetch_news_list("business", page=1, page_size=10)

    results = await asyncio.gather(
        _safe_fetch("market_index", fetch_market_index()),
        _safe_fetch("liquidity", fetch_liquidity(symbols="ALL", time_frame="ONE_MINUTE")),
        _safe_fetch("breadth", fetch_breadth(condition="EMA50", exchange="HSX,HNX,UPCOM", period="Y1")),
        _safe_fetch("sectors_allocation", fetch_sectors_allocation(group="ALL", time_frame="ONE_DAY")),
        _safe_fetch("index_impact", fetch_index_impact(group="ALL", time_frame="ONE_DAY")),
        _safe_fetch("foreign", fetch_foreign(group="ALL", time_frame="ONE_DAY")),
        _safe_fetch("foreign_top", fetch_foreign_top(group="ALL", time_frame="ONE_DAY")),
        _safe_fetch("proprietary", fetch_proprietary(market="ALL", time_frame="ONE_DAY")),
        _safe_fetch("proprietary_top", fetch_proprietary_top(exchange="ALL", time_frame="ONE_DAY")),
        _safe_fetch("news", _fetch_news()),
        return_exceptions=True,
    )

    payload: dict[str, Any] = {
        "as_of": datetime.now(UTC).isoformat(),
        "language": language,
    }

    for item in results:
        if isinstance(item, BaseException):
            logger.warning("Dashboard payload gather exception: %s", item)
            continue
        label, raw = item
        if label == "news":
            # News returns (items, total, url) or None
            payload["news"] = raw[0] if raw is not None else None
        else:
            # Standard sources return (data, url) or None
            payload[label] = raw[0] if raw is not None else None

    # ── Cache the payload ───────────────────────────
    await _cache_set(cache_key, payload, _get_dashboard_ttl())

    return payload


# ═══════════════════════════════════════════════════════
# Industry Payload
# ═══════════════════════════════════════════════════════


async def build_industry_payload(
    *, icb_code: int, language: str = "vi",
) -> dict[str, Any]:
    """Collect sector/industry data for AI industry analysis.

    Data sources:
    - /overview/sectors/detail?icb_code=...  (ONE_DAY, ONE_WEEK, ONE_MONTH)
    - /overview/sectors/allocation
    - /sectors/information
    - /sectors/ranking
    - /overview/stock-strength
    - /overview/market-index
    - /overview/foreign/top
    """
    # ── Check Redis cache ───────────────────────────
    cache_key = f"iqx:ai:payload:industry:{icb_code}:{language}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        logger.debug("Industry payload cache HIT for icb=%s", icb_code)
        return cached

    # ── Fetch all sources in parallel ───────────────
    from app.services.market_data.sources.vietcap_market_overview import (
        fetch_foreign_top,
        fetch_market_index,
        fetch_sector_detail,
        fetch_sectors_allocation,
        fetch_stock_strength,
    )
    from app.services.market_data.sources.vietcap_sector import (
        fetch_sector_information,
        fetch_sector_ranking,
    )

    results = await asyncio.gather(
        _safe_fetch("sector_detail_1d", fetch_sector_detail(group="ALL", time_frame="ONE_DAY", icb_code=icb_code)),
        _safe_fetch("sector_detail_1w", fetch_sector_detail(group="ALL", time_frame="ONE_WEEK", icb_code=icb_code)),
        _safe_fetch("sector_detail_1m", fetch_sector_detail(group="ALL", time_frame="ONE_MONTH", icb_code=icb_code)),
        _safe_fetch("sectors_allocation", fetch_sectors_allocation(group="ALL", time_frame="ONE_DAY")),
        _safe_fetch("sector_information", fetch_sector_information(icb_level=2)),
        _safe_fetch("sector_ranking", fetch_sector_ranking(icb_level=2, adtv=3, value=3)),
        _safe_fetch("stock_strength", fetch_stock_strength(exchange="ALL")),
        _safe_fetch("market_index", fetch_market_index(symbols=["VNINDEX"])),
        _safe_fetch("foreign_top", fetch_foreign_top(group="ALL", time_frame="ONE_DAY")),
        return_exceptions=True,
    )

    payload: dict[str, Any] = {
        "as_of": datetime.now(UTC).isoformat(),
        "icb_code": icb_code,
        "language": language,
    }

    for item in results:
        if isinstance(item, BaseException):
            logger.warning("Industry payload gather exception: %s", item)
            continue
        label, raw = item
        # Standard sources return (data, url) or None
        payload[label] = raw[0] if raw is not None else None

    # Derive summary fields from sector_detail_1d
    _enrich_industry_summary(payload)

    # ── Cache the payload ───────────────────────────
    await _cache_set(cache_key, payload, _get_industry_ttl())

    return payload


async def build_industry_payload_batch(
    *,
    icb_codes: list[int],
    language: str = "vi",
) -> dict[int, dict[str, Any]]:
    """Build industry payloads for multiple ICB codes efficiently.

    Shared data sources (sectors_allocation, sector_information, sector_ranking,
    stock_strength, market_index, foreign_top) are fetched once and reused
    across all requested sectors.

    Returns a dict mapping icb_code -> payload.
    """
    from app.services.market_data.sources.vietcap_market_overview import (
        fetch_foreign_top,
        fetch_market_index,
        fetch_sector_detail,
        fetch_sectors_allocation,
        fetch_stock_strength,
    )
    from app.services.market_data.sources.vietcap_sector import (
        fetch_sector_information,
        fetch_sector_ranking,
    )

    # ── Check cache for each code, collect misses ───
    result_map: dict[int, dict[str, Any]] = {}
    codes_to_fetch: list[int] = []

    for code in icb_codes:
        cache_key = f"iqx:ai:payload:industry:{code}:{language}"
        cached = await _cache_get(cache_key)
        if cached is not None:
            result_map[code] = cached
        else:
            codes_to_fetch.append(code)

    if not codes_to_fetch:
        return result_map

    # ── Fetch shared sources once ───────────────────
    shared_results = await asyncio.gather(
        _safe_fetch("sectors_allocation", fetch_sectors_allocation(group="ALL", time_frame="ONE_DAY")),
        _safe_fetch("sector_information", fetch_sector_information(icb_level=2)),
        _safe_fetch("sector_ranking", fetch_sector_ranking(icb_level=2, adtv=3, value=3)),
        _safe_fetch("stock_strength", fetch_stock_strength(exchange="ALL")),
        _safe_fetch("market_index", fetch_market_index(symbols=["VNINDEX"])),
        _safe_fetch("foreign_top", fetch_foreign_top(group="ALL", time_frame="ONE_DAY")),
        return_exceptions=True,
    )

    shared: dict[str, Any] = {}
    for item in shared_results:
        if isinstance(item, BaseException):
            continue
        label, raw = item
        shared[label] = raw[0] if raw is not None else None

    # ── Fetch per-sector detail in parallel ──────────
    detail_tasks = []
    for code in codes_to_fetch:
        for tf_label, tf_value in [("1d", "ONE_DAY"), ("1w", "ONE_WEEK"), ("1m", "ONE_MONTH")]:
            detail_tasks.append(
                _safe_fetch(
                    f"{code}:sector_detail_{tf_label}",
                    fetch_sector_detail(group="ALL", time_frame=tf_value, icb_code=code),
                )
            )

    detail_results = await asyncio.gather(*detail_tasks, return_exceptions=True)

    # Organise detail results by code
    details_by_code: dict[int, dict[str, Any]] = {c: {} for c in codes_to_fetch}
    for item in detail_results:
        if isinstance(item, BaseException):
            continue
        label, raw = item
        code_str, key = label.split(":", 1)
        code_int = int(code_str)
        details_by_code[code_int][key] = raw[0] if raw is not None else None

    # ── Assemble payloads ───────────────────────────
    now_iso = datetime.now(UTC).isoformat()
    for code in codes_to_fetch:
        payload: dict[str, Any] = {
            "as_of": now_iso,
            "icb_code": code,
            "language": language,
            **shared,
            **details_by_code.get(code, {}),
        }
        _enrich_industry_summary(payload)
        result_map[code] = payload

        # Cache each individual payload
        cache_key = f"iqx:ai:payload:industry:{code}:{language}"
        await _cache_set(cache_key, payload, _get_industry_ttl())

    return result_map


def _enrich_industry_summary(payload: dict[str, Any]) -> None:
    """Compute derived summary fields for the industry prompt.

    Works from sector_detail_1d data to compute:
    - sector_name, state, breadth, leaders, etc.
    """
    detail_1d = payload.get("sector_detail_1d")
    if not detail_1d or not isinstance(detail_1d, list):
        return

    stocks = detail_1d
    total = len(stocks)
    if total == 0:
        return

    # Count breadth
    up = sum(1 for s in stocks if _safe_float(s.get("dayChangePercent", 0)) > 0)
    down = sum(1 for s in stocks if _safe_float(s.get("dayChangePercent", 0)) < 0)
    flat = total - up - down

    payload["derived"] = {
        "total_stocks": total,
        "stocks_up": up,
        "stocks_down": down,
        "stocks_flat": flat,
        "breadth_pct": round(up / total * 100, 1) if total > 0 else 0,
    }


def _safe_float(v: Any) -> float:
    """Safely convert to float, returning 0.0 on failure."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# ═══════════════════════════════════════════════════════
# Insight Payload
# ═══════════════════════════════════════════════════════


async def build_insight_payload(
    *, symbol: str, language: str = "vi",
) -> dict[str, Any]:
    """Collect comprehensive stock data for AI insight analysis.

    Data sources:
    - /quotes/{symbol}/ohlcv
    - /trading/price-board
    - /quotes/{symbol}/intraday
    - /quotes/{symbol}/price-depth
    - /trading/{symbol}/history
    - /trading/{symbol}/summary
    - /trading/{symbol}/supply-demand
    - /trading/{symbol}/supply-demand/summary
    - /trading/{symbol}/foreign-trade
    - /trading/{symbol}/foreign-trade/summary
    - /trading/{symbol}/proprietary
    - /trading/{symbol}/proprietary/summary
    - /trading/{symbol}/insider-deals
    - /news/ai/tickers/{symbol}
    - /company/{symbol}/overview
    - /company/{symbol}/details
    """
    from app.services.market_data.sources import kbs, vietcap
    from app.services.market_data.sources.vietcap_ai_news import (
        fetch_news_detail,
        fetch_news_list,
    )

    sym = symbol.upper()
    payload: dict[str, Any] = {
        "as_of": datetime.now(UTC).isoformat(),
        "symbol": sym,
        "language": language,
    }

    # ── Parallel fetch for independent sources ──────
    async def _fetch_ohlcv():
        data, _ = await vietcap.fetch_ohlcv(
            sym, start_ts=0, end_ts=int(datetime.now(UTC).timestamp()),
            interval="1D",
        )
        return data[-30:] if isinstance(data, list) and len(data) > 30 else data

    async def _fetch_price_board():
        data, _ = await vietcap.fetch_price_board([sym])
        return data

    async def _fetch_intraday():
        data, _ = await vietcap.fetch_intraday(sym, page_size=100)
        return data

    async def _fetch_price_depth():
        data, _ = await vietcap.fetch_price_depth(sym)
        return data

    async def _fetch_trading_history():
        data, _ = await vietcap.fetch_trading_history(sym, resolution="1D", page=0, size=30)
        return data

    async def _fetch_trading_summary():
        data, _ = await vietcap.fetch_trading_summary(sym, resolution="1D")
        return data

    async def _fetch_foreign_trade():
        data, _ = await vietcap.fetch_foreign_trade(sym, size=30)
        return data

    async def _fetch_proprietary():
        data, _ = await vietcap.fetch_proprietary_history(sym, resolution="1D", page=0, size=30)
        return data

    async def _fetch_proprietary_summary():
        data, _ = await vietcap.fetch_proprietary_summary(sym, resolution="1D")
        return data

    async def _fetch_insider_deals():
        data, _ = await vietcap.fetch_insider_deals(sym, limit=30)
        return data

    async def _fetch_news():
        items, _total, _ = await fetch_news_list("business", page=1, page_size=10, ticker=sym)
        return items

    async def _fetch_company_overview():
        raw, url = await kbs.fetch_company_profile(sym)
        return kbs.normalize_overview(raw)

    async def _fetch_company_details():
        data, _ = await vietcap.fetch_company_details(sym)
        return data

    results = await asyncio.gather(
        _safe_fetch("ohlcv_30", _fetch_ohlcv()),
        _safe_fetch("price_board", _fetch_price_board()),
        _safe_fetch("intraday", _fetch_intraday()),
        _safe_fetch("price_depth", _fetch_price_depth()),
        _safe_fetch("trading_history", _fetch_trading_history()),
        _safe_fetch("trading_summary", _fetch_trading_summary()),
        _safe_fetch("foreign_trade", _fetch_foreign_trade()),
        _safe_fetch("proprietary", _fetch_proprietary()),
        _safe_fetch("proprietary_summary", _fetch_proprietary_summary()),
        _safe_fetch("insider_deals", _fetch_insider_deals()),
        _safe_fetch("news_raw", _fetch_news()),
        _safe_fetch("company_overview", _fetch_company_overview()),
        _safe_fetch("company_details", _fetch_company_details()),
        return_exceptions=True,
    )

    for item in results:
        if isinstance(item, BaseException):
            logger.warning("Insight payload gather exception: %s", item)
            continue
        label, raw = item
        payload[label] = raw

    # ── Post-process: supply-demand from trading_history ─
    trading_history = payload.get("trading_history")
    if isinstance(trading_history, list):
        payload["supply_demand"] = [_extract_supply_demand(item) for item in trading_history]
    else:
        payload["supply_demand"] = None

    # Supply-demand summary from trading_summary
    trading_summary = payload.get("trading_summary")
    if isinstance(trading_summary, dict):
        payload["supply_demand_summary"] = _extract_supply_demand(trading_summary)
        payload["foreign_trade_summary"] = _extract_foreign(trading_summary)
    else:
        payload["supply_demand_summary"] = None
        payload["foreign_trade_summary"] = None

    # ── News detail enrichment (sequential, top 3 only) ─
    news_raw = payload.pop("news_raw", None)
    if isinstance(news_raw, list) and news_raw:
        news_with_detail: list[dict[str, Any]] = []
        for news_item in news_raw[:3]:
            slug = news_item.get("slug") if isinstance(news_item, dict) else None
            if slug:
                try:
                    detail, _ = await fetch_news_detail(slug)
                    news_with_detail.append(detail)
                except Exception:
                    news_with_detail.append(news_item)
            else:
                news_with_detail.append(news_item)
        payload["news"] = news_with_detail
        if len(news_raw) > 3:
            payload["news_list"] = news_raw[3:]
    else:
        payload["news"] = None

    # Compute derived technical indicators
    _enrich_insight_derived(payload)

    return payload


_SUPPLY_DEMAND_PREFIXES = (
    "total_buy_trade",
    "total_sell_trade",
    "total_net_trade",
    "average_buy_trade",
    "average_sell_trade",
    "total_buy_unmatched",
    "total_sell_unmatched",
)


def _extract_supply_demand(record: dict[str, Any]) -> dict[str, Any]:
    """Extract supply-demand fields from a trading record."""
    filtered = {
        key: value
        for key, value in record.items()
        if key.startswith(_SUPPLY_DEMAND_PREFIXES)
    }
    if "trading_date" in record:
        return {"trading_date": record["trading_date"], **filtered}
    return filtered


def _extract_foreign(record: dict[str, Any]) -> dict[str, Any]:
    """Extract foreign trading fields from a summary record."""
    return {
        key: value
        for key, value in record.items()
        if key.startswith("foreign")
    }


def _enrich_insight_derived(payload: dict[str, Any]) -> None:
    """Compute technical indicators from OHLCV data.

    Calculates:
    - MA10, MA20 from close prices
    - VolMA10, VolMA20 from volumes
    - Current price/volume (P0, V0)
    - Support/Resistance via 5-bar pivot method
    """
    ohlcv = payload.get("ohlcv_30")
    if not ohlcv or not isinstance(ohlcv, list) or len(ohlcv) < 5:
        payload["derived"] = {"note": "Thiếu dữ liệu OHLCV để tính chỉ báo kỹ thuật"}
        return

    closes = [_safe_float(c.get("close", 0)) for c in ohlcv]
    volumes = [_safe_float(c.get("volume", 0)) for c in ohlcv]
    highs = [_safe_float(c.get("high", 0)) for c in ohlcv]
    lows = [_safe_float(c.get("low", 0)) for c in ohlcv]

    n = len(closes)
    derived: dict[str, Any] = {}

    # Current price & volume
    derived["P0"] = closes[-1] if closes else None
    derived["V0"] = volumes[-1] if volumes else None

    # Moving averages
    if n >= 10:
        derived["MA10"] = round(sum(closes[-10:]) / 10, 2)
        derived["VolMA10"] = round(sum(volumes[-10:]) / 10, 0)
    if n >= 20:
        derived["MA20"] = round(sum(closes[-20:]) / 20, 2)
        derived["VolMA20"] = round(sum(volumes[-20:]) / 20, 0)

    # 5-bar pivot support/resistance
    pivots_high: list[dict[str, Any]] = []
    pivots_low: list[dict[str, Any]] = []
    for i in range(2, n - 2):
        # Pivot High
        if highs[i] > max(highs[i - 2], highs[i - 1], highs[i + 1], highs[i + 2]):
            pivots_high.append({"index": i, "price": highs[i], "volume": volumes[i]})
        # Pivot Low
        if lows[i] < min(lows[i - 2], lows[i - 1], lows[i + 1], lows[i + 2]):
            pivots_low.append({"index": i, "price": lows[i], "volume": volumes[i]})

    p0 = closes[-1]

    # Resistance: pivot highs above P0
    resistances = [ph for ph in pivots_high if ph["price"] > p0]
    if resistances:
        r1 = min(resistances, key=lambda x: x["price"])
        derived["R1"] = r1["price"]
    elif pivots_high:
        derived["R1"] = max(ph["price"] for ph in pivots_high)

    # Support: pivot lows below P0
    supports = [pl for pl in pivots_low if pl["price"] < p0]
    if supports:
        s1 = max(supports, key=lambda x: x["price"])
        derived["S1"] = s1["price"]
    elif pivots_low:
        derived["S1"] = min(pl["price"] for pl in pivots_low)

    # Supply-demand labels
    _label_supply_demand(payload, derived)

    payload["derived"] = derived


def _label_supply_demand(payload: dict[str, Any], derived: dict[str, Any]) -> None:
    """Add supply-demand labels (cao/bình thường/thấp) by comparing with 30-session averages."""
    sd_history = payload.get("supply_demand")
    if not sd_history or not isinstance(sd_history, list) or len(sd_history) < 5:
        return

    # Compute average buy/sell volumes over history
    buy_vols = [_safe_float(r.get("total_buy_trade_volume", 0)) for r in sd_history]
    sell_vols = [_safe_float(r.get("total_sell_trade_volume", 0)) for r in sd_history]

    avg_buy = sum(buy_vols) / len(buy_vols) if buy_vols else 0
    avg_sell = sum(sell_vols) / len(sell_vols) if sell_vols else 0

    latest = sd_history[-1] if sd_history else {}
    current_buy = _safe_float(latest.get("total_buy_trade_volume", 0))
    current_sell = _safe_float(latest.get("total_sell_trade_volume", 0))

    derived["supply_demand_labels"] = {
        "buy_level": _classify_level(current_buy, avg_buy),
        "sell_level": _classify_level(current_sell, avg_sell),
    }


def _classify_level(current: float, average: float) -> str:
    """Classify a value as cao/bình thường/thấp compared to its average."""
    if average <= 0:
        return "chưa đủ dữ liệu"
    ratio = current / average
    if ratio >= 1.3:
        return "cao"
    if ratio >= 0.8:
        return "bình thường"
    return "thấp"


def payload_to_json(payload: dict[str, Any]) -> str:
    """Serialize payload to compact JSON for the AI request."""
    return json.dumps(payload, ensure_ascii=False, default=str)
