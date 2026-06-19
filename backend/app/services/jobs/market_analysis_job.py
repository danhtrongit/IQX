"""Daily market-analysis scheduler job (16:30 ICT, T2-T6, skip holidays).

Thin wrapper around run_daily_analysis() that gates on VN trading days.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.ai.market_analysis.market_calendar import is_trading_day

logger = logging.getLogger(__name__)

_ICT = timezone(timedelta(hours=7))


async def run_market_analysis_job(session: Any | None = None) -> dict[str, Any]:
    """Generate today's VN-Index analysis if today is a trading day.

    Accepts an optional ``session`` for manual/test triggers; the scheduled run
    passes none, so run_daily_analysis() opens its own DB session.
    """
    today = datetime.now(_ICT).date()
    if not is_trading_day(today):
        logger.info("Daily market-analysis skipped: %s is not a VN trading day", today)
        return {"skipped": "not_trading_day", "date": today.isoformat()}

    from app.services.ai.market_analysis import run_daily_analysis

    result = await run_daily_analysis(session=session)
    logger.info(
        "Daily market-analysis: date=%s type=%s valid=%s persisted=%s attempts=%s",
        result.get("session_date"), result.get("session_type"),
        result.get("valid"), result.get("persisted"), result.get("attempts"),
    )
    return result
