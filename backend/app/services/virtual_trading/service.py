"""Virtual Trading service — core business logic for orders, portfolio, settlement."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError,
    UnprocessableEntityError,
)
from app.models.virtual_trading import (
    AccountStatus,
    OrderSide,
    OrderStatus,
    OrderType,
    SettlementKind,
    SettlementMode,
    SettlementStatus,
    VirtualOrder,
    VirtualSettlement,
    VirtualTrade,
)
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.virtual_trading.price_resolver import (
    PriceResult,
    PriceUnavailableError,
    SymbolValidationError,
    resolve_price,
    validate_symbol,
)
from app.services.virtual_trading.settlement import (
    add_trading_days,
    get_current_trading_date,
    parse_holidays,
)

logger = logging.getLogger(__name__)

# Financial bounds
_MAX_QUANTITY = 1_000_000  # 1M shares per order
_MAX_LIMIT_PRICE_VND = 10_000_000  # 10M VND/share (no VN stock is near this)
_MAX_GROSS_VND = 100_000_000_000  # 100B VND per order
_LEADERBOARD_HARD_CAP = 200  # Max accounts to evaluate for leaderboard

# Vietnam timezone: UTC+7
_VN_TZ = timezone(timedelta(hours=7))


def _round_bps(amount: int, rate_bps: int) -> int:
    """Calculate fee/tax from amount and rate in basis points. Round half-up."""
    return (amount * rate_bps + 5000) // 10000


class VirtualTradingService:
    """Core virtual trading business logic."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = VirtualTradingRepository(session)

    # ── Config ───────────────────────────────────────

    async def get_or_create_config(self, admin_id: uuid.UUID | None = None):
        config = await self._repo.get_active_config()
        if config is None:
            config = await self._repo.create_default_config(created_by=admin_id)
        return config

    async def update_config(self, data: dict[str, object], admin_id: uuid.UUID):
        config = await self.get_or_create_config(admin_id)
        return await self._repo.update_config(config, data, updated_by=admin_id)

    # ── Account ──────────────────────────────────────

    async def activate_account(self, user_id: uuid.UUID):
        existing = await self._repo.get_account_by_user_id(user_id)
        if existing is not None:
            raise ConflictError("Virtual trading account already exists")

        config = await self.get_or_create_config()
        if not config.trading_enabled:
            raise ForbiddenError("Virtual trading is currently disabled")

        account = await self._repo.create_account(user_id, config.initial_cash_vnd)
        await self._repo.add_ledger_entry(
            account_id=account.id,
            amount_vnd=config.initial_cash_vnd,
            balance_after_vnd=config.initial_cash_vnd,
            kind="activate",
            note=f"Initial cash from config: {config.initial_cash_vnd} VND",
        )
        return account

    async def get_account(self, user_id: uuid.UUID):
        account = await self._repo.get_account_by_user_id(user_id)
        if account is None:
            raise NotFoundError("Virtual trading account")
        return account

    # ── Place Order ──────────────────────────────────

    async def place_order(
        self,
        user_id: uuid.UUID,
        symbol: str,
        side: str,
        order_type: str,
        quantity: int,
        limit_price_vnd: int | None = None,
    ):
        config = await self.get_or_create_config()
        if not config.trading_enabled:
            raise ForbiddenError("Virtual trading is currently disabled")

        # Validate lot size
        if quantity % config.board_lot_size != 0:
            raise BadRequestError(
                f"Quantity must be a multiple of {config.board_lot_size}",
            )

        # Validate limit order
        if order_type == "limit" and (limit_price_vnd is None or limit_price_vnd <= 0):
            raise BadRequestError(
                "Limit price is required for limit orders and must be > 0",
            )

        symbol = symbol.upper()

        # Financial bounds (Fix 7)
        if quantity > _MAX_QUANTITY:
            raise UnprocessableEntityError(
                f"Quantity {quantity} exceeds max {_MAX_QUANTITY} per order",
            )
        if limit_price_vnd is not None and limit_price_vnd > _MAX_LIMIT_PRICE_VND:
            raise UnprocessableEntityError(
                f"Limit price {limit_price_vnd} exceeds max {_MAX_LIMIT_PRICE_VND} VND",
            )

        # Validate symbol against HOSE/HNX/UPCOM universe (fail-closed)
        try:
            if not await validate_symbol(symbol):
                raise UnprocessableEntityError(
                    f"Symbol '{symbol}' is not listed on HOSE/HNX/UPCOM",
                )
        except SymbolValidationError as exc:
            raise ServiceUnavailableError(
                f"Cannot verify symbol: {exc.reason}",
            ) from exc

        holidays = parse_holidays(config.holidays)
        today = datetime.now(_VN_TZ).date()
        trading_date = get_current_trading_date(today, holidays)

        # Lock account for atomic cash/position check
        account = await self._repo.get_account_by_user_id_for_update(user_id)
        if account is None:
            raise NotFoundError("Virtual trading account")
        if account.status != AccountStatus.ACTIVE:
            raise ForbiddenError("Account is suspended")

        # Config snapshot — authoritative for fee/tax at fill time
        snapshot = json.dumps({
            "buy_fee_rate_bps": config.buy_fee_rate_bps,
            "sell_fee_rate_bps": config.sell_fee_rate_bps,
            "sell_tax_rate_bps": config.sell_tax_rate_bps,
            "settlement_mode": config.settlement_mode.value,
            "board_lot_size": config.board_lot_size,
        })

        order_side = OrderSide(side)
        o_type = OrderType(order_type)

        if o_type == OrderType.MARKET:
            return await self._execute_market_order(
                account, config, symbol, order_side, quantity,
                trading_date, snapshot, holidays,
            )
        else:
            return await self._create_limit_order(
                account, config, symbol, order_side, quantity,
                limit_price_vnd, trading_date, snapshot,
            )

    async def _execute_market_order(
        self, account, config, symbol, side, quantity,
        trading_date, snapshot, holidays=None,
    ):
        """Execute a market order immediately at current price."""
        try:
            price_result = await resolve_price(
                symbol, holidays=holidays or set(),
            )
        except PriceUnavailableError as exc:
            order = VirtualOrder(
                account_id=account.id, user_id=account.user_id, symbol=symbol,
                side=side, order_type=OrderType.MARKET, status=OrderStatus.REJECTED,
                quantity=quantity, trading_date=trading_date,
                rejection_reason=str(exc), config_snapshot=snapshot,
            )
            return await self._repo.create_order(order)

        # Enforce max gross after price resolve
        gross = price_result.price_vnd * quantity
        if gross > _MAX_GROSS_VND:
            raise UnprocessableEntityError(
                f"Gross order value {gross:,} VND exceeds max {_MAX_GROSS_VND:,} VND",
            )

        return await self._fill_order_at_price(
            account, config, symbol, side, OrderType.MARKET,
            quantity, price_result, trading_date, snapshot,
        )

    async def _create_limit_order(
        self, account, config, symbol, side, quantity, limit_price_vnd, trading_date, snapshot,
    ):
        """Create a pending limit order with reserves."""
        # Enforce max gross
        gross = limit_price_vnd * quantity
        if gross > _MAX_GROSS_VND:
            raise UnprocessableEntityError(
                f"Gross order value {gross:,} VND exceeds max {_MAX_GROSS_VND:,} VND",
            )
        if side == OrderSide.BUY:
            gross = limit_price_vnd * quantity
            fee = _round_bps(gross, config.buy_fee_rate_bps)
            reserve_cash = gross + fee
            if account.cash_available_vnd < reserve_cash:
                raise BadRequestError(
                    f"Insufficient cash: need {reserve_cash} VND, have {account.cash_available_vnd} VND"
                )
            account.cash_available_vnd -= reserve_cash
            account.cash_reserved_vnd += reserve_cash
            order = VirtualOrder(
                account_id=account.id, user_id=account.user_id, symbol=symbol,
                side=side, order_type=OrderType.LIMIT, status=OrderStatus.PENDING,
                quantity=quantity, limit_price_vnd=limit_price_vnd,
                reserved_cash_vnd=reserve_cash, trading_date=trading_date,
                config_snapshot=snapshot,
            )
        else:  # SELL
            position = await self._repo.get_position_for_update(account.id, symbol)
            if position is None or position.quantity_sellable < quantity:
                available = position.quantity_sellable if position else 0
                raise BadRequestError(f"Insufficient sellable shares: need {quantity}, have {available}")
            position.quantity_sellable -= quantity
            position.quantity_reserved += quantity
            order = VirtualOrder(
                account_id=account.id, user_id=account.user_id, symbol=symbol,
                side=side, order_type=OrderType.LIMIT, status=OrderStatus.PENDING,
                quantity=quantity, limit_price_vnd=limit_price_vnd,
                reserved_quantity=quantity, trading_date=trading_date,
                config_snapshot=snapshot,
            )

        return await self._repo.create_order(order)

    async def _fill_order_at_price(
        self, account, config, symbol, side, order_type, quantity,
        price_result: PriceResult, trading_date, snapshot,
        limit_price_vnd=None, existing_order=None,
    ):
        """Fill an order at the given price. Handles buy/sell, T0/T2, fee/tax.

        When filling a pending order (existing_order is set), fee/tax/settlement
        are computed from the order's config_snapshot, NOT the current config.
        This ensures admin config changes don't affect pending orders.
        """
        price_vnd = price_result.price_vnd
        now = datetime.now(UTC)

        # Resolve effective config: snapshot for pending fills, live for new
        if existing_order and existing_order.config_snapshot:
            snap = json.loads(existing_order.config_snapshot)
            eff_buy_fee = snap.get("buy_fee_rate_bps", config.buy_fee_rate_bps)
            eff_sell_fee = snap.get("sell_fee_rate_bps", config.sell_fee_rate_bps)
            eff_sell_tax = snap.get("sell_tax_rate_bps", config.sell_tax_rate_bps)
            eff_settlement = SettlementMode(
                snap.get("settlement_mode", config.settlement_mode.value),
            )
        else:
            eff_buy_fee = config.buy_fee_rate_bps
            eff_sell_fee = config.sell_fee_rate_bps
            eff_sell_tax = config.sell_tax_rate_bps
            eff_settlement = config.settlement_mode

        holidays = parse_holidays(config.holidays)

        if side == OrderSide.BUY:
            gross = price_vnd * quantity
            fee = _round_bps(gross, eff_buy_fee)
            tax = 0
            total_cost = gross + fee

            if existing_order:
                account.cash_reserved_vnd -= existing_order.reserved_cash_vnd
                diff = total_cost - existing_order.reserved_cash_vnd
                if diff > 0:
                    # Price went up: need to debit extra from available
                    if account.cash_available_vnd < diff:
                        raise BadRequestError("Insufficient cash after price change")
                    account.cash_available_vnd -= diff
                elif diff < 0:
                    # Price went down: refund excess to available
                    account.cash_available_vnd += abs(diff)
            else:
                if account.cash_available_vnd < total_cost:
                    raise BadRequestError(
                        f"Insufficient cash: need {total_cost}, "
                        f"have {account.cash_available_vnd}",
                    )
                account.cash_available_vnd -= total_cost

            net = -(total_cost)

            position = await self._repo.get_position_for_update(account.id, symbol)
            old_total = position.quantity_total if position else 0
            old_cost = position.avg_cost_vnd if position else 0
            new_total = old_total + quantity
            new_avg = (
                ((old_cost * old_total) + (price_vnd * quantity)) // new_total
                if new_total > 0 else 0
            )

            if eff_settlement == SettlementMode.T0:
                new_sellable = (position.quantity_sellable if position else 0) + quantity
                new_pending = position.quantity_pending if position else 0
            else:
                new_sellable = position.quantity_sellable if position else 0
                new_pending = (position.quantity_pending if position else 0) + quantity

            await self._repo.upsert_position(
                account.id, symbol,
                quantity_total=new_total, quantity_sellable=new_sellable,
                quantity_pending=new_pending,
                quantity_reserved=position.quantity_reserved if position else 0,
                avg_cost_vnd=new_avg,
            )
        else:  # SELL
            gross = price_vnd * quantity
            fee = _round_bps(gross, eff_sell_fee)
            tax = _round_bps(gross, eff_sell_tax)
            proceeds = gross - fee - tax

            if existing_order:
                position = await self._repo.get_position_for_update(account.id, symbol)
                if position:
                    position.quantity_reserved -= existing_order.reserved_quantity
            else:
                position = await self._repo.get_position_for_update(account.id, symbol)
                if position is None or position.quantity_sellable < quantity:
                    available = position.quantity_sellable if position else 0
                    raise BadRequestError(
                        f"Insufficient shares: need {quantity}, have {available}",
                    )
                position.quantity_sellable -= quantity

            if position:
                new_total = position.quantity_total - quantity
                if new_total < 0:
                    raise BadRequestError(
                        f"Position integrity violation: selling {quantity} shares "
                        f"would make total negative ({position.quantity_total} - {quantity})",
                    )
                position.quantity_total = new_total

            if eff_settlement == SettlementMode.T0:
                account.cash_available_vnd += proceeds
            else:
                account.cash_pending_vnd += proceeds

            net = proceeds

        # Create order record
        if existing_order:
            order = existing_order
            order.status = OrderStatus.FILLED
            order.filled_price_vnd = price_vnd
            order.gross_amount_vnd = gross
            order.fee_vnd = fee
            order.tax_vnd = tax
            order.net_amount_vnd = net
        else:
            order = VirtualOrder(
                account_id=account.id, user_id=account.user_id, symbol=symbol,
                side=side, order_type=order_type, status=OrderStatus.FILLED,
                quantity=quantity, limit_price_vnd=limit_price_vnd,
                filled_price_vnd=price_vnd, gross_amount_vnd=gross,
                fee_vnd=fee, tax_vnd=tax, net_amount_vnd=net,
                trading_date=trading_date, config_snapshot=snapshot,
            )
            order = await self._repo.create_order(order)

        trade = VirtualTrade(
            order_id=order.id, account_id=account.id, symbol=symbol,
            side=side, quantity=quantity, price_vnd=price_vnd,
            gross_amount_vnd=gross, fee_vnd=fee, tax_vnd=tax, net_amount_vnd=net,
            price_source=price_result.source, price_time=price_result.timestamp,
            traded_at=now,
        )
        trade = await self._repo.create_trade(trade)

        # T2 settlement
        if eff_settlement == SettlementMode.T2:
            due = add_trading_days(trading_date, 2, holidays)
            if side == OrderSide.BUY:
                await self._repo.create_settlement(VirtualSettlement(
                    account_id=account.id, trade_id=trade.id,
                    kind=SettlementKind.BUY_QTY_RELEASE, amount=quantity,
                    symbol=symbol, due_date=due,
                ))
            else:
                await self._repo.create_settlement(VirtualSettlement(
                    account_id=account.id, trade_id=trade.id,
                    kind=SettlementKind.SELL_CASH_RELEASE, amount=proceeds,
                    due_date=due,
                ))

        # Ledger
        await self._repo.add_ledger_entry(
            account_id=account.id, amount_vnd=net,
            balance_after_vnd=account.cash_available_vnd,
            kind=side.value, reference_type="trade", reference_id=trade.id,
        )

        await self._session.flush()

        # Clear active reserves on terminal order (Fix 3)
        order.reserved_cash_vnd = 0
        order.reserved_quantity = 0

        return order

    # ── Cancel Order ─────────────────────────────────

    async def cancel_order(self, user_id: uuid.UUID, order_id: uuid.UUID):
        order = await self._repo.get_order_for_update(order_id)
        if order is None:
            raise NotFoundError("Order")
        if order.user_id != user_id:
            raise ForbiddenError("Not your order")
        if order.status != OrderStatus.PENDING:
            raise BadRequestError(f"Cannot cancel order with status '{order.status}'")

        account = await self._repo.get_account_for_update(order.account_id)
        if account is None:
            raise NotFoundError("Account")

        order.status = OrderStatus.CANCELLED
        order.cancel_reason = "User cancelled"

        if order.side == OrderSide.BUY and order.reserved_cash_vnd > 0:
            account.cash_reserved_vnd -= order.reserved_cash_vnd
            account.cash_available_vnd += order.reserved_cash_vnd
        elif order.side == OrderSide.SELL and order.reserved_quantity > 0:
            position = await self._repo.get_position_for_update(order.account_id, order.symbol)
            if position:
                position.quantity_reserved -= order.reserved_quantity
                position.quantity_sellable += order.reserved_quantity

        await self._session.flush()

        # Clear active reserves on terminal order (Fix 3)
        order.reserved_cash_vnd = 0
        order.reserved_quantity = 0

        return order

    # ── Refresh ──────────────────────────────────────

    async def refresh(self, user_id: uuid.UUID):
        account = await self._repo.get_account_by_user_id_for_update(user_id)
        if account is None:
            raise NotFoundError("Virtual trading account")

        config = await self.get_or_create_config()
        holidays = parse_holidays(config.holidays)
        today = datetime.now(_VN_TZ).date()
        trading_date = get_current_trading_date(today, holidays)

        filled = 0
        expired = 0
        settled = 0
        warnings: list[str] = []

        # 1. Process pending limit orders
        pending = await self._repo.get_pending_orders(account.id)
        for order in pending:
            # GFD expiry check
            if order.trading_date < trading_date:
                order.status = OrderStatus.EXPIRED
                if order.side == OrderSide.BUY and order.reserved_cash_vnd > 0:
                    account.cash_reserved_vnd -= order.reserved_cash_vnd
                    account.cash_available_vnd += order.reserved_cash_vnd
                elif order.side == OrderSide.SELL and order.reserved_quantity > 0:
                    pos = await self._repo.get_position_for_update(order.account_id, order.symbol)
                    if pos:
                        pos.quantity_reserved -= order.reserved_quantity
                        pos.quantity_sellable += order.reserved_quantity
                # Clear reserves on terminal order (Fix 3)
                order.reserved_cash_vnd = 0
                order.reserved_quantity = 0
                expired += 1
                continue

            # Try to fill — pass holidays for session-aware pricing
            try:
                price_result = await resolve_price(
                    order.symbol, holidays=holidays,
                )
            except PriceUnavailableError:
                warnings.append(
                    f"Price unavailable for {order.symbol}, "
                    f"order {order.id} kept pending",
                )
                continue

            should_fill = False
            if order.side == OrderSide.BUY and order.limit_price_vnd:
                should_fill = price_result.price_vnd <= order.limit_price_vnd
            elif order.side == OrderSide.SELL and order.limit_price_vnd:
                should_fill = price_result.price_vnd >= order.limit_price_vnd

            if should_fill:
                await self._fill_order_at_price(
                    account, config, order.symbol, order.side,
                    order.order_type, order.quantity, price_result,
                    order.trading_date,
                    order.config_snapshot or "{}",
                    existing_order=order,
                )
                filled += 1

        # 2. Settle due T2 items
        due_settlements = await self._repo.get_due_settlements(account.id, today)
        for s in due_settlements:
            if s.kind == SettlementKind.BUY_QTY_RELEASE and s.symbol:
                pos = await self._repo.get_position_for_update(account.id, s.symbol)
                if pos:
                    release = min(int(s.amount), pos.quantity_pending)
                    pos.quantity_pending -= release
                    pos.quantity_sellable += release
            elif s.kind == SettlementKind.SELL_CASH_RELEASE:
                account.cash_pending_vnd -= int(s.amount)
                account.cash_available_vnd += int(s.amount)
            s.status = SettlementStatus.SETTLED
            s.settled_at = datetime.now(UTC)
            settled += 1

        await self._session.flush()
        return {
            "orders_filled": filled, "orders_expired": expired,
            "settlements_settled": settled, "warnings": warnings,
        }

    # ── Portfolio ────────────────────────────────────

    async def get_portfolio(self, user_id: uuid.UUID):
        """Read-only portfolio: no refresh/mutation (Fix 4)."""
        account = await self._repo.get_account_by_user_id(user_id)
        if account is None:
            raise NotFoundError("Virtual trading account")

        config = await self.get_or_create_config()
        holidays_set = parse_holidays(config.holidays)

        positions = await self._repo.list_positions(account.id)
        pos_data = []
        total_mv = 0
        total_pnl = 0

        for p in positions:
            if p.quantity_total <= 0:
                continue
            try:
                pr = await resolve_price(p.symbol, holidays=holidays_set)
                mv = pr.price_vnd * p.quantity_total
                cost = p.avg_cost_vnd * p.quantity_total
                pnl = mv - cost
                pos_data.append({
                    "symbol": p.symbol, "quantity_total": p.quantity_total,
                    "quantity_sellable": p.quantity_sellable, "quantity_pending": p.quantity_pending,
                    "quantity_reserved": p.quantity_reserved, "avg_cost_vnd": p.avg_cost_vnd,
                    "current_price_vnd": pr.price_vnd, "market_value_vnd": mv,
                    "unrealized_pnl_vnd": pnl,
                })
                total_mv += mv
                total_pnl += pnl
            except PriceUnavailableError:
                pos_data.append({
                    "symbol": p.symbol, "quantity_total": p.quantity_total,
                    "quantity_sellable": p.quantity_sellable, "quantity_pending": p.quantity_pending,
                    "quantity_reserved": p.quantity_reserved, "avg_cost_vnd": p.avg_cost_vnd,
                    "current_price_vnd": None, "market_value_vnd": None, "unrealized_pnl_vnd": None,
                })

        total_cash = account.cash_available_vnd + account.cash_reserved_vnd + account.cash_pending_vnd
        nav = total_cash + total_mv
        if account.initial_cash_vnd > 0:
            return_pct = (nav - account.initial_cash_vnd) / account.initial_cash_vnd * 100
        else:
            return_pct = 0.0

        return {
            "account": account,
            "positions": pos_data,
            "total_market_value_vnd": total_mv,
            "nav_vnd": nav,
            "total_unrealized_pnl_vnd": total_pnl,
            "return_pct": round(return_pct, 2),
        }

    # ── Orders / Trades ──────────────────────────────

    async def list_orders(self, user_id: uuid.UUID, *, status=None, symbol=None, side=None, page=1, page_size=20):
        account = await self.get_account(user_id)
        orders, total = await self._repo.list_orders(
            account.id, status=status, symbol=symbol, side=side, page=page, page_size=page_size,
        )
        return orders, total

    async def list_trades(self, user_id: uuid.UUID, *, page=1, page_size=20):
        account = await self.get_account(user_id)
        return await self._repo.list_trades(account.id, page=page, page_size=page_size)

    # ── Leaderboard ──────────────────────────────────

    async def get_leaderboard(self, sort_by: str = "nav", page: int = 1, page_size: int = 20):
        """Leaderboard with hard cap on accounts evaluated (Fix 5)."""
        from sqlalchemy import select as sa_select

        config = await self.get_or_create_config()
        holidays_set = parse_holidays(config.holidays)
        total_eligible = await self._repo.count_active_accounts()

        # Only load capped number of accounts (avoid full table scan)
        accounts = await self._repo.list_active_accounts(
            limit=_LEADERBOARD_HARD_CAP,
        )
        entries = []

        # Collect unique symbols across all accounts first, resolve once
        symbol_prices: dict[str, int] = {}
        all_positions_map: dict[uuid.UUID, list] = {}
        for acct in accounts:
            positions = await self._repo.list_positions(acct.id)
            all_positions_map[acct.id] = positions
            for p in positions:
                if p.quantity_total > 0 and p.symbol not in symbol_prices:
                    symbol_prices[p.symbol] = 0  # placeholder

        # Batch resolve: one call per unique symbol, not per position
        for sym in list(symbol_prices.keys()):
            try:
                pr = await resolve_price(sym, holidays=holidays_set)
                symbol_prices[sym] = pr.price_vnd
            except PriceUnavailableError:
                symbol_prices[sym] = 0  # will fallback to avg_cost

        # Batch-load users for all evaluated accounts
        user_ids = [acct.user_id for acct in accounts]
        user_map: dict[uuid.UUID, str] = {}
        if user_ids:
            from app.models.user import User
            result = await self._session.execute(
                sa_select(User).where(User.id.in_(user_ids))
            )
            for u in result.scalars().all():
                user_map[u.id] = u.full_name

        for acct in accounts:
            total_cash = acct.cash_available_vnd + acct.cash_reserved_vnd + acct.cash_pending_vnd
            positions = all_positions_map.get(acct.id, [])
            mv = 0
            for p in positions:
                if p.quantity_total <= 0:
                    continue
                price = symbol_prices.get(p.symbol, 0)
                if price > 0:
                    mv += price * p.quantity_total
                else:
                    mv += p.avg_cost_vnd * p.quantity_total

            nav = total_cash + mv
            profit = nav - acct.initial_cash_vnd
            ret_pct = (profit / acct.initial_cash_vnd * 100) if acct.initial_cash_vnd > 0 else 0.0

            name = user_map.get(acct.user_id, "Unknown")

            entries.append({
                "user_id": acct.user_id, "display_name": name,
                "nav_vnd": nav, "profit_vnd": profit, "return_pct": round(ret_pct, 2),
                "initial_cash_vnd": acct.initial_cash_vnd,
            })

        # Sort
        key_map = {"nav": "nav_vnd", "profit": "profit_vnd", "return_pct": "return_pct"}
        sort_key = key_map.get(sort_by, "nav_vnd")
        entries.sort(key=lambda e: float(e[sort_key]), reverse=True)  # type: ignore[arg-type]

        total_evaluated = len(entries)
        start = (page - 1) * page_size
        page_entries = entries[start : start + page_size]

        for i, e in enumerate(page_entries, start=start + 1):
            e["rank"] = i

        return page_entries, total_evaluated, total_eligible

    # ── Admin: Reset ─────────────────────────────────

    async def reset_account(self, user_id: uuid.UUID, admin_id: uuid.UUID):
        account = await self._repo.get_account_by_user_id_for_update(user_id)
        if account is None:
            raise NotFoundError("Virtual trading account")

        config = await self.get_or_create_config()

        # Delete all related data
        await self._repo.delete_settlements(account.id)
        await self._repo.delete_trades(account.id)
        await self._repo.delete_orders(account.id)
        await self._repo.delete_positions(account.id)
        await self._repo.delete_ledger(account.id)

        # Reset cash
        account.initial_cash_vnd = config.initial_cash_vnd
        account.cash_available_vnd = config.initial_cash_vnd
        account.cash_reserved_vnd = 0
        account.cash_pending_vnd = 0
        account.reset_at = datetime.now(UTC)

        await self._repo.add_ledger_entry(
            account_id=account.id, amount_vnd=config.initial_cash_vnd,
            balance_after_vnd=config.initial_cash_vnd, kind="reset",
            note=f"Account reset by admin {admin_id}",
        )
        await self._session.flush()

    async def reset_all_accounts(self, admin_id: uuid.UUID) -> int:
        accounts = await self._repo.list_all_accounts()
        for acct in accounts:
            await self.reset_account(acct.user_id, admin_id)
        return len(accounts)

    async def list_accounts_with_users(self) -> list[dict]:
        """List all accounts with user info. Batch-loads users to avoid N+1."""
        from sqlalchemy import select as sa_select

        from app.models.user import User

        accounts = await self._repo.list_all_accounts()
        if not accounts:
            return []

        user_ids = [acct.user_id for acct in accounts]
        result = await self._session.execute(
            sa_select(User).where(User.id.in_(user_ids))
        )
        user_map = {u.id: u for u in result.scalars().all()}

        items = []
        for acct in accounts:
            user = user_map.get(acct.user_id)
            items.append({
                "account": acct,
                "user_email": user.email if user else None,
                "user_name": user.full_name if user else None,
            })
        return items
