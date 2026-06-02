"""Admin IPN log endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, DBSession
from app.api.deps_audit import AuditCtx
from app.schemas.admin_ipn import IPNRetryResponse, SePayIPNLogResponse
from app.schemas.common import PaginatedResponse
from app.services.admin_ipn import AdminIPNService

router = APIRouter(prefix="/admin/ipn", tags=["Admin - IPN Logs"])


@router.get("", response_model=PaginatedResponse[SePayIPNLogResponse])
async def list_ipn_logs(
    admin: AdminUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    secret_key_valid: bool | None = Query(None),
    result_status: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    search: str | None = Query(None),
):
    """Danh sách IPN logs (admin)."""
    svc = AdminIPNService(db)
    return await svc.list(
        page=page,
        page_size=page_size,
        secret_key_valid=secret_key_valid,
        result_status=result_status,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )


@router.get("/{log_id}", response_model=SePayIPNLogResponse)
async def get_ipn_log(log_id: uuid.UUID, admin: AdminUser, db: DBSession):
    """Chi tiết IPN log (admin). Bao gồm raw_body + raw_headers."""
    svc = AdminIPNService(db)
    return await svc.get(log_id)


@router.post("/{log_id}/retry", response_model=IPNRetryResponse)
async def retry_ipn_log(
    log_id: uuid.UUID,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
):
    """Thử xử lý lại IPN log. Chỉ được phép khi secret_key_valid=true và
    result_status != 'processed'. Ghi audit log."""
    svc = AdminIPNService(db)
    return await svc.retry(log_id, audit)
