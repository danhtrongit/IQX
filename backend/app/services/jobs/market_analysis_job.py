"""Daily market-analysis scheduler job (16:30 ICT, T2-T6, skip holidays).

Thin wrapper around run_daily_analysis() that gates on VN trading days.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text

from app.services.ai.market_analysis.market_calendar import is_trading_day

logger = logging.getLogger(__name__)

_ICT = timezone(timedelta(hours=7))
# Postgres advisory-lock key: prod runs uvicorn --workers 4, so the cron fires
# in every worker. This lock makes exactly ONE worker do the (expensive LLM)
# generation per firing; the others skip. Session-level lock survives the
# generator's internal commits and is released in finally.
_LOCK_KEY = 826_101_730
_MIDDAY_LOCK_KEY = 826_101_731
_RETRY_LOCK_KEY = 826_101_732
_PREMARKET_LOCK_KEY = 826_101_734


async def _generate(session: Any) -> dict[str, Any]:
    from app.services.ai.market_analysis import run_daily_analysis

    result = await run_daily_analysis(session=session)
    logger.info(
        "Daily market-analysis: date=%s type=%s valid=%s persisted=%s attempts=%s",
        result.get("session_date"), result.get("session_type"),
        result.get("valid"), result.get("persisted"), result.get("attempts"),
    )
    return result


async def _generate_midday(session: Any) -> dict[str, Any]:
    from app.services.ai.market_analysis import run_midday_analysis

    result = await run_midday_analysis(session=session)
    logger.info(
        "Midday market-analysis: date=%s type=%s valid=%s persisted=%s attempts=%s",
        result.get("session_date"), result.get("session_type"),
        result.get("valid"), result.get("persisted"), result.get("attempts"),
    )
    return result


async def _generate_premarket(session: Any) -> dict[str, Any]:
    from app.services.ai.market_analysis import run_premarket_analysis

    result = await run_premarket_analysis(session=session)
    logger.info(
        "Premarket market-analysis: date=%s type=%s valid=%s persisted=%s attempts=%s",
        result.get("session_date"), result.get("session_type"),
        result.get("valid"), result.get("persisted"), result.get("attempts"),
    )
    return result


async def run_market_analysis_job(session: Any | None = None) -> dict[str, Any]:
    """Generate today's VN-Index analysis if today is a trading day.

    Scheduled run (session=None) takes a pg advisory lock so only one uvicorn
    worker generates. Manual/test triggers may pass an explicit session and
    skip the lock.
    """
    today = datetime.now(_ICT).date()
    if not is_trading_day(today):
        logger.info("Daily market-analysis skipped: %s is not a VN trading day", today)
        return {"skipped": "not_trading_day", "date": today.isoformat()}

    if session is not None:
        return await _generate(session)

    from app.core.database import get_session_factory

    factory = get_session_factory()
    async with factory() as db:
        got = (
            await db.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": _LOCK_KEY})
        ).scalar()
        if not got:
            logger.info("Daily market-analysis: lock held by another worker — skipping")
            return {"skipped": "locked", "date": today.isoformat()}
        try:
            return await _generate(db)
        finally:
            await db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _LOCK_KEY})
            await db.commit()


async def _has_published_daily(db: Any, day) -> bool:
    from sqlalchemy import select

    from app.models.market_analysis import AnalysisHistory

    row = (
        await db.execute(
            select(AnalysisHistory.id)
            .where(
                AnalysisHistory.session_date == day,
                AnalysisHistory.report_type == "daily",
                AnalysisHistory.is_published.is_(True),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return row is not None


async def run_daily_retry_job(session: Any | None = None) -> dict[str, Any]:
    """Safety net for the 16:30 EOD run (17:00 ICT).

    If today's published daily analysis is missing (e.g. the 16:30 firing died
    on a transient network/LLM failure), re-run the generation once. Idempotent:
    skips when the record already exists.
    """
    today = datetime.now(_ICT).date()
    if not is_trading_day(today):
        logger.info("Daily retry skipped: %s is not a VN trading day", today)
        return {"skipped": "not_trading_day", "date": today.isoformat()}

    if session is not None:
        if await _has_published_daily(session, today):
            return {"skipped": "already_published", "date": today.isoformat()}
        logger.warning("Daily retry: no published EOD for %s — re-running generation", today)
        return await _generate(session)

    from app.core.database import get_session_factory

    factory = get_session_factory()
    async with factory() as db:
        if await _has_published_daily(db, today):
            logger.info("Daily retry: EOD for %s already published — nothing to do", today)
            return {"skipped": "already_published", "date": today.isoformat()}
        got = (
            await db.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": _RETRY_LOCK_KEY})
        ).scalar()
        if not got:
            logger.info("Daily retry: lock held by another worker — skipping")
            return {"skipped": "locked", "date": today.isoformat()}
        try:
            logger.warning("Daily retry: no published EOD for %s — re-running generation", today)
            return await _generate(db)
        finally:
            await db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _RETRY_LOCK_KEY})
            await db.commit()


async def run_midday_analysis_job(session: Any | None = None) -> dict[str, Any]:
    """Generate today's VN-Index mid-day analysis if today is a trading day.

    Scheduled run (session=None) takes a pg advisory lock so only one uvicorn
    worker generates. Manual/test triggers may pass an explicit session and
    skip the lock.
    """
    today = datetime.now(_ICT).date()
    if not is_trading_day(today):
        logger.info("Midday market-analysis skipped: %s is not a VN trading day", today)
        return {"skipped": "not_trading_day", "date": today.isoformat()}

    if session is not None:
        return await _generate_midday(session)

    from app.core.database import get_session_factory

    factory = get_session_factory()
    async with factory() as db:
        got = (
            await db.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": _MIDDAY_LOCK_KEY})
        ).scalar()
        if not got:
            logger.info("Midday market-analysis: lock held by another worker — skipping")
            return {"skipped": "locked", "date": today.isoformat()}
        try:
            return await _generate_midday(db)
        finally:
            await db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _MIDDAY_LOCK_KEY})
            await db.commit()


async def run_premarket_analysis_job(session: Any | None = None) -> dict[str, Any]:
    """Generate today's VN-Index pre-market analysis if today is a trading day.

    Scheduled run (session=None) takes a pg advisory lock so only one uvicorn
    worker generates. Manual/test triggers may pass an explicit session and
    skip the lock.
    """
    today = datetime.now(_ICT).date()
    if not is_trading_day(today):
        logger.info("Premarket market-analysis skipped: %s is not a VN trading day", today)
        return {"skipped": "not_trading_day", "date": today.isoformat()}

    if session is not None:
        return await _generate_premarket(session)

    from app.core.database import get_session_factory

    factory = get_session_factory()
    async with factory() as db:
        got = (
            await db.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": _PREMARKET_LOCK_KEY})
        ).scalar()
        if not got:
            logger.info("Premarket market-analysis: lock held by another worker — skipping")
            return {"skipped": "locked", "date": today.isoformat()}
        try:
            return await _generate_premarket(db)
        finally:
            await db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _PREMARKET_LOCK_KEY})
            await db.commit()
