"""Virtual Trading API endpoints.

All endpoints under /api/v1/virtual-trading.
User routes require auth; write ops require premium active.
Admin routes require admin role.
"""

from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, CurrentUser, DBSession, PremiumUser
from app.models.virtual_trading import OrderSide, OrderStatus
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
async def get_account(user: CurrentUser, db: DBSession) -> AccountResponse:
    """Lấy tóm tắt tài khoản giao dịch ảo."""
    svc = VirtualTradingService(db)
    account = await svc.get_account(user.id)
    resp = AccountResponse.model_validate(account)
    resp.total_cash_vnd = account.cash_available_vnd + account.cash_reserved_vnd + account.cash_pending_vnd
    return resp


@router.get("/portfolio", response_model=PortfolioResponse, tags=["Giao dịch ảo"])
async def get_portfolio(user: CurrentUser, db: DBSession) -> PortfolioResponse:
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
    user: CurrentUser,
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
    user: CurrentUser,
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
async def admin_update_config(body: ConfigUpdate, admin: AdminUser, db: DBSession) -> ConfigResponse:
    """Quản trị: cập nhật cấu hình giao dịch ảo."""
    svc = VirtualTradingService(db)
    config = await svc.update_config(body.model_dump(exclude_unset=True), admin.id)
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
async def admin_reset_user(user_id: str, admin: AdminUser, db: DBSession) -> ResetResponse:
    """Quản trị: đặt lại tài khoản giao dịch ảo của một người dùng."""
    import uuid

    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("người dùng") from None

    svc = VirtualTradingService(db)
    await svc.reset_account(uid, admin.id)
    return ResetResponse(accounts_reset=1, message="Đặt lại tài khoản thành công")


@router.post("/admin/reset-all", response_model=ResetResponse, tags=[_TAG_ADMIN])
async def admin_reset_all(admin: AdminUser, db: DBSession) -> ResetResponse:
    """Quản trị: đặt lại tất cả tài khoản giao dịch ảo."""
    svc = VirtualTradingService(db)
    count = await svc.reset_all_accounts(admin.id)
    return ResetResponse(accounts_reset=count, message=f"Đã đặt lại {count} tài khoản")


@router.get("/admin/accounts", response_model=list[AdminAccountResponse], tags=[_TAG_ADMIN])
async def admin_list_accounts(admin: AdminUser, db: DBSession) -> list[AdminAccountResponse]:
    """Quản trị: liệt kê tất cả tài khoản giao dịch ảo."""
    svc = VirtualTradingService(db)
    items = await svc.list_accounts_with_users()
    return [
        AdminAccountResponse(
            id=item["account"].id, user_id=item["account"].user_id,
            user_email=item["user_email"],
            user_name=item["user_name"],
            status=item["account"].status.value,
            initial_cash_vnd=item["account"].initial_cash_vnd,
            cash_available_vnd=item["account"].cash_available_vnd,
            cash_reserved_vnd=item["account"].cash_reserved_vnd,
            cash_pending_vnd=item["account"].cash_pending_vnd,
            activated_at=item["account"].activated_at,
            reset_at=item["account"].reset_at,
        )
        for item in items
    ]
