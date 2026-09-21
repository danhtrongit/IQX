"""Virtual Trading API endpoints.

All endpoints under /api/v1/virtual-trading.
User routes require auth (``CurrentUser``). The active journey level decides
the order mode: Cấp 0 is ``san_tap``/T0 and Cấp 1+ is ``thuc_chien``/T2.
``POST /account/activate`` (the paid 1B-VND account) still requires Premium —
Cấp 0 users get their practice account seeded via ``POST /cap0/enter`` instead.
Admin routes require admin role.
"""

from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, CurrentUser, DBSession, PremiumUser, is_premium_active
from app.api.deps_audit import AuditCtx
from app.core.exceptions import BadRequestError
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
from app.services.admin_audit import AdminAuditService, diff_dict
from app.services.cap0.service import Cap0Service
from app.services.cap1.service import Cap1Service
from app.services.cap2.alerts import Cap2AlertService, current_session_date
from app.services.cap2.service import Cap2Service
from app.services.cap3.service import Cap3Service
from app.services.cap4.service import Cap4Service
from app.services.cap5.service import Cap5Service
from app.services.cap6.service import Cap6Service
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
    """Lấy tóm tắt tài khoản giao dịch ảo.

    Không yêu cầu Premium: người dùng Cấp 0 (sân tập, miễn phí) cũng đọc được
    tài khoản ảo của chính mình (ví dụ tài khoản được seed qua ``POST /cap0/enter``).
    """
    svc = VirtualTradingService(db)
    account = await svc.get_account(user.id)
    resp = AccountResponse.model_validate(account)
    resp.total_cash_vnd = account.cash_available_vnd + account.cash_reserved_vnd + account.cash_pending_vnd
    return resp


@router.get("/portfolio", response_model=PortfolioResponse, tags=["Giao dịch ảo"])
async def get_portfolio(user: CurrentUser, db: DBSession) -> PortfolioResponse:
    """Lấy toàn bộ danh mục — chỉ đọc, không làm mới/thay đổi trạng thái.

    Không yêu cầu Premium (Cấp 0 sân tập được đọc danh mục của chính mình).
    """
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
async def place_order(body: OrderCreateRequest, user: CurrentUser, db: DBSession) -> OrderResponse:
    """Đặt lệnh giao dịch ảo.

    Không yêu cầu Premium. Server suy chế độ từ cấp hành trình hiện tại.
    """
    svc = VirtualTradingService(db)
    journey_level = await svc.get_journey_level(user.id)
    plan = body.journey_plan

    # Placement and graduation choose the next level before its progress row
    # necessarily exists. Materialise that row inside this same transaction so
    # the first BUY cannot fail between the mode resolver and plan persistence.
    if body.side == "buy" and journey_level == 1:
        cap1 = Cap1Service(db)
        if await cap1.get_progress(user.id) is None:
            await cap1.enter(user.id)
    elif body.side == "buy" and journey_level == 2:
        cap2 = Cap2Service(db)
        if await cap2.get_progress(user.id) is None:
            await cap2.enter(user.id)

    # A BUY and its learning commitments are one domain write.  Validate the
    # cumulative form before touching cash/positions so a missing block cannot
    # leave an order without the snapshot required by the active level.
    if body.side == "buy" and journey_level is not None:
        if plan is None:
            raise BadRequestError("Lệnh MUA trong hành trình cần journey_plan")
        if journey_level == 0 and not (plan.ly_do_doi_thuong or "").strip():
            raise BadRequestError("Cấp 0 cần lý do đời thường trước khi mua")
        if journey_level >= 1 and (
            plan.lyDo is None or plan.trangThai_luc_dat is None or plan.vung_mua is None
        ):
            raise BadRequestError("Cấp 1+ cần lý do, trạng thái và vùng mua")
        if journey_level >= 2 and (
            plan.phuong_phap_sl_tp is None or plan.cat_lo is None or plan.chot_loi is None
        ):
            raise BadRequestError("Cấp 2+ cần phương pháp, cắt lỗ và chốt lời")
        if journey_level >= 3 and (
            plan.khau_vi is None
            or plan.muc_tu_tin is None
            or plan.cach_khoi_luong is None
        ):
            raise BadRequestError("Cấp 3+ cần khẩu vị, mức tự tin và cách khối lượng")
        # Cấp 6 replaces the user's five-rating form with the compact
        # server-owned five-layer conflict table (Cap6 spec §5.2).  The hard
        # self-rating gate therefore applies only while that form exists.
        if 4 <= journey_level <= 5 and (
            plan.doc_5_lop is None
            or set(plan.doc_5_lop) != {"ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"}
        ):
            raise BadRequestError("Cấp 4–5 cần tự đọc đủ chính xác 5 lớp")
    elif body.side == "sell" and plan is not None:
        raise BadRequestError("journey_plan chỉ dùng cho lệnh MUA")

    nhoi_alert_service: Cap2AlertService | None = None
    nhoi_alert_id = plan.nhoi_lenh_alert_id if plan is not None else None
    request_session_date = current_session_date()
    if nhoi_alert_id is not None:
        if body.side != "buy" or journey_level is None or journey_level < 2:
            raise BadRequestError("Cảnh báo nhồi lệnh chỉ dùng cho BUY từ Cấp 2")
        nhoi_alert_service = Cap2AlertService(db)
        await nhoi_alert_service.validate_nhoi_order_link(
            user.id,
            nhoi_alert_id,
            symbol=body.symbol,
            quantity=body.quantity,
            order_type=body.order_type,
            limit_price_vnd=body.limit_price_vnd,
            session_date=request_session_date,
        )

    order = await svc.place_order(
        user_id=user.id,
        symbol=body.symbol,
        side=body.side,
        order_type=body.order_type,
        quantity=body.quantity,
        limit_price_vnd=body.limit_price_vnd,
        is_premium=await is_premium_active(user, db),
        journey_level=journey_level,
    )
    saved_levels: list[int] = []
    nhoi_alert_linked = False
    if (
        body.side == "buy"
        and plan is not None
        and journey_level is not None
        and order.status in (OrderStatus.PENDING, OrderStatus.FILLED)
    ):
        if journey_level == 0:
            await Cap0Service(db).record_kehoach(
                user.id, order.id, ly_do_doi_thuong=plan.ly_do_doi_thuong or ""
            )
            saved_levels.append(0)
        else:
            await Cap1Service(db).record_kehoach(
                user.id,
                order.id,
                ly_do=plan.lyDo,
                trang_thai_luc_dat=plan.trangThai_luc_dat,
                vung_mua=plan.vung_mua,
                co_bam_doc_chi_tiet=plan.co_bam_doc_chi_tiet,
                snapshot=plan.snapshot,
            )
            saved_levels.append(1)
            if journey_level >= 2:
                await Cap2Service(db).record_kehoach(
                    user.id,
                    order.id,
                    phuong_phap_sl_tp=plan.phuong_phap_sl_tp,
                    cat_lo=plan.cat_lo,
                    chot_loi=plan.chot_loi,
                )
                saved_levels.append(2)
            if journey_level >= 3:
                cap3 = Cap3Service(db)
                progress = await cap3.get_progress(user.id)
                if progress is None:
                    raise BadRequestError("Chưa có tiến trình Cấp 3")
                reference_price = order.filled_price_vnd or order.limit_price_vnd
                if reference_price is None:
                    raise BadRequestError("Chưa xác định được giá để tính % vốn")
                pct_von = order.quantity * reference_price / progress.von_ban_dau * 100.0
                await cap3.record_kehoach(
                    user.id,
                    order.id,
                    khau_vi=plan.khau_vi,
                    muc_tu_tin=plan.muc_tu_tin,
                    cach_khoi_luong=plan.cach_khoi_luong,
                    khoi_luong=order.quantity,
                    pct_von=pct_von,
                )
                saved_levels.append(3)
            if 4 <= journey_level <= 5:
                await Cap4Service(db).record_kehoach(
                    user.id, order.id, doc_5_lop=plan.doc_5_lop
                )
                saved_levels.append(4)
            if journey_level >= 5:
                cap5_plan = await Cap5Service(db).record_entry_snapshot(user.id, order.id)
                if cap5_plan.cap5_entry_snapshot_at is not None:
                    saved_levels.append(5)
            if journey_level >= 6:
                cap6 = Cap6Service(db)
                cap6_plan = await cap6.record_entry_snapshot(user.id, order.id)
                if plan.conflict_level is not None:
                    cap6_plan = await cap6.record_kehoach(
                        user.id, order.id, conflict_level=plan.conflict_level
                    )
                if (
                    cap6_plan.conflict_snapshot_at is not None
                    and cap6_plan.conflict_level is not None
                ):
                    saved_levels.append(6)
            if journey_level >= 2:
                await svc.activate_buy_plan(user.id, order.id)
            if nhoi_alert_service is not None and nhoi_alert_id is not None:
                nhoi_alert_linked = await nhoi_alert_service.link_nhoi_order(
                    user.id,
                    nhoi_alert_id,
                    order,
                    session_date=request_session_date,
                )

    response = OrderResponse.model_validate(order)
    response.journey_plan_saved_levels = saved_levels
    response.nhoi_lenh_alert_linked = nhoi_alert_linked
    return response


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
async def cancel_order(order_id: str, user: CurrentUser, db: DBSession) -> OrderResponse:
    """Hủy lệnh đang chờ. Không yêu cầu Premium (quyền sở hữu vẫn được kiểm tra)."""
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
async def refresh(user: CurrentUser, db: DBSession) -> RefreshResponse:
    """Xử lý lệnh limit đang chờ, hết hạn GFD, thanh toán T2.

    Không yêu cầu Premium — chỉ xử lý các lệnh/thanh toán đã tồn tại của
    chính tài khoản này (mode/thanh toán đã bị chốt tại thời điểm đặt lệnh).
    """
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
    import math

    from sqlalchemy import and_ as _and
    from sqlalchemy import func as _func
    from sqlalchemy import or_ as _or
    from sqlalchemy import select as _select

    from app.models.user import User
    from app.models.virtual_trading import AccountStatus, VirtualTradingAccount
    from app.schemas.common import PaginatedResponse

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
