"""AI candlestick + chart pattern service.

Reads pattern recognition outputs published in the project's Google Spreadsheet
(sheet IDs ``CANDLE`` and ``CHART``) and exposes them per-symbol.

Sheets layout (both sheets share the same column ordering)::

    SYMBOL | NAME | TIN HIEU | (TRANG THAI|MUC DO) | Y NGHIA | HANH DONG

`CANDLE` uses a confidence column ``MUC DO`` (Cao / Trung bình / Thấp) while
`CHART` uses a state column ``TRANG THAI`` (e.g. "Đang hình thành",
"Sẵn sàng breakout", "Đã breakout", "Đã fail (phá ngược)").

Each pattern row is also enriched with an ``illustration`` field pointing to
the SVG stored under ``dashboard/public/patterns/{candles,charts}/`` so the
frontend can render the same illustrations used in the design mockups.
"""

from __future__ import annotations

import asyncio
import logging
import re
import unicodedata
from typing import Any

from app.services.market_data.sources.google_sheets import fetch_sheet_data

logger = logging.getLogger(__name__)

# ── Sheet identifiers ────────────────────────────────
_SHEET_CANDLE = "CANDLE"
_SHEET_CHART = "CHART"

# Cache (name, ttl_expiry) → list of records. The sheets refresh once a day,
# so a 5-minute TTL is plenty while still allowing manual edits to land fast.
_CACHE_TTL = 300.0
_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_cache_lock = asyncio.Lock()


# ── Name → SVG mapping ───────────────────────────────
# Sheet ``NAME`` values map to TA-Lib style filenames stored under
# ``dashboard/public/patterns/candles/CDL{NAME}.svg``.

_CANDLE_NAME_TO_FILE: dict[str, str] = {
    "Belt-hold": "CDLBELTHOLD",
    "Closing Marubozu": "CDLCLOSINGMARUBOZU",
    "Dark Cloud Cover": "CDLDARKCLOUDCOVER",
    "Doji": "CDLDOJI",
    "Doji Star": "CDLDOJISTAR",
    "Dragonfly Doji": "CDLDRAGONFLYDOJI",
    "Engulfing Pattern": "CDLENGULFING",
    "Evening Star": "CDLEVENINGSTAR",
    "Evening Doji Star": "CDLEVENINGDOJISTAR",
    "Gravestone Doji": "CDLGRAVESTONEDOJI",
    "Hammer": "CDLHAMMER",
    "Hanging Man": "CDLHANGINGMAN",
    "Harami Cross Pattern": "CDLHARAMICROSS",
    "Harami Pattern": "CDLHARAMI",
    "High-Wave Candle": "CDLHIGHWAVE",
    "Hikkake Pattern": "CDLHIKKAKE",
    "Modified Hikkake Pattern": "CDLHIKKAKEMOD",
    "Homing Pigeon": "CDLHOMINGPIGEON",
    "Identical Three Crows": "CDLIDENTICAL3CROWS",
    "In-Neck Pattern": "CDLINNECK",
    "Inverted Hammer": "CDLINVERTEDHAMMER",
    "Long Legged Doji": "CDLLONGLEGGEDDOJI",
    "Long Line Candle": "CDLLONGLINE",
    "Marubozu": "CDLMARUBOZU",
    "Matching Low": "CDLMATCHINGLOW",
    "Morning Star": "CDLMORNINGSTAR",
    "Morning Doji Star": "CDLMORNINGDOJISTAR",
    "On-Neck Pattern": "CDLONNECK",
    "Piercing Pattern": "CDLPIERCING",
    "Rickshaw Man": "CDLRICKSHAWMAN",
    "Separating Lines": "CDLSEPARATINGLINES",
    "Shooting Star": "CDLSHOOTINGSTAR",
    "Short Line Candle": "CDLSHORTLINE",
    "Spinning Top": "CDLSPINNINGTOP",
    "Takuri (Dragonfly Doji with long lower shadow)": "CDLTAKURI",
    "Tasuki Gap": "CDLTASUKIGAP",
    "Three Advancing White Soldiers": "CDL3WHITESOLDIERS",
    "Three Inside Up/Down": "CDL3INSIDE",
    "Three Outside Up/Down": "CDL3OUTSIDE",
    "Thrusting Pattern": "CDLTHRUSTING",
    "Tristar Pattern": "CDLTRISTAR",
    "Up/Down-gap Side-by-side White Lines": "CDLGAPSIDESIDEWHITE",
    # Common alternates we may see from the sheet
    "Two Crows": "CDL2CROWS",
    "Three Black Crows": "CDL3BLACKCROWS",
    "Three-Line Strike": "CDL3LINESTRIKE",
    "Three Stars in the South": "CDL3STARSINSOUTH",
    "Abandoned Baby": "CDLABANDONEDBABY",
    "Advance Block": "CDLADVANCEBLOCK",
    "Breakaway": "CDLBREAKAWAY",
    "Concealing Baby Swallow": "CDLCONCEALBABYSWALL",
    "Counterattack": "CDLCOUNTERATTACK",
    "Kicking": "CDLKICKING",
    "Kicking by Length": "CDLKICKINGBYLENGTH",
    "Ladder Bottom": "CDLLADDERBOTTOM",
    "Mat Hold": "CDLMATHOLD",
    "Rising/Falling Three Methods": "CDLRISEFALL3METHODS",
    "Stalled Pattern": "CDLSTALLEDPATTERN",
    "Stick Sandwich": "CDLSTICKSANDWICH",
    "Unique 3 River": "CDLUNIQUE3RIVER",
    "Upside Gap Two Crows": "CDLUPSIDEGAP2CROWS",
    "Upside/Downside Gap Three Methods": "CDLXSIDEGAP3METHODS",
}

_CHART_NAME_TO_FILE: dict[str, str] = {
    "Ascending Triangle": "Ascending_Triangle",
    "Descending Triangle": "Descending_Triangle",
    "Symmetrical Triangle": "Symmetrical_Triangle",
    "Bull Flag": "Bull_Flag",
    "Bear Flag": "Bear_Flag",
    "Cup and Handle": "Cup_and_Handle",
    "Double Top": "Double_Top",
    "Double Bottom": "Double_Bottom",
    "Triple Top": "Triple_Top",
    "Triple Bottom": "Triple_Bottom",
    "Falling Wedge": "Falling_Wedge",
    "Rising Wedge": "Rising_Wedge",
    "Head and Shoulders": "Head_and_Shoulders",
    "Inverse Head and Shoulders": "Inverse_Head_and_Shoulders",
    "Rectangle (Range)": "Rectangle_Range",
    "Rectangle Range": "Rectangle_Range",
}


def _slugify(name: str) -> str:
    """Stable slug for fuzzy matching (NFKD strip + lowercase + alphanum)."""
    if not name:
        return ""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", ascii_only.lower())


_CANDLE_SLUG_INDEX = {_slugify(k): v for k, v in _CANDLE_NAME_TO_FILE.items()}
_CHART_SLUG_INDEX = {_slugify(k): v for k, v in _CHART_NAME_TO_FILE.items()}


def _resolve_illustration(kind: str, name: str) -> str | None:
    """Return public path under /patterns/{kind}/{file}.svg or None."""
    if not name:
        return None
    slug = _slugify(name)
    if kind == "candles":
        f = _CANDLE_SLUG_INDEX.get(slug)
        return f"/patterns/candles/{f}.svg" if f else None
    if kind == "charts":
        f = _CHART_SLUG_INDEX.get(slug)
        return f"/patterns/charts/{f}.svg" if f else None
    return None


def _normalize_signal(value: str) -> str:
    """Map raw signal text to a stable enum (bullish | bearish | neutral)."""
    lower = (value or "").strip().lower()
    if not lower:
        return "neutral"
    if any(kw in lower for kw in ("tăng", "mua", "bullish", "tích cực")):
        return "bullish"
    if any(kw in lower for kw in ("giảm", "bán", "bearish", "tiêu cực")):
        return "bearish"
    return "neutral"


async def _fetch(sheet: str) -> list[dict[str, Any]]:
    """Read a sheet with TTL caching."""
    now = asyncio.get_running_loop().time()
    cached = _cache.get(sheet)
    if cached and cached[0] > now:
        return cached[1]

    async with _cache_lock:
        cached = _cache.get(sheet)
        if cached and cached[0] > now:
            return cached[1]
        rows, _url = await fetch_sheet_data(sheet)
        _cache[sheet] = (now + _CACHE_TTL, rows)
        return rows


def _project(row: dict[str, Any], kind: str) -> dict[str, Any]:
    """Adapt raw sheet row → API response item.

    `kind` is "candles" or "charts" — used to pick illustration folder.
    """
    name = (row.get("NAME") or "").strip()
    raw_signal = (row.get("TIN HIEU") or "").strip()
    state = (row.get("MUC DO") or row.get("TRANG THAI") or "").strip()
    meaning = (row.get("Y NGHIA") or "").strip()
    action = (row.get("HANH DONG") or "").strip()

    return {
        "symbol": (row.get("SYMBOL") or "").strip().upper(),
        "name": name,
        "signal": _normalize_signal(raw_signal),
        "signalLabel": raw_signal or None,
        "state": state or None,
        "meaning": meaning or None,
        "action": action or None,
        "illustration": _resolve_illustration(kind, name),
    }


async def get_candle_patterns(symbol: str) -> dict[str, Any]:
    """Return all candle patterns recognised for ``symbol``."""
    sym = symbol.strip().upper()
    if not sym:
        return {"symbol": sym, "kind": "candles", "items": [], "count": 0}

    rows = await _fetch(_SHEET_CANDLE)
    items = [_project(r, "candles") for r in rows if (r.get("SYMBOL") or "").strip().upper() == sym]
    return {"symbol": sym, "kind": "candles", "items": items, "count": len(items)}


async def get_chart_patterns(symbol: str) -> dict[str, Any]:
    """Return all chart patterns recognised for ``symbol``."""
    sym = symbol.strip().upper()
    if not sym:
        return {"symbol": sym, "kind": "charts", "items": [], "count": 0}

    rows = await _fetch(_SHEET_CHART)
    items = [_project(r, "charts") for r in rows if (r.get("SYMBOL") or "").strip().upper() == sym]
    return {"symbol": sym, "kind": "charts", "items": items, "count": len(items)}


async def list_pattern_symbols(kind: str) -> dict[str, Any]:
    """Return distinct list of symbols that have at least one row in ``kind`` sheet."""
    if kind not in ("candles", "charts"):
        raise ValueError("kind must be 'candles' or 'charts'")
    sheet = _SHEET_CANDLE if kind == "candles" else _SHEET_CHART
    rows = await _fetch(sheet)
    symbols = sorted({(r.get("SYMBOL") or "").strip().upper() for r in rows if r.get("SYMBOL")})
    return {"kind": kind, "symbols": symbols, "count": len(symbols)}
