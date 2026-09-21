"""Cấp 5 EOD Watchlist consensus refresh.

The Cấp 5 spec requires Watchlist consensus to refresh once per day after the
session, without running AI Insight across the exchange.  This job only reads
the latest stored ``ai_insight_history`` rows through ``Cap5Service`` and writes
the derived score/status to existing ``watchlist_items`` rows.

Scheduler contract
------------------
Register ``run_cap5_consensus_refresh`` on a weekday CronTrigger after the EOD
analysis data is available, using timezone ``Asia/Ho_Chi_Minh``,
``max_instances=1`` and ``coalesce=True``.  The production path also takes a
Postgres advisory lock, so duplicate scheduler processes do not run the sweep
concurrently.
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session_factory
from app.models.watchlist import WatchlistItem
from app.services.cap5.service import Cap5Service

logger = logging.getLogger(__name__)

_ICT = timezone(timedelta(hours=7))
# Session-level lock survives the per-user commits used for partial durability.
_LOCK_KEY = 826_105_500
_MAX_ERRORS_IN_SUMMARY = 20

SessionReady = Callable[[date], Awaitable[bool | None]]


async def _live_session_ready(trading_date: date) -> bool | None:
    """Use the same official-close readiness contract as Bot v1."""
    try:
        from app.services.bot.data import live_session_ready

        return await live_session_ready(trading_date)
    except Exception:  # noqa: BLE001 — unavailable must fail closed
        logger.exception("Cấp 5 EOD consensus: session readiness unavailable")
        return None


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _vn_date(value: datetime | None) -> date | None:
    return _as_utc(value).astimezone(_ICT).date() if value is not None else None


def _row_state(row: WatchlistItem) -> tuple[Any, ...]:
    """Fields the EOD refresh is allowed to mutate, for an exact summary."""
    return (
        row.consensus_today,
        row.consensus_prev,
        row.consensus_da_cham,
        row.consensus_at,
        row.status,
    )


async def _refresh(
    db: AsyncSession,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    run_at = _as_utc(now or datetime.now(UTC))
    today = run_at.astimezone(_ICT).date()
    rows = list(
        (
            await db.execute(
                select(WatchlistItem).order_by(
                    WatchlistItem.user_id.asc(), WatchlistItem.created_at.asc()
                )
            )
        )
        .scalars()
        .all()
    )

    by_user: dict[uuid.UUID, list[WatchlistItem]] = defaultdict(list)
    for row in rows:
        by_user[row.user_id].append(row)

    summary: dict[str, Any] = {
        "date": today.isoformat(),
        "ran_at": run_at.isoformat(),
        "source": "ai_insight_history",
        "ai_calls": 0,
        "users_seen": len(by_user),
        "users_processed": 0,
        "users_failed": 0,
        "items_seen": len(rows),
        "items_due": sum(1 for row in rows if _vn_date(row.consensus_at) != today),
        "items_refreshed": 0,
        "items_unchanged": 0,
        "items_skipped_already_refreshed": sum(
            1 for row in rows if _vn_date(row.consensus_at) == today
        ),
        "errors": [],
    }

    service = Cap5Service(db)
    for user_id, user_rows in by_user.items():
        due_rows = [row for row in user_rows if _vn_date(row.consensus_at) != today]
        if not due_rows:
            summary["users_processed"] += 1
            continue

        before = {row.id: _row_state(row) for row in due_rows}
        try:
            # A savepoint isolates one user's data.  A malformed stored payload
            # or an unexpected row cannot roll back users already committed.
            async with db.begin_nested():
                await service.refresh_consensus_eod(
                    due_rows, today=today, refreshed_at=run_at
                )
            await db.commit()
        except Exception as exc:  # noqa: BLE001 - partial failure is the job contract
            summary["users_failed"] += 1
            summary["items_unchanged"] += len(due_rows)
            if len(summary["errors"]) < _MAX_ERRORS_IN_SUMMARY:
                summary["errors"].append(
                    {
                        "user_id": str(user_id),
                        "error": type(exc).__name__,
                        "message": str(exc)[:300],
                    }
                )
            logger.exception(
                "Cấp 5 EOD consensus: user %s failed; continuing with next user",
                user_id,
            )
            continue

        refreshed = sum(1 for row in due_rows if _row_state(row) != before[row.id])
        summary["users_processed"] += 1
        summary["items_refreshed"] += refreshed
        # Missing, invalid, or stale stored analysis remains unknown.  It is not
        # turned into 0/5 and is reported explicitly as unchanged.
        summary["items_unchanged"] += len(due_rows) - refreshed

    logger.info("Cấp 5 EOD consensus refresh: %s", summary)
    return summary


async def run_cap5_consensus_refresh(
    session: AsyncSession | None = None,
    *,
    now: datetime | None = None,
    session_ready: SessionReady | None = None,
) -> dict[str, Any]:
    """Refresh every Watchlist from stored analysis, idempotently by VN day.

    Passing ``session`` is the test/manual path and skips the Postgres lock.
    The scheduled production path opens its own session and takes a session-level
    advisory lock.  Rows successfully refreshed today are skipped on rerun;
    rows with no usable stored analysis remain unknown and unchanged.
    """
    run_at = _as_utc(now or datetime.now(UTC))
    today = run_at.astimezone(_ICT).date()
    readiness = await (session_ready or _live_session_ready)(today)
    if readiness is not True:
        reason = (
            "not_completed_session"
            if readiness is False
            else "session_readiness_unavailable"
        )
        logger.info("Cấp 5 EOD consensus skipped: %s", reason)
        return {
            "skipped": reason,
            "date": today.isoformat(),
            "session_ready": readiness,
        }

    if session is not None:
        return await _refresh(session, now=now)

    factory = get_session_factory()
    async with factory() as db:
        got = (
            await db.execute(
                text("SELECT pg_try_advisory_lock(:key)"), {"key": _LOCK_KEY}
            )
        ).scalar()
        if not got:
            logger.info("Cấp 5 EOD consensus: lock held by another worker; skipping")
            return {"skipped": "locked", "date": today.isoformat()}
        try:
            return await _refresh(db, now=now)
        finally:
            await db.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": _LOCK_KEY}
            )
            await db.commit()
