"""Unit tests for realtime DNSE payload normalization.

Payloads are the exact shapes captured live from DNSE MQTT on 2026-06-11.
"""

from __future__ import annotations

from app.services.realtime import normalize
from app.services.realtime.topics import mqtt_topic, redis_channel


def test_topic_kind():
    assert normalize.topic_kind("plaintext/quotes/krx/mdds/tick/v1/roundlot/symbol/FPT") == "tick"
    assert (
        normalize.topic_kind("plaintext/quotes/krx/mdds/topprice/v1/roundlot/symbol/FPT")
        == "orderbook"
    )
    assert normalize.topic_kind("plaintext/quotes/krx/mdds/v2/ohlc/stock/1/FPT") == "ohlc"
    assert normalize.topic_kind("plaintext/quotes/krx/mdds/marketindex/v1/code/VNINDEX") == "index"
    assert normalize.topic_kind("garbage/topic") is None


def test_normalize_tick_stock_price_x1000():
    raw = {
        "symbol": "FPT",
        "matchPrice": 73.4,
        "matchQtty": 10.0,
        "sendingTime": "2026-06-11T02:42:05.184Z",
        "tradingSessionId": "TRADING_SESSION_ID_40",
        "totalVolumeTraded": "63210",
        "side": "SIDE_BUY",
    }
    out = normalize.normalize_tick(raw)
    assert out["symbol"] == "FPT"
    assert out["price"] == 73400  # nghìn đồng → VND
    assert out["volume"] == 10.0
    assert out["side"] == "B"
    assert out["total_volume"] == 63210
    assert out["time"] == "2026-06-11T02:42:05.184Z"


def test_normalize_tick_sell_side():
    out = normalize.normalize_tick({"symbol": "VIC", "matchPrice": 50.0, "side": "SIDE_SELL"})
    assert out["side"] == "S"
    assert out["price"] == 50000


def test_normalize_tick_derivative_no_x1000():
    out = normalize.normalize_tick(
        {"symbol": "VN30F1M", "matchPrice": 1320.5, "side": "SIDE_BUY"},
        is_derivative=True,
    )
    assert out["price"] == 1320.5  # index points, not ×1000


def test_normalize_orderbook_bid_offer():
    raw = {
        "symbol": "FPT",
        "sendingTime": "2026-06-11T02:42:06.182Z",
        "bid": [{"price": 73.3, "qtty": 3010.0}, {"price": 73.2, "qtty": 5940.0}],
        "offer": [{"price": 73.4, "qtty": 270.0}],
    }
    out = normalize.normalize_orderbook(raw)
    assert out["bids"][0] == {"price": 73300, "volume": 3010.0}
    assert out["bids"][1] == {"price": 73200, "volume": 5940.0}
    assert out["asks"][0] == {"price": 73400, "volume": 270.0}  # offer → asks


def test_normalize_ohlc():
    raw = {
        "time": "1780541940",
        "open": 76.6,
        "high": 76.6,
        "low": 76.6,
        "close": 76.6,
        "volume": "12900",
        "symbol": "FPT",
        "lastUpdated": "1780541992",
    }
    out = normalize.normalize_ohlc(raw)
    assert out["symbol"] == "FPT"
    assert out["time"] == 1780541940
    assert out["close"] == 76600
    assert out["volume"] == 12900
    assert out["last_updated"] == 1780541992


def test_normalize_index_no_x1000():
    raw = {"symbol": "VNINDEX", "indexValue": 1285.5, "change": 5.2, "changePercent": 0.41}
    out = normalize.normalize_index(raw)
    assert out["code"] == "VNINDEX"
    assert out["value"] == 1285.5  # points, not ×1000
    assert out["change"] == 5.2


def test_normalize_dispatch():
    assert normalize.normalize("tick", {"symbol": "FPT", "matchPrice": 1.0})["price"] == 1000
    assert normalize.normalize("unknown", {}) is None


def test_safe_parsing_bad_values():
    out = normalize.normalize_tick({"symbol": "X", "matchPrice": None, "matchQtty": "abc"})
    assert out["price"] == 0
    assert out["volume"] == 0.0


def test_mqtt_topic_builder():
    assert mqtt_topic("tick", "fpt") == "plaintext/quotes/krx/mdds/tick/v1/roundlot/symbol/FPT"
    assert (
        mqtt_topic("orderbook", "vic")
        == "plaintext/quotes/krx/mdds/topprice/v1/roundlot/symbol/VIC"
    )
    assert mqtt_topic("ohlc", "hpg") == "plaintext/quotes/krx/mdds/v2/ohlc/stock/1/HPG"
    assert mqtt_topic("index", "vnindex") == "plaintext/quotes/krx/mdds/marketindex/v1/code/VNINDEX"


def test_redis_channel_naming():
    assert redis_channel("tick", "fpt") == "rt:tick:FPT"
    assert redis_channel("orderbook", "fpt") == "rt:ob:FPT"
    assert redis_channel("ohlc", "fpt") == "rt:ohlc:FPT"
    assert redis_channel("index", "vnindex") == "rt:index:VNINDEX"
