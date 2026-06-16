"""Chart drawing repository — per-user line-tool state CRUD."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chart_drawing import ChartDrawing


class ChartDrawingRepository:
    """Data access layer for saved TradingView drawings."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: uuid.UUID, symbol: str) -> ChartDrawing | None:
        """Get the saved drawing for a (user, symbol)."""
        result = await self._session.execute(
            select(ChartDrawing).where(
                ChartDrawing.user_id == user_id,
                ChartDrawing.symbol == symbol.upper(),
            )
        )
        return result.scalar_one_or_none()

    async def upsert(
        self, user_id: uuid.UUID, symbol: str, state: dict[str, Any]
    ) -> ChartDrawing:
        """Insert or update the drawing state for a (user, symbol)."""
        existing = await self.get(user_id, symbol)
        if existing is not None:
            existing.state = state
            await self._session.flush()
            # onupdate=now() expires updated_at server-side; reload it in the
            # async context so response serialization doesn't trigger a sync
            # lazy-load (MissingGreenlet).
            await self._session.refresh(existing)
            return existing
        item = ChartDrawing(user_id=user_id, symbol=symbol.upper(), state=state)
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def delete(self, user_id: uuid.UUID, symbol: str) -> bool:
        """Delete the saved drawing. Returns True if a row was removed."""
        result = await self._session.execute(
            delete(ChartDrawing).where(
                ChartDrawing.user_id == user_id,
                ChartDrawing.symbol == symbol.upper(),
            )
        )
        await self._session.flush()
        return result.rowcount > 0
