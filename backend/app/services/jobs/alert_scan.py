"""Scheduler job: intraday alert scan (delegates to the alerts service)."""

from __future__ import annotations

from app.services.alerts.scan import run_alert_scan


async def run_alert_scan_job() -> dict:
    """Entrypoint registered with APScheduler (opens its own DB session)."""
    return await run_alert_scan()
