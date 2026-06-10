"""Binance crypto data source connector.

Upstream API: rotates across 6 Binance hosts; retries on 429/5xx with
exponential backoff. Provides OHLC (uiKlines), 24h ticker, and order-book depth.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

import httpx

from app.services.market_data.http import get_headers

logger = logging.getLogger(__name__)

_SOURCE = "BINANCE"

_HOSTS = (
    "https://api.binance.com",
    "https://api-gcp.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
    "https://api4.binance.com",
)
_RETRYABLE = {429, 500, 502, 503, 504}
_TIMEOUT = 30.0
_MAX_ATTEMPTS = 5

# Module-level round-robin host index (rotated on retryable errors).
_host_idx = 0


async def _binance_request(path: str, params: dict[str, Any]) -> Any:
    """GET a Binance endpoint with host rotation + exponential backoff."""
    global _host_idx  # noqa: PLW0603
    headers = {
        "User-Agent": get_headers("MSN")["User-Agent"],
        "Accept": "application/json",
    }
    last_exc: Exception | None = None

    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        for attempt in range(_MAX_ATTEMPTS):
            url = f"{_HOSTS[_host_idx]}{path}"
            try:
                resp = await client.get(url, headers=headers, params=params)
                if resp.status_code in _RETRYABLE:
                    _host_idx = (_host_idx + 1) % len(_HOSTS)
                    raise httpx.HTTPStatusError(
                        f"Binance retryable {resp.status_code}",
                        request=resp.request,
                        response=resp,
                    )
                resp.raise_for_status()
                return resp.json()
            except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.ConnectError) as exc:
                last_exc = exc
                # Non-retryable 4xx (other than 429) → fail fast.
                if isinstance(exc, httpx.HTTPStatusError):
                    code = exc.response.status_code
                    if code not in _RETRYABLE and 400 <= code < 500:
                        raise
                if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError)):
                    _host_idx = (_host_idx + 1) % len(_HOSTS)
                if attempt < _MAX_ATTEMPTS - 1:
                    await asyncio.sleep(min(10.0, 2.0 * 2**attempt))

    if last_exc:
        raise last_exc
    raise httpx.ConnectError(f"All Binance hosts failed for {path}")


async def fetch_ohlc(
    symbol: str, interval: str = "1d", limit: int = 500
) -> tuple[list[dict[str, Any]], str]:
    """Fetch crypto OHLCV candles (uiKlines)."""
    path = "/api/v3/uiKlines"
    params = {"symbol": symbol.upper(), "interval": interval, "limit": limit}
    rows = await _binance_request(path, params)
    records: list[dict[str, Any]] = []
    for k in rows or []:
        ts = int(k[0] // 1000)
        records.append({
            "time": datetime.fromtimestamp(ts, UTC).strftime("%Y-%m-%d"),
            "timestamp": ts,
            "open": float(k[1]),
            "high": float(k[2]),
            "low": float(k[3]),
            "close": float(k[4]),
            "volume": float(k[5]),
        })
    return records, f"{_HOSTS[0]}{path}"


async def fetch_ticker(symbol: str) -> tuple[dict[str, Any], str]:
    """Fetch 24h ticker statistics for a crypto symbol."""
    path = "/api/v3/ticker/24hr"
    r = await _binance_request(path, {"symbol": symbol.upper()})
    data = {
        "symbol": r.get("symbol"),
        "last_price": float(r["lastPrice"]),
        "open_price": float(r["openPrice"]),
        "high_price": float(r["highPrice"]),
        "low_price": float(r["lowPrice"]),
        "bid_price": float(r["bidPrice"]),
        "ask_price": float(r["askPrice"]),
        "price_change": float(r["priceChange"]),
        "change_pct": float(r["priceChangePercent"]),
        "volume": float(r["volume"]),
        "quote_volume": float(r["quoteVolume"]),
        "open_time": r.get("openTime"),
        "close_time": r.get("closeTime"),
        "count": r.get("count"),
    }
    return data, f"{_HOSTS[0]}{path}"


async def fetch_depth(symbol: str, limit: int = 100) -> tuple[dict[str, Any], str]:
    """Fetch order-book depth (bids/asks) for a crypto symbol."""
    path = "/api/v3/depth"
    r = await _binance_request(path, {"symbol": symbol.upper(), "limit": limit})

    def _level(entry: list[str]) -> dict[str, float]:
        return {"price": float(entry[0]), "qty": float(entry[1])}

    data = {
        "last_update_id": r.get("lastUpdateId"),
        "bids": [_level(b) for b in r.get("bids", [])],
        "asks": [_level(a) for a in r.get("asks", [])],
    }
    return data, f"{_HOSTS[0]}{path}"
