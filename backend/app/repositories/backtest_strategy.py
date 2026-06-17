"""Backtest strategy repository — per-user saved-strategy CRUD."""

from __future__ import annotations

import uuid
from typing import Any, cast

from sqlalchemy import CursorResult, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.backtest_strategy import BacktestStrategy


class BacktestStrategyRepository:
    """Data access for saved backtest strategies."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_user(self, user_id: uuid.UUID) -> list[BacktestStrategy]:
        result = await self._session.execute(
            select(BacktestStrategy)
            .where(BacktestStrategy.user_id == user_id)
            .order_by(BacktestStrategy.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get(self, user_id: uuid.UUID, strategy_id: uuid.UUID) -> BacktestStrategy | None:
        result = await self._session.execute(
            select(BacktestStrategy).where(
                BacktestStrategy.id == strategy_id,
                BacktestStrategy.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, user_id: uuid.UUID, name: str) -> BacktestStrategy | None:
        result = await self._session.execute(
            select(BacktestStrategy).where(
                BacktestStrategy.user_id == user_id,
                BacktestStrategy.name == name,
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self, user_id: uuid.UUID, name: str, symbol: str | None, config: dict[str, Any]
    ) -> BacktestStrategy:
        item = BacktestStrategy(user_id=user_id, name=name, symbol=symbol, config=config)
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def update(
        self,
        item: BacktestStrategy,
        *,
        name: str | None = None,
        symbol: str | None = None,
        config: dict[str, Any] | None = None,
    ) -> BacktestStrategy:
        if name is not None:
            item.name = name
        if symbol is not None:
            item.symbol = symbol
        if config is not None:
            item.config = config
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def delete(self, user_id: uuid.UUID, strategy_id: uuid.UUID) -> bool:
        result = await self._session.execute(
            delete(BacktestStrategy).where(
                BacktestStrategy.id == strategy_id,
                BacktestStrategy.user_id == user_id,
            )
        )
        await self._session.flush()
        return bool(cast("CursorResult[Any]", result).rowcount)
