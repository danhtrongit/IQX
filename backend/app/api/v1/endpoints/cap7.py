"""Cấp 7 live portfolio-balance API."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap7 import Cap7ProgressOut
from app.services.cap7.service import Cap7Service
from app.services.portfolio_balance import PortfolioBalanceSnapshot

router = APIRouter(prefix="/cap7", tags=["Cấp 7"])


@router.get("/progress", response_model=Cap7ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap7ProgressOut | None:
    """Recompute and return the current live portfolio-balance gate."""
    result = await Cap7Service(db).get_progress(user.id)
    return Cap7ProgressOut(**result) if result is not None else None


@router.post("/enter", response_model=Cap7ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap7ProgressOut:
    """Enter Cấp 7 idempotently after Cấp 6 graduation."""
    return Cap7ProgressOut(**await Cap7Service(db).enter(user.id))


@router.get("/portfolio", response_model=PortfolioBalanceSnapshot)
async def portfolio(user: CurrentUser, db: DBSession) -> PortfolioBalanceSnapshot:
    """Full neutral allocation snapshot for the Holdings-adjacent balance view."""
    return await Cap7Service(db).portfolio(user.id)


@router.post("/graduate", response_model=Cap7ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap7ProgressOut:
    """Graduate only when the transactionally recomputed live gate is complete."""
    return Cap7ProgressOut(**await Cap7Service(db).graduate(user.id))
