"""Bounded Cấp 2 official-close scan job.

Scheduler registration lives in ``app.services.jobs`` and stays disabled until
both an official-close provider and a verified exchange calendar are wired.
The default run is intentionally fail-closed: every eligible symbol is
reported unavailable and no alert is created.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session_factory
from app.models.cap2 import Cap2Progress
from app.services.cap2.alerts import (
    Cap2AlertService,
    OfficialCloseProvider,
    UnavailableOfficialCloseProvider,
)

_VN_TZ = timezone(timedelta(hours=7))


def _next_weekday(day: date) -> date:
    """Explicit fallback only; this does not claim knowledge of exchange holidays."""
    candidate = day + timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


async def run_cap2_stop_close_scan_job(
    *,
    official_session_date: date | None = None,
    display_session_date: date | None = None,
    provider: OfficialCloseProvider | None = None,
    session: AsyncSession | None = None,
    now: datetime | None = None,
) -> dict:
    """Scan every Cấp 2 user once and return an aggregate audit result.

    Scheduler contract: invoke at 15:05 ``Asia/Ho_Chi_Minh``.  A real provider
    must be paired with a verified next trading date; weekday-only inference is
    never allowed to schedule a real banner across exchange holidays.  An
    omitted provider remains unavailable by design.
    """
    now_vn = (now or datetime.now(_VN_TZ)).astimezone(_VN_TZ)
    close_day = official_session_date or now_vn.date()
    provider_ready = provider is not None
    if provider_ready and display_session_date is None:
        return {
            "official_session_date": close_day,
            "display_session_date": None,
            "users_scanned": 0,
            "positions_checked": 0,
            "alerts_pending": 0,
            "unavailable_count": 0,
            "unavailable": [],
            "provider_ready": True,
            "calendar_ready": False,
            "calendar_source": "unavailable",
            "skipped_reason": "verified_next_trading_date_required",
        }
    display_day = display_session_date or _next_weekday(close_day)
    calendar_source = "caller" if display_session_date is not None else "weekday_fallback"
    close_provider = provider or UnavailableOfficialCloseProvider()
    if session is not None:
        result = await _run(
            session,
            official_session_date=close_day,
            display_session_date=display_day,
            provider=close_provider,
        )
        return {
            **result,
            "provider_ready": provider_ready,
            "calendar_ready": display_session_date is not None,
            "calendar_source": calendar_source,
            "skipped_reason": None,
        }

    factory = get_session_factory()
    async with factory() as db:
        result = await _run(
            db,
            official_session_date=close_day,
            display_session_date=display_day,
            provider=close_provider,
        )
        await db.commit()
        return {
            **result,
            "provider_ready": provider_ready,
            "calendar_ready": display_session_date is not None,
            "calendar_source": calendar_source,
            "skipped_reason": None,
        }


# Backwards-friendly explicit callable for service/tests that already provide
# both dates.  Scheduler registration should use the longer name above.
run_cap2_alert_scan = run_cap2_stop_close_scan_job


async def _run(
    db: AsyncSession,
    *,
    official_session_date: date,
    display_session_date: date,
    provider: OfficialCloseProvider,
) -> dict:
    user_ids = list(
        (
            await db.execute(
                select(Cap2Progress.user_id).order_by(Cap2Progress.user_id)
            )
        ).scalars().all()
    )
    positions_checked = 0
    alerts_pending = 0
    unavailable: list[dict[str, str]] = []
    for user_id in user_ids:
        result = await Cap2AlertService(db).scan_stop_closes(
            user_id,
            official_session_date=official_session_date,
            display_session_date=display_session_date,
            provider=provider,
        )
        positions_checked += result["positions_checked"]
        alerts_pending += result["alerts_pending"]
        unavailable.extend(
            {"user_id": str(user_id), "symbol": symbol}
            for symbol in result["unavailable_symbols"]
        )
    await db.flush()
    return {
        "official_session_date": official_session_date,
        "display_session_date": display_session_date,
        "users_scanned": len(user_ids),
        "positions_checked": positions_checked,
        "alerts_pending": alerts_pending,
        "unavailable_count": len(unavailable),
        "unavailable": unavailable,
    }
