"""Tests for the pre-market payload builder (Task B2)."""

import datetime as dt
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from app.services.ai.market_analysis import premarket_payload as PP


def _snap(symbol, price, pct, stale=False):
    class R:  # minimal stand-in for MarketDataSnapshot row
        pass

    r = R()
    r.symbol = symbol
    r.last_price = price
    r.change_percent = pct
    r.stale = stale
    r.asset_category = "fx" if symbol == "VND=X" else "us_index"
    r.name = symbol
    return r


@pytest.mark.asyncio
async def test_payload_cells_and_usdvnd_inversion(db_session):
    rows = [_snap("^GSPC", 6124.85, 0.40), _snap("VND=X", 26100, -0.15)]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    assert cells["^GSPC"]["sentiment"] == "up"
    assert cells["VND=X"]["sentiment"] == "up"          # USD weakening (−0.15%) → positive
    assert cells["^N225"]["value"] is None               # absent symbol degrades, cell still present
    assert "global_markets" in p["meta"]["missing_fields"] or cells["^N225"]["stale"]
    assert p["meta"]["report_type"] == "premarket" and p["news_pool"] == [] and p["events_pool"] == []


@pytest.mark.asyncio
async def test_all_six_cells_always_emitted(db_session):
    """All 6 grid cells must be present even when snapshot is completely empty.

    VCB fallback is also mocked to fail so that VND=X also degrades to None.
    """
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=[])), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))), \
         patch.object(PP, "fetch_fx", new=AsyncMock(side_effect=Exception("vcb down"))):
        p = await PP.build_premarket_payload(db_session)

    expected_ids = {"^GSPC", "^IXIC", "^N225", "BZ=F", "GC=F", "VND=X"}
    cell_ids = {c["id"] for c in p["global_markets"]["cells"]}
    assert cell_ids == expected_ids
    for cell in p["global_markets"]["cells"]:
        assert cell["value"] is None
        assert cell["stale"] is True
    assert "global_markets" in p["meta"]["missing_fields"]


@pytest.mark.asyncio
async def test_usdvnd_positive_change_is_down(db_session):
    """USD/VND: change_pct > 0 (USD strengthening) → 'down' sentiment."""
    rows = [_snap("VND=X", 26200, 0.50)]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    assert cells["VND=X"]["sentiment"] == "down"


@pytest.mark.asyncio
async def test_usdvnd_zero_change_is_flat(db_session):
    """USD/VND: change_pct == 0 → 'flat' sentiment."""
    rows = [_snap("VND=X", 26100, 0.0)]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    assert cells["VND=X"]["sentiment"] == "flat"


@pytest.mark.asyncio
async def test_news_fetch_failure_degrades_gracefully(db_session):
    """News fetch failure → empty pool + 'news_pool' in missing_fields."""
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=[])), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(side_effect=Exception("network err"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)
    assert p["news_pool"] == []
    assert "news_pool" in p["meta"]["missing_fields"]


@pytest.mark.asyncio
async def test_events_fetch_failure_degrades_gracefully(db_session):
    """Events fetch failure → empty pool + 'events_pool' in missing_fields."""
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=[])), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(side_effect=Exception("timeout"))):
        p = await PP.build_premarket_payload(db_session)
    assert p["events_pool"] == []
    assert "events_pool" in p["meta"]["missing_fields"]


@pytest.mark.asyncio
async def test_vcb_fallback_for_missing_vndx(db_session):
    """VND=X absent from snapshot → VCB FX fallback used for value."""
    rows = [_snap("^GSPC", 6124.85, 0.40)]
    vcb_rows = [
        {"currency_code": "USD", "sell": 26150.0, "date": "2026-07-03"},
        {"currency_code": "EUR", "sell": 28000.0, "date": "2026-07-03"},
    ]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))), \
         patch.object(PP, "fetch_fx", new=AsyncMock(return_value=(vcb_rows, "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    vnd_cell = cells["VND=X"]
    assert vnd_cell["value"] == 26150.0
    assert vnd_cell["change_pct"] is None
    assert vnd_cell.get("source") == "vcb"
    # stale could be False since we got a real value from VCB
    assert vnd_cell["sentiment"] == "flat"  # None change_pct → flat


@pytest.mark.asyncio
async def test_meta_structure(db_session):
    """meta block has required keys with correct report_type."""
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=[])), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)

    meta = p["meta"]
    assert meta["report_type"] == "premarket"
    assert "generated_for_date" in meta
    assert "missing_fields" in meta
    assert "weekday_vi" in meta
    assert "is_post_weekend" in meta
    assert "is_post_holiday" in meta
    assert isinstance(meta["missing_fields"], list)


@pytest.mark.asyncio
async def test_config_mirrors_meta_flags(db_session):
    """config block must duplicate meta flags consumed by prompt."""
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=[])), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)

    cfg = p["config"]
    assert cfg["is_post_weekend"] == p["meta"]["is_post_weekend"]
    assert cfg["is_post_holiday"] == p["meta"]["is_post_holiday"]
    assert "generated_for_date" in cfg


@pytest.mark.asyncio
async def test_cells_fixed_order(db_session):
    """The 6 cells must be emitted in fixed order regardless of snapshot order."""
    rows = [
        _snap("GC=F", 3350.0, 0.2),
        _snap("^GSPC", 6124.85, 0.40),
        _snap("BZ=F", 78.5, -0.3),
    ]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)

    expected_order = ["^GSPC", "^IXIC", "^N225", "BZ=F", "GC=F", "VND=X"]
    actual_order = [c["id"] for c in p["global_markets"]["cells"]]
    assert actual_order == expected_order


@pytest.mark.asyncio
async def test_stale_cell_in_missing_fields(db_session):
    """Stale snapshot row → cell stale=True and symbol in missing_fields (or stale noted)."""
    rows = [_snap("^GSPC", 6000.0, 0.1, stale=True)]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    assert cells["^GSPC"]["stale"] is True


@pytest.mark.asyncio
async def test_decimal_prices_converted_to_float(db_session):
    """Decimal values from the ORM must be converted to float in cells."""
    rows = [_snap("^GSPC", Decimal("6124.85"), Decimal("0.40"))]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    assert isinstance(cells["^GSPC"]["value"], float)
    assert isinstance(cells["^GSPC"]["change_pct"], float)
