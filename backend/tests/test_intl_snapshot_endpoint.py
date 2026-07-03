"""Tests for GET /api/v1/market-data/global/snapshot endpoint."""

from __future__ import annotations

import datetime as dt

import pytest
from app.models.market_data_snapshot import MarketDataSnapshot

pytestmark = pytest.mark.asyncio


async def test_snapshot_endpoint_filters_category(client, db_session):
    d = dt.date(2026, 7, 3)
    db_session.add(MarketDataSnapshot(snapshot_date=d, asset_category="us_index", symbol="^GSPC", name="S&P 500",
                                      last_price=6124.85, previous_close=6100.2, change_value=24.65, change_percent=0.4041))
    db_session.add(MarketDataSnapshot(snapshot_date=d, asset_category="fx", symbol="VND=X", name="USD/VND",
                                      last_price=26150, previous_close=26120, change_value=30, change_percent=0.1148, stale=True))
    await db_session.commit()
    r = await client.get("/api/v1/market-data/global/snapshot?category=fx")
    body = r.json()
    assert r.status_code == 200 and len(body["data"]) == 1 and body["data"][0]["symbol"] == "VND=X"
    assert body["data"][0]["stale"] is True and body["meta"]["stale_count"] == 1


async def test_snapshot_endpoint_no_category_returns_all(client, db_session):
    """No category param → returns all rows for the latest snapshot_date."""
    d = dt.date(2026, 7, 3)
    db_session.add(MarketDataSnapshot(snapshot_date=d, asset_category="us_index", symbol="^GSPC", name="S&P 500",
                                      last_price=6124.85, previous_close=6100.2, change_value=24.65, change_percent=0.4041))
    db_session.add(MarketDataSnapshot(snapshot_date=d, asset_category="fx", symbol="VND=X", name="USD/VND",
                                      last_price=26150, previous_close=26120, change_value=30, change_percent=0.1148))
    await db_session.commit()
    r = await client.get("/api/v1/market-data/global/snapshot")
    body = r.json()
    assert r.status_code == 200
    assert len(body["data"]) == 2
    assert body["meta"]["stale_count"] == 0
    assert body["meta"]["snapshot_date"] == "2026-07-03"


async def test_snapshot_endpoint_empty_table(client, db_session):
    """Empty table → 200 with empty data and null snapshot_date."""
    r = await client.get("/api/v1/market-data/global/snapshot")
    body = r.json()
    assert r.status_code == 200
    assert body["data"] == []
    assert body["meta"]["snapshot_date"] is None
    assert body["meta"]["stale_count"] == 0


async def test_snapshot_endpoint_stale_meta_count(client, db_session):
    """stale_count in meta reflects number of stale rows in the filtered result."""
    d = dt.date(2026, 7, 3)
    db_session.add(MarketDataSnapshot(snapshot_date=d, asset_category="us_index", symbol="^GSPC", name="S&P 500",
                                      last_price=6124.85, previous_close=6100.2, change_value=24.65, change_percent=0.4041, stale=True))
    db_session.add(MarketDataSnapshot(snapshot_date=d, asset_category="us_index", symbol="^DJI", name="Dow Jones",
                                      last_price=42000.0, previous_close=41900.0, change_value=100.0, change_percent=0.2387, stale=False))
    await db_session.commit()
    r = await client.get("/api/v1/market-data/global/snapshot?category=us_index")
    body = r.json()
    assert r.status_code == 200
    assert len(body["data"]) == 2
    assert body["meta"]["stale_count"] == 1


async def test_snapshot_endpoint_numeric_serialized_as_float(client, db_session):
    """Decimal/Numeric fields must serialize as floats, not strings."""
    d = dt.date(2026, 7, 3)
    db_session.add(MarketDataSnapshot(snapshot_date=d, asset_category="us_index", symbol="^GSPC", name="S&P 500",
                                      last_price=6124.85, previous_close=6100.2, change_value=24.65, change_percent=0.4041))
    await db_session.commit()
    r = await client.get("/api/v1/market-data/global/snapshot")
    body = r.json()
    row = body["data"][0]
    assert isinstance(row["last_price"], float)
    assert isinstance(row["change_percent"], float)
