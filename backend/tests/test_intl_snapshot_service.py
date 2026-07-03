# backend/tests/test_intl_snapshot_service.py
import datetime as dt
import pytest
from app.services.market_data.intl_snapshot import persist_snapshot_rows, load_latest_snapshot

P = {"^GSPC": {"symbol": "^GSPC", "name": "S&P 500", "last_price": 6124.85, "previous_close": 6100.2,
               "change_value": 24.65, "change_percent": 0.4041, "day_high": 6130.1, "day_low": 6090.5,
               "volume": 1, "currency": "USD", "market_state": "CLOSED", "market_time": "2026-07-02T20:00:00+00:00"}}

@pytest.mark.asyncio
async def test_upsert_updates_same_day_row(db_session):
    d = dt.date(2026, 7, 3)
    await persist_snapshot_rows(db_session, d, P, requested=["^GSPC"])
    p2 = {"^GSPC": {**P["^GSPC"], "last_price": 6200.0}}
    res = await persist_snapshot_rows(db_session, d, p2, requested=["^GSPC"])
    rows = await load_latest_snapshot(db_session)
    assert len(rows) == 1 and float(rows[0].last_price) == 6200.0 and res["upserted"] == 1

@pytest.mark.asyncio
async def test_stale_copy_from_previous_day(db_session):
    y, t = dt.date(2026, 7, 2), dt.date(2026, 7, 3)
    await persist_snapshot_rows(db_session, y, P, requested=["^GSPC"])
    res = await persist_snapshot_rows(db_session, t, {}, requested=["^GSPC"])  # today's fetch failed
    rows = await load_latest_snapshot(db_session)
    assert res["stale_copied"] == 1 and rows[0].stale is True and rows[0].snapshot_date == t

@pytest.mark.asyncio
async def test_missing_when_no_history(db_session):
    res = await persist_snapshot_rows(db_session, dt.date(2026, 7, 3), {}, requested=["ES=F"])
    assert res["missing"] == ["ES=F"] and res["stale_copied"] == 0

@pytest.mark.asyncio
async def test_incomplete_parsed_row_routes_to_stale_path(db_session):
    y, t = dt.date(2026, 7, 2), dt.date(2026, 7, 3)
    await persist_snapshot_rows(db_session, y, P, requested=["^GSPC"])  # good history yesterday
    bad = {"^GSPC": {"symbol": "^GSPC", "name": "S&P 500", "last_price": 6124.85,
                     "previous_close": None, "change_value": None, "change_percent": None}}
    res = await persist_snapshot_rows(db_session, t, bad, requested=["^GSPC"])
    assert res["upserted"] == 0 and res["stale_copied"] == 1
    rows = await load_latest_snapshot(db_session)
    assert rows[0].stale is True and rows[0].snapshot_date == t and float(rows[0].previous_close) == float(P["^GSPC"]["previous_close"])
