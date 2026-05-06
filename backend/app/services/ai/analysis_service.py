"""AI analysis service — orchestrates prompt loading, payload building, and proxy calls.

Provides three high-level functions:
- analyze_dashboard()
- analyze_industry(icb_code, language)
- analyze_insight(symbol, language)

Each function:
1. Checks Redis cache for a previous result.
2. Loads the appropriate prompt from docs/ai/.
3. Builds the data payload from market-data services.
4. Sends the prompt + payload to the AI proxy.
5. Caches the result in Redis.
6. Returns a structured response dict.

Cache keys:
- iqx:ai:analysis:dashboard:{language}
- iqx:ai:analysis:industry:{icb_code}:{language}
- iqx:ai:analysis:insight:{symbol}:{language}
TTL: REDIS_TTL_AI_ANALYSIS_SECONDS (default 1800 = 30 min)
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from app.services.ai.payloads import (
    build_dashboard_payload,
    build_industry_payload,
    build_insight_payload,
    payload_to_json,
)
from app.services.ai.prompt_loader import load_prompt
from app.services.ai.proxy_client import chat_completion

logger = logging.getLogger(__name__)


def _analysis_cache_key(analysis_type: str, identifier: str, language: str) -> str:
    """Build Redis cache key for a final AI analysis result."""
    return f"iqx:ai:analysis:{analysis_type}:{identifier}:{language}"


def _get_analysis_ttl() -> int:
    """Get TTL for AI analysis cache from settings."""
    try:
        from app.core.config import get_settings
        return get_settings().REDIS_TTL_AI_ANALYSIS_SECONDS
    except Exception:
        return 1800  # 30 min default


async def _cache_get_analysis(key: str) -> dict[str, Any] | None:
    """Retrieve cached AI analysis from Redis. Returns None on miss."""
    try:
        from app.services.cache.redis_cache import cache_get_json
        return await cache_get_json(key)
    except Exception:
        return None


async def _cache_set_analysis(key: str, value: dict[str, Any]) -> None:
    """Store AI analysis result in Redis cache."""
    try:
        from app.services.cache.redis_cache import cache_set_json
        await cache_set_json(key, value, _get_analysis_ttl())
    except Exception:
        logger.warning("Failed to cache AI analysis for key=%s", key, exc_info=True)


async def analyze_dashboard(
    *, language: str = "vi", include_payload: bool = False,
) -> dict[str, Any]:
    """Run dashboard AI analysis.

    Checks Redis cache first; on miss, runs AI and caches the result.

    Returns:
        Structured response with analysis text and metadata.
    """
    cache_key = _analysis_cache_key("dashboard", "all", language)

    # ── Check cache ────────────────────────────────
    cached = await _cache_get_analysis(cache_key)
    if cached and "analysis" in cached:
        logger.debug("AI dashboard analysis cache HIT: %s", cache_key)
        if include_payload:
            payload = await build_dashboard_payload(language=language)
            cached["payload"] = payload
        return cached

    # ── Run AI ─────────────────────────────────────
    prompt = load_prompt("dashboard")
    payload = await build_dashboard_payload(language=language)
    payload_json = payload_to_json(payload)

    analysis_text, model_used = await chat_completion(
        system_prompt=prompt,
        user_content=payload_json,
    )

    result: dict[str, Any] = {
        "type": "dashboard",
        "input": {"language": language},
        "analysis": analysis_text,
        "model": model_used,
        "as_of": datetime.now(UTC).isoformat(),
    }

    # Cache result (without payload to keep cache small)
    await _cache_set_analysis(cache_key, result)

    if include_payload:
        result["payload"] = payload

    return result


async def analyze_industry(
    *, icb_code: int, language: str = "vi", include_payload: bool = False,
) -> dict[str, Any]:
    """Run industry AI analysis for a specific ICB sector.

    Checks Redis cache first; on miss, runs AI and caches the result.
    The same cache key is shared between single and batch endpoints.

    Args:
        icb_code: ICB industry code (e.g. 8300, 9500).
        language: Output language.
        include_payload: Whether to include the raw data payload in response.

    Returns:
        Structured response with analysis text and metadata.
    """
    cache_key = _analysis_cache_key("industry", str(icb_code), language)

    # ── Check cache ────────────────────────────────
    cached = await _cache_get_analysis(cache_key)
    if cached and "analysis" in cached:
        logger.debug("AI industry analysis cache HIT: %s", cache_key)
        if include_payload:
            payload = await build_industry_payload(icb_code=icb_code, language=language)
            cached["payload"] = payload
        return cached

    # ── Run AI ─────────────────────────────────────
    prompt = load_prompt("industry")
    payload = await build_industry_payload(icb_code=icb_code, language=language)
    payload_json = payload_to_json(payload)

    analysis_text, model_used = await chat_completion(
        system_prompt=prompt,
        user_content=payload_json,
    )

    result: dict[str, Any] = {
        "type": "industry",
        "input": {"icb_code": icb_code, "language": language},
        "analysis": analysis_text,
        "model": model_used,
        "as_of": datetime.now(UTC).isoformat(),
    }

    # Cache result (without payload to keep cache small)
    await _cache_set_analysis(cache_key, result)

    if include_payload:
        result["payload"] = payload

    return result


async def analyze_insight(
    *, symbol: str, language: str = "vi", include_payload: bool = False,
) -> dict[str, Any]:
    """Run stock insight AI analysis for a specific symbol.

    Returns structured JSON matching the frontend InsightResponse interface:
    { symbol, timestamp, layers, rawInput, dataSummary, summary }
    """
    import json as _json
    import re

    sym = symbol.upper()

    # ── Check cache ────────────────────────────────
    cache_key = _analysis_cache_key("insight", sym, language)
    cached = await _cache_get_analysis(cache_key)
    if cached and "layers" in cached:
        logger.debug("AI insight analysis cache HIT: %s", cache_key)
        return cached

    # ── Build payload & call AI ────────────────────
    prompt = load_prompt("insight")
    payload = await build_insight_payload(symbol=sym, language=language)
    payload_json = payload_to_json(payload)

    analysis_text, model_used = await chat_completion(
        system_prompt=prompt,
        user_content=payload_json,
    )

    # ── Parse structured JSON from AI response ─────
    # Strip markdown code fences if present
    cleaned = analysis_text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    try:
        ai_json = _json.loads(cleaned)
    except _json.JSONDecodeError:
        logger.warning("AI insight returned non-JSON, wrapping as text")
        ai_json = {
            "layers": {
                "trend": {"label": "Xu hướng", "output": {"text": analysis_text}},
                "liquidity": {"label": "Thanh khoản", "output": {}},
                "moneyFlow": {"label": "Dòng tiền", "output": {}},
                "insider": {"label": "Nội bộ", "output": {}},
                "news": {"label": "Tin tức", "output": {}},
                "decision": {"label": "Tổng hợp & Hành động", "output": {"Tổng quan": analysis_text}},
            },
            "summary": {"trend": "—", "state": "—", "action": "—", "confidence": 0, "reversalProbability": 0},
        }

    layers = ai_json.get("layers", {})
    summary = ai_json.get("summary", {})

    # ── Build rawInput from payload ────────────────
    raw_input = _build_raw_input(payload)

    # ── Assemble final response ────────────────────
    now_str = datetime.now(UTC).isoformat()
    result: dict[str, Any] = {
        "symbol": sym,
        "timestamp": now_str,
        "layers": layers,
        "rawInput": raw_input,
        "dataSummary": {
            "model": model_used,
            "as_of": now_str,
        },
        "summary": summary,
    }

    # Cache result (without large payload)
    await _cache_set_analysis(cache_key, result)

    if include_payload:
        result["payload"] = payload

    return result


def _build_raw_input(payload: dict[str, Any]) -> dict[str, Any]:
    """Extract rawInput structure from the payload for frontend display."""
    derived = payload.get("derived", {})
    ohlcv = payload.get("ohlcv_30", [])
    price_board = payload.get("price_board")

    # Realtime data from price_board
    realtime = None
    if isinstance(price_board, list) and price_board:
        pb = price_board[0]
        realtime = {
            "price": pb.get("matchedPrice") or pb.get("close") or derived.get("P0"),
            "volume": pb.get("totalVolume") or pb.get("nmTotalTradedQty") or derived.get("V0"),
            "high": pb.get("high") or pb.get("highPrice"),
            "low": pb.get("low") or pb.get("lowPrice"),
            "ref": pb.get("refPrice") or pb.get("referencePrice"),
        }

    # OHLCV for chart
    ohlcv_clean = []
    if isinstance(ohlcv, list):
        for bar in ohlcv:
            ohlcv_clean.append({
                "date": bar.get("tradingDate") or bar.get("date") or bar.get("t"),
                "open": bar.get("open") or bar.get("o"),
                "high": bar.get("high") or bar.get("h"),
                "low": bar.get("low") or bar.get("l"),
                "close": bar.get("close") or bar.get("c"),
                "volume": bar.get("volume") or bar.get("v"),
            })

    # Computed indicators
    computed = {
        "ma10": derived.get("MA10", 0),
        "ma20": derived.get("MA20", 0),
        "volMa10": derived.get("VolMA10", 0),
        "volMa20": derived.get("VolMA20", 0),
        "latestClose": derived.get("P0", 0),
    }

    # Liquidity
    supply_demand = payload.get("supply_demand")
    sd_summary = payload.get("supply_demand_summary")
    liquidity_history = []
    if isinstance(supply_demand, list):
        for sd in supply_demand[-10:]:
            liquidity_history.append({
                "date": sd.get("trading_date"),
                "buyUnmatchedVolume": sd.get("total_buy_unmatched_volume", 0),
                "sellUnmatchedVolume": sd.get("total_sell_unmatched_volume", 0),
                "totalVolume": sd.get("total_buy_trade_volume", 0) + sd.get("total_sell_trade_volume", 0),
                "buyTradeVolume": sd.get("total_buy_trade_volume", 0),
                "sellTradeVolume": sd.get("total_sell_trade_volume", 0),
                "buyTradeCount": sd.get("total_buy_trade_count", 0),
                "sellTradeCount": sd.get("total_sell_trade_count", 0),
            })

    liquidity_latest = liquidity_history[-1] if liquidity_history else None
    liquidity_avg = None
    if liquidity_history and len(liquidity_history) >= 3:
        keys = ["buyUnmatchedVolume", "sellUnmatchedVolume", "totalVolume"]
        avg: dict[str, Any] = {}
        for k in keys:
            vals = [h.get(k, 0) for h in liquidity_history]
            avg[k] = sum(vals) / len(vals) if vals else 0
        liquidity_avg = avg

    # Money flow
    foreign_trade = payload.get("foreign_trade", [])
    proprietary = payload.get("proprietary", [])

    def _normalize_flow(items: Any) -> list:
        if not isinstance(items, list):
            return []
        result = []
        for item in items[-15:]:
            result.append({
                "date": item.get("tradingDate") or item.get("date") or item.get("trading_date"),
                "matchNetVolume": item.get("matchNetVolume") or item.get("match_net_volume") or item.get("netVolume", 0),
                "dealNetVolume": item.get("dealNetVolume") or item.get("deal_net_volume", 0),
                "totalNetVolume": item.get("totalNetVolume") or item.get("total_net_volume") or item.get("netVolume", 0),
            })
        return result

    # Insider
    insider_deals = payload.get("insider_deals", [])
    insider_txns = []
    if isinstance(insider_deals, list):
        for deal in insider_deals[:15]:
            insider_txns.append({
                "action": deal.get("action") or deal.get("dealType") or deal.get("transactionType"),
                "shareRegistered": deal.get("shareRegistered") or deal.get("volumeRegistered", 0),
                "shareExecuted": deal.get("shareExecuted") or deal.get("volumeExecuted", 0),
                "startDate": deal.get("startDate") or deal.get("fromDate") or deal.get("transactionDate"),
            })

    # News
    news_items = payload.get("news", [])
    ticker_score = None
    clean_news = []
    if isinstance(news_items, list):
        for n in news_items:
            clean_news.append({
                "title": n.get("title") or n.get("name"),
                "sourceName": n.get("sourceName") or n.get("source"),
                "updatedAt": n.get("updatedAt") or n.get("publishedAt") or n.get("date"),
            })

    return {
        "trend": {
            "realtime": realtime,
            "ohlcv": ohlcv_clean,
            "computed": computed,
        },
        "liquidity": {
            "latest": liquidity_latest,
            "avg30": liquidity_avg,
            "history": liquidity_history,
        },
        "moneyFlow": {
            "foreign": _normalize_flow(foreign_trade),
            "proprietary": _normalize_flow(proprietary),
        },
        "insider": {
            "transactions": insider_txns,
        },
        "news": {
            "items": clean_news,
            "tickerScore": ticker_score,
        },
    }

