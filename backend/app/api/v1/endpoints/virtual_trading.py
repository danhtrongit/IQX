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

router = APIRouter(prefix="/virtual-trading", tags=["Virtual Trading"])

_TAG_ADMIN = "Virtual Trading Admin"


# ══════════════════════════════════════════════════════
# User endpoints
# ══════════════════════════════════════════════════════


@router.post("/account/activate", response_model=AccountResponse, status_code=201, tags=["Virtual Trading"])
async def activate_account(user: PremiumUser, db: DBSession) -> AccountResponse:
    """Activate a virtual trading account. Requires active premium."""
    svc = VirtualTradingService(db)
    account = await svc.activate_account(user.id)
    resp = AccountResponse.model_validate(account)
    resp.total_cash_vnd = account.cash_available_vnd + account.cash_reserved_vnd + account.cash_pending_vnd
    return resp


@router.get("/account", response_model=AccountResponse, tags=["Virtual Trading"])
async def get_account(user: CurrentUser, db: DBSession) -> AccountResponse:
    """Get virtual trading account summary."""
    svc = VirtualTradingService(db)
    account = await svc.get_account(user.id)
    resp = AccountResponse.model_validate(account)
    resp.total_cash_vnd = account.cash_available_vnd + account.cash_reserved_vnd + account.cash_pending_vnd
    return resp


@router.get("/portfolio", response_model=PortfolioResponse, tags=["Virtual Trading"])
async def get_portfolio(user: CurrentUser, db: DBSession) -> PortfolioResponse:
    """Get full portfolio (triggers refresh of pending orders/settlements)."""
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
        refresh_warnings=data["refresh_warnings"],
    )


@router.post("/orders", response_model=OrderResponse, status_code=201, tags=["Virtual Trading"])
async def place_order(body: OrderCreateRequest, user: PremiumUser, db: DBSession) -> OrderResponse:
    """Place a virtual trading order. Requires active premium."""
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


@router.get("/orders", response_model=OrderListResponse, tags=["Virtual Trading"])
async def list_orders(
    user: CurrentUser,
    db: DBSession,
    status: Annotated[str | None, Query(description="Filter: pending,filled,cancelled,expired,rejected")] = None,
    symbol: Annotated[str | None, Query()] = None,
    side: Annotated[str | None, Query(description="Filter: buy,sell")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> OrderListResponse:
    """List virtual orders with optional filters."""
    svc = VirtualTradingService(db)
    o_status = OrderStatus(status) if status else None
    o_side = OrderSide(side) if side else None
    orders, total = await svc.list_orders(
        user.id, status=o_status, symbol=symbol, side=o_side, page=page, page_size=page_size,
    )
    return OrderListResponse(
        orders=[OrderResponse.model_validate(o) for o in orders],
        total=total, page=page, page_size=page_size,
    )


@router.post("/orders/{order_id}/cancel", response_model=OrderResponse, tags=["Virtual Trading"])
async def cancel_order(order_id: str, user: PremiumUser, db: DBSession) -> OrderResponse:
    """Cancel a pending order. Requires active premium."""
    import uuid

    try:
        oid = uuid.UUID(order_id)
    except ValueError:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Order") from None

    svc = VirtualTradingService(db)
    order = await svc.cancel_order(user.id, oid)
    return OrderResponse.model_validate(order)


@router.post("/refresh", response_model=RefreshResponse, tags=["Virtual Trading"])
async def refresh(user: CurrentUser, db: DBSession) -> RefreshResponse:
    """Process pending limit orders, expire GFD, settle T2."""
    svc = VirtualTradingService(db)
    result = await svc.refresh(user.id)
    return RefreshResponse(**result)


@router.get("/trades", response_model=TradeListResponse, tags=["Virtual Trading"])
async def list_trades(
    user: CurrentUser,
    db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> TradeListResponse:
    """List executed trades."""
    svc = VirtualTradingService(db)
    trades, total = await svc.list_trades(user.id, page=page, page_size=page_size)
    return TradeListResponse(
        trades=[TradeResponse.model_validate(t) for t in trades],
        total=total, page=page, page_size=page_size,
    )


@router.get("/leaderboard", response_model=LeaderboardResponse, tags=["Virtual Trading"])
async def get_leaderboard(
    db: DBSession,
    sort_by: Annotated[str, Query(description="Sort: nav, profit, return_pct")] = "nav",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> LeaderboardResponse:
    """Public leaderboard — no auth required."""
    svc = VirtualTradingService(db)
    entries, total = await svc.get_leaderboard(sort_by=sort_by, page=page, page_size=page_size)
    return LeaderboardResponse(
        entries=[LeaderboardEntry(**e) for e in entries],
        total=total, page=page, page_size=page_size, sort_by=sort_by,
    )


# ══════════════════════════════════════════════════════
# Admin endpoints
# ══════════════════════════════════════════════════════


@router.get("/admin/config", response_model=ConfigResponse, tags=[_TAG_ADMIN])
async def admin_get_config(admin: AdminUser, db: DBSession) -> ConfigResponse:
    """Admin: get active virtual trading config."""
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
    """Admin: update virtual trading config."""
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
    """Admin: reset a user's virtual trading account."""
    import uuid

    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("User") from None

    svc = VirtualTradingService(db)
    await svc.reset_account(uid, admin.id)
    return ResetResponse(accounts_reset=1, message="Account reset successfully")


@router.post("/admin/reset-all", response_model=ResetResponse, tags=[_TAG_ADMIN])
async def admin_reset_all(admin: AdminUser, db: DBSession) -> ResetResponse:
    """Admin: reset all virtual trading accounts."""
    svc = VirtualTradingService(db)
    count = await svc.reset_all_accounts(admin.id)
    return ResetResponse(accounts_reset=count, message=f"{count} accounts reset")


@router.get("/admin/accounts", response_model=list[AdminAccountResponse], tags=[_TAG_ADMIN])
async def admin_list_accounts(admin: AdminUser, db: DBSession) -> list[AdminAccountResponse]:
    """Admin: list all virtual trading accounts."""
    from sqlalchemy import select

    from app.models.user import User

    svc = VirtualTradingService(db)
    accounts = await svc._repo.list_all_accounts()
    result = []
    for acct in accounts:
        user_result = await db.execute(select(User).where(User.id == acct.user_id))
        user = user_result.scalar_one_or_none()
        result.append(AdminAccountResponse(
            id=acct.id, user_id=acct.user_id,
            user_email=user.email if user else None,
            user_name=user.full_name if user else None,
            status=acct.status.value, initial_cash_vnd=acct.initial_cash_vnd,
            cash_available_vnd=acct.cash_available_vnd,
            cash_reserved_vnd=acct.cash_reserved_vnd,
            cash_pending_vnd=acct.cash_pending_vnd,
            activated_at=acct.activated_at,
            reset_at=acct.reset_at,
        ))
    return result
