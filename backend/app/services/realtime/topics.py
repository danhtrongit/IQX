"""KRX MQTT topic builders + Redis pub/sub channel naming.

Topics verified live 2026-06-11 (wildcard '#' is NOT authorized — must
subscribe each symbol's exact topic).
"""

from __future__ import annotations

from app.services.realtime.normalize import (
    KIND_INDEX,
    KIND_OHLC,
    KIND_ORDERBOOK,
    KIND_TICK,
)

_KRX = "plaintext/quotes/krx/mdds"

# Canonical channel names the WS handler subscribes to in the client request.
CHANNELS = (KIND_TICK, KIND_ORDERBOOK, KIND_OHLC, KIND_INDEX)


def mqtt_topic(kind: str, symbol: str) -> str | None:
    """Build the exact KRX MQTT topic for a (kind, symbol)."""
    s = symbol.upper()
    if kind == KIND_TICK:
        return f"{_KRX}/tick/v1/roundlot/symbol/{s}"
    if kind == KIND_ORDERBOOK:
        return f"{_KRX}/topprice/v1/roundlot/symbol/{s}"
    if kind == KIND_OHLC:
        return f"{_KRX}/v2/ohlc/stock/1/{s}"
    if kind == KIND_INDEX:
        return f"{_KRX}/marketindex/v1/code/{s}"
    return None


def redis_channel(kind: str, symbol: str) -> str:
    """Redis pub/sub channel for a normalized message."""
    prefix = {
        KIND_TICK: "rt:tick",
        KIND_ORDERBOOK: "rt:ob",
        KIND_OHLC: "rt:ohlc",
        KIND_INDEX: "rt:index",
    }.get(kind, "rt:other")
    return f"{prefix}:{symbol.upper()}"
