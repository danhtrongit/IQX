"""Cấp 0 onboarding API — progress, enter (+seed), placement, tasks, graduate.

Cap 0 is FREE: all endpoints use ``CurrentUser`` (authenticated), NOT ``PremiumUser``.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap0 import (
    Cap0ProgressOut,
    PlacementRequest,
    PlacementResponse,
    TaskRequest,
)
from app.services.cap0.service import Cap0Service

router = APIRouter(prefix="/cap0", tags=["Cấp 0"])


@router.get("/progress", response_model=Cap0ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap0ProgressOut | None:
    """Trả về tiến trình Cấp 0 của người dùng hiện tại (hoặc null nếu chưa vào)."""
    svc = Cap0Service(db)
    return await svc.get_progress(user.id)


@router.post("/enter", response_model=Cap0ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap0ProgressOut:
    """Vào Cấp 0 (idempotent) + seed tài khoản ảo 250tr nếu user chưa có."""
    svc = Cap0Service(db)
    return await svc.enter(user.id)


@router.post("/placement", response_model=PlacementResponse)
async def placement(
    body: PlacementRequest, user: CurrentUser, db: DBSession
) -> PlacementResponse:
    """Ghi nhận câu trả lời phân loại → trả placed_level (chưa từng giao dịch → 0, đã từng → 2)."""
    svc = Cap0Service(db)
    result = await svc.set_placement(user.id, body.has_traded_before)
    return PlacementResponse(placed_level=result.placed_level)


@router.patch("/task", response_model=Cap0ProgressOut)
async def complete_task(
    body: TaskRequest, user: CurrentUser, db: DBSession
) -> Cap0ProgressOut:
    """Đánh dấu nhiệm vụ hoàn thành (idempotent) + set cổng (star/sl_typed/debrief) nếu có."""
    svc = Cap0Service(db)
    return await svc.complete_task(user.id, body.task_no, body.gate)


@router.post("/graduate", response_model=Cap0ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap0ProgressOut:
    """Tốt nghiệp Cấp 0 — chỉ khi đủ 6 nhiệm vụ + 2 cổng (sl_typed, debrief)."""
    svc = Cap0Service(db)
    return await svc.graduate(user.id)
