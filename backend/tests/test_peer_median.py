"""Tests for the peer-median service (cache hit / miss-computes / degrade)."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import func, select

from app.models.sector_median_cache import SectorMedianCache

_ICB = "Công nghệ Thông tin"


@pytest.mark.asyncio
async def test_get_sector_medians_cache_hit(db_session, monkeypatch):
    db_session.add(
        SectorMedianCache(
            icb_lv2=_ICB,
            asof_date=date(2026, 7, 15),
            medians={"pe": 15.2, "pb": 2.1, "roe": 22.0},
            peer_count=18,
        )
    )
    await db_session.flush()

    # Any fetch attempt would blow up — proving the cache path never fetches.
    from app.services.bctc_dashboard import peer_median as pm

    async def _boom(*args, **kwargs):
        raise AssertionError("cache hit must not fetch peers")

    monkeypatch.setattr(pm, "fetch_screening_paging", _boom)
    monkeypatch.setattr(pm, "fetch_financial_report", _boom)

    m = await pm.get_sector_medians(db_session, _ICB, asof=date(2026, 7, 15))
    assert m["pe"] == 15.2 and m["roe"] == 22.0


@pytest.mark.asyncio
async def test_get_sector_medians_miss_computes(db_session, monkeypatch):
    from app.services.bctc_dashboard import peer_median as pm

    peers = ["AAA", "BBB", "CCC", "DDD", "EEE"]
    pe_vals = {"AAA": 10.0, "BBB": 12.0, "CCC": 15.0, "DDD": 18.0, "EEE": 20.0}
    roe_vals = {"AAA": 18.0, "BBB": 20.0, "CCC": 22.0, "DDD": 24.0, "EEE": 26.0}

    async def fake_paging(*, page=0, page_size=50, sort_fields=None, sort_orders=None, filters=None):
        content = [
            {
                "ticker": t,
                "market_cap": 1_000_000 * (len(peers) - i),
                "icb_code_lv2": "9000",
                "vi_sector": _ICB,
                "en_sector": "Information Technology",
            }
            for i, t in enumerate(peers)
        ]
        # A non-matching peer that must be filtered out.
        content.append(
            {
                "ticker": "ZZZ",
                "market_cap": 9_999_999,
                "icb_code_lv2": "8600",
                "vi_sector": "Ngân hàng",
                "en_sector": "Banks",
            }
        )
        return {"content": content, "last": True}, "http://x"

    async def fake_report(symbol, **kwargs):
        return (
            [{"pe": pe_vals[symbol], "pb": 2.0, "roe": roe_vals[symbol]}],
            "http://x",
        )

    monkeypatch.setattr(pm, "fetch_screening_paging", fake_paging)
    monkeypatch.setattr(pm, "fetch_financial_report", fake_report)

    m = await pm.get_sector_medians(db_session, _ICB, asof=date(2026, 7, 15))

    # median of [10,12,15,18,20] = 15 ; median roe = 22 ; pb constant 2.0
    assert m["pe"] == 15.0
    assert m["roe"] == 22.0
    assert m["pb"] == 2.0
    # metrics not present in ratio rows degrade to None
    assert m["gross_margin"] is None

    # Exactly one cache row upserted, peer_count == 5.
    total = (await db_session.execute(select(func.count(SectorMedianCache.id)))).scalar_one()
    assert total == 1
    row = (await db_session.execute(select(SectorMedianCache))).scalar_one()
    assert row.peer_count == 5
    assert row.medians["pe"] == 15.0


@pytest.mark.asyncio
async def test_degrade_few_peers(db_session, monkeypatch):
    from app.services.bctc_dashboard import peer_median as pm

    async def fake_paging(*, page=0, page_size=50, sort_fields=None, sort_orders=None, filters=None):
        content = [
            {"ticker": "AAA", "market_cap": 5, "vi_sector": _ICB},
            {"ticker": "BBB", "market_cap": 4, "vi_sector": _ICB},
        ]
        return {"content": content, "last": True}, "http://x"

    async def fake_report(symbol, **kwargs):
        return ([{"pe": 11.0, "pb": 1.5, "roe": 19.0}], "http://x")

    monkeypatch.setattr(pm, "fetch_screening_paging", fake_paging)
    monkeypatch.setattr(pm, "fetch_financial_report", fake_report)

    m = await pm.get_sector_medians(db_session, _ICB, asof=date(2026, 7, 15))

    # <3 peers with data → all-None medians, does NOT raise.
    assert all(v is None for v in m.values())

    row = (await db_session.execute(select(SectorMedianCache))).scalar_one()
    assert row.peer_count < 3
