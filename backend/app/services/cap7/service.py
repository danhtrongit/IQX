"""Cấp 7 live portfolio-balance journey service."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.cap6 import Cap6Progress
from app.models.cap7 import Cap7Progress
from app.repositories.virtual_trading import VirtualTradingRepository
from app.schemas.cap7 import cap7_progress_out
from app.services.portfolio_balance import PortfolioBalanceService, PortfolioBalanceSnapshot


class Cap7Service:
    """Recomputes Cấp 7 only from the current portfolio allocation."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = VirtualTradingRepository(session)
        self._portfolio_balance = PortfolioBalanceService(session)

    async def _get_progress_row(
        self, user_id: uuid.UUID, *, for_update: bool = False
    ) -> Cap7Progress | None:
        statement = select(Cap7Progress).where(Cap7Progress.user_id == user_id)
        if for_update:
            statement = statement.with_for_update()
        return (await self._session.execute(statement)).scalar_one_or_none()

    async def _require_progress(self, user_id: uuid.UUID, *, for_update: bool = False) -> Cap7Progress:
        progress = await self._get_progress_row(user_id, for_update=for_update)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 7")
        return progress

    async def _snapshot(self, user_id: uuid.UUID) -> PortfolioBalanceSnapshot:
        return await self._portfolio_balance.get_snapshot(user_id)

    async def _lock_live_portfolio(self, user_id: uuid.UUID) -> None:
        """Serialize a portfolio-wide decision with account/position mutations.

        Fills lock account first and then the touched position.  Graduation
        takes the same account lock before the ordered position set, so no fill
        can commit between the live allocation snapshot and ``graduated_at``.
        """
        account = await self._repo.get_account_by_user_id_for_update(user_id)
        if account is None:
            raise NotFoundError("tài khoản giao dịch ảo")
        await self._repo.list_positions_for_update(account.id)

    async def _recompute(self, progress: Cap7Progress) -> tuple[dict, PortfolioBalanceSnapshot]:
        snapshot = await self._snapshot(progress.user_id)
        progress.can_doi_ok = snapshot.can_doi_ok
        await self._session.flush()
        return cap7_progress_out(progress, snapshot).model_dump(), snapshot

    async def get_progress(self, user_id: uuid.UUID) -> dict | None:
        """Recompute and persist the current live balance decision, if entered."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            return None
        payload, _ = await self._recompute(progress)
        return payload

    async def enter(self, user_id: uuid.UUID) -> dict:
        """Enter idempotently after the user has graduated Cấp 6."""
        progress = await self._get_progress_row(user_id)
        if progress is None:
            cap6 = (
                await self._session.execute(select(Cap6Progress).where(Cap6Progress.user_id == user_id))
            ).scalar_one_or_none()
            if cap6 is None:
                raise NotFoundError("tiến trình Cấp 6")
            if cap6.graduated_at is None:
                raise ConflictError("Chưa tốt nghiệp Cấp 6")
            progress = Cap7Progress(user_id=user_id, entered_at=datetime.now(UTC), can_doi_ok=False)
            self._session.add(progress)
            await self._session.flush()
        payload, _ = await self._recompute(progress)
        return payload

    async def portfolio(self, user_id: uuid.UUID) -> PortfolioBalanceSnapshot:
        """Return the complete neutral allocation snapshot for the actionable view."""
        await self._require_progress(user_id)
        return await self._snapshot(user_id)

    async def graduate(self, user_id: uuid.UUID) -> dict:
        """Atomically recheck the live three-part gate before recording graduation."""
        await self._lock_live_portfolio(user_id)
        progress = await self._require_progress(user_id, for_update=True)
        payload, snapshot = await self._recompute(progress)
        # Historical graduates retain their terminal record even if a later
        # portfolio change would no longer qualify.
        if progress.graduated_at is not None:
            return payload
        if not snapshot.can_doi_ok:
            raise ConflictError(
                "Danh mục chưa cân đối: cần tối đa 30% mỗi mã, 40% mỗi ngành, "
                "ít nhất 4 mã và 3 ngành với dữ liệu giá/ngành đầy đủ"
            )
        now = datetime.now(UTC)
        progress.graduated_at = now
        entered_at = progress.entered_at
        if entered_at.tzinfo is None:
            entered_at = entered_at.replace(tzinfo=UTC)
        progress.time_to_graduate_hours = (now - entered_at).total_seconds() / 3600.0
        await self._session.flush()
        return cap7_progress_out(progress, snapshot).model_dump()
