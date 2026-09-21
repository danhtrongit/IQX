"""One current-session Bot batch; never backfill sessions before activation."""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.services.bot import run_scheduled_session


async def run_bot_session_job() -> dict:
    # Provider validates holidays/readiness/official T close; a cron weekday is
    # not by itself evidence that a trading session or an executable price exists.
    trading_date = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    return await run_scheduled_session(trading_date)
