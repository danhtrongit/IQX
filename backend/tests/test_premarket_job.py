# backend/tests/test_premarket_job.py
from unittest.mock import AsyncMock, patch

import pytest

from app.services.jobs import market_analysis_job as J


@pytest.mark.asyncio
async def test_premarket_job_skips_non_trading_day():
    with patch.object(J, "is_trading_day", return_value=False):
        res = await J.run_premarket_analysis_job(session=object())
    assert res == {"skipped": "not_trading_day", "date": res["date"]}


@pytest.mark.asyncio
async def test_premarket_job_reaches_generate_premarket_no_import_error():
    """CROSS-BOUNDARY GUARD (C2): on a trading day the job must actually reach
    _generate_premarket, whose body does `from app.services.ai.market_analysis
    import run_premarket_analysis`. If that symbol is not re-exported the import
    raises ImportError when the 07:15 cron fires. Passing an explicit session
    skips the advisory lock but still executes the import/call path.
    """
    fake_result = {
        "session_date": "2026-07-03",
        "session_type": "premarket",
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
            "app.services.ai.market_analysis.run_premarket_analysis",
            new=AsyncMock(return_value=fake_result),
        ) as mock_run,
    ):
        res = await J.run_premarket_analysis_job(session=object())

    mock_run.assert_awaited_once()
    assert res == fake_result


@pytest.mark.asyncio
async def test_premarket_scheduler_registers_when_enabled():
    """Scheduler registers the premarket job when PREMARKET_ANALYSIS_ENABLED=True."""
    from unittest.mock import MagicMock, patch

    from app.services import jobs as jobs_pkg

    mock_scheduler = MagicMock()
    mock_scheduler.get_jobs.return_value = []

    with (
        patch("app.services.jobs.AsyncIOScheduler", return_value=mock_scheduler),
        patch("app.services.jobs.get_settings") as mock_settings,
    ):
        settings = MagicMock()
        settings.JOBS_ENABLED = True
        settings.ALERTS_ENABLED = False
        settings.MARKET_ANALYSIS_ENABLED = False
        settings.MIDDAY_ANALYSIS_ENABLED = False
        settings.PREMARKET_ANALYSIS_ENABLED = True
        settings.PREMARKET_ANALYSIS_CRON_HOUR = 7
        settings.PREMARKET_ANALYSIS_CRON_MINUTE = 15
        settings.INTL_DATA_ENABLED = False
        mock_settings.return_value = settings

        # Reset the module-level scheduler
        jobs_pkg._scheduler = None
        await jobs_pkg.startup()

    added_ids = [call.kwargs.get("id") for call in mock_scheduler.add_job.call_args_list]
    assert "market_analysis_premarket" in added_ids


@pytest.mark.asyncio
async def test_premarket_scheduler_absent_when_disabled():
    """Scheduler does NOT register the premarket job when PREMARKET_ANALYSIS_ENABLED=False."""
    from unittest.mock import MagicMock, patch

    from app.services import jobs as jobs_pkg

    mock_scheduler = MagicMock()
    mock_scheduler.get_jobs.return_value = []

    with (
        patch("app.services.jobs.AsyncIOScheduler", return_value=mock_scheduler),
        patch("app.services.jobs.get_settings") as mock_settings,
    ):
        settings = MagicMock()
        settings.JOBS_ENABLED = True
        settings.ALERTS_ENABLED = False
        settings.MARKET_ANALYSIS_ENABLED = False
        settings.MIDDAY_ANALYSIS_ENABLED = False
        settings.PREMARKET_ANALYSIS_ENABLED = False
        settings.INTL_DATA_ENABLED = False
        mock_settings.return_value = settings

        jobs_pkg._scheduler = None
        await jobs_pkg.startup()

    added_ids = [call.kwargs.get("id") for call in mock_scheduler.add_job.call_args_list]
    assert "market_analysis_premarket" not in added_ids
