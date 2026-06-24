"""Tests for app/services/ai/insight_history.py (async, uses db_session fixture)."""

from __future__ import annotations

from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_insight_history import AIInsightHistory
from app.services.ai.insight_history import load_prev_insight, save_insight


@pytest.mark.asyncio
async def test_load_prev_insight_returns_payload(db_session: AsyncSession) -> None:
    """After saving a row, load_prev_insight returns its payload for a later date."""
    await save_insight(db_session, "VCB", date(2026, 6, 18), {"k": 1})
    result = await load_prev_insight(db_session, "VCB", date(2026, 6, 19))
    assert result == {"k": 1}


@pytest.mark.asyncio
async def test_load_prev_insight_same_date_not_returned(db_session: AsyncSession) -> None:
    """load_prev_insight must NOT return the row for the same date (strict <)."""
    await save_insight(db_session, "VCB", date(2026, 6, 19), {"k": 99})
    result = await load_prev_insight(db_session, "VCB", date(2026, 6, 19))
    assert result is None


@pytest.mark.asyncio
async def test_load_prev_insight_unknown_symbol(db_session: AsyncSession) -> None:
    """load_prev_insight returns None for a symbol that has no rows."""
    result = await load_prev_insight(db_session, "NEW", date(2026, 6, 19))
    assert result is None


@pytest.mark.asyncio
async def test_save_insight_upsert_latest_payload_wins(db_session: AsyncSession) -> None:
    """Calling save_insight twice for the same (symbol, date) keeps exactly one row with the latest payload."""
    await save_insight(db_session, "VCB", date(2026, 6, 18), {"k": 1})
    await save_insight(db_session, "VCB", date(2026, 6, 18), {"k": 2})

    count_result = await db_session.execute(
        select(func.count()).select_from(AIInsightHistory).where(
            AIInsightHistory.symbol == "VCB",
            AIInsightHistory.session_date == date(2026, 6, 18),
        )
    )
    assert count_result.scalar_one() == 1

    result = await load_prev_insight(db_session, "VCB", date(2026, 6, 19))
    assert result == {"k": 2}


@pytest.mark.asyncio
async def test_load_prev_insight_returns_most_recent(db_session: AsyncSession) -> None:
    """When multiple rows exist, load_prev_insight returns the most recent one."""
    await save_insight(db_session, "VCB", date(2026, 6, 16), {"k": "old"})
    await save_insight(db_session, "VCB", date(2026, 6, 17), {"k": "newer"})
    await save_insight(db_session, "VCB", date(2026, 6, 18), {"k": "newest"})
    result = await load_prev_insight(db_session, "VCB", date(2026, 6, 19))
    assert result == {"k": "newest"}
