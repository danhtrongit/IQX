"""Model tests for SectorMedianCache (JSON medians + unique (icb_lv2, asof_date))."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.sector_median_cache import SectorMedianCache


@pytest.mark.asyncio
async def test_create_and_read_row(db_session):
    row = SectorMedianCache(
        icb_lv2="Công nghệ Thông tin",
        asof_date=date(2026, 7, 15),
        medians={"pe": 15.2, "pb": 2.1, "roe": 22.0},
        peer_count=18,
    )
    db_session.add(row)
    await db_session.flush()

    fetched = (
        await db_session.execute(
            select(SectorMedianCache).where(
                SectorMedianCache.icb_lv2 == "Công nghệ Thông tin",
                SectorMedianCache.asof_date == date(2026, 7, 15),
            )
        )
    ).scalar_one()

    assert fetched.id is not None
    assert fetched.peer_count == 18
    assert fetched.medians["pe"] == 15.2
    assert fetched.medians["roe"] == 22.0


@pytest.mark.asyncio
async def test_unique_icb_asof(db_session):
    db_session.add(
        SectorMedianCache(
            icb_lv2="Bất động sản",
            asof_date=date(2026, 7, 15),
            medians={"pe": 12.0},
            peer_count=10,
        )
    )
    await db_session.flush()

    db_session.add(
        SectorMedianCache(
            icb_lv2="Bất động sản",
            asof_date=date(2026, 7, 15),
            medians={"pe": 13.0},
            peer_count=11,
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()
