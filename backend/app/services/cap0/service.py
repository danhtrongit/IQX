"""Cấp 0 onboarding service — progress, placement, tasks, graduation.

Cap 0 is FREE. This service owns the ``cap0_progress`` and ``user_placement``
rows and reuses the virtual-trading repo to seed a 250tr practice account on
entry. It does NOT touch the virtual-trading engine (matching/settlement).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap0 import Cap0Progress, UserPlacement
from app.repositories.virtual_trading import VirtualTradingRepository

_CAP0_INITIAL_CASH_VND = 250_000_000
_TASK_NOS = (1, 2, 3, 4, 5, 6)
_GATE_ATTR = {
    "star": "task1_star_clicked",
    "sl_typed": "task5_sl_typed",
    "debrief": "task6_debrief_done",
}


class Cap0Service:
    """Business logic for the free Cấp 0 onboarding flow."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._vt_repo = VirtualTradingRepository(session)

    async def _get_progress_row(self, user_id: uuid.UUID) -> Cap0Progress | None:
        result = await self._session.execute(
            select(Cap0Progress).where(Cap0Progress.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_progress(self, user_id: uuid.UUID) -> Cap0Progress | None:
        return await self._get_progress_row(user_id)

    async def enter(self, user_id: uuid.UUID) -> Cap0Progress:
        """Enter Cấp 0 (idempotent) and seed a 250tr account if the user has none."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            progress = Cap0Progress(
                user_id=user_id,
                entered_at=datetime.now(UTC),
                virtual_balance_init=_CAP0_INITIAL_CASH_VND,
            )
            self._session.add(progress)
            await self._session.flush()
            await self._session.refresh(progress)

        # Seed a practice account only if the user does not already have one.
        account = await self._vt_repo.get_account_by_user_id(user_id)
        if account is None:
            await self._vt_repo.create_account(user_id, _CAP0_INITIAL_CASH_VND)

        return progress

    async def set_placement(self, user_id: uuid.UUID, has_traded: bool) -> UserPlacement:
        """Record the placement answer (idempotent — re-answering overwrites)."""
        result = await self._session.execute(
            select(UserPlacement).where(UserPlacement.user_id == user_id)
        )
        placement = result.scalar_one_or_none()
        placed_level = 2 if has_traded else 0
        if placement is None:
            placement = UserPlacement(
                user_id=user_id,
                has_traded_before=has_traded,
                placed_level=placed_level,
            )
            self._session.add(placement)
        else:
            placement.has_traded_before = has_traded
            placement.placed_level = placed_level
        await self._session.flush()
        await self._session.refresh(placement)
        return placement

    async def complete_task(
        self, user_id: uuid.UUID, task_no: int, gate: str | None = None
    ) -> Cap0Progress:
        """Mark task ``task_no`` done (idempotent) and optionally set a gate."""
        if task_no not in _TASK_NOS:
            raise BadRequestError("task_no không hợp lệ")
        if gate is not None and gate not in _GATE_ATTR:
            raise BadRequestError("gate không hợp lệ")

        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 0")

        done_attr = f"task_{task_no}_done_at"
        if getattr(progress, done_attr) is None:
            setattr(progress, done_attr, datetime.now(UTC))

        if gate is not None:
            setattr(progress, _GATE_ATTR[gate], True)

        await self._session.flush()
        await self._session.refresh(progress)
        return progress

    async def graduate(self, user_id: uuid.UUID) -> Cap0Progress:
        """Graduate Cấp 0 — only when all 6 tasks are done + both required gates."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 0")

        all_tasks_done = all(
            getattr(progress, f"task_{n}_done_at") is not None for n in _TASK_NOS
        )
        gates_ok = progress.task5_sl_typed and progress.task6_debrief_done
        if not (all_tasks_done and gates_ok):
            raise ConflictError("Chưa hoàn thành đủ nhiệm vụ và cổng Cấp 0")

        if progress.graduated_at is None:
            now = datetime.now(UTC)
            progress.graduated_at = now
            entered = progress.entered_at
            if entered.tzinfo is None:
                entered = entered.replace(tzinfo=UTC)
            progress.time_to_graduate_hours = (now - entered).total_seconds() / 3600.0
            await self._session.flush()
            await self._session.refresh(progress)

        return progress
