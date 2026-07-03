"""APScheduler bootstrap. Embedded in FastAPI lifespan.

The scheduler is a singleton process-level instance. We assume uvicorn runs
with workers=1 (current production config). If you scale workers, wrap each
job entry with a Postgres advisory lock (see plan §"Background Job Design").

Set JOBS_ENABLED=false in env to skip the scheduler entirely (useful in tests
and for ops emergency disable).
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def startup() -> None:
    """Start scheduler if JOBS_ENABLED is True."""
    global _scheduler
    settings = get_settings()
    if not getattr(settings, "JOBS_ENABLED", True):
        logger.info("Scheduler disabled via JOBS_ENABLED=false")
        return

    from .expiry_sweep import run_expiry_sweep
    from .ipn_reconcile import run_ipn_reconcile_scan

    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        run_expiry_sweep, IntervalTrigger(hours=1),
        id="expiry_sweep",
        name="Expire subscriptions whose period_end passed",
        max_instances=1, coalesce=True, replace_existing=True,
    )
    _scheduler.add_job(
        run_ipn_reconcile_scan, IntervalTrigger(hours=6),
        id="ipn_reconcile_scan",
        name="Scan stuck PENDING payment orders against IPN logs",
        max_instances=1, coalesce=True, replace_existing=True,
    )

    if getattr(settings, "ALERTS_ENABLED", False):
        from .alert_scan import run_alert_scan_job

        interval = max(int(getattr(settings, "ALERT_SCAN_INTERVAL_MINUTES", 10)), 1)
        _scheduler.add_job(
            run_alert_scan_job, IntervalTrigger(minutes=interval),
            id="alert_scan",
            name="Evaluate alert rules against watchlists (intraday) → Telegram",
            max_instances=1, coalesce=True, replace_existing=True,
        )

    if getattr(settings, "MARKET_ANALYSIS_ENABLED", False):
        from .market_analysis_job import run_daily_retry_job, run_market_analysis_job

        _scheduler.add_job(
            run_market_analysis_job,
            CronTrigger(
                day_of_week="mon-fri",
                hour=int(getattr(settings, "MARKET_ANALYSIS_CRON_HOUR", 16)),
                minute=int(getattr(settings, "MARKET_ANALYSIS_CRON_MINUTE", 30)),
                timezone="Asia/Ho_Chi_Minh",
            ),
            id="market_analysis_daily",
            name="Generate daily VN-Index AI analysis (16:30 ICT, EOD)",
            max_instances=1, coalesce=True, replace_existing=True,
        )
        _scheduler.add_job(
            run_daily_retry_job,
            CronTrigger(
                day_of_week="mon-fri",
                hour=int(getattr(settings, "MARKET_ANALYSIS_RETRY_HOUR", 17)),
                minute=int(getattr(settings, "MARKET_ANALYSIS_RETRY_MINUTE", 0)),
                timezone="Asia/Ho_Chi_Minh",
            ),
            id="market_analysis_daily_retry",
            name="Retry daily EOD analysis if the 16:30 run failed (17:00 ICT)",
            max_instances=1, coalesce=True, replace_existing=True,
        )

    if getattr(settings, "MIDDAY_ANALYSIS_ENABLED", False):
        from .market_analysis_job import run_midday_analysis_job

        _scheduler.add_job(
            run_midday_analysis_job,
            CronTrigger(
                day_of_week="mon-fri",
                hour=int(getattr(settings, "MIDDAY_ANALYSIS_CRON_HOUR", 11)),
                minute=int(getattr(settings, "MIDDAY_ANALYSIS_CRON_MINUTE", 30)),
                timezone="Asia/Ho_Chi_Minh",
            ),
            id="market_analysis_midday",
            name="Generate mid-day VN-Index AI analysis (11:30 ICT, midday)",
            max_instances=1, coalesce=True, replace_existing=True,
        )

    if getattr(settings, "INTL_DATA_ENABLED", False):
        from .intl_snapshot_job import run_intl_wave1, run_intl_wave2, run_intl_wave3

        _scheduler.add_job(
            run_intl_wave1,
            CronTrigger(
                day_of_week="mon-fri",
                hour=6,
                minute=0,
                timezone="Asia/Ho_Chi_Minh",
            ),
            id="intl_snapshot_wave1",
            name="International snapshot wave 1 — ALL_SYMBOLS (06:00 ICT)",
            max_instances=1, coalesce=True, replace_existing=True,
        )
        _scheduler.add_job(
            run_intl_wave2,
            CronTrigger(
                day_of_week="mon-fri",
                hour=7,
                minute=5,
                timezone="Asia/Ho_Chi_Minh",
            ),
            id="intl_snapshot_wave2",
            name="International snapshot wave 2 — WAVE2_SYMBOLS (07:05 ICT)",
            max_instances=1, coalesce=True, replace_existing=True,
        )
        _scheduler.add_job(
            run_intl_wave3,
            CronTrigger(
                day_of_week="mon-fri",
                hour=8,
                minute=30,
                timezone="Asia/Ho_Chi_Minh",
            ),
            id="intl_snapshot_wave3",
            name="International snapshot wave 3 — WAVE3_SYMBOLS (08:30 ICT)",
            max_instances=1, coalesce=True, replace_existing=True,
        )

    _scheduler.start()
    logger.info("Scheduler started with %d jobs", len(_scheduler.get_jobs()))


async def shutdown() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler stopped")


def list_jobs() -> list[dict]:
    """Return current jobs + next-run times (UI shows this)."""
    if _scheduler is None:
        return []
    out = []
    for j in _scheduler.get_jobs():
        out.append({
            "id": j.id,
            "name": j.name,
            "next_run_at": j.next_run_time.isoformat() if j.next_run_time else None,
            "trigger": str(j.trigger),
        })
    return out


async def run_job_now(job_id: str) -> None:
    """Trigger a job to run immediately. Raises ValueError if unknown."""
    if _scheduler is None:
        raise ValueError("Scheduler not running")
    job = _scheduler.get_job(job_id)
    if job is None:
        raise ValueError(f"Unknown job id: {job_id}")
    # Run the function directly (await it) — uses same DB session factory as scheduled run.
    await job.func()


def is_running() -> bool:
    return _scheduler is not None and _scheduler.running
