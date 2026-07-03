"""Yahoo Finance v8/chart data source connector.

Provides international market data (indices, FX, commodities, ETFs, crypto)
via Yahoo Finance's chart API endpoint. Uses semaphore + jitter for fetch_many
to avoid rate-limiting.
"""

from __future__ import annotations

import asyncio
import logging
import random
from datetime import UTC, datetime
from typing import Any

from app.services.market_data.http import fetch_json, get_headers

logger = logging.getLogger(__name__)

_SOURCE = "YAHOO"
_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
_CHART_PARAMS = {"interval": "1d", "range": "5d"}
_SEMAPHORE_LIMIT = 5


def parse_chart_meta(meta: dict[str, Any], symbol: str) -> dict[str, Any]:
    """Pure parser: extract a normalised quote row from a Yahoo v8 chart meta dict.

    Args:
        meta: The ``data["chart"]["result"][0]["meta"]`` dict from Yahoo's API.
        symbol: The ticker symbol (used as fallback for ``name``).

    Returns:
        A dict with keys:
        symbol, name, last_price, previous_close, change_value, change_percent,
        day_high, day_low, volume, currency, market_state, market_time.
    """
    last_price: float | None = meta.get("regularMarketPrice")

    # chartPreviousClose takes priority over previousClose (brief requirement)
    previous_close: float | None = meta.get("chartPreviousClose") or meta.get("previousClose")

    # Compute change fields; both are None-safe
    change_value: float | None = None
    change_percent: float | None = None
    if last_price is not None and previous_close is not None:
        change_value = last_price - previous_close
        change_percent = (change_value / previous_close) * 100

    # market_time: epoch seconds → ISO-8601 UTC string
    raw_time: int | None = meta.get("regularMarketTime")
    market_time: str | None = None
    if raw_time is not None:
        try:
            market_time = datetime.fromtimestamp(int(raw_time), UTC).isoformat()
        except (ValueError, OSError, OverflowError):
            market_time = None

    # name: shortName first, then longName, then fall back to the supplied symbol
    name: str = (
        meta.get("shortName")
        or meta.get("longName")
        or symbol
    )

    return {
        "symbol": meta.get("symbol", symbol),
        "name": name,
        "last_price": last_price,
        "previous_close": previous_close,
        "change_value": change_value,
        "change_percent": change_percent,
        "day_high": meta.get("regularMarketDayHigh"),
        "day_low": meta.get("regularMarketDayLow"),
        "volume": meta.get("regularMarketVolume"),
        "currency": meta.get("currency"),
        "market_state": meta.get("marketState"),
        "market_time": market_time,
    }


async def fetch_chart(symbol: str) -> tuple[dict[str, Any], str]:
    """Fetch current-quote data for a single Yahoo Finance symbol.

    Hits ``https://query1.finance.yahoo.com/v8/finance/chart/{symbol}``
    with ``interval=1d&range=5d`` and returns a ``(parsed, url)`` tuple.

    Args:
        symbol: Yahoo Finance ticker (e.g. ``"^GSPC"``, ``"DX-Y.NYB"``).

    Returns:
        ``(parsed_dict, url)`` where *parsed_dict* is the output of
        :func:`parse_chart_meta` and *url* is the resolved request URL.

    Raises:
        httpx.HTTPStatusError: On non-retryable HTTP errors.
        ValueError: If the response lacks expected structure.
    """
    url = _CHART_URL.format(symbol=symbol)
    data = await fetch_json(
        url,
        method="GET",
        headers=get_headers(_SOURCE),
        params=_CHART_PARAMS,
        source=_SOURCE,
    )
    try:
        meta = data["chart"]["result"][0]["meta"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError(f"Yahoo: unexpected response structure for {symbol!r}") from exc

    return parse_chart_meta(meta, symbol), url


async def fetch_many(symbols: list[str]) -> dict[str, dict[str, Any]]:
    """Fetch quotes for multiple symbols concurrently with rate-limiting.

    Uses an ``asyncio.Semaphore(5)`` and a random jitter sleep of
    0.1–0.2 s before each request. Failed symbols are logged at WARNING
    level and omitted from the result dict.

    Args:
        symbols: List of Yahoo Finance tickers.

    Returns:
        Dict mapping successfully-fetched tickers to their parsed quote dicts.
    """
    semaphore = asyncio.Semaphore(_SEMAPHORE_LIMIT)
    results: dict[str, dict[str, Any]] = {}

    async def _fetch_one(sym: str) -> None:
        async with semaphore:
            await asyncio.sleep(random.uniform(0.1, 0.2))
            try:
                parsed, _ = await fetch_chart(sym)
                # last_price missing entirely → treat as failed (brief requirement)
                if parsed.get("last_price") is None:
                    raise ValueError(f"Yahoo: last_price missing for {sym!r}")
                results[sym] = parsed
            except Exception as exc:  # noqa: BLE001
                logger.warning("Yahoo fetch_many: failed for %r — %s", sym, exc)

    await asyncio.gather(*(_fetch_one(s) for s in symbols))
    return results
