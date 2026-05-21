"""Admin subscription endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, DBSession
from app.api.deps_audit import AuditCtx
from app.schemas.admin_subscriptions import (
    AdminSubscriptionBrief,
    AdminSubscriptionDetail,
    CancelSubscriptionRequest,
    ExtendSubscriptionRequest,
)
from app.schemas.common import PaginatedResponse
from app.services.admin_subscriptions import AdminSubscriptionService

router = APIRouter(tags=["Admin - Subscriptions"])


@router.get("/admin/subscriptions", response_model=PaginatedResponse[AdminSubscriptionBrief])
async def list_subscriptions(
    admin: AdminUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    status: str | None = Query(None),
    plan_id: uuid.UUID | None = Query(None),
    user_id: uuid.UUID | None = Query(None),
    expiring_within_days: int | None = Query(None, ge=1),
):
    """Danh sách subscription (admin)."""
    svc = AdminSubscriptionService(db)
    return await svc.list(
        page=page,
        page_size=page_size,
        status=status,
        plan_id=plan_id,
        user_id=user_id,
        expiring_within_days=expiring_within_days,
    )


@router.get("/admin/subscriptions/{sub_id}", response_model=AdminSubscriptionDetail)
async def get_subscription(sub_id: uuid.UUID, admin: AdminUser, db: DBSession):
    """Chi tiết subscription (admin)."""
    svc = AdminSubscriptionService(db)
    return await svc.get(sub_id)


@router.get(
    "/admin/users/{user_id}/subscriptions/history",
    response_model=list[AdminSubscriptionDetail],
)
async def user_subscription_history(user_id: uuid.UUID, admin: AdminUser, db: DBSession):
    """Lịch sử subscription của người dùng (admin)."""
    svc = AdminSubscriptionService(db)
    return await svc.list_user_history(user_id)


@router.post("/admin/subscriptions/{sub_id}/cancel", response_model=AdminSubscriptionDetail)
async def cancel_subscription(
    sub_id: uuid.UUID,
    body: CancelSubscriptionRequest,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
):
    """Huỷ subscription (admin)."""
    svc = AdminSubscriptionService(db)
    return await svc.cancel(sub_id, audit, body.reason)


@router.post("/admin/subscriptions/{sub_id}/extend", response_model=AdminSubscriptionDetail)
async def extend_subscription(
    sub_id: uuid.UUID,
    body: ExtendSubscriptionRequest,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
):
    """Gia hạn subscription (admin)."""
    svc = AdminSubscriptionService(db)
    return await svc.extend(sub_id, audit, body.days, body.reason)
