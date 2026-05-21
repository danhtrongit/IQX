"""Admin payment order endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, DBSession
from app.api.deps_audit import AuditCtx
from app.schemas.admin_payments import (
    AdminPaymentOrderBrief,
    AdminPaymentOrderDetail,
    ReconcileRequest,
    RefundRequest,
)
from app.schemas.common import PaginatedResponse
from app.services.admin_payments import AdminPaymentService

router = APIRouter(prefix="/admin/payments", tags=["Admin - Payments"])


@router.get("", response_model=PaginatedResponse[AdminPaymentOrderBrief])
async def list_payments(
    admin: AdminUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    status: str | None = Query(None),
    grant_type: str | None = Query(None),
    user_id: uuid.UUID | None = Query(None),
    plan_id: uuid.UUID | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    search: str | None = Query(None),
):
    """Danh sách đơn hàng thanh toán (admin)."""
    svc = AdminPaymentService(db)
    return await svc.list(
        page=page,
        page_size=page_size,
        status=status,
        grant_type=grant_type,
        user_id=user_id,
        plan_id=plan_id,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )


@router.get("/{order_id}", response_model=AdminPaymentOrderDetail)
async def get_payment(order_id: uuid.UUID, admin: AdminUser, db: DBSession):
    """Chi tiết đơn hàng thanh toán (admin)."""
    svc = AdminPaymentService(db)
    return await svc.get(order_id)


@router.post("/{order_id}/refund", response_model=AdminPaymentOrderDetail)
async def refund_payment(
    order_id: uuid.UUID,
    body: RefundRequest,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
):
    """Hoàn tiền đơn hàng PAID (admin)."""
    svc = AdminPaymentService(db)
    return await svc.refund(order_id, audit, body.reason)


@router.post("/{order_id}/reconcile")
async def reconcile_payment(
    order_id: uuid.UUID,
    body: ReconcileRequest,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
):
    """Đối soát thủ công đơn hàng PENDING >30 phút (admin)."""
    svc = AdminPaymentService(db)
    return await svc.reconcile(order_id, audit, body.note)
