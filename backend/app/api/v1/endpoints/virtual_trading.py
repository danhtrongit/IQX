"""Virtual Trading API endpoints.

All endpoints under /api/v1/virtual-trading.
User routes require auth; write ops require premium active.
Admin routes require admin role.
"""

from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, DBSession, PremiumUser
from app.api.deps_audit import AuditCtx
from app.models.virtual_trading import OrderSide, OrderStatus
from app.services.admin_audit import AdminAuditService, diff_dict
from app.schemas.virtual_trading import (
    AccountResponse,
    AdminAccountResponse,
    ConfigResponse,
    ConfigUpdate,
    LeaderboardEntry,
    LeaderboardResponse,
    OrderCreateRequest,
    OrderListResponse,
    OrderResponse,
    PortfolioResponse,
    PositionResponse,
    RefreshResponse,
    ResetResponse,
    TradeListResponse,
    TradeResponse,
)
from app.services.virtual_trading.service import VirtualTradingService

router = APIRouter(prefix="/virtual-trading")

_TAG_ADMIN = "Giao dịch ảo (quản trị)"


# ══════════════════════════════════════════════════════
# User endpoints
# ══════════════════════════════════════════════════════


@router.post("/account/activate", response_model=AccountResponse, status_code=201, tags=["Giao dịch ảo"])
async def activate_account(user: PremiumUser, db: DBSession) -> AccountResponse:
    """Kích hoạt tài khoản giao dịch ảo. Yêu cầu Premium đang hoạt động."""
    svc = VirtualTradingService(db)
    account = await svc.activate_account(user.id)
    resp = AccountResponse.model_validate(account)
    resp.total_cash_vnd = account.cash_available_vnd + account.cash_reserved_vnd + account.cash_pending_vnd
    return resp


@router.get("/account", response_model=AccountResponse, tags=["Giao dịch ảo"])
async def get_account(user: PremiumUser, db: DBSession) -> AccountResponse:
    """Lấy tóm tắt tài khoản giao dịch ảo."""
    svc = VirtualTradingService(db)
    account = await svc.get_account(user.id)
    resp = AccountResponse.model_validate(account)
    resp.total_cash_vnd = account.cash_available_vnd + account.cash_reserved_vnd + account.cash_pending_vnd
    return resp


@router.get("/portfolio", response_model=PortfolioResponse, tags=["Giao dịch ảo"])
async def get_portfolio(user: PremiumUser, db: DBSession) -> PortfolioResponse:
    """Lấy toàn bộ danh mục — chỉ đọc, không làm mới/thay đổi trạng thái."""
    svc = VirtualTradingService(db)
    data = await svc.get_portfolio(user.id)
    account = data["account"]
    acct_resp = AccountResponse.model_validate(account)
    acct_resp.total_cash_vnd = account.cash_available_vnd + account.cash_reserved_vnd + account.cash_pending_vnd
    return PortfolioResponse(
        account=acct_resp,
        positions=[PositionResponse(**p) for p in data["positions"]],
        total_market_value_vnd=data["total_market_value_vnd"],
        nav_vnd=data["nav_vnd"],
        total_unrealized_pnl_vnd=data["total_unrealized_pnl_vnd"],
        return_pct=data["return_pct"],
        refresh_warnings=data.get("refresh_warnings", []),
    )


@router.post("/orders", response_model=OrderResponse, status_code=201, tags=["Giao dịch ảo"])
async def place_order(body: OrderCreateRequest, user: PremiumUser, db: DBSession) -> OrderResponse:
    """Đặt lệnh giao dịch ảo. Yêu cầu Premium đang hoạt động."""
    svc = VirtualTradingService(db)
    order = await svc.place_order(
        user_id=user.id,
        symbol=body.symbol,
        side=body.side,
        order_type=body.order_type,
        quantity=body.quantity,
        limit_price_vnd=body.limit_price_vnd,
    )
    return OrderResponse.model_validate(order)


@router.get("/orders", response_model=OrderListResponse, tags=["Giao dịch ảo"])
async def list_orders(
    user: PremiumUser,
    db: DBSession,
    status: Annotated[
        str | None,
        Query(description="Lọc trạng thái: pending, filled, cancelled, expired, rejected"),
    ] = None,
    symbol: Annotated[str | None, Query()] = None,
    side: Annotated[
        str | None,
        Query(description="Lọc theo loại lệnh: buy, sell"),
    ] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> OrderListResponse:
    """Danh sách lệnh ảo có bộ lọc tùy chọn."""
    from app.core.exceptions import BadRequestError

    try:
        o_status = OrderStatus(status) if status else None
    except ValueError:
        raise BadRequestError(
            f"Giá trị status '{status}' không hợp lệ. "
            f"Cho phép: pending, filled, cancelled, expired, rejected",
        ) from None
    try:
        o_side = OrderSide(side) if side else None
    except ValueError:
        raise BadRequestError(
            f"Giá trị side '{side}' không hợp lệ. Cho phép: buy, sell",
        ) from None

    svc = VirtualTradingService(db)
    orders, total = await svc.list_orders(
        user.id, status=o_status, symbol=symbol, side=o_side, page=page, page_size=page_size,
    )
    return OrderListResponse(
        orders=[OrderResponse.model_validate(o) for o in orders],
        total=total, page=page, page_size=page_size,
    )


@router.post("/orders/{order_id}/cancel", response_model=OrderResponse, tags=["Giao dịch ảo"])
async def cancel_order(order_id: str, user: PremiumUser, db: DBSession) -> OrderResponse:
    """Hủy lệnh đang chờ. Yêu cầu Premium đang hoạt động."""
    import uuid

    try:
        oid = uuid.UUID(order_id)
    except ValueError:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("lệnh") from None

    svc = VirtualTradingService(db)
    order = await svc.cancel_order(user.id, oid)
    return OrderResponse.model_validate(order)


@router.post("/refresh", response_model=RefreshResponse, tags=["Giao dịch ảo"])
async def refresh(user: PremiumUser, db: DBSession) -> RefreshResponse:
    """Xử lý lệnh limit đang chờ, hết hạn GFD, thanh toán T2. Yêu cầu Premium đang hoạt động."""
    svc = VirtualTradingService(db)
    result = await svc.refresh(user.id)
    return RefreshResponse(**result)


@router.get("/trades", response_model=TradeListResponse, tags=["Giao dịch ảo"])
async def list_trades(
    user: PremiumUser,
    db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> TradeListResponse:
    """Danh sách giao dịch đã khớp."""
    svc = VirtualTradingService(db)
    trades, total = await svc.list_trades(user.id, page=page, page_size=page_size)
    return TradeListResponse(
        trades=[TradeResponse.model_validate(t) for t in trades],
        total=total, page=page, page_size=page_size,
    )


@router.get("/leaderboard", response_model=LeaderboardResponse, tags=["Giao dịch ảo"])
async def get_leaderboard(
    db: DBSession,
    sort_by: Annotated[str, Query(description="Sắp xếp theo: nav, profit, return_pct")] = "nav",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> LeaderboardResponse:
    """Bảng xếp hạng công khai — không cần xác thực."""
    svc = VirtualTradingService(db)
    entries, evaluated_count, total_eligible = await svc.get_leaderboard(
        sort_by=sort_by, page=page, page_size=page_size,
    )
    return LeaderboardResponse(
        entries=[LeaderboardEntry(**e) for e in entries],
        total=evaluated_count, total_eligible=total_eligible,
        evaluated_count=evaluated_count,
        page=page, page_size=page_size, sort_by=sort_by,
    )


# ══════════════════════════════════════════════════════
# Admin endpoints
# ══════════════════════════════════════════════════════


@router.get("/admin/config", response_model=ConfigResponse, tags=[_TAG_ADMIN])
async def admin_get_config(admin: AdminUser, db: DBSession) -> ConfigResponse:
    """Quản trị: lấy cấu hình giao dịch ảo đang hoạt động."""
    svc = VirtualTradingService(db)
    config = await svc.get_or_create_config(admin.id)
    holidays = json.loads(config.holidays) if config.holidays else []
    return ConfigResponse(
        id=config.id,
        initial_cash_vnd=config.initial_cash_vnd,
        buy_fee_rate_bps=config.buy_fee_rate_bps,
        sell_fee_rate_bps=config.sell_fee_rate_bps,
        sell_tax_rate_bps=config.sell_tax_rate_bps,
        settlement_mode=config.settlement_mode.value,
        board_lot_size=config.board_lot_size,
        trading_enabled=config.trading_enabled,
        holidays=holidays,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@router.patch("/admin/config", response_model=ConfigResponse, tags=[_TAG_ADMIN])
async def admin_update_config(
    body: ConfigUpdate, admin: AdminUser, audit: AuditCtx, db: DBSession
) -> ConfigResponse:
    """Quản trị: cập nhật cấu hình giao dịch ảo."""
    svc = VirtualTradingService(db)
    patch = body.model_dump(exclude_unset=True)
    # Capture before state for changed fields
    existing_config = await svc.get_or_create_config(admin.id)
    before_raw = {k: getattr(existing_config, k, None) for k in patch}
    before_vals = {
        k: (v.value if hasattr(v, "value") else v)
        for k, v in before_raw.items()
    }
    config = await svc.update_config(patch, admin.id)
    after_raw = {k: getattr(config, k, None) for k in patch}
    after_vals = {
        k: (v.value if hasattr(v, "value") else v)
        for k, v in after_raw.items()
    }
    b, a = diff_dict(before_vals, after_vals)
    await AdminAuditService(db).record(
        audit,
        action="vt.config.update",
        target_entity="vt_config",
        target_id=str(config.id),
        before=b,
        after=a,
    )
    holidays = json.loads(config.holidays) if config.holidays else []
    return ConfigResponse(
        id=config.id,
        initial_cash_vnd=config.initial_cash_vnd,
        buy_fee_rate_bps=config.buy_fee_rate_bps,
        sell_fee_rate_bps=config.sell_fee_rate_bps,
        sell_tax_rate_bps=config.sell_tax_rate_bps,
        settlement_mode=config.settlement_mode.value,
        board_lot_size=config.board_lot_size,
        trading_enabled=config.trading_enabled,
        holidays=holidays,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@router.post("/admin/users/{user_id}/reset", response_model=ResetResponse, tags=[_TAG_ADMIN])
async def admin_reset_user(
    user_id: str, admin: AdminUser, audit: AuditCtx, db: DBSession
) -> ResetResponse:
    """Quản trị: đặt lại tài khoản giao dịch ảo của một người dùng."""
    import uuid

    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("người dùng") from None

    svc = VirtualTradingService(db)
    await svc.reset_account(uid, admin.id)
    await AdminAuditService(db).record(
        audit,
        action="vt.account.reset",
        target_entity="vt_account",
        target_id=str(uid),
        note=f"reset user {uid}",
    )
    return ResetResponse(accounts_reset=1, message="Đặt lại tài khoản thành công")


@router.post("/admin/reset-all", response_model=ResetResponse, tags=[_TAG_ADMIN])
async def admin_reset_all(admin: AdminUser, audit: AuditCtx, db: DBSession) -> ResetResponse:
    """Quản trị: đặt lại tất cả tài khoản giao dịch ảo."""
    svc = VirtualTradingService(db)
    count = await svc.reset_all_accounts(admin.id)
    await AdminAuditService(db).record(
        audit,
        action="vt.account.reset_all",
        target_entity="vt_account",
        note=f"reset all accounts (count={count})",
        after={"count": count},
    )
    return ResetResponse(accounts_reset=count, message=f"Đã đặt lại {count} tài khoản")


@router.get("/admin/accounts", tags=[_TAG_ADMIN])
async def admin_list_accounts(
    admin: AdminUser,
    db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
    status: str | None = Query(None),
    frozen_only: bool | None = Query(None),
    search: str | None = Query(None),
):
    """Quản trị: liệt kê tài khoản giao dịch ảo (hỗ trợ phân trang và lọc)."""
    from app.schemas.common import PaginatedResponse
    import math
    from sqlalchemy import select as _select, func as _func, or_ as _or, and_ as _and
    from app.models.virtual_trading import VirtualTradingAccount, AccountStatus
    from app.models.user import User

    conditions = []
    if status:
        try:
            acct_status = AccountStatus(status)
            conditions.append(VirtualTradingAccount.status == acct_status)
        except ValueError:
            pass
    if frozen_only is True:
        conditions.append(VirtualTradingAccount.frozen_at.isnot(None))
    elif frozen_only is False:
        conditions.append(VirtualTradingAccount.frozen_at.is_(None))
    if search:
        conditions.append(
            _or(
                User.email.ilike(f"%{search}%"),
                User.full_name.ilike(f"%{search}%"),
            )
        )

    where = _and(*conditions) if conditions else None

    base = (
        _select(VirtualTradingAccount, User.email.label("user_email"), User.full_name.label("user_name"))
        .join(User, User.id == VirtualTradingAccount.user_id, isouter=True)
    )
    if where is not None:
        base = base.where(where)

    count_stmt = _select(_func.count()).select_from(base.subquery())
    session = db
    total: int = (await session.execute(count_stmt)).scalar_one()

    items_stmt = (
        base.order_by(VirtualTradingAccount.created_at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    rows = (await session.execute(items_stmt)).all()

    items = [
        AdminAccountResponse(
            id=r.VirtualTradingAccount.id,
            user_id=r.VirtualTradingAccount.user_id,
            user_email=r.user_email,
            user_name=r.user_name,
            status=r.VirtualTradingAccount.status.value,
            initial_cash_vnd=r.VirtualTradingAccount.initial_cash_vnd,
            cash_available_vnd=r.VirtualTradingAccount.cash_available_vnd,
            cash_reserved_vnd=r.VirtualTradingAccount.cash_reserved_vnd,
            cash_pending_vnd=r.VirtualTradingAccount.cash_pending_vnd,
            activated_at=r.VirtualTradingAccount.activated_at,
            reset_at=r.VirtualTradingAccount.reset_at,
        )
        for r in rows
    ]

    total_pages = math.ceil(total / page_size) if total > 0 else 0
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
