"""Admin audit log viewer endpoint."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import AdminUser, DBSession
from app.models.admin_audit import AdminAuditLog
from app.models.user import User
from app.schemas.admin_audit import AdminAuditLogResponse
from app.schemas.common import PaginatedResponse
from app.services.admin_audit import AdminAuditService

router = APIRouter(prefix="/admin/audit", tags=["Admin - Audit"])


@router.get("", response_model=PaginatedResponse[AdminAuditLogResponse])
async def list_audit_logs(
    admin: AdminUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    admin_user_id: uuid.UUID | None = Query(None),
    action_prefix: str | None = Query(None),
    target_entity: str | None = Query(None),
    target_id: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
):
    """Danh sách audit log (admin)."""
    svc = AdminAuditService(db)
    page_result = await svc.list(
        page=page,
        page_size=page_size,
        admin_user_id=admin_user_id,
        action_prefix=action_prefix,
        target_entity=target_entity,
        target_id=target_id,
        date_from=date_from,
        date_to=date_to,
    )

    # Fetch admin emails in one extra query
    distinct_admin_ids = {
        row.admin_user_id for row in page_result.items if row.admin_user_id is not None
    }
    email_map: dict[uuid.UUID, str] = {}
    if distinct_admin_ids:
        user_rows = (
            await db.execute(
                select(User.id, User.email).where(User.id.in_(distinct_admin_ids))
            )
        ).all()
        email_map = {r.id: r.email for r in user_rows}

    items = [
        AdminAuditLogResponse(
            id=row.id,
            admin_user_id=row.admin_user_id,
            admin_email=email_map.get(row.admin_user_id) if row.admin_user_id else None,
            action=row.action,
            target_entity=row.target_entity,
            target_id=row.target_id,
            payload_before=row.payload_before,
            payload_after=row.payload_after,
            note=row.note,
            ip=row.ip,
            user_agent=row.user_agent,
            request_id=row.request_id,
            created_at=row.created_at,
        )
        for row in page_result.items
    ]

    return PaginatedResponse(
        items=items,
        total=page_result.total,
        page=page_result.page,
        page_size=page_result.page_size,
        total_pages=page_result.total_pages,
    )
