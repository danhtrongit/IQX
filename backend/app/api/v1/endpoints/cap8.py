"""Cấp 8 APIs for terminal plan-compliant exit evidence."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap8 import (
    Cap8ProgressOut,
    DynamicStopOut,
    DynamicStopRequest,
    ExitContextOut,
    ExitOut,
    ExitRecordRequest,
    SyncPlanOut,
    SyncPlanRequest,
)
from app.services.cap8.service import Cap8Service

router = APIRouter(prefix="/cap8", tags=["Cấp 8"])


@router.get("/progress", response_model=Cap8ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap8ProgressOut | None:
    result = await Cap8Service(db).get_progress(user.id)
    return Cap8ProgressOut(**result) if result is not None else None


@router.post("/enter", response_model=Cap8ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap8ProgressOut:
    return Cap8ProgressOut(**await Cap8Service(db).enter(user.id))


@router.post("/graduate", response_model=Cap8ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap8ProgressOut:
    """Terminal graduation; Level 8 never opens another level."""
    return Cap8ProgressOut(**await Cap8Service(db).graduate(user.id))


@router.get("/positions/{symbol}/exit-context", response_model=ExitContextOut)
async def exit_context(
    symbol: str,
    user: CurrentUser,
    db: DBSession,
    proposed_sale_quantity: int | None = None,
) -> ExitContextOut:
    return ExitContextOut(**await Cap8Service(db).exit_context(
        user.id, symbol, proposed_sale_quantity,
    ))


@router.post("/positions/{symbol}/sync-plan", response_model=SyncPlanOut)
async def sync_plan(
    symbol: str, body: SyncPlanRequest, user: CurrentUser, db: DBSession
) -> SyncPlanOut:
    """Attach the latest qualifying filled BUY plan; thresholds are never client supplied."""
    return SyncPlanOut(**await Cap8Service(db).sync_plan(user.id, symbol, body.buy_order_id))


@router.patch("/positions/{symbol}/dynamic-stop", response_model=DynamicStopOut)
async def dynamic_stop(
    symbol: str, body: DynamicStopRequest, user: CurrentUser, db: DBSession
) -> DynamicStopOut:
    return DynamicStopOut(**await Cap8Service(db).set_dynamic_stop(user.id, symbol, body.dynamic_stop_vnd))


@router.post("/exits", response_model=ExitOut)
async def record_exit(body: ExitRecordRequest, user: CurrentUser, db: DBSession) -> ExitOut:
    """Idempotently derive evidence for one already-filled SELL order."""
    return ExitOut(**await Cap8Service(db).record_exit(user.id, body.sell_order_id))
