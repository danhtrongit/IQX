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
