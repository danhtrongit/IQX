# tests/test_daily_retry_job.py
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.models.market_analysis import AnalysisHistory
from app.services.jobs import market_analysis_job as J

_ICT = timezone(timedelta(hours=7))


@pytest.mark.asyncio
async def test_retry_skips_non_trading_day():
    with patch.object(J, "is_trading_day", return_value=False):
        res = await J.run_daily_retry_job(session=object())
    assert res == {"skipped": "not_trading_day", "date": res["date"]}


@pytest.mark.asyncio
async def test_retry_skips_when_already_published(db_session):
    today = datetime.now(_ICT).date()
    db_session.add(AnalysisHistory(
        public_id=f"vnindex-{today.isoformat()}", session_date=today,
        session_type="low_volatility", report_type="daily",
        headline="đã có", tagline={}, paragraphs={}, scenarios=[], is_published=True,
    ))
    await db_session.commit()
    with patch.object(J, "is_trading_day", return_value=True), \
         patch("app.services.ai.market_analysis.run_daily_analysis", new=AsyncMock()) as gen:
        res = await J.run_daily_retry_job(session=db_session)
    assert res == {"skipped": "already_published", "date": today.isoformat()}
    gen.assert_not_awaited()


@pytest.mark.asyncio
async def test_retry_runs_when_missing(db_session):
    fake = {"session_date": "x", "session_type": "low_volatility",
            "valid": True, "persisted": True, "attempts": 1}
    with patch.object(J, "is_trading_day", return_value=True), \
         patch("app.services.ai.market_analysis.run_daily_analysis",
               new=AsyncMock(return_value=fake)) as gen:
        res = await J.run_daily_retry_job(session=db_session)
    gen.assert_awaited_once()
    assert res["persisted"] is True
