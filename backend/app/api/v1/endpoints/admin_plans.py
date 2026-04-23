"""Admin plan management endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.dependencies.auth import get_current_admin
from app.models.user import User
from app.schemas.error import ErrorResponse
from app.schemas.plan import PlanCreate, PlanListResponse, PlanResponse, PlanUpdate
from app.services import plan as plan_service

router = APIRouter(prefix="/admin/plans", tags=["Admin Plans"])


@router.get(
    "",
    response_model=PlanListResponse,
    summary="List all plans (admin)",
    description="Return paginated list of all plans including inactive/private. **Requires admin.**",
    operation_id="adminListPlans",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
async def admin_list_plans(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin list all plans."""
    plans, total = await plan_service.list_all_plans(session, skip=skip, limit=limit)
    return {"items": plans, "total": total}


@router.post(
    "",
    response_model=PlanResponse,
    status_code=201,
    summary="Create a plan (admin)",
    description="Create a new subscription plan. **Requires admin.**",
    operation_id="adminCreatePlan",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        409: {"model": ErrorResponse, "description": "Plan code already exists."},
    },
)
async def admin_create_plan(
    body: PlanCreate,
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin create plan."""
    existing = await plan_service.get_plan_by_code(session, body.code)
    if existing:
        raise HTTPException(status_code=409, detail="Plan code already exists")
    return await plan_service.create_plan(session, body)


@router.get(
    "/{plan_id}",
    response_model=PlanResponse,
    summary="Get plan (admin)",
    description="Get any plan by UUID including inactive. **Requires admin.**",
    operation_id="adminGetPlan",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
async def admin_get_plan(
    plan_id: uuid.UUID,
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin get plan."""
    plan = await plan_service.get_plan_by_id(session, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.patch(
    "/{plan_id}",
    response_model=PlanResponse,
    summary="Update plan (admin)",
    description="Update a plan (PATCH semantics). **Requires admin.**",
    operation_id="adminUpdatePlan",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
async def admin_update_plan(
    plan_id: uuid.UUID,
    body: PlanUpdate,
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin update plan."""
    plan = await plan_service.get_plan_by_id(session, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return await plan_service.update_plan(session, plan, body)
