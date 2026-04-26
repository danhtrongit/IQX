"""Tests for Vietcap Sector and Screening source connectors and API endpoints.

Uses unittest.mock to patch the HTTP client, never hitting external APIs.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

# ══════════════════════════════════════════════════════
# Sector connector unit tests (mocked)
# ══════════════════════════════════════════════════════

_SECTOR_FETCH = "app.services.market_data.sources.vietcap_sector.fetch_json"


@pytest.mark.asyncio
async def test_sector_trading_dates():
    from app.services.market_data.sources.vietcap_sector import fetch_trading_dates
    mock_resp = {
        "status": 200, "successful": True,
        "data": [
            "2026-04-24", "2026-04-23", "2026-04-22",
            "2026-04-21", "2026-04-20",
        ],
    }
    with patch(_SECTOR_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, url = await fetch_trading_dates()
    assert len(data) == 5
    assert data[0] == "2026-04-24"
    assert data[-1] == "2026-04-20"


@pytest.mark.asyncio
async def test_sector_trading_dates_bad_shape():
    from app.services.market_data.sources.vietcap_sector import (
        SectorUpstreamShapeError,
        fetch_trading_dates,
    )
    mock_resp = {"status": 200, "successful": True, "data": "not list"}
    with (
        patch(_SECTOR_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(SectorUpstreamShapeError, match="Expected list"),
    ):
        await fetch_trading_dates()


@pytest.mark.asyncio
async def test_sector_trading_dates_transport_error():
    from app.services.market_data.sources.vietcap_sector import (
        SectorUpstreamError,
        fetch_trading_dates,
    )
    with (
        patch(_SECTOR_FETCH, new_callable=AsyncMock, side_effect=Exception("timeout")),
        pytest.raises(SectorUpstreamError, match="timeout"),
    ):
        await fetch_trading_dates()


@pytest.mark.asyncio
async def test_sector_ranking():
    from app.services.market_data.sources.vietcap_sector import fetch_sector_ranking
    mock_resp = {
        "status": 200, "successful": True,
        "data": [
            {
                "name": "8300",
                "values": [
                    {"date": "2026-04-24", "value": 59},
                    {
                        "date": "2026-04-07", "value": 36,
                        "sectorTrend": "DOWN",
                        "extremeValue": 35,
                        "trendStartValue": 41,
                    },
                ],
            },
            {
                "name": "8600",
                "values": [
                    {"date": "2026-04-24", "value": 72},
                ],
            },
        ],
    }
    with patch(_SECTOR_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, url = await fetch_sector_ranking()
    assert len(data) == 2
    assert data[0]["icb_code"] == "8300"
    assert len(data[0]["values"]) == 2
    # First value has no trend
    assert data[0]["values"][0]["value"] == 59
    assert "sector_trend" not in data[0]["values"][0]
    # Second value has trend signal
    assert data[0]["values"][1]["sector_trend"] == "DOWN"
    assert data[0]["values"][1]["extreme_value"] == 35
    assert data[0]["values"][1]["trend_start_value"] == 41


@pytest.mark.asyncio
async def test_sector_ranking_bad_shape():
    from app.services.market_data.sources.vietcap_sector import (
        SectorUpstreamShapeError,
        fetch_sector_ranking,
    )
    mock_resp = "not dict"
    with (
        patch(_SECTOR_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(SectorUpstreamShapeError),
    ):
        await fetch_sector_ranking()


@pytest.mark.asyncio
async def test_sector_information():
    from app.services.market_data.sources.vietcap_sector import fetch_sector_information
    mock_resp = {
        "status": 200, "successful": True,
        "data": [
            {
                "icbCode": "8600",
                "marketCap": 2904291991948489,
                "last20DayIndex": [694.31, 721.86, 947.85],
                "lastCloseIndex": 947.85,
                "percentPriceChange1Day": -0.0178,
                "percentPriceChange1Week": 0.0725,
                "percentPriceChange1Month": 0.4521,
                "percentPriceChange6Month": 0.3902,
                "percentPriceChangeYTD": 0.1233,
                "percentPriceChange1Year": 1.7349,
                "percentPriceChange2Year": 2.1541,
                "percentPriceChange5Year": 0.8547,
            },
        ],
    }
    with patch(_SECTOR_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, url = await fetch_sector_information()
    assert len(data) == 1
    assert data[0]["icb_code"] == "8600"
    assert data[0]["market_cap"] == 2904291991948489
    assert isinstance(data[0]["market_cap"], int)
    assert data[0]["last_close_index"] == 947.85
    assert isinstance(data[0]["last_close_index"], float)
    assert len(data[0]["last_20_day_index"]) == 3
    assert data[0]["percent_price_change_1d"] == -0.0178
    assert data[0]["percent_price_change_5y"] == 0.8547


@pytest.mark.asyncio
async def test_sector_information_bad_shape():
    from app.services.market_data.sources.vietcap_sector import (
        SectorUpstreamShapeError,
        fetch_sector_information,
    )
    mock_resp = {"status": 200, "successful": True, "data": "bad"}
    with (
        patch(_SECTOR_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(SectorUpstreamShapeError, match="Expected list"),
    ):
        await fetch_sector_information()


# ══════════════════════════════════════════════════════
# Screening connector unit tests (mocked)
# ══════════════════════════════════════════════════════

_SCREENING_FETCH = "app.services.market_data.sources.vietcap_screening.fetch_json"


@pytest.mark.asyncio
async def test_screening_criteria():
    from app.services.market_data.sources.vietcap_screening import fetch_screening_criteria
    mock_resp = {
        "status": 200,
        "data": [
            {
                "id": "abc123",
                "category": "general",
                "name": "exchange",
                "order": 5,
                "allowDuplicate": False,
                "selectType": "multiple",
                "sliderStepper": None,
                "multiplier": None,
                "min": None,
                "max": None,
                "conditionOptions": [
                    {"type": "value", "viName": "HOSE", "enName": "HOSE", "value": "hsx"},
                ],
                "conditionExtra": None,
                "active": True,
            },
        ],
    }
    with patch(_SCREENING_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, url = await fetch_screening_criteria()
    assert len(data) == 1
    assert data[0]["name"] == "exchange"
    assert data[0]["category"] == "general"
    assert data[0]["select_type"] == "multiple"
    assert len(data[0]["condition_options"]) == 1
    assert data[0]["condition_options"][0]["value"] == "hsx"


@pytest.mark.asyncio
async def test_screening_criteria_bad_shape():
    from app.services.market_data.sources.vietcap_screening import (
        ScreeningUpstreamShapeError,
        fetch_screening_criteria,
    )
    mock_resp = {"status": 200, "data": "not list"}
    with (
        patch(_SCREENING_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(ScreeningUpstreamShapeError, match="Expected list"),
    ):
        await fetch_screening_criteria()


@pytest.mark.asyncio
async def test_screening_criteria_transport_error():
    from app.services.market_data.sources.vietcap_screening import (
        ScreeningUpstreamError,
        fetch_screening_criteria,
    )
    with (
        patch(_SCREENING_FETCH, new_callable=AsyncMock, side_effect=Exception("timeout")),
        pytest.raises(ScreeningUpstreamError, match="timeout"),
    ):
        await fetch_screening_criteria()


@pytest.mark.asyncio
async def test_screening_paging():
    from app.services.market_data.sources.vietcap_screening import fetch_screening_paging
    mock_resp = {
        "status": 200,
        "data": {
            "content": [
                {
                    "ticker": "FCC",
                    "exchange": "UPCOM",
                    "refPrice": 47200,
                    "ceiling": 54200,
                    "marketPrice": 47200,
                    "floor": 40200,
                    "accumulatedValue": 0,
                    "accumulatedVolume": 0,
                    "marketCap": 283060288000,
                    "dailyPriceChangePercent": 0,
                    "enOrganName": "Foodstuff Corp",
                    "viOrganName": "Cong ty Thuc pham",
                    "enOrganShortName": "Foodstuff",
                    "viOrganShortName": "Thuc pham",
                    "icbCodeLv2": "8600",
                    "enSector": "Real Estate",
                    "viSector": "Bat dong san",
                    "icbCodeLv4": "8633",
                    "stockStrength": 99,
                },
            ],
            "totalElements": 312,
            "totalPages": 157,
            "last": False,
            "first": True,
            "size": 2,
            "number": 0,
            "numberOfElements": 1,
            "empty": False,
        },
    }
    with patch(_SCREENING_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, url = await fetch_screening_paging(page=0, page_size=2)
    assert len(data["content"]) == 1
    assert data["content"][0]["ticker"] == "FCC"
    assert data["content"][0]["stock_strength"] == 99
    assert data["content"][0]["market_cap"] == 283060288000
    assert data["total_elements"] == 312
    assert data["total_pages"] == 157
    assert data["first"] is True
    assert data["last"] is False


@pytest.mark.asyncio
async def test_screening_paging_bad_shape():
    from app.services.market_data.sources.vietcap_screening import (
        ScreeningUpstreamShapeError,
        fetch_screening_paging,
    )
    mock_resp = {"status": 200, "data": "not dict"}
    with (
        patch(_SCREENING_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(ScreeningUpstreamShapeError, match="Expected dict"),
    ):
        await fetch_screening_paging()


@pytest.mark.asyncio
async def test_preset_screeners():
    from app.services.market_data.sources.vietcap_screening import fetch_preset_screeners
    mock_resp = {
        "status": 200,
        "data": {
            "SYSTEM": [
                {
                    "id": "abc",
                    "name": "Leading Stocks",
                    "viName": "Top CP manh nhat",
                    "mode": "slider",
                    "order": 1,
                    "metrics": [
                        {
                            "name": "exchange",
                            "category": "general",
                            "conditionOptions": [
                                {"type": "value", "value": "hsx"},
                            ],
                        },
                    ],
                },
            ],
        },
    }
    with patch(_SCREENING_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, url = await fetch_preset_screeners()
    assert "SYSTEM" in data
    assert len(data["SYSTEM"]) == 1
    assert data["SYSTEM"][0]["name"] == "Leading Stocks"
    assert data["SYSTEM"][0]["vi_name"] == "Top CP manh nhat"
    assert len(data["SYSTEM"][0]["metrics"]) == 1


@pytest.mark.asyncio
async def test_preset_screeners_bad_shape():
    from app.services.market_data.sources.vietcap_screening import (
        ScreeningUpstreamShapeError,
        fetch_preset_screeners,
    )
    mock_resp = {"status": 200, "data": "bad"}
    with (
        patch(_SCREENING_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(ScreeningUpstreamShapeError, match="Expected dict"),
    ):
        await fetch_preset_screeners()


# ══════════════════════════════════════════════════════
# Sector API endpoint tests (happy path)
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_api_sector_trading_dates(client: AsyncClient):
    mock_resp = {
        "status": 200, "successful": True,
        "data": ["2026-04-24", "2026-04-23"],
    }
    with patch(_SECTOR_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        resp = await client.get("/api/v1/market-data/sectors/trading-dates")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 2
    assert body["data"][0] == "2026-04-24"


@pytest.mark.asyncio
async def test_api_sector_ranking(client: AsyncClient):
    mock_resp = {
        "status": 200, "successful": True,
        "data": [
            {"name": "8300", "values": [{"date": "2026-04-24", "value": 59}]},
        ],
    }
    with patch(_SECTOR_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        resp = await client.get(
            "/api/v1/market-data/sectors/ranking?icb_level=2&adtv=3&value=3",
        )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["icb_code"] == "8300"


@pytest.mark.asyncio
async def test_api_sector_ranking_invalid_adtv(client: AsyncClient):
    resp = await client.get(
        "/api/v1/market-data/sectors/ranking?adtv=99",
    )
    assert resp.status_code == 422
    assert "adtv" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_api_sector_ranking_invalid_value(client: AsyncClient):
    resp = await client.get(
        "/api/v1/market-data/sectors/ranking?value=99",
    )
    assert resp.status_code == 422
    assert "value" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_api_sector_ranking_invalid_icb_level(client: AsyncClient):
    resp = await client.get(
        "/api/v1/market-data/sectors/ranking?icb_level=0",
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_api_sector_information(client: AsyncClient):
    mock_resp = {
        "status": 200, "successful": True,
        "data": [
            {
                "icbCode": "8600",
                "marketCap": 2904291991948489,
                "last20DayIndex": [694.31, 947.85],
                "lastCloseIndex": 947.85,
                "percentPriceChange1Day": -0.0178,
                "percentPriceChange1Week": 0.0725,
                "percentPriceChange1Month": 0.4521,
                "percentPriceChange6Month": 0.3902,
                "percentPriceChangeYTD": 0.1233,
                "percentPriceChange1Year": 1.7349,
                "percentPriceChange2Year": 2.1541,
                "percentPriceChange5Year": 0.8547,
            },
        ],
    }
    with patch(_SECTOR_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        resp = await client.get(
            "/api/v1/market-data/sectors/information?icb_level=2",
        )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["icb_code"] == "8600"
    assert body["data"][0]["market_cap"] == 2904291991948489


@pytest.mark.asyncio
async def test_api_sector_information_invalid_icb_level(client: AsyncClient):
    resp = await client.get(
        "/api/v1/market-data/sectors/information?icb_level=5",
    )
    assert resp.status_code == 422


# ══════════════════════════════════════════════════════
# Screening API endpoint tests (happy path)
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_api_screening_criteria(client: AsyncClient):
    mock_resp = {
        "status": 200,
        "data": [
            {
                "id": "abc",
                "category": "general",
                "name": "exchange",
                "order": 5,
                "selectType": "multiple",
                "conditionOptions": [],
                "active": True,
            },
        ],
    }
    with patch(_SCREENING_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        resp = await client.get("/api/v1/market-data/screening/criteria")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["name"] == "exchange"


@pytest.mark.asyncio
async def test_api_screening_search(client: AsyncClient):
    mock_resp = {
        "status": 200,
        "data": {
            "content": [
                {
                    "ticker": "FPT",
                    "exchange": "HOSE",
                    "marketPrice": 73400,
                    "marketCap": 126570579090300,
                    "stockStrength": 45,
                },
            ],
            "totalElements": 1,
            "totalPages": 1,
            "first": True,
            "last": True,
            "size": 50,
            "number": 0,
            "empty": False,
        },
    }
    with patch(_SCREENING_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        resp = await client.post(
            "/api/v1/market-data/screening/search",
            json={
                "page": 0,
                "pageSize": 50,
                "sortFields": ["stockStrength"],
                "sortOrders": ["DESC"],
                "filter": [
                    {
                        "name": "exchange",
                        "conditionOptions": [
                            {"type": "value", "value": "hsx"},
                        ],
                    },
                ],
            },
        )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]["content"]) == 1
    assert body["data"]["content"][0]["ticker"] == "FPT"
    assert body["data"]["total_elements"] == 1


@pytest.mark.asyncio
async def test_api_screening_search_empty_filter(client: AsyncClient):
    """Empty filter → should pass validation (returns all stocks)."""
    mock_resp = {
        "status": 200,
        "data": {
            "content": [],
            "totalElements": 0,
            "totalPages": 0,
            "first": True,
            "last": True,
            "size": 50,
            "number": 0,
            "empty": True,
        },
    }
    with patch(_SCREENING_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        resp = await client.post(
            "/api/v1/market-data/screening/search",
            json={"filter": []},
        )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_api_screening_search_range_filter(client: AsyncClient):
    """Range filter with from/to should pass validation."""
    mock_resp = {
        "status": 200,
        "data": {
            "content": [],
            "totalElements": 0,
            "totalPages": 0,
            "first": True,
            "last": True,
            "size": 50,
            "number": 0,
            "empty": True,
        },
    }
    with patch(_SCREENING_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        resp = await client.post(
            "/api/v1/market-data/screening/search",
            json={
                "filter": [
                    {
                        "name": "stockStrength",
                        "conditionOptions": [{"from": 70, "to": 100}],
                    },
                    {
                        "name": "rs",
                        "conditionOptions": [{"from": 50, "to": 100}],
                        "extraName": "3Month",
                    },
                ],
            },
        )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_api_screening_search_invalid_sort_order(client: AsyncClient):
    resp = await client.post(
        "/api/v1/market-data/screening/search",
        json={
            "sortOrders": ["INVALID"],
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_api_screening_search_invalid_page_size(client: AsyncClient):
    resp = await client.post(
        "/api/v1/market-data/screening/search",
        json={"pageSize": 999},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_api_screening_presets(client: AsyncClient):
    mock_resp = {
        "status": 200,
        "data": {
            "SYSTEM": [
                {
                    "id": "abc",
                    "name": "Leading Stocks",
                    "viName": "Top CP manh nhat",
                    "mode": "slider",
                    "order": 1,
                    "metrics": [],
                },
            ],
        },
    }
    with patch(_SCREENING_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        resp = await client.get("/api/v1/market-data/screening/presets")
    assert resp.status_code == 200
    body = resp.json()
    assert "SYSTEM" in body["data"]
    assert len(body["data"]["SYSTEM"]) == 1
    assert body["data"]["SYSTEM"][0]["name"] == "Leading Stocks"


# ══════════════════════════════════════════════════════
# Upstream error → correct HTTP status
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_api_sector_trading_dates_upstream_shape_error(client: AsyncClient):
    mock_resp = "not dict"
    with patch(_SECTOR_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        resp = await client.get("/api/v1/market-data/sectors/trading-dates")
    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_api_sector_ranking_upstream_error(client: AsyncClient):
    with patch(_SECTOR_FETCH, new_callable=AsyncMock, side_effect=Exception("fail")):
        resp = await client.get("/api/v1/market-data/sectors/ranking")
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_api_screening_criteria_upstream_error(client: AsyncClient):
    with patch(_SCREENING_FETCH, new_callable=AsyncMock, side_effect=Exception("fail")):
        resp = await client.get("/api/v1/market-data/screening/criteria")
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_api_screening_search_upstream_shape_error(client: AsyncClient):
    mock_resp = {"status": 200, "data": "bad"}
    with patch(_SCREENING_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        resp = await client.post(
            "/api/v1/market-data/screening/search",
            json={},
        )
    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_api_screening_presets_upstream_error(client: AsyncClient):
    with patch(_SCREENING_FETCH, new_callable=AsyncMock, side_effect=Exception("fail")):
        resp = await client.get("/api/v1/market-data/screening/presets")
    assert resp.status_code == 503
