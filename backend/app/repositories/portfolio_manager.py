"""Data access for PortfolioReport (day-cache + history)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.portfolio_report import PortfolioReport


class PortfolioReportRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_for_date(self, account_id: uuid.UUID, session_date: date) -> PortfolioReport | None:
        res = await self._session.execute(
            select(PortfolioReport).where(
                PortfolioReport.account_id == account_id,
                PortfolioReport.session_date == session_date,
            )
        )
        return res.scalar_one_or_none()

    async def get_latest(self, account_id: uuid.UUID) -> PortfolioReport | None:
        res = await self._session.execute(
            select(PortfolioReport)
            .where(PortfolioReport.account_id == account_id)
            .order_by(PortfolioReport.session_date.desc())
            .limit(1)
        )
        return res.scalar_one_or_none()

    async def list_recent(self, account_id: uuid.UUID, limit: int = 10) -> list[PortfolioReport]:
        res = await self._session.execute(
            select(PortfolioReport)
            .where(PortfolioReport.account_id == account_id)
            .order_by(PortfolioReport.session_date.desc())
            .limit(limit)
        )
        return list(res.scalars().all())

    async def count_for_account(self, account_id: uuid.UUID) -> int:
        res = await self._session.execute(
            select(func.count()).select_from(PortfolioReport).where(
                PortfolioReport.account_id == account_id
            )
        )
        return int(res.scalar() or 0)

    async def insert(self, report: PortfolioReport) -> PortfolioReport:
        self._session.add(report)
        await self._session.flush()
        return report
