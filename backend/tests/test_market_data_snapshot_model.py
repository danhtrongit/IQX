"""Tests for MarketDataSnapshot model."""

import datetime as dt

import pytest
from sqlalchemy import select

from app.models.market_data_snapshot import MarketDataSnapshot


@pytest.mark.asyncio
async def test_unique_per_date_symbol(db_session):
    d = dt.date(2026, 7, 3)
    db_session.add(MarketDataSnapshot(snapshot_date=d, asset_category="us_index", symbol="^GSPC",
                                      name="S&P 500", last_price=6124.85, previous_close=6100.2,
                                      change_value=24.65, change_percent=0.4041))
    await db_session.commit()
    rows = (await db_session.execute(select(MarketDataSnapshot))).scalars().all()
    assert len(rows) == 1 and rows[0].stale is False and rows[0].source == "yahoo"
