"""Public plan endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.schemas.error import ErrorResponse
from app.schemas.plan import PlanResponse
from app.services import plan as plan_service

router = APIRouter(prefix="/plans", tags=["Plans"])


@router.get(
    "",
    response_model=list[PlanResponse],
    summary="List available plans",
    description="Return all active, public subscription plans. No authentication required.",
    operation_id="listPublicPlans",
)
async def list_plans(
    session: AsyncSession = Depends(get_session),
) -> list:
    """List public plans."""
    return await plan_service.list_public_plans(session)


@router.get(
    "/{plan_id}",
    response_model=PlanResponse,
    summary="Get plan details",
    description="Return details of a specific plan by UUID. No authentication required.",
    operation_id="getPlan",
    responses={
        404: {"description": "Plan not found.", "model": ErrorResponse},
    },
)
async def get_plan(
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> PlanResponse:
    """Get a single plan."""
    plan = await plan_service.get_plan_by_id(session, plan_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
        )
    return plan  # type: ignore[return-value]
