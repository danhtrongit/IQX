"""Market data API tests with mocked HTTP responses.

Uses unittest.mock to patch the HTTP client, never hitting external APIs.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

# ══════════════════════════════════════════════════════
# Reference: GET /reference/symbols
# ══════════════════════════════════════════════════════

_VCI_SYMBOLS_RESPONSE = [
    {
        "symbol": "VCB",
        "organName": "Ngân hàng TMCP Ngoại thương Việt Nam",
        "board": "HSX",
        "type": "STOCK",
    },
    {
        "symbol": "FPT",
        "organName": "CTCP FPT",
        "board": "HSX",
        "type": "STOCK",
    },
    {
        "symbol": "SHB",
        "organName": "Ngân hàng TMCP Sài Gòn - Hà Nội",
        "board": "HNX",
        "type": "STOCK",
    },
]


@pytest.mark.asyncio
async def test_reference_symbols_vci_primary(client: AsyncClient):
    """VCI primary source returns normalized symbol data."""
    with patch("app.services.market_data.sources.vietcap.fetch_json", new_callable=AsyncMock) as mock:
        mock.return_value = _VCI_SYMBOLS_RESPONSE

        resp = await client.get("/api/v1/market-data/reference/symbols")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "VCI"
        assert body["meta"]["fallback_used"] is False
        assert len(body["data"]) == 3
        assert body["data"][0]["symbol"] == "VCB"
        assert body["data"][0]["exchange"] == "HOSE"  # HSX → HOSE normalization


@pytest.mark.asyncio
async def test_reference_symbols_exchange_filter(client: AsyncClient):
    """Exchange filter works correctly."""
    with patch("app.services.market_data.sources.vietcap.fetch_json", new_callable=AsyncMock) as mock:
        mock.return_value = _VCI_SYMBOLS_RESPONSE

        resp = await client.get("/api/v1/market-data/reference/symbols?exchange=HNX")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 1
        assert body["data"][0]["symbol"] == "SHB"


@pytest.mark.asyncio
async def test_reference_symbols_fallback_to_vnd(client: AsyncClient):
    """When VCI fails, VND fallback is used."""
    vnd_response = {
        "data": [
            {"code": "VCB", "companyName": "VCB Corp", "floor": "HOSE", "type": "stock"},
        ]
    }

    with (
        patch("app.services.market_data.sources.vietcap.fetch_json", new_callable=AsyncMock) as vci_mock,
        patch("app.services.market_data.sources.vndirect.fetch_json", new_callable=AsyncMock) as vnd_mock,
    ):
        vci_mock.side_effect = Exception("VCI timeout")
        vnd_mock.return_value = vnd_response

        resp = await client.get("/api/v1/market-data/reference/symbols")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "VND"
        assert body["meta"]["fallback_used"] is True
        assert body["meta"]["source_priority"] == 2
        assert len(body["data"]) == 1


@pytest.mark.asyncio
async def test_reference_symbols_all_fail_returns_502(client: AsyncClient):
    """When all sources fail, returns 502."""
    with (
        patch("app.services.market_data.sources.vietcap.fetch_json", new_callable=AsyncMock) as vci_mock,
        patch("app.services.market_data.sources.vndirect.fetch_json", new_callable=AsyncMock) as vnd_mock,
    ):
        vci_mock.side_effect = Exception("VCI down")
        vnd_mock.side_effect = Exception("VND down")

        resp = await client.get("/api/v1/market-data/reference/symbols")
        assert resp.status_code == 502


# ══════════════════════════════════════════════════════
# Reference: GET /reference/industries
# ══════════════════════════════════════════════════════

_VCI_INDUSTRIES_RESPONSE = {
    "data": [
        {"name": "8000", "viSector": "Tài chính", "enSector": "Financials", "icbLevel": 1},
        {"name": "8300", "viSector": "Ngân hàng", "enSector": "Banks", "icbLevel": 2},
    ]
}


@pytest.mark.asyncio
async def test_reference_industries(client: AsyncClient):
    with patch("app.services.market_data.sources.vietcap.fetch_json", new_callable=AsyncMock) as mock:
        mock.return_value = _VCI_INDUSTRIES_RESPONSE

        resp = await client.get("/api/v1/market-data/reference/industries")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "VCI"
        assert len(body["data"]) == 2
        assert body["data"][0]["icb_code"] == "8000"
        assert body["data"][0]["icb_name"] == "Tài chính"


# ══════════════════════════════════════════════════════
# Reference: GET /reference/indices
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_reference_indices(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/reference/indices")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["source"] == "STATIC"
    assert any(i["code"] == "VNINDEX" for i in body["data"])


@pytest.mark.asyncio
async def test_reference_indices_filter_by_group(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/reference/indices?group=HNX")
    assert resp.status_code == 200
    body = resp.json()
    assert all(i["exchange"] == "HNX" for i in body["data"])


# ══════════════════════════════════════════════════════
# Reference: GET /reference/groups/{group}/symbols
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_reference_group_symbols(client: AsyncClient):
    with patch("app.services.market_data.sources.vietcap.fetch_json", new_callable=AsyncMock) as mock:
        mock.return_value = [{"symbol": "VCB"}, {"symbol": "FPT"}, {"symbol": "VNM"}]

        resp = await client.get("/api/v1/market-data/reference/groups/VN30/symbols")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 3


@pytest.mark.asyncio
async def test_reference_group_invalid_returns_422(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/reference/groups/INVALID_GROUP/symbols")
    assert resp.status_code == 422


# ══════════════════════════════════════════════════════
# Quotes: GET /quotes/{symbol}/ohlcv
# ══════════════════════════════════════════════════════

_VND_OHLCV_RESPONSE = {
    "t": [1700000000, 1700086400],
    "o": [50.0, 51.0],
    "h": [52.0, 53.0],
    "l": [49.0, 50.0],
    "c": [51.5, 52.0],
    "v": [1000000, 1200000],
    "s": "ok",
}


@pytest.mark.asyncio
async def test_ohlcv_vnd_primary(client: AsyncClient):
    with patch("app.services.market_data.sources.vndirect.fetch_json", new_callable=AsyncMock) as mock:
        mock.return_value = _VND_OHLCV_RESPONSE

        resp = await client.get(
            "/api/v1/market-data/quotes/VCB/ohlcv?start=2024-01-01&end=2024-12-31&interval=1D"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "VND"
        assert len(body["data"]) == 2
        assert body["data"][0]["open"] == 50.0
        assert body["data"][0]["volume"] == 1000000


@pytest.mark.asyncio
async def test_ohlcv_invalid_interval_returns_422(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/quotes/VCB/ohlcv?interval=2D")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ohlcv_invalid_symbol_returns_422(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/quotes/invalid!/ohlcv")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ohlcv_fallback_vci_when_vnd_fails(client: AsyncClient):
    vci_response = [
        {
            "t": [1700000000],
            "o": [50.0],
            "h": [52.0],
            "l": [49.0],
            "c": [51.5],
            "v": [1000000],
        }
    ]

    with (
        patch("app.services.market_data.sources.vndirect.fetch_json", new_callable=AsyncMock) as vnd_mock,
        patch("app.services.market_data.sources.vietcap.fetch_json", new_callable=AsyncMock) as vci_mock,
    ):
        vnd_mock.side_effect = Exception("VND timeout")
        vci_mock.return_value = vci_response

        resp = await client.get("/api/v1/market-data/quotes/VCB/ohlcv?start=2024-01-01&end=2024-12-31")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "VCI"
        assert body["meta"]["fallback_used"] is True


# ══════════════════════════════════════════════════════
# Quotes: GET /quotes/{symbol}/intraday
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_intraday(client: AsyncClient):
    with patch("app.services.market_data.sources.vietcap.fetch_json", new_callable=AsyncMock) as mock:
        mock.return_value = [
            {
                "truncTime": "1777016700",
                "matchPrice": "50500.0",
                "matchVol": "100.0",
                "matchType": "unknown",
                "accumulatedVolume": "1000.0",
                "accumulatedValue": "50000.0",
            },
            {
                "truncTime": "1777016760",
                "matchPrice": "50600.0",
                "matchVol": "200.0",
                "matchType": "shark",
                "accumulatedVolume": "1200.0",
                "accumulatedValue": "60000.0",
            },
        ]

        resp = await client.get("/api/v1/market-data/quotes/VCB/intraday?page_size=10")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 2
        assert body["data"][0]["price"] == 50500.0
        assert body["data"][0]["time"] == "1777016700"
        assert body["data"][0]["volume"] == 100.0


# ══════════════════════════════════════════════════════
# Quotes: GET /quotes/{symbol}/price-depth
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_price_depth(client: AsyncClient):
    with patch("app.services.market_data.sources.vietcap.fetch_json", new_callable=AsyncMock) as mock:
        # VCI live API returns all numeric fields as strings (e.g. "63000.0")
        mock.return_value = [
            {
                "priceStep": "63000.0",
                "accumulatedVolume": "109500.0",
                "accumulatedBuyVolume": "4800.0",
                "accumulatedSellVolume": "0.0",
                "accumulatedUndefinedVolume": "104700.0",
            }
        ]

        resp = await client.get("/api/v1/market-data/quotes/VCB/price-depth")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 1
        row = body["data"][0]
        # All fields must be numeric (float), not strings
        assert isinstance(row["price"], (int, float))
        assert isinstance(row["volume"], (int, float))
        assert isinstance(row["buy_volume"], (int, float))
        assert isinstance(row["sell_volume"], (int, float))
        assert isinstance(row["undefined_volume"], (int, float))
        # Verify actual converted values
        assert row["price"] == 63000.0
        assert row["volume"] == 109500.0
        assert row["buy_volume"] == 4800.0
        assert row["sell_volume"] == 0.0
        assert row["undefined_volume"] == 104700.0


# ══════════════════════════════════════════════════════
# Trading: POST /trading/price-board
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_price_board(client: AsyncClient):
    with patch("app.services.market_data.sources.vietcap.fetch_json", new_callable=AsyncMock) as mock:
        mock.return_value = [
            {
                "listingInfo": {
                    "symbol": "VCB",
                    "board": "HSX",
                    "ceiling": 100,
                    "floor": 90,
                    "refPrice": 95,
                },
                "matchPrice": {
                    "openPrice": 96,
                    "highest": 99,
                    "lowest": 94,
                    "matchPrice": 97,
                    "avgMatchPrice": 96.5,
                    "accumulatedVolume": 5000000,
                    "accumulatedValue": 485000000000,
                },
            },
        ]

        resp = await client.post(
            "/api/v1/market-data/trading/price-board",
            json={"symbols": ["VCB"]},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 1
        assert body["data"][0]["symbol"] == "VCB"
        assert body["data"][0]["exchange"] == "HOSE"
        assert body["data"][0]["close_price"] == 97


@pytest.mark.asyncio
async def test_price_board_empty_symbols_returns_422(client: AsyncClient):
    resp = await client.post(
        "/api/v1/market-data/trading/price-board",
        json={"symbols": []},
    )
    assert resp.status_code == 422


# ══════════════════════════════════════════════════════
# Insights: GET /insights/ranking/{kind}
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_insights_ranking_gainer(client: AsyncClient):
    with patch("app.services.market_data.sources.vndirect.fetch_json", new_callable=AsyncMock) as mock:
        mock.return_value = {
            "data": [
                {
                    "code": "FPT",
                    "index": "VNIndex",
                    "lastPrice": 130.0,
                    "priceChgCr1D": 5.0,
                    "priceChgPctCr1D": 4.0,
                    "accumulatedVal": 1000000000,
                },
            ]
        }

        resp = await client.get("/api/v1/market-data/insights/ranking/gainer?limit=5")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "VND"
        assert len(body["data"]) == 1
        assert body["data"][0]["symbol"] == "FPT"


@pytest.mark.asyncio
async def test_insights_ranking_invalid_kind(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/insights/ranking/invalid_kind")
    assert resp.status_code == 422


# ══════════════════════════════════════════════════════
# Metadata validation
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_response_always_has_meta(client: AsyncClient):
    """Every response must include source metadata."""
    with patch("app.services.market_data.sources.vietcap.fetch_json", new_callable=AsyncMock) as mock:
        mock.return_value = _VCI_SYMBOLS_RESPONSE

        resp = await client.get("/api/v1/market-data/reference/symbols")
        body = resp.json()
        meta = body["meta"]
        assert "source" in meta
        assert "source_priority" in meta
        assert "fallback_used" in meta
        assert "as_of" in meta
        assert "raw_endpoint" in meta


# ══════════════════════════════════════════════════════
# Company: KBS-sourced company data
# ══════════════════════════════════════════════════════

_KBS_PROFILE_RESPONSE: dict[str, Any] = {
    "SM": "<p>Banking services and financial solutions</p>",
    "SB": "VCB",
    "FD": "1963-04-01",
    "CC": 83557,  # rounded charter cap in billions — DROPPED by normalize
    "EX": "HOSE",
    "FV": 10000,  # par value VND (actual)
    "VL": 8356,  # rounded listed vol in millions — DROPPED by normalize
    "LP": 60000,  # listing price VND (actual)
    "KLCPLH": 8355675094,  # outstanding shares (exact count)
    "KLCPNY": 83556750940000,  # charter capital VND (exact, = KLCPLH * FV)
    "CTP": "Nguyen Thanh Tung",
    "CTPP": "Chairman",
    "ADD": "198 Tran Quang Khai, Hoan Kiem, Ha Noi",
    "PHONE": "024 3934 3137",
    "EMAIL": "ir@vietcombank.com.vn",
    "URL": "https://www.vietcombank.com.vn",
    "HS": "<p>Established in 1963 as a state bank.</p>",
    "Shareholders": [
        {"NM": "Ngân hàng Nhà nước Việt Nam", "D": "2025-03-17T00:00:00", "V": 6250338579, "OR": 74.8},
        {"NM": "Mizuho Bank", "D": "2024-12-31T00:00:00", "V": 837741468, "OR": 15.0},
    ],
    "Leaders": [
        {"FD": "2021", "PN": "CTHĐQT", "NM": "Ông Nguyễn Thanh Tùng", "PO": "Chairman of BOD", "PI": "CTHDQT"},
        {"FD": "2022", "PN": "TGĐ", "NM": "Ông Nguyễn Đức Vinh", "PO": "CEO", "PI": "TGD"},
    ],
    "Subsidiaries": [
        {"D": "2025-12-31", "NM": "VCBS", "CC": 3000000000000, "OR": 100, "CR": "VND"},
        {"D": "2025-12-31", "NM": "VCB AMC", "CC": 500000000000, "OR": 40, "CR": "VND"},
    ],
    "LaborStructure": [
        {"Name": "Quản lý", "Value": 500},
        {"Name": "Nhân viên", "Value": 18000},
    ],
}

_KBS_NEWS_RESPONSE = [
    {
        "ArticleID": 12345,
        "Title": "VCB reports strong Q1 2026 results",
        "Head": "<p>Revenue and profit both grew 20%.</p>",
        "URL": "https://example.com/vcb-q1",
        "PublishTime": "2026-04-20T10:00:00",
    },
]


@pytest.mark.asyncio
async def test_company_overview(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.kbs.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = _KBS_PROFILE_RESPONSE

        resp = await client.get("/api/v1/market-data/company/VCB/overview")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "KBS"
        data = body["data"]
        assert data["symbol"] == "VCB"
        assert data["exchange"] == "HOSE"
        # KLCPNY → charter_capital (VND, exact)
        assert data["charter_capital"] == 83556750940000
        # KLCPLH → outstanding_shares (exact count)
        assert data["outstanding_shares"] == 8355675094
        assert data["par_value"] == 10000
        assert data["listing_price"] == 60000
        # Invariant: charter_capital == outstanding_shares * par_value
        assert data["charter_capital"] == data["outstanding_shares"] * data["par_value"]
        # CC/VL/SFV are dropped (rounded/duplicate)
        assert "listed_volume" not in data
        assert "free_float_vnd" not in data
        assert "free_float_shares" not in data
        assert "Banking" in data["business_model"]  # HTML stripped
        assert data["number_of_employees"] == 18500


@pytest.mark.asyncio
async def test_company_shareholders(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.kbs.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = _KBS_PROFILE_RESPONSE

        resp = await client.get("/api/v1/market-data/company/VCB/shareholders")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "KBS"
        assert len(body["data"]) == 2
        assert body["data"][0]["name"] == "Ngân hàng Nhà nước Việt Nam"
        assert body["data"][0]["ownership_percentage"] == 74.8


@pytest.mark.asyncio
async def test_company_officers(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.kbs.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = _KBS_PROFILE_RESPONSE

        resp = await client.get("/api/v1/market-data/company/VCB/officers")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "KBS"
        assert len(body["data"]) == 2
        assert body["data"][1]["position_en"] == "CEO"


@pytest.mark.asyncio
async def test_company_subsidiaries(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.kbs.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = _KBS_PROFILE_RESPONSE

        resp = await client.get("/api/v1/market-data/company/VCB/subsidiaries")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "KBS"
        assert len(body["data"]) == 2
        assert body["data"][0]["name"] == "VCBS"
        assert body["data"][0]["type"] == "subsidiary"  # 100% ownership
        assert body["data"][1]["type"] == "affiliate"  # 40% ownership


@pytest.mark.asyncio
async def test_company_news(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.kbs.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = _KBS_NEWS_RESPONSE

        resp = await client.get("/api/v1/market-data/company/VCB/news")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "KBS"
        assert len(body["data"]) == 1
        assert "VCB" in body["data"][0]["title"]
        assert body["data"][0]["summary"]  # HTML stripped


@pytest.mark.asyncio
async def test_company_invalid_symbol_returns_422(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/company/invalid!/overview")
    assert resp.status_code == 422


# ══════════════════════════════════════════════════════
# Fundamentals: GET /fundamentals/{symbol}/{report_type}
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_fundamentals_balance_sheet(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.vietcap.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": {
                "quarters": [
                    {"field_name": "total_assets", "year": 2024, "quarter": 3, "value": 1000000},
                ],
            }
        }

        resp = await client.get("/api/v1/market-data/fundamentals/VCB/balance_sheet")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "VCI"
        assert len(body["data"]) > 0


@pytest.mark.asyncio
async def test_fundamentals_invalid_report_type(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/fundamentals/VCB/invalid_type")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_fundamentals_ratio(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.vietcap.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": [
                {"pe": 12.5, "pb": 1.8, "eps": 5000, "year": 2024},
            ]
        }

        resp = await client.get("/api/v1/market-data/fundamentals/VCB/ratio")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 1


# ══════════════════════════════════════════════════════
# Trading details
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_trading_foreign_trade(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.vietcap.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": {
                "content": [
                    {
                        "foreignBuyVolume": 100000,
                        "foreignSellVolume": 50000,
                        "tradingDate": "2024-01-15",
                    },
                ],
            }
        }

        resp = await client.get("/api/v1/market-data/trading/VCB/foreign-trade")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 1
        assert "foreign_buy_volume" in body["data"][0]


@pytest.mark.asyncio
async def test_trading_insider_deals(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.vietcap.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": {
                "content": [
                    {
                        "fullName": "Nguyen Van A",
                        "position": "CEO",
                        "quantity": 10000,
                        "dealType": "BUY",
                    },
                ],
            }
        }

        resp = await client.get("/api/v1/market-data/trading/VCB/insider-deals")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 1


# ══════════════════════════════════════════════════════
# Company Statistics: proprietary, details, price-chart
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_proprietary_history(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.vietcap.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": {
                "content": [
                    {
                        "ticker": "VCB",
                        "tradingDate": "2026-04-25",
                        "totalBuyTradeVolume": 500000,
                        "totalSellTradeVolume": 300000,
                        "totalTradeNetVolume": 200000,
                    },
                ],
            }
        }

        resp = await client.get("/api/v1/market-data/trading/VCB/proprietary")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 1
        assert body["data"][0]["total_buy_trade_volume"] == 500000


@pytest.mark.asyncio
async def test_proprietary_history_invalid_resolution(client: AsyncClient):
    resp = await client.get(
        "/api/v1/market-data/trading/VCB/proprietary?resolution=BAD"
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_proprietary_history_invalid_date(client: AsyncClient):
    resp = await client.get(
        "/api/v1/market-data/trading/VCB/proprietary?fromDate=2026-04-25"
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_proprietary_summary(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.vietcap.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": {
                "totalBuyTradeVolume": 1000000,
                "totalSellTradeVolume": 800000,
            }
        }

        resp = await client.get(
            "/api/v1/market-data/trading/VCB/proprietary/summary"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["total_buy_trade_volume"] == 1000000


@pytest.mark.asyncio
async def test_company_details(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.vietcap.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": {
                "ticker": "VCB",
                "organName": "Vietcombank",
                "exchange": "HOSE",
                "icbCode": "8300",
            }
        }

        resp = await client.get("/api/v1/market-data/company/VCB/details")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["ticker"] == "VCB"
        assert body["data"]["organ_name"] == "Vietcombank"


@pytest.mark.asyncio
async def test_company_details_invalid_symbol(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/company/bad!/details")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_company_price_chart(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.vietcap.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": [
                {
                    "openPrice": 90.5,
                    "highPrice": 92.0,
                    "lowPrice": 89.0,
                    "closingPrice": 91.5,
                    "tradingTime": 1700000000,
                },
                {
                    "openPrice": 91.5,
                    "highPrice": 93.0,
                    "lowPrice": 90.0,
                    "closingPrice": 92.0,
                    "tradingTime": 1700086400,
                },
            ]
        }

        resp = await client.get(
            "/api/v1/market-data/company/VCB/price-chart?length=30"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 2
        assert body["data"][0]["open_price"] == 90.5
        assert body["data"][0]["trading_time"] == 1700000000


@pytest.mark.asyncio
async def test_company_price_chart_invalid_length(client: AsyncClient):
    resp = await client.get(
        "/api/v1/market-data/company/VCB/price-chart?length=0"
    )
    assert resp.status_code == 422


# ══════════════════════════════════════════════════════
# Events calendar
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_events_calendar(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.vietcap.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": {
                "content": [
                    {
                        "eventTitle": "Dividend Q3 2024",
                        "eventListCode": "DIV",
                        "publicDate": "2024-10-01",
                    },
                ],
            }
        }

        resp = await client.get(
            "/api/v1/market-data/events/calendar?start=2024-01-01&end=2024-12-31"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "VCI"


# ══════════════════════════════════════════════════════
# Macro: GET /macro/economy/{indicator}
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_macro_gdp(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.mbk.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = [
            {
                "reportTime": "2024-06-30",
                "groupName": "GDP",
                "name": "GDP growth",
                "value": 6.93,
                "unit": "%",
                "day": "/Date(1719705600000)/",
            },
        ]

        resp = await client.get(
            "/api/v1/market-data/macro/economy/gdp?start_year=2020&period=quarter"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "MBK"


@pytest.mark.asyncio
async def test_macro_invalid_indicator(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/macro/economy/invalid_indicator")
    assert resp.status_code == 422


# ══════════════════════════════════════════════════════
# Funds: GET /funds
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_funds_listing(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.fmarket.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": {
                "rows": [
                    {
                        "id": 1,
                        "shortName": "VFMVN30 ETF",
                        "name": "VFMVN30 ETF Fund",
                        "dataFundAssetType": {"name": "STOCK"},
                        "owner": {"name": "VFM"},
                        "managementFee": 0.65,
                        "firstIssueAt": "2014-10-01",
                        "nav": 15000,
                        "code": "E1VFVN30",
                        "productNavChange": {
                            "navTo1Months": 2.5,
                            "navTo3Months": 5.0,
                            "navTo6Months": 10.0,
                            "navTo12Months": 15.0,
                            "navTo36Months": 40.0,
                            "updateAt": "2024-10-01",
                        },
                    },
                ],
            }
        }

        resp = await client.get("/api/v1/market-data/funds")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "FMARKET"
        assert len(body["data"]) == 1
        assert body["data"][0]["short_name"] == "VFMVN30 ETF"
        assert body["data"][0]["nav_change_6m"] == 10.0


@pytest.mark.asyncio
async def test_fund_details(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.fmarket.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": {
                "productTopHoldingList": [
                    {
                        "stockCode": "VCB",
                        "industry": "Banks",
                        "netAssetPercent": 10.5,
                        "type": "STOCK",
                    },
                ],
                "productTopHoldingBondList": [],
                "productIndustriesHoldingList": [
                    {"industry": "Banks", "assetPercent": 30.0},
                ],
                "productAssetHoldingList": [
                    {
                        "assetType": {"name": "Stock"},
                        "assetPercent": 90.0,
                    },
                ],
            }
        }

        resp = await client.get("/api/v1/market-data/funds/1")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]["top_holdings"]) == 1
        assert body["data"]["top_holdings"][0]["stock_code"] == "VCB"
        assert len(body["data"]["industry_holdings"]) == 1
        assert len(body["data"]["asset_holdings"]) == 1


@pytest.mark.asyncio
async def test_fund_nav_history(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.fmarket.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": [
                {"navDate": "2024-01-01", "nav": 15000},
                {"navDate": "2024-01-02", "nav": 15100},
            ]
        }

        resp = await client.get("/api/v1/market-data/funds/1/nav")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 2
        assert body["data"][0]["nav_per_unit"] == 15000


@pytest.mark.asyncio
async def test_fund_details_not_found(client: AsyncClient):
    """Invalid fund_id should return 404, not 502."""
    with patch(
        "app.services.market_data.sources.fmarket.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        import httpx

        response = httpx.Response(status_code=400, request=httpx.Request("GET", "https://api.fmarket.vn/res/products/99999999"))
        mock.side_effect = httpx.HTTPStatusError("", request=response.request, response=response)

        resp = await client.get("/api/v1/market-data/funds/99999999")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_fund_nav_not_found(client: AsyncClient):
    """Invalid fund_id on NAV should return 404, not 502."""
    with patch(
        "app.services.market_data.sources.fmarket.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        import httpx

        response = httpx.Response(status_code=400, request=httpx.Request("POST", "https://api.fmarket.vn/res/product/get-nav-history"))
        mock.side_effect = httpx.HTTPStatusError("", request=response.request, response=response)

        resp = await client.get("/api/v1/market-data/funds/99999999/nav")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()
# Commodities: GET /macro/commodities, /macro/commodities/{code}
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_list_commodities(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/macro/commodities")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["source"] == "SPL"
    assert isinstance(body["data"], list)
    assert len(body["data"]) > 10
    codes = {item["code"] for item in body["data"]}
    assert "gold_global" in codes
    assert "oil_crude" in codes


@pytest.mark.asyncio
async def test_commodity_price_gold(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.spl.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": [
                [1704067200, 2063.0, 2072.0, 2058.0, 2068.5, 150000],
                [1704153600, 2068.5, 2080.0, 2065.0, 2075.0, 120000],
            ]
        }

        resp = await client.get(
            "/api/v1/market-data/macro/commodities/gold_global"
            "?start=2024-01-01&end=2024-01-31"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "SPL"
        assert len(body["data"]) == 2
        assert body["data"][0]["open"] == 2063.0
        assert body["data"][1]["close"] == 2075.0


@pytest.mark.asyncio
async def test_commodity_price_dict_format(client: AsyncClient):
    with patch(
        "app.services.market_data.sources.spl.fetch_json",
        new_callable=AsyncMock,
    ) as mock:
        mock.return_value = {
            "data": [
                {
                    "time": 1704067200,
                    "open": 100,
                    "high": 110,
                    "low": 95,
                    "close": 105,
                    "volume": 5000,
                },
            ]
        }

        resp = await client.get(
            "/api/v1/market-data/macro/commodities/oil_crude"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 1
        assert body["data"][0]["close"] == 105


@pytest.mark.asyncio
async def test_commodity_invalid_code(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/macro/commodities/invalid_code")
    assert resp.status_code == 422


# ══════════════════════════════════════════════════════
# News: GET /news/latest, /news/sources
# ══════════════════════════════════════════════════════


_RSS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Stock market rises 2%</title>
      <link>https://example.com/article-1</link>
      <description>Market surged today on positive data.</description>
      <pubDate>Thu, 01 Jan 2024 08:00:00 +0700</pubDate>
    </item>
    <item>
      <title>VCB reports record profits</title>
      <link>https://example.com/article-2</link>
      <description><![CDATA[<img src="https://example.com/img.jpg"/>VCB Q3]]></description>
      <pubDate>Thu, 02 Jan 2024 10:00:00 +0700</pubDate>
    </item>
  </channel>
</rss>"""


@pytest.mark.asyncio
async def test_news_latest(client: AsyncClient):
    with patch("app.services.market_data.sources.news.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.text = _RSS_XML
        mock_response.raise_for_status = lambda: None
        mock_client.get.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_client

        resp = await client.get(
            "/api/v1/market-data/news/latest?sites=vnexpress&max_per_site=10"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["source"] == "RSS"
        assert len(body["data"]) == 2
        assert body["data"][0]["title"] == "Stock market rises 2%"
        assert body["data"][1]["link"] == "https://example.com/article-2"


@pytest.mark.asyncio
async def test_news_sources(client: AsyncClient):
    resp = await client.get("/api/v1/market-data/news/sources")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["source"] == "STATIC"
    sites = {item["site"] for item in body["data"]}
    assert "vnexpress" in sites
    assert "cafebiz" in sites
    assert all("feeds" in item for item in body["data"])


@pytest.mark.asyncio
async def test_news_rss_parser_cdata():
    """Test that CDATA and HTML are stripped correctly."""
    from app.services.market_data.sources.news import _extract_image, _strip_cdata

    assert _strip_cdata("<![CDATA[Hello World]]>") == "Hello World"
    assert _strip_cdata("<p>Text <b>bold</b></p>") == "Text bold"
    assert _strip_cdata(None) == ""

    img = _extract_image('<img src="https://img.com/photo.jpg" alt="test"/>')
    assert img == "https://img.com/photo.jpg"
    assert _extract_image("no image here") == ""
    assert _extract_image(None) == ""
