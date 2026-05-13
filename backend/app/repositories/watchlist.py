"""Watchlist repository — CRUD for user favorites."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.watchlist import WatchlistItem


class WatchlistRepository:
    """Data access layer for watchlist items."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_items(self, user_id: uuid.UUID) -> list[WatchlistItem]:
        """Get all watchlist items for a user, ordered by sort_order."""
        result = await self._session.execute(
            select(WatchlistItem)
            .where(WatchlistItem.user_id == user_id)
            .order_by(WatchlistItem.sort_order.asc(), WatchlistItem.created_at.asc())
        )
        return list(result.scalars().all())

    async def get_item(self, user_id: uuid.UUID, symbol: str) -> WatchlistItem | None:
        """Get a specific watchlist item."""
        result = await self._session.execute(
            select(WatchlistItem).where(
                WatchlistItem.user_id == user_id,
                WatchlistItem.symbol == symbol.upper(),
            )
        )
        return result.scalar_one_or_none()

    async def add_item(self, user_id: uuid.UUID, symbol: str) -> WatchlistItem:
        """Add a symbol to the user's watchlist."""
        # Get max sort_order
        result = await self._session.execute(
            select(func.coalesce(func.max(WatchlistItem.sort_order), -1))
            .where(WatchlistItem.user_id == user_id)
        )
        max_order = result.scalar() or 0

        item = WatchlistItem(
            user_id=user_id,
            symbol=symbol.upper(),
            sort_order=max_order + 1,
        )
        self._session.add(item)
        await self._session.flush()
        return item

    async def remove_item(self, user_id: uuid.UUID, symbol: str) -> bool:
        """Remove a symbol from the watchlist. Returns True if deleted."""
        result = await self._session.execute(
            delete(WatchlistItem).where(
                WatchlistItem.user_id == user_id,
                WatchlistItem.symbol == symbol.upper(),
            )
        )
        await self._session.flush()
        return result.rowcount > 0

    async def reorder(self, user_id: uuid.UUID, symbols: list[str]) -> None:
        """Reorder watchlist items to match the given symbol order."""
        for i, sym in enumerate(symbols):
            await self._session.execute(
                update(WatchlistItem)
                .where(
                    WatchlistItem.user_id == user_id,
                    WatchlistItem.symbol == sym.upper(),
                )
                .values(sort_order=i)
            )
        await self._session.flush()

    async def count(self, user_id: uuid.UUID) -> int:
        """Count items in a user's watchlist."""
        result = await self._session.execute(
            select(func.count()).select_from(WatchlistItem)
            .where(WatchlistItem.user_id == user_id)
        )
        return result.scalar() or 0
