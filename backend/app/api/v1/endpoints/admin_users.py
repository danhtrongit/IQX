"""Admin user endpoints — 360, bulk, reset-password, verify, export, login history."""
from __future__ import annotations

import math
import uuid
from datetime import datetime

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.api.deps import AdminUser, DBSession
from app.api.deps_audit import AuditCtx
from app.schemas.admin_users import (
    BulkUpdateRequest,
    BulkUpdateResponse,
    LoginHistoryRow,
    ResendVerificationResponse,
    ResetPasswordResponse,
    User360Response,
    UserExportParams,
)
from app.schemas.common import PaginatedResponse
from app.services.admin_users import AdminUserService


router = APIRouter(prefix="/admin/users", tags=["Quản trị: Người dùng"])


# NOTE: /export must be declared BEFORE /{user_id}/... routes so FastAPI does
# not try to coerce the literal "export" as a UUID path parameter.


@router.get("/export")
async def export_users_csv(
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
    role: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    last_login_from: datetime | None = Query(None),
    last_login_to: datetime | None = Query(None),
) -> StreamingResponse:
    """Stream a CSV file of users matching the given filters.

    Returns 400 (BadRequestError) if the filter would match more than 50 000
    rows — tighten the filters first.
    """
    from app.core.exceptions import BadRequestError
    from app.services.admin_users import EXPORT_MAX_ROWS

    params = UserExportParams(
        role=role,
        status=status,
        search=search,
        last_login_from=last_login_from,
        last_login_to=last_login_to,
    )
    svc = AdminUserService(db)
    # Pre-check row count BEFORE starting the streaming response so that a
    # BadRequestError can propagate as a normal HTTP 400 response instead of
    # crashing mid-stream.
    total = await svc.count_for_export(params)
    if total > EXPORT_MAX_ROWS:
        raise BadRequestError(
            f"Export filter matches {total} rows (max {EXPORT_MAX_ROWS}). "
            "Tighten filters first."
        )
    filename = f"users-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
    return StreamingResponse(
        svc.stream_csv(audit, params),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/bulk", response_model=BulkUpdateResponse)
async def bulk_update_users(
    body: BulkUpdateRequest,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> BulkUpdateResponse:
    """Bulk set_role / set_status / soft_delete for up to 500 users."""
    return await AdminUserService(db).bulk_update(audit, body)


@router.get("/{user_id}/360", response_model=User360Response)
async def get_user_360(
    user_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
) -> User360Response:
    """Full 360° profile for one user: subscription, payments, VT account, login history."""
    return await AdminUserService(db).get_360(user_id)


@router.post("/{user_id}/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    user_id: uuid.UUID,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> ResetPasswordResponse:
    """Reset to a 16-char temporary password and email the user a reset link.

    The temporary password is returned to the admin as a fallback (share it
    securely); the user also receives a self-service reset link by email.
    """
    return await AdminUserService(db).reset_password(audit, user_id)


@router.post(
    "/{user_id}/resend-verification",
    response_model=ResendVerificationResponse,
    status_code=202,
)
async def resend_verification(
    user_id: uuid.UUID,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> ResendVerificationResponse:
    """Send the user a fresh email-verification link (and record an audit row)."""
    await AdminUserService(db).resend_verification(audit, user_id)
    return ResendVerificationResponse()


@router.get(
    "/{user_id}/login-history",
    response_model=PaginatedResponse[LoginHistoryRow],
)
async def get_login_history(
    user_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> PaginatedResponse[LoginHistoryRow]:
    """Paginated login history for one user, newest first."""
    rows, total = await AdminUserService(db).login_history(
        user_id, page=page, page_size=page_size
    )
    return PaginatedResponse(
        items=[LoginHistoryRow.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
    )
