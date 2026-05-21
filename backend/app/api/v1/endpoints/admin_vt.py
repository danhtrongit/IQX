"""Admin Virtual Trading endpoints — freeze / unfreeze / cash-adjust / account 360."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, DBSession
from app.api.deps_audit import AuditCtx
from app.schemas.admin_vt import (
    CashAdjustRequest,
    CashAdjustResponse,
    FreezeAccountRequest,
    UnfreezeAccountRequest,
    VTAccountAdminResponse,
    VTAccountStatsResponse,
    VTLedgerResponse,
    VTOrderResponse,
    VTPositionResponse,
    VTSettlementResponse,
    VTTradeResponse,
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


# ── Account 360 endpoints ─────────────────────────────────────────────────────


@router.get(
    "/accounts/{account_id}",
    response_model=VTAccountAdminResponse,
    summary="Chi tiết tài khoản giao dịch ảo",
)
async def get_account(
    account_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
) -> VTAccountAdminResponse:
    """Quản trị: Lấy thông tin tài khoản giao dịch ảo."""
    acct = await AdminVTService(db).get_account(account_id)
    return VTAccountAdminResponse.model_validate(acct)


@router.get(
    "/accounts/{account_id}/positions",
    response_model=list[VTPositionResponse],
    summary="Danh sách vị thế của tài khoản",
)
async def list_positions(
    account_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
) -> list[VTPositionResponse]:
    """Quản trị: Danh sách vị thế hiện tại của tài khoản."""
    positions = await AdminVTService(db).list_positions(account_id)
    return [VTPositionResponse.model_validate(p) for p in positions]


@router.get(
    "/accounts/{account_id}/orders",
    summary="Danh sách lệnh của tài khoản (phân trang)",
)
async def list_orders(
    account_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
    symbol: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
) -> dict:
    """Quản trị: Lấy danh sách lệnh có phân trang và bộ lọc."""
    result = await AdminVTService(db).list_orders(
        account_id,
        page=page,
        page_size=page_size,
        status=status,
        symbol=symbol,
        date_from=date_from,
        date_to=date_to,
    )
    return {
        "items": [VTOrderResponse.model_validate(o) for o in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "total_pages": result["total_pages"],
    }


@router.get(
    "/accounts/{account_id}/trades",
    summary="Danh sách giao dịch của tài khoản (phân trang)",
)
async def list_trades(
    account_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    symbol: Optional[str] = Query(None),
) -> dict:
    """Quản trị: Lấy danh sách giao dịch có phân trang."""
    result = await AdminVTService(db).list_trades(
        account_id,
        page=page,
        page_size=page_size,
        symbol=symbol,
    )
    return {
        "items": [VTTradeResponse.model_validate(t) for t in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "total_pages": result["total_pages"],
    }


@router.get(
    "/accounts/{account_id}/ledger",
    summary="Sổ cái tiền mặt của tài khoản (phân trang)",
)
async def list_ledger(
    account_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    kind: Optional[str] = Query(None),
) -> dict:
    """Quản trị: Lấy sổ cái tiền mặt có phân trang."""
    result = await AdminVTService(db).list_ledger(
        account_id,
        page=page,
        page_size=page_size,
        kind=kind,
    )
    return {
        "items": [VTLedgerResponse.model_validate(e) for e in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "total_pages": result["total_pages"],
    }


@router.get(
    "/accounts/{account_id}/settlements",
    summary="Danh sách thanh toán T+N của tài khoản (phân trang)",
)
async def list_settlements(
    account_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
) -> dict:
    """Quản trị: Lấy danh sách thanh toán T+N có phân trang."""
    result = await AdminVTService(db).list_settlements(
        account_id,
        page=page,
        page_size=page_size,
        status=status,
    )
    return {
        "items": [VTSettlementResponse.model_validate(s) for s in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "total_pages": result["total_pages"],
    }


@router.get(
    "/accounts/{account_id}/stats",
    response_model=VTAccountStatsResponse,
    summary="Thống kê tài khoản giao dịch ảo",
)
async def get_account_stats(
    account_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
) -> VTAccountStatsResponse:
    """Quản trị: Thống kê tài khoản (tổng lệnh, giao dịch, PnL gần đúng)."""
    stats = await AdminVTService(db).get_stats(account_id)
    return VTAccountStatsResponse(**stats)
