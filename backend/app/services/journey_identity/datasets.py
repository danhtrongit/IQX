"""Freeze the exact reading evidence before revealing its server-side AI verdicts.

The existing Insight history is mutable per symbol/day, so it cannot be used as
an immutable receipt. Store the actual response and valuation used by this view.
"""

from __future__ import annotations

import asyncio
import logging
import math
from datetime import UTC, date, datetime, timedelta, timezone

from app.models.cap4 import LOP_KEYS
from app.services.cap6.mau_thuan import bac_cua_nhan
from app.services.valuation_reading import positive, read_valuation

logger = logging.getLogger(__name__)
LAYER_SOURCE = {"ky_thuat": "L1", "dong_tien": "L3", "noi_bo": "L4", "tin_tuc": "L5"}
_VN_TZ = timezone(timedelta(hours=7))


def _session_date(value: object) -> date | None:
    """Parse a provider-owned bar timestamp into its Vietnam session date."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, datetime):
        return value.astimezone(_VN_TZ).date() if value.tzinfo is not None else value.date()
    if isinstance(value, date):
        return value

    numeric: float | None = None
    if isinstance(value, (int, float)):
        try:
            numeric = float(value)
        except OverflowError:
            return None
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            numeric = float(raw)
        except ValueError:
            try:
                parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except ValueError:
                return None
            return parsed.astimezone(_VN_TZ).date() if parsed.tzinfo is not None else parsed.date()
    else:
        return None

    if not math.isfinite(numeric):
        return None
    if abs(numeric) > 10_000_000_000:  # provider epochs may be milliseconds
        numeric /= 1000
    try:
        return datetime.fromtimestamp(numeric, tz=UTC).astimezone(_VN_TZ).date()
    except (OverflowError, OSError, ValueError):
        return None


def _latest_source_session(insight: dict, now: datetime) -> date | None:
    """Return the latest non-future session stated by an immutable OHLCV bar."""
    raw_input = insight.get("rawInput")
    trend = raw_input.get("trend") if isinstance(raw_input, dict) else None
    bars = trend.get("ohlcv") if isinstance(trend, dict) else None
    today = now.astimezone(_VN_TZ).date() if now.tzinfo is not None else now.date()
    sessions: list[date] = []
    for bar in bars if isinstance(bars, list) else []:
        if not isinstance(bar, dict):
            continue
        for key in ("date", "tradingDate", "t", "time"):
            session = _session_date(bar.get(key))
            if session is not None:
                if session <= today:
                    sessions.append(session)
                break
    return max(sessions) if sessions else None


def valuation_verdict(valuation: object, price: float | None) -> str | None:
    """Compatibility wrapper around the canonical BCTC valuation reading."""
    reading = read_valuation(valuation, observed_price=price)
    return reading.verdict if reading is not None else None


def reading_lines(layer: object) -> list[str]:
    if not isinstance(layer, dict):
        return []
    if layer.get("layerNum") == "L5" and isinstance(layer.get("news"), dict):
        news = layer["news"]
        return [
            str(item.get("title", "")).strip()
            for collection in (news.get("material"), news.get("filler"))
            if isinstance(collection, list)
            for item in collection
            if isinstance(item, dict) and str(item.get("title") or "").strip()
        ]
    # Same evidence fields as Doc5LopBlock, with status/summary/diff withheld.
    lines = []
    fields = layer.get("fields")
    for field in fields if isinstance(fields, list) else []:
        if not isinstance(field, dict):
            continue
        if field.get("label") in (None, "Tác động", "Tổng quan", "Trạng thái"):
            continue
        values = field.get("value")
        values = values if isinstance(values, list) else []
        content = "".join(
            str(value.get("content") or "") for value in values if isinstance(value, dict)
        ).strip()
        if content:
            lines.append(f"{field['label']}: {content}")
    return lines


def snapshot(
    insight: dict | None,
    bctc: dict | None,
    now: datetime,
    *,
    symbol: str | None = None,
) -> dict:
    insight_data = insight if isinstance(insight, dict) else {}
    bctc_data = bctc if isinstance(bctc, dict) else {}
    readings = {key: {"lines": [], "degraded": True} for key in LOP_KEYS}
    ai = {}
    layers = insight_data.get("layers")
    if isinstance(layers, dict):
        for key, source in LAYER_SOURCE.items():
            layer = layers.get(source)
            layer = layer if isinstance(layer, dict) else {}
            rank = bac_cua_nhan(source, layer.get("statusLabel"))
            # The Insight renderer defaults unknown labels to 3; do not treat
            # that display fallback as an actual neutral assessment.
            lines = reading_lines(layer)
            # A verdict without the corresponding visible reading is not a
            # complete learning pair. Keep its raw source for explicit repair,
            # while letting the manual plan continue in degraded mode.
            if rank is not None and lines:
                ai[key] = "ok" if rank >= 4 else "bad" if rank <= 2 else "neu"
            readings[key] = {"lines": lines, "degraded": not bool(lines)}
    blocks = bctc_data.get("blocks")
    valuation = blocks.get("valuation") if isinstance(blocks, dict) else {}
    valuation = valuation if isinstance(valuation, dict) else {}
    header = insight_data.get("header")
    price = header.get("price") if isinstance(header, dict) else None
    valuation_reading = read_valuation(valuation, observed_price=price)
    if valuation_reading is not None:
        price = valuation_reading.price
        ai["dinh_gia"] = valuation_reading.verdict
        readings["dinh_gia"] = {
            "degraded": False,
            "lines": [
                f"Vùng giá trị: {valuation_reading.low:,.0f} – {valuation_reading.high:,.0f}",
                f"Giá hiện tại: {valuation_reading.price:,.0f}",
                f"Trung vị (giá hợp lý): {valuation_reading.fair_median:,.0f}",
            ],
        }
    # Session from the supplied price series, never from request/browser time or
    # the mutable analysis ``updatedAt``. If the provider cannot identify a
    # session, permit learning but exclude the receipt from assignment.
    session = _latest_source_session(insight_data, now)
    requested_symbol = symbol.strip().upper() if isinstance(symbol, str) and symbol.strip() else None
    source_symbol = insight_data.get("symbol")
    source_symbol = (
        source_symbol.strip().upper() if isinstance(source_symbol, str) and source_symbol.strip() else None
    )
    hero = bctc_data.get("hero")
    valuation_source_symbol = hero.get("ticker") if isinstance(hero, dict) else None
    valuation_source_symbol = (
        valuation_source_symbol.strip().upper()
        if isinstance(valuation_source_symbol, str) and valuation_source_symbol.strip()
        else None
    )
    return {
        # Keep both values in the immutable receipt. ``symbol`` is the
        # server-normalized request; ``source_symbol`` lets classification
        # reject a provider response for another ticker instead of trusting
        # the request path alone.
        "symbol": requested_symbol,
        "source_symbol": source_symbol,
        "valuation_source_symbol": valuation_source_symbol,
        "readings": readings,
        "ai_answers": ai,
        "unavailable_layers": [key for key in LOP_KEYS if key not in ai],
        "trading_date": str(session) if session else None,
        "price": price if positive(price) else None,
        "source_refs": {
            "insight_as_of": insight_data.get("updatedAt"),
            "valuation_meta": bctc_data.get("meta"),
            "observed_at": now.isoformat(),
        },
        "source_snapshot": {"insight": insight, "valuation": valuation},
    }


async def load_dataset(symbol: str, now: datetime) -> dict:
    from app.services.ai.analysis_service import analyze_insight
    from app.services.bctc_dashboard.compute import compute_dashboard

    values = await asyncio.gather(analyze_insight(symbol=symbol), compute_dashboard(symbol), return_exceptions=True)
    for value in values:
        if isinstance(value, Exception):
            logger.warning(
                "journey_reading_source_unavailable", extra={"symbol": symbol, "error_type": type(value).__name__}
            )
    return snapshot(
        *(value if isinstance(value, dict) else None for value in values),
        now,
        symbol=symbol,
    )
