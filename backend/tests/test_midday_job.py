# backend/tests/test_midday_job.py
from unittest.mock import AsyncMock, patch

import pytest

from app.services.jobs import market_analysis_job as J


@pytest.mark.asyncio
async def test_midday_job_skips_non_trading_day():
    with patch.object(J, "is_trading_day", return_value=False):
        res = await J.run_midday_analysis_job(session=object())
    assert res == {"skipped": "not_trading_day", "date": res["date"]}


@pytest.mark.asyncio
async def test_midday_job_reaches_generate_midday_no_import_error():
    """CROSS-BOUNDARY GUARD (C2): on a trading day the job must actually reach
    _generate_midday, whose body does `from app.services.ai.market_analysis
    import run_midday_analysis`. If that symbol is not re-exported the import
    raises ImportError when the 11:30 cron fires. Passing an explicit session
    skips the advisory lock but still executes the import/call path.
    """
    fake_result = {
        "session_date": "2026-07-02",
        "session_type": "low_volatility",
        "valid": True,
        "persisted": True,
        "memory_loaded": False,
        "attempts": 1,
        "errors": [],
        "model": "test-model",
        "generation_time_ms": 42,
    }

    with (
        patch.object(J, "is_trading_day", return_value=True),
        patch(
            "app.services.ai.market_analysis.run_midday_analysis",
            new=AsyncMock(return_value=fake_result),
        ) as mock_run,
    ):
        res = await J.run_midday_analysis_job(session=object())

    mock_run.assert_awaited_once()
    assert res == fake_result
