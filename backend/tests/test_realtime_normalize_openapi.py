"""Unit tests for normalizing DNSE OpenAPI WS payload variants.

Payloads are the EXACT examples from the official docs (connect.md), so any
schema drift on DNSE's side shows up as a test-vector mismatch here.
"""

from __future__ import annotations

from app.services.realtime import normalize

# ── tick (T:"t") — Trade payload, HPG @ 24.35 nghìn đồng ──
TRADE_HPG = {
    "marketId": "STO",
    "boardId": "G1",
    "isin": "VN000000HPG4",
    "symbol": "HPG",
    "matchPrice": 24.35,
    "matchQtty": 40,
    "totalVolumeTraded": 1184240,
    "grossTradeAmount": 287.17458,
    "highestPrice": 24.35,
    "lowestPrice": 24.15,
    "openPrice": 24.25,
    "tradingSessionId": "40",
    "time": {"Seconds": 1779762571, "Nanos": 101000000},
}


def test_normalize_openapi_tick_stock():
    out = normalize.normalize_tick(TRADE_HPG)
    assert out == {
        "type": "tick",
        "symbol": "HPG",
        "price": 24350,  # nghìn đồng → VND
        "volume": 40,
        "side": "unknown",  # plain Trade has no side (only Trade Extra)
        "total_volume": 1184240,
        "time": "2026-05-26T02:29:31.101Z",  # {Seconds,Nanos} → ISO UTC
        "session": "40",
    }


def test_normalize_openapi_tick_derivative_trade_extra():
    # Trade Extra example: derivative 41I1G6000 on DVX, side SELL
    raw = {
        "marketId": "DVX",
        "boardId": "G1",
        "isin": "VN41I1G60005",
        "symbol": "41I1G6000",
        "matchPrice": 2022.5,
        "matchQtty": 1.0,
        "side": "SELL",
        "avgPrice": 2023.92,
        "totalVolumeTraded": 55913,
        "grossTradeAmount": 11316.34193,
        "highestPrice": 2028.0,
        "lowestPrice": 2018.3,
        "openPrice": 2018.6,
        "tradingSessionId": "40",
        "time": {"Seconds": 1779766822, "Nanos": 72000000},
    }
    out = normalize.normalize_tick(raw, is_derivative=True)
    assert out["price"] == 2022.5  # points, not ×1000
    assert out["side"] == "S"
    assert out["volume"] == 1.0


# ── orderbook (T:"q") — Quote payload with "quantity" level key ──
QUOTE_DVX = {
    "marketId": "DVX",
    "boardId": "G1",
    "isin": "VN41I1G60005",
    "symbol": "41I1G6000",
    "bid": [
        {"price": 2023.4, "quantity": 9.0},
        {"price": 2023.3, "quantity": 22.0},
        {"price": 2023.2, "quantity": 15.0},
    ],
    "offer": [
        {"price": 2023.6, "quantity": 3.0},
        {"price": 2023.7, "quantity": 62.0},
        {"price": 2023.8, "quantity": 16.0},
    ],
    "totalOfferQtty": 8353.0,
    "totalBidQtty": 6447.0,
    "time": {"Seconds": 1779767143, "Nanos": 736000000},
}


def test_normalize_openapi_orderbook_quantity_key_derivative():
    out = normalize.normalize_orderbook(QUOTE_DVX, is_derivative=True)
    assert out["symbol"] == "41I1G6000"
    assert out["bids"] == [
        {"price": 2023.4, "volume": 9.0},
        {"price": 2023.3, "volume": 22.0},
        {"price": 2023.2, "volume": 15.0},
    ]
    assert out["asks"][0] == {"price": 2023.6, "volume": 3.0}  # offer → asks
    assert out["time"] == "2026-05-26T03:45:43.736Z"


def test_normalize_openapi_orderbook_quantity_key_stock_x1000():
    raw = {
        "symbol": "HPG",
        "bid": [{"price": 24.3, "quantity": 100.0}],
        "offer": [{"price": 24.35, "quantity": 50.0}],
        "time": {"Seconds": 1779767143, "Nanos": 736000000},
    }
    out = normalize.normalize_orderbook(raw)
    assert out["bids"][0] == {"price": 24300, "volume": 100.0}
    assert out["asks"][0] == {"price": 24350, "volume": 50.0}


def test_normalize_orderbook_qtty_key_still_works():
    raw = {"symbol": "FPT", "bid": [{"price": 73.3, "qtty": 3010.0}], "offer": []}
    out = normalize.normalize_orderbook(raw)
    assert out["bids"][0] == {"price": 73300, "volume": 3010.0}


# ── ohlc (T:"b") — STOCK → VND, INDEX stays in points ──
def test_normalize_openapi_ohlc_stock_x1000():
    raw = {
        "time": 1757992500,
        "open": 30.4,
        "high": 30.4,
        "low": 30.25,
        "close": 30.3,
        "volume": 1398200,
        "symbol": "HPG",
        "resolution": "15",
        "lastUpdated": 1757993014,
        "type": "STOCK",
    }
    out = normalize.normalize_ohlc(raw)
    assert out["time"] == 1757992500
    assert out["open"] == 30400
    assert out["high"] == 30400
    assert out["low"] == 30250
    assert out["close"] == 30300
    assert out["volume"] == 1398200
    assert out["last_updated"] == 1757993014


def test_normalize_openapi_ohlc_index_stays_points():
    raw = {
        "time": 1757988000,
        "open": 1696.87,
        "high": 1696.87,
        "low": 1686.02,
        "close": 1686.31,
        "volume": 435873728,
        "symbol": "VNINDEX",
        "resolution": "1D",
        "lastUpdated": 1757993070,
        "type": "INDEX",
    }
    out = normalize.normalize_ohlc(raw, is_derivative=True)
    assert out["open"] == 1696.87  # points, not ×1000
    assert out["close"] == 1686.31
    assert out["symbol"] == "VNINDEX"


# ── index (T:"mi") — Market Index payload, VNINDEX ──
MARKET_INDEX_VNINDEX = {
    "indexName": "VNINDEX",
    "changedRatio": 0.41,
    "changedValue": 6.84,
    "fluctuationSteadinessIssueCount": 67,
    "fluctuationDownIssueCount": 158,
    "fluctuationUpIssueCount": 144,
    "fluctuationLowerLimitIssueCount": None,
    "fluctuationUpperLimitIssueCount": 7,
    "fluctuationDownIssueVolume": 220246500,
    "fluctuationUpIssueVolume": 446927155,
    "fluctuationSteadinessIssueVolume": 39390038,
    "currencyCode": "VND",
    "indexTypeCode": "001",
    "lowestValueIndexes": 1662.05,
    "highestValueIndexes": 1677.83,
    "priorValueIndexes": 1662.54,
    "valueIndexes": 1669.38,
    "contauctAccTrdVal": 15609.88011093,
    "contauctAccTrdVol": 606182599,
    "blkTrdAccTrdVal": 3040.58723198,
    "blkTrdAccTrdVol": 100381155,
    "grossTradeAmount": 18650.46734291,
    "totalVolumeTraded": 706563754,
    "marketIndexClass": 1,
    "marketId": "STO",
    "tradingSessionId": "40",
    "transactTime": {"Seconds": 1774940705, "Nanos": 0},
}


def test_normalize_openapi_market_index():
    out = normalize.normalize_index(MARKET_INDEX_VNINDEX)
    assert out == {
        "type": "index",
        "code": "VNINDEX",
        "value": 1669.38,
        "change": 6.84,
        "change_percent": 0.41,
        "total_volume": 706563754,
        "total_value": 18650.46734291e9,  # tỷ đồng → VND tuyệt đối
        "advances": 144,
        "declines": 158,
        "nochange": 67,
        "time": "2026-03-31T07:05:05.000Z",
    }


def test_normalize_index_legacy_mqtt_shape_still_works():
    raw = {"symbol": "VNINDEX", "indexValue": 1285.5, "change": 5.2, "changePercent": 0.41}
    out = normalize.normalize_index(raw)
    assert out["code"] == "VNINDEX"
    assert out["value"] == 1285.5
    assert out["change"] == 5.2
    assert out["change_percent"] == 0.41


# ── {Seconds,Nanos} time handling edge cases ─────────
def test_time_seconds_nanos_dict_handling():
    out = normalize.normalize_tick(
        {"symbol": "HPG", "matchPrice": 24.35, "time": {"Seconds": 1779762571, "Nanos": 101000000}}
    )
    assert out["time"] == "2026-05-26T02:29:31.101Z"

    # missing Nanos → .000Z; sendingTime string passes through unchanged
    out = normalize.normalize_tick(
        {"symbol": "HPG", "matchPrice": 24.35, "time": {"Seconds": 1779762571}}
    )
    assert out["time"] == "2026-05-26T02:29:31.000Z"

    out = normalize.normalize_tick(
        {"symbol": "FPT", "matchPrice": 73.4, "sendingTime": "2026-06-11T02:42:05.184Z"}
    )
    assert out["time"] == "2026-06-11T02:42:05.184Z"

    # empty/zero Seconds → None (no fabricated timestamp)
    out = normalize.normalize_tick({"symbol": "HPG", "matchPrice": 24.35, "time": {}})
    assert out["time"] is None
