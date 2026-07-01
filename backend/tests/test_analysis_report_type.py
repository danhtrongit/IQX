# backend/tests/test_analysis_report_type.py
import datetime as dt
import pytest
from sqlalchemy import select
from app.models.market_analysis import AnalysisHistory

@pytest.mark.asyncio
async def test_two_report_types_same_date_coexist(db_session):
    d = dt.date(2026, 7, 1)
    db_session.add(AnalysisHistory(public_id="vnindex-2026-07-01-daily", session_date=d,
                                   session_type="low_volatility", report_type="daily",
                                   headline="EOD", tagline={}, paragraphs={}, scenarios=[]))
    db_session.add(AnalysisHistory(public_id="vnindex-2026-07-01-midday", session_date=d,
                                   session_type="low_volatility", report_type="midday",
                                   headline="Midday", tagline={}, paragraphs={}, scenarios=[]))
    await db_session.commit()
    rows = (await db_session.execute(select(AnalysisHistory).where(AnalysisHistory.session_date == d))).scalars().all()
    assert {r.report_type for r in rows} == {"daily", "midday"}

@pytest.mark.asyncio
async def test_default_report_type_is_daily(db_session):
    d = dt.date(2026, 7, 2)
    row = AnalysisHistory(public_id="vnindex-2026-07-02", session_date=d, session_type="low_volatility",
                          headline="x", tagline={}, paragraphs={}, scenarios=[])
    db_session.add(row); await db_session.commit()
    assert row.report_type == "daily"
