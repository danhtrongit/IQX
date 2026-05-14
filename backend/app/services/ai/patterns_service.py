"""AI candlestick + chart pattern service.

Reads pattern recognition outputs published in the project's Google Spreadsheet
(sheet IDs ``CANDLE`` and ``CHART``) and exposes them per-symbol.

Sheets layout (both sheets share the same column ordering)::

    SYMBOL | NAME | TIN HIEU | (TRANG THAI|MUC DO) | Y NGHIA | HANH DONG

`CANDLE` uses a confidence column ``MUC DO`` (Cao / Trung bình / Thấp) while
`CHART` uses a state column ``TRANG THAI`` (e.g. "Đang hình thành",
"Sẵn sàng breakout", "Đã breakout", "Đã fail (phá ngược)").

The frontend renders pattern illustrations inline as theme-aware SVG
(see ``dashboard/src/components/patterns/pattern-illustration.tsx``) so this
service does not return any image URL.
"""

from __future__ import annotations

import asyncio
import logging
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


def _project(row: dict[str, Any]) -> dict[str, Any]:
    """Adapt raw sheet row → API response item."""
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
    }


async def get_candle_patterns(symbol: str) -> dict[str, Any]:
    """Return all candle patterns recognised for ``symbol``."""
    sym = symbol.strip().upper()
    if not sym:
        return {"symbol": sym, "kind": "candles", "items": [], "count": 0}

    rows = await _fetch(_SHEET_CANDLE)
    items = [_project(r) for r in rows if (r.get("SYMBOL") or "").strip().upper() == sym]
    return {"symbol": sym, "kind": "candles", "items": items, "count": len(items)}


async def get_chart_patterns(symbol: str) -> dict[str, Any]:
    """Return all chart patterns recognised for ``symbol``."""
    sym = symbol.strip().upper()
    if not sym:
        return {"symbol": sym, "kind": "charts", "items": [], "count": 0}

    rows = await _fetch(_SHEET_CHART)
    items = [_project(r) for r in rows if (r.get("SYMBOL") or "").strip().upper() == sym]
    return {"symbol": sym, "kind": "charts", "items": items, "count": len(items)}


async def list_pattern_symbols(kind: str) -> dict[str, Any]:
    """Return distinct list of symbols that have at least one row in ``kind`` sheet."""
    if kind not in ("candles", "charts"):
        raise ValueError("kind must be 'candles' or 'charts'")
    sheet = _SHEET_CANDLE if kind == "candles" else _SHEET_CHART
    rows = await _fetch(sheet)
    symbols = sorted({(r.get("SYMBOL") or "").strip().upper() for r in rows if r.get("SYMBOL")})
    return {"kind": kind, "symbols": symbols, "count": len(symbols)}
