"""Dedicated EOD Watchlist consensus refresh for Cấp 5."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_insight_history import AIInsightHistory
from app.models.user import User, UserRole, UserStatus
from app.models.watchlist import WatchlistItem
from app.services.cap5.service import Cap5Service
from app.services.jobs.cap5_consensus import run_cap5_consensus_refresh

pytestmark = pytest.mark.asyncio

_RUN_AT = datetime(2026, 9, 15, 11, 30, tzinfo=UTC)  # 18:30 ICT
_FOUR_SUPPORTING_LAYERS = {
    "L1": {"statusLabel": "Rất mạnh"},
    "L3": {"statusLabel": "Hỗ trợ mạnh"},
    "L4": {"statusLabel": "Hỗ trợ nhẹ"},
    "L5": {"statusLabel": "Rất tích cực"},
}


async def _session_ready(_trading_date) -> bool:
    return True


async def _user(db: AsyncSession, email: str) -> User:
    row = User(
        email=email,
        hashed_password="unused-in-job-test",
        full_name="EOD Test",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(row)
    await db.flush()
    return row


async def _watch(
    db: AsyncSession, user: User, symbol: str, *, with_insight: bool = True
) -> WatchlistItem:
    row = WatchlistItem(user_id=user.id, symbol=symbol, sort_order=0)
    db.add(row)
    if with_insight:
        db.add(
            AIInsightHistory(
                symbol=symbol,
                session_date=_RUN_AT.date(),
                payload=_FOUR_SUPPORTING_LAYERS,
            )
        )
    await db.flush()
    return row


async def test_eod_refreshes_from_stored_analysis_and_rerun_is_idempotent(
    db_session: AsyncSession,
) -> None:
    user = await _user(db_session, "cap5-eod@example.com")
    item = await _watch(db_session, user, "HPG")
    await db_session.commit()

    first = await run_cap5_consensus_refresh(
        db_session, now=_RUN_AT, session_ready=_session_ready
    )

    assert first["source"] == "ai_insight_history"
    assert first["ai_calls"] == 0
    assert first["items_due"] == 1
    assert first["items_refreshed"] == 1
    await db_session.refresh(item)
    assert item.consensus_today == 4
    assert item.consensus_da_cham == 4
    assert item.status == "notable"
    # SQLite drops timezone metadata; production Postgres preserves it.
    assert item.consensus_at.replace(tzinfo=UTC) == _RUN_AT

    second = await run_cap5_consensus_refresh(
        db_session, now=_RUN_AT, session_ready=_session_ready
    )

    assert second["items_due"] == 0
    assert second["items_refreshed"] == 0
    assert second["items_skipped_already_refreshed"] == 1


async def test_eod_missing_stored_analysis_stays_unknown(
    db_session: AsyncSession,
) -> None:
    user = await _user(db_session, "cap5-eod-unknown@example.com")
    item = await _watch(db_session, user, "NONE", with_insight=False)
    await db_session.commit()

    result = await run_cap5_consensus_refresh(
        db_session, now=_RUN_AT, session_ready=_session_ready
    )

    assert result["items_refreshed"] == 0
    assert result["items_unchanged"] == 1
    await db_session.refresh(item)
    assert item.consensus_today is None
    assert item.consensus_at is None
    assert item.status is None


async def test_eod_failure_for_one_user_does_not_rollback_other_users(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    bad_user = await _user(db_session, "cap5-eod-bad@example.com")
    good_user = await _user(db_session, "cap5-eod-good@example.com")
    bad = await _watch(db_session, bad_user, "BAD")
    good = await _watch(db_session, good_user, "GOOD")
    await db_session.commit()

    original = Cap5Service.refresh_consensus_eod

    async def flaky(self, rows, *, today, refreshed_at):
        if rows[0].symbol == "BAD":
            raise RuntimeError("bad stored payload")
        return await original(
            self, rows, today=today, refreshed_at=refreshed_at
        )

    monkeypatch.setattr(Cap5Service, "refresh_consensus_eod", flaky)

    result = await run_cap5_consensus_refresh(
        db_session, now=_RUN_AT, session_ready=_session_ready
    )

    assert result["users_seen"] == 2
    assert result["users_processed"] == 1
    assert result["users_failed"] == 1
    assert result["items_refreshed"] == 1
    assert result["errors"][0]["error"] == "RuntimeError"
    await db_session.refresh(bad)
    await db_session.refresh(good)
    assert bad.consensus_at is None
    assert good.consensus_today == 4
    assert good.consensus_at.replace(tzinfo=UTC) == _RUN_AT


async def test_eod_skips_holiday_without_stamping_consensus(
    db_session: AsyncSession,
) -> None:
    user = await _user(db_session, "cap5-eod-holiday@example.com")
    item = await _watch(db_session, user, "HOLIDAY")
    await db_session.commit()

    async def holiday(_trading_date):
        return False

    result = await run_cap5_consensus_refresh(
        db_session, now=_RUN_AT, session_ready=holiday
    )
    assert result == {
        "skipped": "not_completed_session",
        "date": _RUN_AT.date().isoformat(),
        "session_ready": False,
    }
    await db_session.refresh(item)
    assert item.consensus_at is None


async def test_eod_fails_closed_when_session_readiness_is_unavailable(
    db_session: AsyncSession,
) -> None:
    user = await _user(db_session, "cap5-eod-unavailable@example.com")
    item = await _watch(db_session, user, "UNKNOWN")
    await db_session.commit()

    async def unavailable(_trading_date):
        return None

    result = await run_cap5_consensus_refresh(
        db_session, now=_RUN_AT, session_ready=unavailable
    )
    assert result["skipped"] == "session_readiness_unavailable"
    assert result["session_ready"] is None
    await db_session.refresh(item)
    assert item.consensus_at is None
