"""Plan CRUD service."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plan import Plan
from app.schemas.plan import PlanCreate, PlanUpdate


async def get_plan_by_id(session: AsyncSession, plan_id: uuid.UUID) -> Plan | None:
    """Fetch a plan by primary key."""
    return await session.get(Plan, plan_id)


async def get_plan_by_code(session: AsyncSession, code: str) -> Plan | None:
    """Fetch a plan by its unique code."""
    result = await session.execute(select(Plan).where(Plan.code == code))
    return result.scalar_one_or_none()


async def list_public_plans(session: AsyncSession) -> list[Plan]:
    """Return all active, public plans ordered by sort_order."""
    result = await session.execute(
        select(Plan)
        .where(Plan.is_active.is_(True), Plan.is_public.is_(True))
        .order_by(Plan.sort_order)
    )
    return list(result.scalars().all())


async def list_all_plans(
    session: AsyncSession, *, skip: int = 0, limit: int = 50
) -> tuple[list[Plan], int]:
    """Admin: return paginated list of all plans."""
    total_result = await session.execute(select(func.count(Plan.id)))
    total = total_result.scalar_one()
    result = await session.execute(
        select(Plan).order_by(Plan.sort_order).offset(skip).limit(limit)
    )
    return list(result.scalars().all()), total


async def create_plan(session: AsyncSession, data: PlanCreate) -> Plan:
    """Create a new plan."""
    plan = Plan(**data.model_dump())
    session.add(plan)
    await session.flush()
    await session.refresh(plan)
    return plan


async def update_plan(session: AsyncSession, plan: Plan, data: PlanUpdate) -> Plan:
    """Update plan fields (PATCH semantics)."""
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    await session.flush()
    await session.refresh(plan)
    return plan
