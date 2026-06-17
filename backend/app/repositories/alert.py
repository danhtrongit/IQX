"""Repositories for alert signals, user rules, and fired events."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import AlertEvent, AlertSide, AlertSignal, UserAlertRule
from app.models.watchlist import WatchlistItem


class AlertSignalRepository:
    """Global signal presets (admin-managed)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self, *, enabled_only: bool = False) -> list[AlertSignal]:
        stmt = select(AlertSignal).order_by(AlertSignal.sort_order.asc())
        if enabled_only:
            stmt = stmt.where(AlertSignal.is_enabled.is_(True))
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get(self, key: str) -> AlertSignal | None:
        result = await self._session.execute(select(AlertSignal).where(AlertSignal.key == key))
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        key: str,
        side: AlertSide,
        ta_name: str,
        message_title: str,
        combination: dict[str, Any],
        is_enabled: bool = True,
        sort_order: int = 0,
    ) -> AlertSignal:
        item = AlertSignal(
            key=key,
            side=side,
            ta_name=ta_name,
            message_title=message_title,
            combination=combination,
            is_enabled=is_enabled,
            sort_order=sort_order,
        )
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def delete(self, key: str) -> bool:
        result = await self._session.execute(delete(AlertSignal).where(AlertSignal.key == key))
        await self._session.flush()
        return bool(result.rowcount)  # type: ignore[attr-defined]


class UserAlertRuleRepository:
    """Per-user alert rules."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_user(self, user_id: uuid.UUID) -> list[UserAlertRule]:
        result = await self._session.execute(
            select(UserAlertRule).where(UserAlertRule.user_id == user_id).order_by(UserAlertRule.created_at.asc())
        )
        return list(result.scalars().all())

    async def get(self, user_id: uuid.UUID, rule_id: uuid.UUID) -> UserAlertRule | None:
        result = await self._session.execute(
            select(UserAlertRule).where(UserAlertRule.id == rule_id, UserAlertRule.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        user_id: uuid.UUID,
        name: str,
        side: AlertSide,
        combination: dict[str, Any],
        base_signal_key: str | None = None,
        is_enabled: bool = True,
    ) -> UserAlertRule:
        item = UserAlertRule(
            user_id=user_id,
            name=name,
            side=side,
            combination=combination,
            base_signal_key=base_signal_key,
            is_enabled=is_enabled,
        )
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def update(
        self,
        item: UserAlertRule,
        *,
        name: str | None = None,
        combination: dict[str, Any] | None = None,
        is_enabled: bool | None = None,
    ) -> UserAlertRule:
        if name is not None:
            item.name = name
        if combination is not None:
            item.combination = combination
        if is_enabled is not None:
            item.is_enabled = is_enabled
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def delete(self, user_id: uuid.UUID, rule_id: uuid.UUID) -> bool:
        result = await self._session.execute(
            delete(UserAlertRule).where(UserAlertRule.id == rule_id, UserAlertRule.user_id == user_id)
        )
        await self._session.flush()
        return bool(result.rowcount)  # type: ignore[attr-defined]

    async def all_enabled(self) -> list[UserAlertRule]:
        """Every enabled rule across all users (for the scan job)."""
        result = await self._session.execute(select(UserAlertRule).where(UserAlertRule.is_enabled.is_(True)))
        return list(result.scalars().all())


class AlertEventRepository:
    """Fired-alert log + once-per-day dedup."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_user(self, user_id: uuid.UUID, *, limit: int = 50) -> list[AlertEvent]:
        result = await self._session.execute(
            select(AlertEvent).where(AlertEvent.user_id == user_id).order_by(AlertEvent.fired_at.desc()).limit(limit)
        )
        return list(result.scalars().all())

    async def exists(self, user_id: uuid.UUID, rule_id: uuid.UUID, symbol: str, session_date: date) -> bool:
        result = await self._session.execute(
            select(AlertEvent.id)
            .where(
                AlertEvent.user_id == user_id,
                AlertEvent.rule_id == rule_id,
                AlertEvent.symbol == symbol,
                AlertEvent.session_date == session_date,
            )
            .limit(1)
        )
        return result.scalar_one_or_none() is not None


async def watchlist_symbols_by_user(session: AsyncSession) -> dict[uuid.UUID, set[str]]:
    """Map ``user_id -> {symbols}`` from watchlists (for the scan universe)."""
    result = await session.execute(select(WatchlistItem.user_id, WatchlistItem.symbol))
    mapping: dict[uuid.UUID, set[str]] = {}
    for user_id, symbol in result.all():
        mapping.setdefault(user_id, set()).add(symbol.upper())
    return mapping
