"""Normalize raw DNSE payloads (legacy MQTT + OpenAPI WS) to IQX's canonical schema.

Pure functions (no I/O) so they are trivial to unit-test against the real
payloads captured live on 2026-06-11 and the OpenAPI docs examples.

Unit conventions (verified live):
- DNSE stock prices arrive in **nghìn đồng** (e.g. ``matchPrice: 73.4`` = 73 400đ).
  We convert to **VND tuyệt đối** (×1000) to match the existing REST price-board
  schema (`close_price`, `reference_price`, ...) the frontend already consumes.
- Volume / qtty are in **số cổ phiếu** (shares), already absolute.
- Index values and derivative prices are **điểm chỉ số** — NOT multiplied.
- ``sendingTime`` is ISO8601 (ms, UTC ``Z``); OHLC ``time``/``lastUpdated`` are
  epoch seconds (string).
- OpenAPI variants: ``time``/``transactTime`` may be ``{"Seconds":…,"Nanos":…}``
  (→ ISO8601 UTC string); orderbook level qty key is ``qtty`` OR ``quantity``;
  market index uses ``indexName``/``valueIndexes``/``changedValue``/...
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

# Topic kind discriminators (segment right after ``/krx/mdds/``).
KIND_TICK = "tick"
KIND_ORDERBOOK = "orderbook"
KIND_OHLC = "ohlc"
KIND_INDEX = "index"
KIND_STOCKINFO = "stockinfo"


def _f(value: Any) -> float:
    """Parse to float, tolerating strings / None. Returns 0.0 on failure."""
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _to_vnd(price_k: Any) -> float:
    """DNSE stock price (nghìn đồng) → VND tuyệt đối."""
    return round(_f(price_k) * 1000)


def _time_value(value: Any) -> Any:
    """Normalize a time field across transports.

    OpenAPI sends ``{"Seconds": epoch_s, "Nanos": ns}`` → ISO8601 UTC string
    (same shape as MQTT ``sendingTime``); strings/None pass through unchanged.
    """
    if isinstance(value, dict):
        seconds = int(_f(value.get("Seconds") or value.get("seconds")))
        if seconds <= 0:
            return None
        millis = int(_f(value.get("Nanos") or value.get("nanos")) // 1_000_000)
        dt = datetime.fromtimestamp(seconds, tz=UTC)
        return f"{dt.strftime('%Y-%m-%dT%H:%M:%S')}.{millis:03d}Z"
    return value


def _side(raw_side: Any) -> str:
    """DNSE ``SIDE_BUY``/``SIDE_SELL`` → ``B``/``S``/``unknown``."""
    s = str(raw_side or "").upper()
    if "BUY" in s:
        return "B"
    if "SELL" in s:
        return "S"
    return "unknown"


def topic_kind(topic: str) -> str | None:
    """Map an MQTT topic string to a canonical kind, or None if unknown."""
    if "/krx/mdds/" not in topic:
        return None
    seg = topic.split("/krx/mdds/", 1)[1].split("/", 1)[0]
    return {
        "tick": KIND_TICK,
        "topprice": KIND_ORDERBOOK,
        "v2": KIND_OHLC,          # .../v2/ohlc/stock/1/{symbol}
        "ohlc": KIND_OHLC,
        "marketindex": KIND_INDEX,
        "stockinfo": KIND_STOCKINFO,
    }.get(seg)


def normalize_tick(raw: dict[str, Any], *, is_derivative: bool = False) -> dict[str, Any]:
    """Matched-trade tick.

    Derivative prices are index points (no ×1000); stock prices → VND.
    """
    price = _f(raw.get("matchPrice")) if is_derivative else _to_vnd(raw.get("matchPrice"))
    return {
        "type": "tick",
        "symbol": raw.get("symbol", ""),
        "price": price,
        "volume": _f(raw.get("matchQtty")),
        "side": _side(raw.get("side")),
        "total_volume": _f(raw.get("totalVolumeTraded")),
        "time": _time_value(raw.get("sendingTime") or raw.get("time")),
        "session": raw.get("tradingSessionId"),
    }


def normalize_orderbook(raw: dict[str, Any], *, is_derivative: bool = False) -> dict[str, Any]:
    """Order book / price depth. DNSE uses ``bid``/``offer`` (NOT ``ask``).

    Level qty key is ``qtty`` (MQTT + SDK) or ``quantity`` (OpenAPI docs).
    """
    conv = _f if is_derivative else _to_vnd

    def _level(item: dict[str, Any]) -> dict[str, float]:
        qty = item.get("qtty")
        if qty is None:
            qty = item.get("quantity")
        return {"price": conv(item.get("price")), "volume": _f(qty)}

    return {
        "type": "orderbook",
        "symbol": raw.get("symbol", ""),
        "bids": [_level(b) for b in (raw.get("bid") or [])],
        "asks": [_level(a) for a in (raw.get("offer") or [])],
        "time": _time_value(raw.get("sendingTime") or raw.get("time")),
    }


def normalize_ohlc(raw: dict[str, Any], *, is_derivative: bool = False) -> dict[str, Any]:
    """1-minute OHLC bar. ``time``/``lastUpdated`` are epoch seconds (string)."""
    conv = _f if is_derivative else _to_vnd
    return {
        "type": "ohlc",
        "symbol": raw.get("symbol", ""),
        "time": int(_f(raw.get("time"))),
        "open": conv(raw.get("open")),
        "high": conv(raw.get("high")),
        "low": conv(raw.get("low")),
        "close": conv(raw.get("close")),
        "volume": _f(raw.get("volume")),
        "last_updated": int(_f(raw.get("lastUpdated"))),
    }


def normalize_index(raw: dict[str, Any]) -> dict[str, Any]:
    """Market index — values are points, NOT ×1000.

    Handles both the legacy MQTT shape (``indexValue``/``change``/...) and the
    OpenAPI ``mi`` shape (``indexName``/``valueIndexes``/``changedValue``/
    ``changedRatio``/``fluctuation*IssueCount``/``transactTime``).
    """
    return {
        "type": "index",
        "code": raw.get("indexName") or raw.get("symbol") or raw.get("code") or raw.get("indexId", ""),
        "value": _f(raw.get("valueIndexes") or raw.get("indexValue") or raw.get("value")),
        "change": _f(raw.get("changedValue") or raw.get("change")),
        "change_percent": _f(raw.get("changedRatio") or raw.get("changePercent") or raw.get("ratioChange")),
        "total_volume": _f(raw.get("totalVolumeTraded") or raw.get("allQty") or raw.get("totalQtty")),
        # OpenAPI ``grossTradeAmount`` về đơn vị tỷ đồng (docs: 18650.467 ≈ phiên
        # ~18.65k tỷ) → quy về VND tuyệt đối cho khớp contract IndexData.totalValue.
        "total_value": (
            _f(raw.get("grossTradeAmount")) * 1e9
            if raw.get("grossTradeAmount") is not None
            else _f(raw.get("allValue") or raw.get("totalValue"))
        ),
        "advances": _f(raw.get("fluctuationUpIssueCount") or raw.get("advances")),
        "declines": _f(raw.get("fluctuationDownIssueCount") or raw.get("declines")),
        "nochange": _f(raw.get("fluctuationSteadinessIssueCount") or raw.get("nochange") or raw.get("noChanges")),
        "time": _time_value(raw.get("transactTime") or raw.get("sendingTime") or raw.get("time")),
    }


def normalize(kind: str, raw: dict[str, Any], *, is_derivative: bool = False) -> dict[str, Any] | None:
    """Dispatch by kind. Returns None for unsupported kinds."""
    if kind == KIND_TICK:
        return normalize_tick(raw, is_derivative=is_derivative)
    if kind == KIND_ORDERBOOK:
        return normalize_orderbook(raw, is_derivative=is_derivative)
    if kind == KIND_OHLC:
        return normalize_ohlc(raw, is_derivative=is_derivative)
    if kind == KIND_INDEX:
        return normalize_index(raw)
    return None
