"""Live smoke/contract tests for market data endpoints.

Run ONLY when the environment variable RUN_MARKET_DATA_LIVE_TESTS=1 is set.
These tests hit the actual upstream APIs (VCI, VND, MBK, Fmarket, SPL, RSS).

Usage:
    RUN_MARKET_DATA_LIVE_TESTS=1 uv run pytest tests/test_market_data_live.py -v
"""

from __future__ import annotations

import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_MARKET_DATA_LIVE_TESTS", "") != "1",
    reason="Live tests disabled (set RUN_MARKET_DATA_LIVE_TESTS=1 to enable)",
)

_BASE = "/api/v1/market-data"

# Collect results for final summary
_results: list[dict[str, str | int]] = []


def _record(
    endpoint: str,
    status: int,
    source: str = "",
    count: int | str = "",
    raw_endpoint: str = "",
) -> None:
    _results.append({
        "endpoint": endpoint,
        "status": status,
        "source": source,
        "count": count,
        "raw_endpoint": raw_endpoint[:80] if raw_endpoint else "",
    })


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ══════════════════════════════════════════════════════
# 1. Reference
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_live_reference_symbols(client: AsyncClient):
    resp = await client.get(f"{_BASE}/reference/symbols?exchange=HOSE")
    body = resp.json()
    _record(
        "/reference/symbols?exchange=HOSE",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] in ("VCI", "VND")
    assert len(body["data"]) > 0, "Expected non-empty symbol list"


@pytest.mark.asyncio
async def test_live_reference_industries(client: AsyncClient):
    resp = await client.get(f"{_BASE}/reference/industries")
    body = resp.json()
    _record(
        "/reference/industries",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "VCI"
    assert len(body["data"]) > 0, "Expected non-empty industries"


@pytest.mark.asyncio
async def test_live_reference_indices(client: AsyncClient):
    resp = await client.get(f"{_BASE}/reference/indices")
    body = resp.json()
    _record(
        "/reference/indices",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert len(body["data"]) > 0


@pytest.mark.asyncio
async def test_live_reference_group_symbols(client: AsyncClient):
    resp = await client.get(f"{_BASE}/reference/groups/VN30/symbols")
    body = resp.json()
    _record(
        "/reference/groups/VN30/symbols",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert len(body["data"]) > 0


# ══════════════════════════════════════════════════════
# 2. Quotes
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_live_ohlcv(client: AsyncClient):
    resp = await client.get(
        f"{_BASE}/quotes/VCB/ohlcv?interval=1D&start=2024-01-01&end=2024-03-31"
    )
    body = resp.json()
    _record(
        "/quotes/VCB/ohlcv",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] in ("VND", "VCI")
    assert len(body["data"]) > 0


@pytest.mark.asyncio
async def test_live_intraday(client: AsyncClient):
    resp = await client.get(f"{_BASE}/quotes/VCB/intraday")
    body = resp.json()
    data = body.get("data", []) if isinstance(body.get("data"), list) else []
    count = len(data)
    _record(
        "/quotes/VCB/intraday",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        count,
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    # Intraday may be empty outside trading hours
    assert resp.status_code == 200
    # When data is present, assert field quality
    if count > 0:
        first = data[0]
        assert first.get("time"), "time must be non-empty"
        assert first.get("price", 0) > 0, "price must be > 0"
        assert first.get("volume", 0) > 0, "volume must be > 0"


@pytest.mark.asyncio
async def test_live_price_depth(client: AsyncClient):
    resp = await client.get(f"{_BASE}/quotes/VCB/price-depth")
    body = resp.json()
    count = len(body.get("data", [])) if isinstance(body.get("data"), list) else 0
    _record(
        "/quotes/VCB/price-depth",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        count,
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    # When data is present, assert all numeric fields are floats (not strings)
    if count > 0:
        first = body["data"][0]
        for field in ("price", "volume", "buy_volume", "sell_volume", "undefined_volume"):
            assert isinstance(first.get(field), (int, float)), f"{field} must be numeric, got {type(first.get(field))}"
        assert first["price"] > 0, "price must be > 0"


# ══════════════════════════════════════════════════════
# 3. Trading
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_live_price_board(client: AsyncClient):
    resp = await client.post(
        f"{_BASE}/trading/price-board",
        json={"symbols": ["VCB", "VNM", "FPT"]},
    )
    body = resp.json()
    _record(
        "/trading/price-board",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert len(body["data"]) > 0


@pytest.mark.asyncio
async def test_live_foreign_trade(client: AsyncClient):
    resp = await client.get(f"{_BASE}/trading/VCB/foreign-trade?limit=10")
    body = resp.json()
    count = len(body.get("data", [])) if isinstance(body.get("data"), list) else 0
    _record(
        "/trading/VCB/foreign-trade",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        count,
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_live_insider_deals(client: AsyncClient):
    resp = await client.get(f"{_BASE}/trading/VCB/insider-deals?limit=10")
    body = resp.json()
    count = len(body.get("data", [])) if isinstance(body.get("data"), list) else 0
    _record(
        "/trading/VCB/insider-deals",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        count,
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200


# ══════════════════════════════════════════════════════
# 4. Company  (KBS profile + news)
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_live_company_overview(client: AsyncClient):
    resp = await client.get(f"{_BASE}/company/VCB/overview")
    body = resp.json()
    data = body.get("data", {})
    _record(
        "/company/VCB/overview",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(data) if isinstance(data, dict) else 0,
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "KBS"
    assert isinstance(data, dict) and len(data) > 0
    assert data.get("symbol") == "VCB"
    assert data.get("exchange") == "HOSE"
    # charter_capital must be in VND (>1B for any listed company)
    cc = data.get("charter_capital", 0)
    assert cc > 1_000_000_000, f"charter_capital must be VND (got {cc})"
    # listed_volume must be in shares (>1M for any large-cap)
    lv = data.get("listed_volume", 0)
    assert lv > 1_000_000, f"listed_volume must be shares (got {lv})"
    # outstanding_shares should be close to listed_volume
    os_shares = data.get("outstanding_shares", 0)
    assert os_shares > 1_000_000, f"outstanding_shares must be >1M (got {os_shares})"
    # par_value is typically 10000 VND
    assert data.get("par_value") in (10000, 100000, None)


@pytest.mark.asyncio
async def test_live_company_shareholders(client: AsyncClient):
    resp = await client.get(f"{_BASE}/company/VCB/shareholders")
    body = resp.json()
    data = body.get("data", [])
    _record(
        "/company/VCB/shareholders",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(data),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "KBS"
    assert len(data) > 0
    assert data[0].get("name"), "shareholder name must be non-empty"
    assert data[0].get("ownership_percentage") is not None


@pytest.mark.asyncio
async def test_live_company_officers(client: AsyncClient):
    resp = await client.get(f"{_BASE}/company/VCB/officers")
    body = resp.json()
    data = body.get("data", [])
    _record(
        "/company/VCB/officers",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(data),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "KBS"
    assert len(data) > 0
    assert data[0].get("name"), "officer name must be non-empty"


@pytest.mark.asyncio
async def test_live_company_subsidiaries(client: AsyncClient):
    resp = await client.get(f"{_BASE}/company/VCB/subsidiaries")
    body = resp.json()
    data = body.get("data", [])
    _record(
        "/company/VCB/subsidiaries",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(data),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "KBS"
    assert len(data) > 0
    assert data[0].get("name"), "subsidiary name must be non-empty"
    assert data[0].get("type") in ("subsidiary", "affiliate")


@pytest.mark.asyncio
async def test_live_company_news(client: AsyncClient):
    resp = await client.get(f"{_BASE}/company/VCB/news")
    body = resp.json()
    data = body.get("data", [])
    _record(
        "/company/VCB/news",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(data),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "KBS"
    # News may be empty sometimes, allow_empty=True in endpoint


# ══════════════════════════════════════════════════════
# 5. Fundamentals
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_live_fundamentals_balance_sheet(client: AsyncClient):
    resp = await client.get(f"{_BASE}/fundamentals/VCB/balance_sheet")
    body = resp.json()
    _record(
        "/fundamentals/VCB/balance_sheet",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert len(body["data"]) > 0


@pytest.mark.asyncio
async def test_live_fundamentals_ratio(client: AsyncClient):
    resp = await client.get(f"{_BASE}/fundamentals/VCB/ratio")
    body = resp.json()
    _record(
        "/fundamentals/VCB/ratio",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert len(body["data"]) > 0


# ══════════════════════════════════════════════════════
# 6. Insights
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_live_insights_ranking(client: AsyncClient):
    resp = await client.get(f"{_BASE}/insights/ranking/gainer")
    body = resp.json()
    _record(
        "/insights/ranking/gainer",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "VND"


# ══════════════════════════════════════════════════════
# 7. Events
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_live_events_calendar(client: AsyncClient):
    resp = await client.get(
        f"{_BASE}/events/calendar?start=2024-01-01&end=2024-12-31&event_type=dividend"
    )
    body = resp.json()
    _record(
        "/events/calendar?dividend",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200


# ══════════════════════════════════════════════════════
# 8. Macro
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_live_macro_gdp(client: AsyncClient):
    resp = await client.get(
        f"{_BASE}/macro/economy/gdp?start_year=2020&period=quarter"
    )
    body = resp.json()
    _record(
        "/macro/economy/gdp",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "MBK"
    assert len(body["data"]) > 0, "Expected non-empty GDP data"


# ══════════════════════════════════════════════════════
# 9. Funds
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_live_funds_listing(client: AsyncClient):
    resp = await client.get(f"{_BASE}/funds")
    body = resp.json()
    _record(
        "/funds",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "FMARKET"
    assert len(body["data"]) > 0


@pytest.mark.asyncio
async def test_live_funds_detail(client: AsyncClient):
    """Get a real fund_id from listing, then fetch its detail."""
    listing = await client.get(f"{_BASE}/funds")
    funds = listing.json().get("data", [])
    assert len(funds) > 0, "listing must be non-empty to test detail"
    fund_id = funds[0]["fund_id"]

    resp = await client.get(f"{_BASE}/funds/{fund_id}")
    body = resp.json()
    data = body.get("data", {})
    _record(
        f"/funds/{fund_id}",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(data.get("top_holdings", [])) if isinstance(data, dict) else 0,
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "FMARKET"
    assert isinstance(data, dict)
    assert "top_holdings" in data
    assert "industry_holdings" in data
    assert "asset_holdings" in data


@pytest.mark.asyncio
async def test_live_funds_nav(client: AsyncClient):
    """Get a real fund_id from listing, then fetch its NAV history."""
    listing = await client.get(f"{_BASE}/funds")
    funds = listing.json().get("data", [])
    assert len(funds) > 0, "listing must be non-empty to test nav"
    fund_id = funds[0]["fund_id"]

    resp = await client.get(f"{_BASE}/funds/{fund_id}/nav")
    body = resp.json()
    data = body.get("data", [])
    _record(
        f"/funds/{fund_id}/nav",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(data),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "FMARKET"
    assert len(data) > 0
    assert data[0].get("date"), "NAV date must be non-empty"
    assert data[0].get("nav_per_unit") is not None


@pytest.mark.asyncio
async def test_live_funds_invalid_id(client: AsyncClient):
    """Invalid fund_id should return 404, not 502."""
    resp = await client.get(f"{_BASE}/funds/99999999")
    body = resp.json()
    _record(
        "/funds/99999999",
        resp.status_code,
        "FMARKET",
        0,
        "404_expected",
    )
    assert resp.status_code == 404
    assert "not found" in body.get("detail", "").lower()


# ══════════════════════════════════════════════════════
# 10. Commodities
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_live_commodities_list(client: AsyncClient):
    resp = await client.get(f"{_BASE}/macro/commodities")
    body = resp.json()
    _record(
        "/macro/commodities",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert len(body["data"]) > 10


@pytest.mark.asyncio
async def test_live_commodity_gold(client: AsyncClient):
    resp = await client.get(
        f"{_BASE}/macro/commodities/gold_global?start=2024-01-01&end=2024-03-31"
    )
    body = resp.json()
    _record(
        "/macro/commodities/gold_global",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "SPL"


# ══════════════════════════════════════════════════════
# 11. News
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_live_news_sources(client: AsyncClient):
    resp = await client.get(f"{_BASE}/news/sources")
    body = resp.json()
    _record(
        "/news/sources",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        len(body.get("data", [])),
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert len(body["data"]) > 0


@pytest.mark.asyncio
async def test_live_news_latest(client: AsyncClient):
    resp = await client.get(f"{_BASE}/news/latest?sites=vnexpress&max_per_site=5")
    body = resp.json()
    count = len(body.get("data", [])) if isinstance(body.get("data"), list) else 0
    _record(
        "/news/latest?vnexpress",
        resp.status_code,
        body.get("meta", {}).get("source", ""),
        count,
        body.get("meta", {}).get("raw_endpoint", ""),
    )
    assert resp.status_code == 200
    assert body["meta"]["source"] == "RSS"


# ══════════════════════════════════════════════════════
# Summary printer
# ══════════════════════════════════════════════════════


def test_zz_print_summary():
    """Print summary table at the end (named with zz_ to run last)."""
    if not _results:
        pytest.skip("No live test results to summarize")

    print("\n" + "=" * 100)
    print(f"{'Endpoint':<40} {'Status':>6} {'Source':<10} {'Count':>8} {'Raw Endpoint'}")
    print("-" * 100)
    for r in _results:
        print(
            f"{r['endpoint']:<40} {r['status']:>6} {r['source']:<10} "
            f"{r['count']:>8} {r['raw_endpoint']}"
        )
    print("=" * 100)
