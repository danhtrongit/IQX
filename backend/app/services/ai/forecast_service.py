"""AI forecast model service.

Reads the curated recommendation list published in the project's Google
Spreadsheet, sheet ``Du_Bao``. The sheet stores, per ticker, a projected
price target and the expected return.

Sheet schema::

    ticker | price | return

``price`` is the projected price in VND; ``return`` is a fraction
(``0.06`` = +6%). Numbers use ``,`` as the decimal separator (Vietnamese
locale).

API exposes a leaderboard ranked by expected return (descending) plus a
per-symbol lookup.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from app.services.market_data.sources.google_sheets import fetch_sheet_data

logger = logging.getLogger(__name__)

_SHEET = "Du_Bao"
_CACHE_TTL = 300.0
_cache: tuple[float, list[dict[str, Any]]] | None = None
_cache_lock = asyncio.Lock()

# Kept for endpoint query-param compatibility; the Du_Bao list is
# horizon-agnostic so the value is accepted but not used for filtering.
Horizon = Literal["3", "5", "10"]


def _to_float(value: Any) -> float | None:
    """Parse a Google-Sheets cell value to float (handles `,` decimals)."""
    if value is None:
        return None
    s = str(value).strip()
    if not s or s == "-":
        return None
    s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


async def _fetch_rows() -> list[dict[str, Any]]:
    """Read the Du_Bao sheet with TTL caching."""
    global _cache  # noqa: PLW0603
    now = asyncio.get_running_loop().time()
    if _cache and _cache[0] > now:
        return _cache[1]

    async with _cache_lock:
        if _cache and _cache[0] > now:
            return _cache[1]
        rows, _url = await fetch_sheet_data(_SHEET)
        _cache = (now + _CACHE_TTL, rows)
        return rows


def _project(row: dict[str, Any]) -> dict[str, Any]:
    """Adapt a raw sheet row to a numeric forecast record."""
    return {
        "symbol": (row.get("ticker") or "").strip().upper(),
        "projectedPrice": _to_float(row.get("price")),
        "expectedReturn": _to_float(row.get("return")),
    }


async def get_forecast_ranking(
    horizon: Horizon | None = None,
    *,
    limit: int = 20,
) -> dict[str, Any]:
    """Return the recommendation leaderboard sorted by expected return desc.

    Each item exposes the symbol, its projected price and the expected
    return. ``horizon`` is accepted for backwards compatibility but the
    Du_Bao list is a single curated set (no per-horizon columns).
    Tickers without a numeric return are dropped.
    """
    rows = await _fetch_rows()

    items: list[dict[str, Any]] = []
    for raw in rows:
        rec = _project(raw)
        sym = rec["symbol"]
        if not sym:
            continue
        er = rec["expectedReturn"]
        if er is None:
            continue
        items.append({
            "symbol": sym,
            "expectedReturn": er,
            "projectedPrice": rec["projectedPrice"],
            # No probability column in Du_Bao; kept null for response stability.
            "upProbability": None,
        })

    items.sort(key=lambda x: x["expectedReturn"], reverse=True)
    items = items[: max(1, min(limit, 100))]

    # Add 1-based rank
    for i, item in enumerate(items):
        item["rank"] = i + 1

    return {
        "horizon": f"T+{horizon}" if horizon else "Du_Bao",
        "horizonDays": int(horizon) if horizon else 0,
        "count": len(items),
        "items": items,
    }


async def get_forecast_for_symbol(symbol: str) -> dict[str, Any]:
    """Return the projected price + expected return for ``symbol``."""
    sym = (symbol or "").strip().upper()
    if not sym:
        return {"symbol": sym, "projectedPrice": None, "expectedReturn": None}

    rows = await _fetch_rows()
    for raw in rows:
        if (raw.get("ticker") or "").strip().upper() == sym:
            rec = _project(raw)
            return {
                "symbol": sym,
                "projectedPrice": rec["projectedPrice"],
                "expectedReturn": rec["expectedReturn"],
            }

    return {"symbol": sym, "projectedPrice": None, "expectedReturn": None}
