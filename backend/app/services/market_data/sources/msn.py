"""MSN (Microsoft Start Finance) data source connector.

Provides world stock indices, forex pairs, and crypto (in VND) via MSN's
Finance charts API. Requires a short-lived apikey resolved dynamically from
MSN's config resolver (cached in Redis for 6h).
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from app.services.market_data.http import fetch_json, get_headers

logger = logging.getLogger(__name__)

_SOURCE = "MSN"
_CHARTS_URL = "https://assets.msn.com/service/Finance/Charts/TimeRange"
_CRYPTO_URL = "https://assets.msn.com/service/Finance/Cryptocurrency/chart"
_RESOLVER_URL = "https://assets.msn.com/resolver/api/resolve/v3/config/"

_REDIS_KEY = "mkt:msn:apikey"
_APIKEY_TTL = 21600  # 6 hours
_SENTINEL = -99999901.0

# symbol → MSN SecId (index + crypto + forex). Ported from IQX-TS secid.ts.
MSN_SECID: dict[str, str] = {
    # index
    "INX": "a33k6h", "DJI": "a6qja2", "USA30": "a6qja2", "COMP": "a3oxnm",
    "RUT": "b9v42w", "NYA": "a74pqh", "UKX": "aopnp2", "DAX": "afx2kr",
    "PX1": "aecfh7", "N225": "a9j7bh", "000001": "adfh77", "HSI": "ah7etc",
    "SENSEX": "ahkucw", "VNI": "aqk2nm",
    # crypto
    "BTC": "c2111", "BTCUSDT": "c2111", "ETH": "c2112", "BNB": "c2113",
    "XRP": "c2117", "ADA": "c2114", "SOL": "c2116", "DOGE": "c2119",
    "USDT": "c2115", "USDC": "c211a",
    # forex
    "USDVND": "avyufr", "JPYVND": "ave8sm", "EURVND": "av93ec",
    "EURUSD": "av932w", "USDJPY": "avyomw", "GBPUSD": "avyjhw",
    "AUDUSD": "auxr9c", "XAUUSD": "ck48ur", "XAGUSD": "ck48xm",
}

_MSN_SCOPE = {
    "audienceMode": "adult",
    "browser": {"browserType": "chrome", "version": "0", "ismobile": "false"},
    "deviceFormFactor": "desktop",
    "domain": "www.msn.com",
    "locale": {
        "content": {"language": "vi", "market": "vn"},
        "display": {"language": "vi", "market": "vn"},
    },
    "ocid": "hpmsn",
    "os": "macos",
    "platform": "web",
    "pageType": "financestockdetails",
}


def resolve_secid(symbol: str) -> str | None:
    return MSN_SECID.get(symbol.upper())


def _resolver_version() -> str:
    """v = YYYYMMDD of (now - 7h), suffixed '.168'."""
    d = datetime.now(UTC) - timedelta(hours=7)
    return f"{d.strftime('%Y%m%d')}.168"


def _extract_apikey(res: dict[str, Any]) -> str | None:
    configs = res.get("configs", {}) if isinstance(res, dict) else {}
    entry = configs.get("shared/msn-ns/HoroscopeAnswerCardWC/default", {})
    props = entry.get("properties", {}) if isinstance(entry, dict) else {}
    key = (
        props.get("horoscopeAnswerServiceClientSettings", {}).get("apikey")
        or props.get("mvpAPIkey")
        or props.get("weatherApi", {}).get("apiKey")
    )
    return str(key) if key else None


async def resolve_apikey(redis: Any | None = None) -> str:
    """Resolve MSN apikey, caching in Redis for 6h when available."""
    if redis is not None:
        try:
            cached = await redis.get(_REDIS_KEY)
            if cached:
                return cached.decode() if isinstance(cached, bytes) else str(cached)
        except Exception as exc:  # noqa: BLE001
            logger.debug("MSN apikey cache read failed: %s", exc)

    res = await fetch_json(
        _RESOLVER_URL,
        method="GET",
        headers=get_headers(_SOURCE),
        params={
            "expType": "AppConfig",
            "expInstance": "default",
            "apptype": "finance",
            "v": _resolver_version(),
            "targetScope": json.dumps(_MSN_SCOPE),
        },
        source=_SOURCE,
    )
    apikey = _extract_apikey(res)
    if not apikey:
        raise ValueError("MSN resolver: apikey not found in response")

    if redis is not None:
        try:
            await redis.set(_REDIS_KEY, apikey, ex=_APIKEY_TTL)
        except Exception as exc:  # noqa: BLE001
            logger.debug("MSN apikey cache write failed: %s", exc)
    return apikey


def _norm_series(series: dict[str, Any], is_currency: bool) -> list[dict[str, Any]]:
    """Normalize an MSN price series into OHLCV rows (drops sentinel rows)."""
    timestamps = series.get("timeStamps", []) or []
    opens = series.get("openPrices", []) or []
    highs = series.get("pricesHigh", []) or []
    lows = series.get("pricesLow", []) or []
    closes = series.get("prices", []) or []
    volumes = series.get("volumes", []) or []

    out: list[dict[str, Any]] = []
    for i, ts_str in enumerate(timestamps):
        o = opens[i] if i < len(opens) else None
        h = highs[i] if i < len(highs) else None
        low = lows[i] if i < len(lows) else None
        if any(v is None or v == _SENTINEL for v in (o, h, low)):
            continue
        c = closes[i] if i < len(closes) else None
        vol = volumes[i] if i < len(volumes) else None
        try:
            ts = int(datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp())
        except (ValueError, AttributeError):
            continue
        out.append({
            "time": datetime.fromtimestamp(ts, UTC).strftime("%Y-%m-%d"),
            "timestamp": ts,
            "open": o,
            "high": h,
            "low": low,
            "close": c,
            "volume": None if (is_currency or vol == _SENTINEL) else vol,
        })
    return out


def _chart_params(apikey: str, secid: str, start: str | None, end: str | None) -> dict[str, str]:
    start = start or "2000-01-01"
    end = end or datetime.now(UTC).strftime("%Y-%m-%d")
    return {
        "apikey": apikey,
        "StartTime": f"{start}T17:00:00.000Z",
        "EndTime": f"{end}T16:59:00.858Z",
        "timeframe": "1",
        "ocid": "finance-utils-peregrine",
        "cm": "vi-vn",
        "it": "web",
        "scn": "ANON",
        "ids": secid,
        "type": "All",
        "wrapodata": "false",
        "disableSymbol": "false",
    }


async def _fetch_chart(
    url: str,
    symbol: str,
    apikey: str,
    *,
    start: str | None,
    end: str | None,
    force_currency: bool | None,
) -> tuple[list[dict[str, Any]], str]:
    secid = resolve_secid(symbol)
    if not secid:
        raise ValueError(f"No MSN SecId for symbol: {symbol}")
    arr = await fetch_json(
        url,
        method="GET",
        headers=get_headers(_SOURCE),
        params=_chart_params(apikey, secid, start, end),
        source=_SOURCE,
    )
    item = arr[0] if isinstance(arr, list) and arr else None
    if not item:
        return [], url
    is_currency = (
        force_currency
        if force_currency is not None
        else item.get("securityType") == "currencyPair"
    )
    return _norm_series(item.get("series", {}), is_currency), url


async def fetch_world_index(
    symbol: str, apikey: str, *, start: str | None = None, end: str | None = None
) -> tuple[list[dict[str, Any]], str]:
    """World stock index OHLC (absolute points + real volume)."""
    return await _fetch_chart(
        _CHARTS_URL, symbol, apikey, start=start, end=end, force_currency=False
    )


async def fetch_forex(
    symbol: str, apikey: str, *, start: str | None = None, end: str | None = None
) -> tuple[list[dict[str, Any]], str]:
    """Forex pair OHLC (currencyPair → volume null)."""
    return await _fetch_chart(
        _CHARTS_URL, symbol, apikey, start=start, end=end, force_currency=True
    )


async def fetch_crypto(
    symbol: str, apikey: str, *, start: str | None = None, end: str | None = None
) -> tuple[list[dict[str, Any]], str]:
    """Crypto OHLC in VND (MSN cryptocurrency chart)."""
    return await _fetch_chart(
        _CRYPTO_URL, symbol, apikey, start=start, end=end, force_currency=False
    )
