"""Admin Virtual Trading endpoints — freeze / unfreeze / cash-adjust."""
from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.deps import AdminUser, DBSession
from app.api.deps_audit import AuditCtx
from app.schemas.admin_vt import (
    CashAdjustRequest,
    CashAdjustResponse,
    FreezeAccountRequest,
    UnfreezeAccountRequest,
    VTAccountAdminResponse,
)
from app.services.admin_vt import AdminVTService

router = APIRouter(prefix="/admin/vt", tags=["Quản trị: Giao dịch ảo"])


@router.post(
    "/accounts/{account_id}/freeze",
    response_model=VTAccountAdminResponse,
    summary="Tạm khóa tài khoản giao dịch ảo",
)
async def freeze_account(
    account_id: uuid.UUID,
    body: FreezeAccountRequest,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> VTAccountAdminResponse:
    """Quản trị: Tạm khóa tài khoản giao dịch ảo. Ghi audit log."""
    acct = await AdminVTService(db).freeze(account_id, audit, body.reason)
    return VTAccountAdminResponse.model_validate(acct)


@router.post(
    "/accounts/{account_id}/unfreeze",
    response_model=VTAccountAdminResponse,
    summary="Mở khóa tài khoản giao dịch ảo",
)
async def unfreeze_account(
    account_id: uuid.UUID,
    body: UnfreezeAccountRequest,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> VTAccountAdminResponse:
    """Quản trị: Mở khóa tài khoản giao dịch ảo. Ghi audit log."""
    acct = await AdminVTService(db).unfreeze(
        account_id, audit, body.reason or ""
    )
    return VTAccountAdminResponse.model_validate(acct)


@router.post(
    "/accounts/{account_id}/cash-adjust",
    response_model=CashAdjustResponse,
    summary="Điều chỉnh số dư tiền mặt",
)
async def cash_adjust(
    account_id: uuid.UUID,
    body: CashAdjustRequest,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> CashAdjustResponse:
    """Quản trị: Điều chỉnh số dư tiền mặt (cộng/trừ). Ghi audit log."""
    acct, ledger = await AdminVTService(db).cash_adjust(
        account_id,
        audit,
        amount_vnd=body.amount_vnd,
        reason=body.reason,
    )
    return CashAdjustResponse(
        account=VTAccountAdminResponse.model_validate(acct),
        ledger_id=ledger.id,
        new_cash_available_vnd=acct.cash_available_vnd,
    )
