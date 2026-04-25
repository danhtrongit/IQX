"""Tests for Vietcap Market Overview source connector and API endpoints."""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest

from app.services.market_data.sources.vietcap_market_overview import (
    MarketOverviewUpstreamError,
    MarketOverviewUpstreamShapeError,
    _to_float_ratio,
    _to_int_amount,
    fetch_allocation,
    fetch_breadth,
    fetch_foreign,
    fetch_foreign_top,
    fetch_heatmap,
    fetch_heatmap_index,
    fetch_index_impact,
    fetch_liquidity,
    fetch_proprietary,
    fetch_proprietary_top,
    fetch_sectors_allocation,
    fetch_valuation,
)

_FETCH = "app.services.market_data.sources.vietcap_market_overview.fetch_json"

# ── Numeric helper tests ─────────────────────────────


class TestToIntAmount:
    def test_int(self):
        assert _to_int_amount(42) == 42

    def test_float_whole(self):
        assert _to_int_amount(50300.0) == 50300

    def test_string_whole(self):
        assert _to_int_amount("50300.0") == 50300

    def test_string_int(self):
        assert _to_int_amount("100") == 100

    def test_negative(self):
        assert _to_int_amount("-3589172164000") == -3589172164000

    def test_none(self):
        assert _to_int_amount(None) is None

    def test_empty(self):
        assert _to_int_amount("") is None

    def test_invalid(self):
        assert _to_int_amount("abc") is None

    def test_bool_excluded(self):
        assert _to_int_amount(True) is None


class TestToFloatRatio:
    def test_float(self):
        assert _to_float_ratio(11.9267) == 11.9267

    def test_string(self):
        assert _to_float_ratio("0.351") == 0.351

    def test_int(self):
        assert _to_float_ratio(10) == 10.0

    def test_none(self):
        assert _to_float_ratio(None) is None

    def test_invalid(self):
        assert _to_float_ratio("bad") is None

    def test_negative(self):
        assert _to_float_ratio("-8.903") == -8.903


# ── Connector unit tests (mocked) ────────────────────


@pytest.mark.asyncio
async def test_liquidity():
    mock_resp = [{
        "symbol": ["VNINDEX"], "t": ["1777082400"],
        "accumulatedVolume": [1709305],
        "accumulatedValue": [12054.64],
        "minBatchTruncTime": 1777082400,
    }]
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, url = await fetch_liquidity()
    assert len(data) == 1
    assert data[0]["accumulated_volume"] == [1709305]
    assert isinstance(data[0]["accumulated_volume"][0], int)
    assert isinstance(data[0]["accumulated_value_million_vnd"][0], float)


@pytest.mark.asyncio
async def test_liquidity_bad_shape():
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value="not list"),
        pytest.raises(MarketOverviewUpstreamShapeError, match="Expected list"),
    ):
        await fetch_liquidity()


@pytest.mark.asyncio
async def test_index_impact():
    mock_resp = {
        "topUp": [{"symbol": "VIC", "impact": 321.98, "exchange": "HOSE",
                    "organName": "Vingroup", "matchPrice": "212100.0",
                    "refPrice": "31350.0"}],
        "topDown": [{"symbol": "FPT", "impact": -8.9, "exchange": "HOSE",
                     "organName": "FPT Corp", "matchPrice": "73400.0",
                     "refPrice": "95572.7"}],
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_index_impact()
    assert len(data["top_up"]) == 1
    assert data["top_up"][0]["impact"] == 321.98
    assert isinstance(data["top_up"][0]["impact"], float)
    assert data["top_down"][0]["match_price"] == 73400
    assert isinstance(data["top_down"][0]["match_price"], int)


@pytest.mark.asyncio
async def test_index_impact_missing_top_up():
    """Missing topUp key → shape error, not empty 200."""
    mock_resp: dict[str, list[object]] = {"topDown": []}
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(MarketOverviewUpstreamShapeError, match="topUp"),
    ):
        await fetch_index_impact()


@pytest.mark.asyncio
async def test_index_impact_missing_top_down():
    mock_resp: dict[str, list[object]] = {"topUp": []}
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(MarketOverviewUpstreamShapeError, match="topDown"),
    ):
        await fetch_index_impact()


@pytest.mark.asyncio
async def test_foreign():
    mock_resp = [{"truncTime": 1745452800, "foreignBuyVolume": "289245061.0",
                  "foreignSellVolume": "286834860.0",
                  "foreignBuyValue": "8663969161680.0",
                  "foreignSellValue": "9193330589610.0",
                  "group": "ALL", "timeFrame": "ONE_MONTH"}]
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_foreign()
    assert len(data) == 1
    assert data[0]["foreign_buy_volume"] == 289245061
    assert isinstance(data[0]["foreign_buy_volume"], int)
    assert isinstance(data[0]["foreign_buy_value_vnd"], int)


@pytest.mark.asyncio
async def test_foreign_top():
    mock_resp = {
        "netBuy": [{"symbol": "TCX", "net": "2535474570550.0",
                     "foreignBuyValue": "6575539160202.0",
                     "foreignSellValue": "4040064589652.0",
                     "exchange": "HOSE", "organName": "TCBS",
                     "matchPrice": "50300.0", "refPrice": "48450.71"}],
        "netSell": [],
        "totalNetBuy": "10000", "totalNetSell": "-5000",
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_foreign_top()
    assert len(data["net_buy"]) == 1
    assert data["total_net_buy_vnd"] == 10000
    assert isinstance(data["total_net_buy_vnd"], int)
    assert data["net_buy"][0]["net_value_vnd"] == 2535474570550
    assert isinstance(data["net_buy"][0]["ref_price"], float)


@pytest.mark.asyncio
async def test_foreign_top_missing_keys():
    mock_resp = {"totalNetBuy": "100"}
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(MarketOverviewUpstreamShapeError, match="netBuy"),
    ):
        await fetch_foreign_top()


@pytest.mark.asyncio
async def test_proprietary():
    mock_resp = {
        "status": 200, "successful": True,
        "data": {"data": [
            {"tradingDate": "2025-05-01", "totalBuyValue": 8620030672700,
             "totalSellValue": 12248298998317, "totalBuyVolume": 274568417,
             "totalSellVolume": 406465933, "totalDealBuyVolume": 39639118,
             "totalDealSellVolume": 0},
        ]},
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_proprietary()
    assert len(data) == 1
    assert data[0]["total_buy_value_vnd"] == 8620030672700
    assert isinstance(data[0]["total_buy_value_vnd"], int)
    assert isinstance(data[0]["total_buy_volume"], int)


@pytest.mark.asyncio
async def test_proprietary_missing_data_key():
    mock_resp = {"status": 200, "successful": True, "data": {}}
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(MarketOverviewUpstreamShapeError, match="data"),
    ):
        await fetch_proprietary()


@pytest.mark.asyncio
async def test_proprietary_top():
    mock_resp = {
        "status": 200, "successful": True,
        "data": {
            "tradingDate": "25/04/2026",
            "data": {
                "BUY": [{"ticker": "GEE", "totalValue": 3200000000,
                         "totalVolume": 500000, "exchange": "HOSE",
                         "organName": "GEE Corp"}],
                "SELL": [{"ticker": "VPB", "totalValue": -3589172164000,
                          "totalVolume": 692394443, "exchange": "HOSE",
                          "organName": "VPBank"}],
            },
        },
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_proprietary_top()
    assert len(data["buy"]) == 1
    assert len(data["sell"]) == 1
    assert data["buy"][0]["ticker"] == "GEE"
    assert isinstance(data["sell"][0]["total_value_vnd"], int)


@pytest.mark.asyncio
async def test_proprietary_top_missing_data():
    mock_resp = {"status": 200, "successful": True, "data": {"tradingDate": "x"}}
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(MarketOverviewUpstreamShapeError, match="data"),
    ):
        await fetch_proprietary_top()


@pytest.mark.asyncio
async def test_allocation():
    mock_resp = [{
        "totalIncrease": [{"group": "HOSE", "val": 6054816465075510}],
        "totalDecrease": [{"group": "HOSE", "val": 624482184610010}],
        "totalSymbolIncrease": [{"group": "HOSE", "count": 264}],
        "totalSymbolDecrease": [{"group": "HOSE", "count": 180}],
    }]
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_allocation()
    assert len(data) == 1
    assert "totalIncrease_HOSE" in data[0]


@pytest.mark.asyncio
async def test_allocation_bad_shape():
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value="bad"),
        pytest.raises(MarketOverviewUpstreamShapeError),
    ):
        await fetch_allocation()


@pytest.mark.asyncio
async def test_sectors_allocation():
    mock_resp = [{"icb_code": 9000, "icbChangePercent": -20.506,
                  "totalValue": 244260147127980, "totalStockIncrease": 16,
                  "totalStockDecrease": 11}]
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_sectors_allocation()
    assert len(data) == 1
    assert data[0]["icb_code"] == 9000
    assert isinstance(data[0]["icb_change_percent"], float)
    assert isinstance(data[0]["total_value_vnd"], int)


@pytest.mark.asyncio
async def test_valuation():
    mock_resp = {
        "status": 200, "successful": True,
        "data": {"values": [
            {"date": "2025-04-25", "value": 11.9267},
            {"date": "2025-04-28", "value": 11.8198},
        ]},
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_valuation()
    assert len(data) == 2
    assert data[0]["value"] == 11.9267
    assert isinstance(data[0]["value"], float)


@pytest.mark.asyncio
async def test_valuation_missing_values():
    mock_resp = {"status": 200, "successful": True, "data": {}}
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(MarketOverviewUpstreamShapeError, match="values"),
    ):
        await fetch_valuation()


@pytest.mark.asyncio
async def test_breadth():
    mock_resp = {
        "status": 200, "successful": True,
        "data": [
            {"condition": "EMA50", "count": 556, "total": 1584,
             "percent": 0.351, "tradingDate": "2025-04-25"},
        ],
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_breadth()
    assert len(data) == 1
    assert data[0]["percent"] == 0.351
    assert isinstance(data[0]["count"], int)


@pytest.mark.asyncio
async def test_heatmap():
    mock_resp = [{
        "icb_code": 9500, "icb_name": "CNTT", "en_icb_name": "Technology",
        "icbChangePercent": -1.13, "totalMarketCap": 144073963290550,
        "data": [{"symbol": "FPT", "volume": 10459800, "value": 769854.19,
                  "price": 73400, "refPrice": 74300,
                  "marketCap": 126570579090300,
                  "ceilingPrice": 79500, "floorPrice": 69100}],
    }]
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_heatmap()
    assert len(data) == 1
    assert data[0]["icb_code"] == 9500
    assert len(data[0]["stocks"]) == 1
    assert data[0]["stocks"][0]["symbol"] == "FPT"
    assert isinstance(data[0]["stocks"][0]["volume"], int)
    assert isinstance(data[0]["stocks"][0]["value_million_vnd"], float)
    assert isinstance(data[0]["total_market_cap_vnd"], int)


@pytest.mark.asyncio
async def test_heatmap_index():
    mock_resp = {
        "totalStock": 1538, "totalTradingVolume": 794400925,
        "totalTradingValue": 21139697.99,
        "totalFrBuyVolume": 41925820, "totalFrSellVolume": 93163897,
        "totalFrBuyValue": 1624704273500,
        "totalFrSellValue": 3572863448780,
        "indexData": [
            {"symbol": "VNINDEX", "price": 1853.29, "refPrice": 1870.36},
        ],
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_heatmap_index()
    assert data["total_stock"] == 1538
    assert isinstance(data["total_stock"], int)
    assert isinstance(data["total_trading_value_million_vnd"], float)
    assert len(data["index_data"]) == 1
    assert isinstance(data["index_data"][0]["price"], float)


@pytest.mark.asyncio
async def test_heatmap_index_missing_index_data():
    mock_resp = {"totalStock": 100}
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(MarketOverviewUpstreamShapeError, match="indexData"),
    ):
        await fetch_heatmap_index()


@pytest.mark.asyncio
async def test_transport_error_wrapping():
    with (
        patch(_FETCH, new_callable=AsyncMock,
              side_effect=Exception("timeout")),
        pytest.raises(MarketOverviewUpstreamError, match="timeout"),
    ):
        await fetch_index_impact()


# ── API endpoint validation tests ────────────────────


@pytest.mark.asyncio
async def test_overview_invalid_group(client):
    resp = await client.get("/api/v1/market-data/overview/index-impact?group=BAD")
    assert resp.status_code == 422
    assert "Invalid group" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_overview_invalid_time_frame(client):
    resp = await client.get(
        "/api/v1/market-data/overview/index-impact?time_frame=BAD",
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_overview_invalid_valuation_type(client):
    resp = await client.get("/api/v1/market-data/overview/valuation?type=bad")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_overview_invalid_breadth_condition(client):
    resp = await client.get("/api/v1/market-data/overview/breadth?condition=BAD")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_overview_invalid_heatmap_sector(client):
    resp = await client.get("/api/v1/market-data/overview/heatmap?sector=bad")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_overview_invalid_heatmap_size(client):
    resp = await client.get("/api/v1/market-data/overview/heatmap?size=BAD")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_overview_invalid_breadth_exchange(client):
    resp = await client.get(
        "/api/v1/market-data/overview/breadth?exchange=INVALID",
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_overview_invalid_liquidity_symbols(client):
    resp = await client.get(
        "/api/v1/market-data/overview/liquidity?symbols=BAD",
    )
    assert resp.status_code == 422


# ── Live tests (behind env flag) ─────────────────────

_LIVE = os.environ.get("RUN_MARKET_DATA_LIVE_TESTS") == "1"
_skip_live = pytest.mark.skipif(
    not _LIVE, reason="RUN_MARKET_DATA_LIVE_TESTS not set",
)


@_skip_live
@pytest.mark.asyncio
async def test_live_liquidity():
    data, _ = await fetch_liquidity(
        symbols="ALL", time_frame="ONE_DAY",
    )
    assert isinstance(data, list)


@_skip_live
@pytest.mark.asyncio
async def test_live_index_impact():
    data, _ = await fetch_index_impact(group="ALL", time_frame="ONE_DAY")
    assert "top_up" in data
    assert "top_down" in data
    assert isinstance(data["top_up"], list)
    assert isinstance(data["top_down"], list)


@_skip_live
@pytest.mark.asyncio
async def test_live_foreign():
    data, _ = await fetch_foreign(group="ALL", time_frame="ONE_MONTH")
    assert len(data) > 0
    # Contract: volume/value are integers
    assert isinstance(data[0]["foreign_buy_volume"], int)


@_skip_live
@pytest.mark.asyncio
async def test_live_foreign_top():
    data, _ = await fetch_foreign_top(group="ALL", time_frame="ONE_YEAR")
    assert "net_buy" in data
    assert "net_sell" in data
    if data["net_buy"]:
        assert isinstance(data["net_buy"][0]["net_value_vnd"], int)


@_skip_live
@pytest.mark.asyncio
async def test_live_proprietary():
    data, _ = await fetch_proprietary(market="ALL", time_frame="ONE_YEAR")
    assert len(data) > 0
    assert isinstance(data[0]["total_buy_value_vnd"], int)


@_skip_live
@pytest.mark.asyncio
async def test_live_proprietary_top():
    data, _ = await fetch_proprietary_top(exchange="ALL", time_frame="ONE_YEAR")
    assert "buy" in data
    assert "sell" in data


@_skip_live
@pytest.mark.asyncio
async def test_live_allocation():
    data, _ = await fetch_allocation(group="ALL", time_frame="ONE_YEAR")
    assert isinstance(data, list)
    assert len(data) > 0


@_skip_live
@pytest.mark.asyncio
async def test_live_sectors_allocation():
    data, _ = await fetch_sectors_allocation(group="ALL", time_frame="ONE_YEAR")
    assert len(data) > 0
    assert data[0]["icb_code"] is not None
    assert isinstance(data[0]["icb_change_percent"], float)


@_skip_live
@pytest.mark.asyncio
async def test_live_valuation():
    data, _ = await fetch_valuation(val_type="pe", com_group_code="VNINDEX")
    assert len(data) > 0
    assert data[0]["date"]
    assert isinstance(data[0]["value"], float)


@_skip_live
@pytest.mark.asyncio
async def test_live_breadth():
    data, _ = await fetch_breadth(condition="EMA50", period="Y1")
    assert len(data) > 0
    assert isinstance(data[0]["count"], int)
    assert isinstance(data[0]["percent"], float)


@_skip_live
@pytest.mark.asyncio
async def test_live_heatmap():
    data, _ = await fetch_heatmap(group="ALL", sector="icb_code_2", size="MKC")
    assert len(data) > 0
    assert data[0]["icb_code"]
    assert isinstance(data[0]["total_market_cap_vnd"], int)


@_skip_live
@pytest.mark.asyncio
async def test_live_heatmap_index():
    data, _ = await fetch_heatmap_index()
    assert data["total_stock"] > 0
    assert isinstance(data["total_stock"], int)
    assert len(data["index_data"]) > 0
    assert isinstance(data["index_data"][0]["price"], float)
