# backend/tests/test_midday_payload.py
from unittest.mock import AsyncMock, patch
import pytest
from app.services.ai.market_analysis import midday_payload as MP


@pytest.mark.asyncio
async def test_build_midday_charts_tags_data_state():
    eod = {"market_health_detail": {"pct_above_ma20": 40.0, "trend_20d": [1,2]}, "sector_rotation": {"sectors_today": [{"name":"Ngân hàng","pct":1.2}]}}
    charts = MP._build_midday_charts(
        breadth={"up": 100, "down": 80, "flat": 10, "ceiling": 2, "floor": 1, "ratio_up_down": "1 : 0.8", "classification": "Đi ngang", "pct_above_ma20": None},
        contribution={"top_positive": [], "top_negative": []},
        foreign_detail={"total_buy_vnd_billion": 100.0, "total_sell_vnd_billion": 80.0, "streak": {"count":1,"direction":"buy","last_5d_cumulative":None}, "last_12_sessions": [], "top_sell": [], "top_buy": []},
        prop_detail=None,  # degraded
        eod_previous_charts=eod,
    )
    assert charts["breadth"]["data_state"] == "am_session"
    assert charts["market_health_detail"]["data_state"] == "eod_previous"
    assert charts["market_health_detail"]["pct_above_ma20"] == 40.0
    assert charts["prop_detail"]["data_state"] == "unavailable"


@pytest.mark.asyncio
async def test_build_midday_charts_all_am_live():
    """All AM blocks present, no EOD previous — frozen blocks should be unavailable."""
    charts = MP._build_midday_charts(
        breadth={"up": 200, "down": 100, "flat": 50, "ceiling": 5, "floor": 2, "ratio_up_down": "2.0 : 1", "classification": "Tích cực", "pct_above_ma20": 55.0},
        contribution={"top_positive": [{"ticker": "VCB", "points": 1.2}], "top_negative": []},
        foreign_detail={"total_buy_vnd_billion": 200.0, "total_sell_vnd_billion": 150.0, "streak": {"count": 3, "direction": "buy", "last_5d_cumulative": 500.0}, "last_12_sessions": [], "top_sell": [], "top_buy": []},
        prop_detail={"total_buy_vnd_billion": 50.0, "total_sell_vnd_billion": 30.0, "net_vnd_billion": 20.0, "last_12_sessions": [], "top_buy": [], "top_sell": []},
        eod_previous_charts=None,
    )
    assert charts["breadth"]["data_state"] == "am_session"
    assert charts["contribution"]["data_state"] == "am_session"
    assert charts["foreign_detail"]["data_state"] == "am_session"
    assert charts["prop_detail"]["data_state"] == "am_session"
    assert charts["market_health_detail"]["data_state"] == "unavailable"
    assert charts["sector_rotation"]["data_state"] == "unavailable"


@pytest.mark.asyncio
async def test_build_midday_charts_foreign_degraded():
    """foreign_detail=None → data_state unavailable; other AM blocks still present."""
    eod = {"market_health_detail": {"pct_above_ma20": 35.0, "trend_20d": []}, "sector_rotation": {"sectors_today": []}}
    charts = MP._build_midday_charts(
        breadth={"up": 150, "down": 90, "flat": 30, "ceiling": 3, "floor": 1, "ratio_up_down": "1.7 : 1", "classification": "Nghiêng tăng", "pct_above_ma20": 48.0},
        contribution={"top_positive": [], "top_negative": []},
        foreign_detail=None,
        prop_detail={"total_buy_vnd_billion": 40.0, "total_sell_vnd_billion": 35.0, "net_vnd_billion": 5.0, "last_12_sessions": [], "top_buy": [], "top_sell": []},
        eod_previous_charts=eod,
    )
    assert charts["foreign_detail"]["data_state"] == "unavailable"
    assert charts["breadth"]["data_state"] == "am_session"
    assert charts["prop_detail"]["data_state"] == "am_session"
    assert charts["market_health_detail"]["data_state"] == "eod_previous"
    assert charts["sector_rotation"]["data_state"] == "eod_previous"


@pytest.mark.asyncio
async def test_build_midday_charts_sector_rotation_frozen_passthrough():
    """sector_rotation from EOD is forwarded verbatim with data_state injected."""
    eod = {
        "market_health_detail": {"pct_above_ma20": 50.0, "trend_20d": [48.0, 50.0]},
        "sector_rotation": {"sectors_today": [{"name": "Tài chính", "pct": 2.5}, {"name": "BĐS", "pct": -1.0}]},
    }
    charts = MP._build_midday_charts(
        breadth={"up": 100, "down": 80, "flat": 10, "ceiling": 2, "floor": 1, "ratio_up_down": "1.3 : 1", "classification": "Cân bằng", "pct_above_ma20": None},
        contribution={"top_positive": [], "top_negative": []},
        foreign_detail={"total_buy_vnd_billion": 50.0, "total_sell_vnd_billion": 60.0, "streak": {"count": 2, "direction": "sell", "last_5d_cumulative": None}, "last_12_sessions": [], "top_sell": [], "top_buy": []},
        prop_detail=None,
        eod_previous_charts=eod,
    )
    sector = charts["sector_rotation"]
    assert sector["data_state"] == "eod_previous"
    assert sector["sectors_today"][0]["name"] == "Tài chính"
    assert sector["sectors_today"][1]["pct"] == -1.0


@pytest.mark.asyncio
async def test_build_midday_payload_meta_fields():
    """build_midday_payload returns correct meta.report_type, session_phase, missing_fields."""
    import asyncio
    from datetime import datetime, timezone, timedelta

    ICT = timezone(timedelta(hours=7))
    now_ts = int(datetime.now(ICT).replace(hour=11, minute=30, second=0).timestamp())

    # Minimal mocks for all data sources
    mock_index = [
        {"symbol": "VNINDEX", "price": 1280.5, "ref_price": 1270.0, "change": 10.5, "change_percent": 0.826,
         "total_stock_increase": 250, "total_stock_decline": 100, "total_stock_no_change": 50,
         "total_stock_ceiling": 5, "total_stock_floor": 2, "total_value_million_vnd": 5000.0, "time": ""},
    ]
    mock_liquidity = [{"symbols": ["ALL"], "timestamps": [now_ts], "accumulated_volume": [1000000],
                       "accumulated_value_million_vnd": [4500.0], "min_batch_trunc_time": None}]
    mock_impact = {"top_up": [{"symbol": "VCB", "impact": 1.2, "exchange": "HOSE", "company_name": "Vietcombank", "match_price": 80000, "ref_price": 79000.0}],
                   "top_down": [], "group": "ALL", "time_frame": "ONE_DAY"}
    mock_foreign = [{"trunc_time": now_ts, "foreign_buy_volume": 1000000, "foreign_sell_volume": 800000,
                     "foreign_buy_value_vnd": 100_000_000_000, "foreign_sell_value_vnd": 80_000_000_000,
                     "group": "ALL", "time_frame": "ONE_DAY"}]
    mock_foreign_top = {"net_buy": [], "net_sell": [], "total_net_buy_vnd": 20_000_000_000, "total_net_sell_vnd": 0, "group": "ALL"}
    mock_prop = [{"trading_date": "2026-07-02", "total_buy_value_vnd": 50_000_000_000, "total_sell_value_vnd": 40_000_000_000,
                  "total_buy_volume": 500000, "total_sell_volume": 400000, "total_deal_buy_volume": 0, "total_deal_sell_volume": 0}]
    mock_prop_top = {"buy": [], "sell": [], "trading_date": "2026-07-02"}

    with (
        patch("app.services.ai.market_analysis.midday_payload.mo.fetch_market_index", new=AsyncMock(return_value=(mock_index, "url"))),
        patch("app.services.ai.market_analysis.midday_payload.mo.fetch_liquidity", new=AsyncMock(return_value=(mock_liquidity, "url"))),
        patch("app.services.ai.market_analysis.midday_payload.mo.fetch_index_impact", new=AsyncMock(return_value=(mock_impact, "url"))),
        patch("app.services.ai.market_analysis.midday_payload.mo.fetch_foreign", new=AsyncMock(return_value=(mock_foreign, "url"))),
        patch("app.services.ai.market_analysis.midday_payload.mo.fetch_foreign_top", new=AsyncMock(return_value=(mock_foreign_top, "url"))),
        patch("app.services.ai.market_analysis.midday_payload.mo.fetch_proprietary", new=AsyncMock(return_value=(mock_prop, "url"))),
        patch("app.services.ai.market_analysis.midday_payload.mo.fetch_proprietary_top", new=AsyncMock(return_value=(mock_prop_top, "url"))),
        patch("app.services.ai.market_analysis.midday_payload.MP._load_previous_eod", new=AsyncMock(return_value=None)),
    ):
        db = AsyncMock()
        payload = await MP.build_midday_payload(db)

    assert payload["meta"]["report_type"] == "midday"
    assert payload["meta"]["session_phase"] == "am"
    assert "missing_fields" in payload["meta"]
    assert "generated_for_date" in payload["meta"]
    # pulse block
    assert "pulse" in payload
    pulse = payload["pulse"]
    assert "vn_index" in pulse
    assert "breadth" in pulse
    assert "foreign_net_billion" in pulse
    assert "liquidity" in pulse
    assert isinstance(pulse["vn_index"]["sparkline"], list)
