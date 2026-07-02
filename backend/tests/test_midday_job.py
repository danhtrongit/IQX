# backend/tests/test_midday_job.py
import datetime as dt
from unittest.mock import patch
import pytest
from app.services.jobs import market_analysis_job as J


@pytest.mark.asyncio
async def test_midday_job_skips_non_trading_day():
    with patch.object(J, "is_trading_day", return_value=False):
        res = await J.run_midday_analysis_job(session=object())
    assert res == {"skipped": "not_trading_day", "date": res["date"]}
