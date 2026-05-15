"""AI forecast model service.

Reads model output published in the project's Google Spreadsheet, sheet
``MODEL_AI``. The sheet stores expected return and probability of upward
move for each ticker across three horizons (T+3, T+5, T+10).

Sheet schema::

    ticker | ER_3d | P_up_3d | ER_5d | P_up_5d | ER_10d | P_up_10d

All numbers are stored as decimals using ``,`` as the fractional
separator (Vietnamese locale). Values are fractions (``0.04`` = 4%).

API exposes a single endpoint that returns the leaderboard for a given
horizon, ranked by expected return (descending).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from app.services.market_data.sources.google_sheets import fetch_sheet_data

logger = logging.getLogger(__name__)

_SHEET = "MODEL_AI"
_CACHE_TTL = 300.0
_cache: tuple[float, list[dict[str, Any]]] | None = None
_cache_lock = asyncio.Lock()

Horizon = Literal["3", "5", "10"]
_VALID_HORIZONS: tuple[Horizon, ...] = ("3", "5", "10")


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
    """Read MODEL_AI sheet with TTL caching."""
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
    """Adapt a raw sheet row to numeric forecast record."""
    return {
        "symbol": (row.get("ticker") or "").strip().upper(),
        "expectedReturn": {
            "3d": _to_float(row.get("ER_3d")),
            "5d": _to_float(row.get("ER_5d")),
            "10d": _to_float(row.get("ER_10d")),
        },
        "upProbability": {
            "3d": _to_float(row.get("P_up_3d")),
            "5d": _to_float(row.get("P_up_5d")),
            "10d": _to_float(row.get("P_up_10d")),
        },
    }


async def get_forecast_ranking(
    horizon: Horizon,
    *,
    limit: int = 20,
) -> dict[str, Any]:
    """Return the leaderboard for ``horizon`` (3 / 5 / 10) sorted by ER desc.

    Each item exposes the symbol, expected return and probability of an
    upward move for the requested horizon. Tickers without a numeric
    return are dropped.
    """
    if horizon not in _VALID_HORIZONS:
        raise ValueError(f"horizon must be one of {_VALID_HORIZONS}")

    rows = await _fetch_rows()
    key = f"{horizon}d"

    items: list[dict[str, Any]] = []
    for raw in rows:
        rec = _project(raw)
        sym = rec["symbol"]
        if not sym:
            continue
        er = rec["expectedReturn"][key]
        if er is None:
            continue
        items.append({
            "symbol": sym,
            "expectedReturn": er,
            "upProbability": rec["upProbability"][key],
        })

    items.sort(key=lambda x: x["expectedReturn"], reverse=True)
    items = items[: max(1, min(limit, 100))]

    # Add 1-based rank
    for i, item in enumerate(items):
        item["rank"] = i + 1

    return {
        "horizon": f"T+{horizon}",
        "horizonDays": int(horizon),
        "count": len(items),
        "items": items,
    }


async def get_forecast_for_symbol(symbol: str) -> dict[str, Any]:
    """Return all three horizons for ``symbol``."""
    sym = (symbol or "").strip().upper()
    if not sym:
        return {"symbol": sym, "horizons": []}

    rows = await _fetch_rows()
    record: dict[str, Any] | None = None
    for raw in rows:
        if (raw.get("ticker") or "").strip().upper() == sym:
            record = _project(raw)
            break

    if record is None:
        return {"symbol": sym, "horizons": []}

    horizons = []
    for h in _VALID_HORIZONS:
        key = f"{h}d"
        er = record["expectedReturn"][key]
        if er is None:
            continue
        horizons.append({
            "horizon": f"T+{h}",
            "horizonDays": int(h),
            "expectedReturn": er,
            "upProbability": record["upProbability"][key],
        })

    return {"symbol": sym, "horizons": horizons}
