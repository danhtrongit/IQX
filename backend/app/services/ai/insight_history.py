"""Persistence helpers for per-symbol AI insight history (prev-session context)."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_insight_history import AIInsightHistory


async def load_prev_insight(db: AsyncSession, symbol: str, today: date) -> dict | None:
    """Return the payload of the latest insight for *symbol* before *today*, or None."""
    row = (await db.execute(
        select(AIInsightHistory)
        .where(
            AIInsightHistory.symbol == symbol,
            AIInsightHistory.session_date < today,
        )
        .order_by(AIInsightHistory.session_date.desc())
        .limit(1)
    )).scalar_one_or_none()

    return row.payload if row is not None else None


async def save_insight(
    db: AsyncSession,
    symbol: str,
    session_date: date,
    payload: dict,
) -> None:
    """Upsert an insight row by (symbol, session_date) and commit."""
    existing = (await db.execute(
        select(AIInsightHistory).where(
            AIInsightHistory.symbol == symbol,
            AIInsightHistory.session_date == session_date,
        )
    )).scalar_one_or_none()

    if existing:
        existing.payload = payload
    else:
        db.add(AIInsightHistory(symbol=symbol, session_date=session_date, payload=payload))

    await db.commit()
