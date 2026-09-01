"""Server-owned Cấp 8 position-plan and exit evidence service.

A position is aggregate average-cost state, so its active plan is always the
latest filled BUY that has both original stop and take-profit values.  A SELL is
classified from that saved plan, persisted fill data, remaining quantity, and
verified daily close history; clients only name the already-filled order.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import OrderKehoach
from app.models.cap7 import Cap7Progress
from app.models.cap8 import Cap8Exit, Cap8Progress
from app.models.virtual_trading import (
    OrderSide,
    OrderStatus,
    VirtualOrder,
    VirtualPosition,
    VirtualTradingAccount,
)
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.portfolio_balance import PortfolioBalanceService
from app.services.ta.data import get_adjusted_ohlcv
from app.services.virtual_trading.service import VirtualTradingService

EXIT_TARGET = 5
_HISTORY_LOOKBACK_DAYS = 730


class Cap8Service:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = VirtualTradingRepository(session)
        self._trading = VirtualTradingService(session)
        self._portfolio_balance = PortfolioBalanceService(session)

    async def _progress(self, user_id: uuid.UUID, *, for_update: bool = False) -> Cap8Progress | None:
        statement = select(Cap8Progress).where(Cap8Progress.user_id == user_id)
        if for_update:
            statement = statement.with_for_update()
        return (await self._session.execute(statement)).scalar_one_or_none()

    async def _require_progress(self, user_id: uuid.UUID, *, for_update: bool = False) -> Cap8Progress:
        progress = await self._progress(user_id, for_update=for_update)
        if progress is None:
            raise NotFoundError("tiến trình Cấp 8")
        return progress

    @staticmethod
    def _progress_out(progress: Cap8Progress) -> dict:
        return {
            "id": progress.id,
            "user_id": progress.user_id,
            "entered_at": progress.entered_at,
            "so_lenh_thoat_dung_ke_hoach": progress.so_lenh_thoat_dung_ke_hoach,
            "muc_tieu_thoat_dung_ke_hoach": EXIT_TARGET,
            "graduated_at": progress.graduated_at,
            "time_to_graduate_hours": progress.time_to_graduate_hours,
        }

    async def _recompute_progress(self, progress: Cap8Progress) -> None:
        progress.so_lenh_thoat_dung_ke_hoach = int(
            (await self._session.execute(
                select(func.count(Cap8Exit.id)).where(
                    Cap8Exit.user_id == progress.user_id,
                    Cap8Exit.dung_ke_hoach.is_(True),
                    Cap8Exit.exited_at >= progress.entered_at,
                )
            )).scalar_one()
        )
        await self._session.flush()

    async def _bootstrap_open_positions(self, user_id: uuid.UUID) -> None:
        """Attach plans to every existing positive holding at Level 8 entry/read.

        This runs before exit reconciliation so a newly filled limit SELL cannot
        be permanently classified against an empty plan merely because the user
        never opened that symbol's Holdings row.
        """
        account = await self._repo.get_account_by_user_id_for_update(user_id)
        if account is None:
            return
        positions = await self._repo.list_positions_for_update(account.id)
        for position in positions:
            if position.quantity_total > 0:
                await self._bootstrap_plan(user_id, account.id, position)

    async def _reconcile_filled_exits(self, progress: Cap8Progress) -> None:
        """Persist missed post-entry SELL evidence, including later limit fills."""
        sell_ids = list((await self._session.execute(
            select(VirtualOrder.id)
            .where(
                VirtualOrder.user_id == progress.user_id,
                VirtualOrder.side == OrderSide.SELL,
                VirtualOrder.status == OrderStatus.FILLED,
                func.coalesce(
                    VirtualOrder.exit_snapshot_at,
                    VirtualOrder.updated_at,
                    VirtualOrder.created_at,
                ) >= progress.entered_at,
                ~select(Cap8Exit.id)
                .where(Cap8Exit.sell_order_id == VirtualOrder.id)
                .exists(),
            )
            .order_by(VirtualOrder.exit_snapshot_at, VirtualOrder.id)
        )).scalars())
        for sell_id in sell_ids:
            await self._record_exit(progress, sell_id)
    async def get_progress(self, user_id: uuid.UUID) -> dict | None:
        progress = await self._progress(user_id, for_update=True)
        if progress is None:
            return None
        await self._bootstrap_open_positions(user_id)
        await self._reconcile_filled_exits(progress)
        await self._recompute_progress(progress)
        return self._progress_out(progress)

    async def enter(self, user_id: uuid.UUID) -> dict:
        progress = await self._progress(user_id, for_update=True)
        if progress is None:
            cap7 = (await self._session.execute(
                select(Cap7Progress).where(Cap7Progress.user_id == user_id)
            )).scalar_one_or_none()
            if cap7 is None:
                raise NotFoundError("tiến trình Cấp 7")
            if cap7.graduated_at is None:
                raise ConflictError("Chưa tốt nghiệp Cấp 7")
            progress = Cap8Progress(user_id=user_id, entered_at=datetime.now(UTC))
            self._session.add(progress)
            await self._session.flush()
        await self._bootstrap_open_positions(user_id)
        await self._reconcile_filled_exits(progress)
        await self._recompute_progress(progress)
        return self._progress_out(progress)

    async def _position(
        self, user_id: uuid.UUID, symbol: str, *, for_update: bool = False
    ) -> tuple[VirtualTradingAccount, VirtualPosition]:
        account = await self._repo.get_account_by_user_id(user_id)
        if account is None:
            raise NotFoundError("tài khoản giao dịch ảo")
        position = await (
            self._repo.get_position_for_update(account.id, symbol.upper())
            if for_update
            else self._repo.get_position(account.id, symbol.upper())
        )
        if position is None:
            raise NotFoundError("vị thế")
        return account, position

    async def _latest_qualifying_plan(
        self,
        user_id: uuid.UUID,
        account_id: uuid.UUID,
        symbol: str,
        order_id: uuid.UUID | None = None,
    ) -> tuple[VirtualOrder, OrderKehoach] | None:
        """Find the latest complete BUY in the current holding cycle only."""
        last_full_close = (await self._session.execute(
            select(func.max(VirtualOrder.exit_snapshot_at)).where(
                VirtualOrder.account_id == account_id,
                VirtualOrder.symbol == symbol.upper(),
                VirtualOrder.side == OrderSide.SELL,
                VirtualOrder.status == OrderStatus.FILLED,
                VirtualOrder.position_quantity_after_fill == 0,
            )
        )).scalar_one()
        statement = (
            select(VirtualOrder, OrderKehoach)
            .join(OrderKehoach, OrderKehoach.order_id == VirtualOrder.id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.account_id == account_id,
                VirtualOrder.symbol == symbol.upper(),
                VirtualOrder.side == OrderSide.BUY,
                VirtualOrder.status == OrderStatus.FILLED,
                OrderKehoach.cat_lo.is_not(None),
                OrderKehoach.chot_loi.is_not(None),
            )
            .order_by(VirtualOrder.updated_at.desc(), VirtualOrder.id.desc())
        )
        if last_full_close is not None:
            statement = statement.where(VirtualOrder.updated_at > last_full_close)
        if order_id is not None:
            statement = statement.where(VirtualOrder.id == order_id)
        row = (await self._session.execute(statement)).tuples().first()
        return None if row is None else (row[0], row[1])
    async def _bootstrap_plan(
        self, user_id: uuid.UUID, account_id: uuid.UUID, position: VirtualPosition
    ) -> bool:
        """Reconcile a positive aggregate position to its current-cycle plan."""
        latest = await self._latest_qualifying_plan(user_id, account_id, position.symbol)
        if latest is None:
            position.active_plan_buy_order_id = None
            position.active_original_stop_vnd = None
            position.active_original_take_profit_vnd = None
            position.active_dynamic_stop_vnd = None
            position.active_dynamic_stop_set_at = None
            await self._session.flush()
            return False
        order, plan = latest
        if position.active_plan_buy_order_id == order.id:
            return True
        position.active_plan_buy_order_id = order.id
        position.active_original_stop_vnd = plan.cat_lo
        position.active_original_take_profit_vnd = plan.chot_loi
        position.active_dynamic_stop_vnd = None
        position.active_dynamic_stop_set_at = None
        await self._session.flush()
        return True
    async def sync_plan(self, user_id: uuid.UUID, symbol: str, buy_order_id: uuid.UUID) -> dict:
        await self._require_progress(user_id)
        account, position = await self._position(user_id, symbol, for_update=True)
        matching = await self._latest_qualifying_plan(user_id, account.id, position.symbol)
        if matching is None or matching[0].id != buy_order_id:
            raise BadRequestError(
                "Chỉ lệnh MUA khớp gần nhất có kế hoạch cắt lỗ/chốt lời hợp lệ mới điều khiển vị thế"
            )
        order, plan = matching
        position.active_plan_buy_order_id = order.id
        position.active_original_stop_vnd = plan.cat_lo
        position.active_original_take_profit_vnd = plan.chot_loi
        position.active_dynamic_stop_vnd = None
        position.active_dynamic_stop_set_at = None
        await self._session.flush()
        return {
            "symbol": position.symbol,
            "source_buy_order_id": order.id,
            "original_stop_vnd": plan.cat_lo,
            "original_take_profit_vnd": plan.chot_loi,
            "dynamic_stop_vnd": None,
            "dynamic_stop_set_at": None,
        }

    async def _history(self, symbol: str) -> list[tuple[date, float]] | None:
        try:
            today = date.today()
            data, _ = await get_adjusted_ohlcv(symbol.upper(), today - timedelta(days=_HISTORY_LOOKBACK_DAYS), today)
            rows = [
                (date.fromisoformat(str(day)[:10]), float(close))
                for day, close in zip(list(data.time), list(data.close), strict=True)
            ]
        except Exception:  # price history is evidence: unavailable means unknown, never safe
            return None
        return sorted(rows, key=lambda row: row[0]) or None

    @staticmethod
    def _timely_stop(
        history: list[tuple[date, float]],
        stop: int,
        sell_date: date,
        *,
        after: date | None = None,
    ) -> tuple[bool, str]:
        sessions = [
            (day, close) for day, close in history if after is None or day >= after
        ]
        crossing_index = next(
            (i for i, (_, close) in enumerate(sessions) if close <= stop),
            None,
        )
        if crossing_index is None:
            return False, "stop_crossing_not_verified"
        deadline = sessions[min(crossing_index + 1, len(sessions) - 1)][0]
        if sell_date > deadline:
            return False, "late_stop_exit"
        if sell_date < sessions[crossing_index][0]:
            return False, "stop_before_verified_crossing"
        return True, "timely_stop_exit"

    async def set_dynamic_stop(self, user_id: uuid.UUID, symbol: str, dynamic_stop_vnd: int) -> dict:
        await self._require_progress(user_id)
        _, position = await self._position(user_id, symbol, for_update=True)
        if position.quantity_total <= 0:
            raise BadRequestError("Không còn vị thế để nâng cắt lỗ động")
        await self._bootstrap_plan(user_id, position.account_id, position)
        portfolio = await self._trading.get_portfolio(user_id)
        live = next((p for p in portfolio["positions"] if p["symbol"] == position.symbol), None)
        current_price = live["current_price_vnd"] if live else None
        if current_price is None or current_price <= position.avg_cost_vnd:
            raise BadRequestError("Chỉ được nâng cắt lỗ động khi vị thế đang có lãi")
        previous = position.active_dynamic_stop_vnd or position.active_original_stop_vnd
        if dynamic_stop_vnd <= position.avg_cost_vnd:
            raise BadRequestError("Cắt lỗ động phải cao hơn giá vốn bình quân")
        if previous is None or dynamic_stop_vnd <= previous:
            raise BadRequestError("Cắt lỗ động phải cao hơn mức cắt lỗ hiện tại")
        if dynamic_stop_vnd > current_price:
            raise BadRequestError("Cắt lỗ động không được vượt giá thị trường hiện tại")
        now = datetime.now(UTC)
        position.active_dynamic_stop_vnd = dynamic_stop_vnd
        position.active_dynamic_stop_set_at = now
        await self._session.flush()
        return {"symbol": position.symbol, "dynamic_stop_vnd": dynamic_stop_vnd, "dynamic_stop_set_at": now}
    async def exit_context(
        self, user_id: uuid.UUID, symbol: str, proposed_sale_quantity: int | None = None
    ) -> dict:
        await self._require_progress(user_id)
        account, position = await self._position(user_id, symbol, for_update=True)
        await self._bootstrap_plan(user_id, account.id, position)
        portfolio = await self._trading.get_portfolio(user_id)
        live = next((p for p in portfolio["positions"] if p["symbol"] == position.symbol), None)
        current_price = live["current_price_vnd"] if live else None
        if position.quantity_total <= 0:
            raise BadRequestError("Không còn vị thế để thoát lệnh")
        proposed_quantity = (
            position.quantity_sellable
            if proposed_sale_quantity is None
            else proposed_sale_quantity
        )
        if proposed_quantity < 0 or proposed_quantity > position.quantity_sellable:
            raise BadRequestError("Khối lượng bán dự kiến phải nằm trong số cổ phiếu có thể bán")
        # A T+2 position has no sellable quantity yet, but the plan and
        # profitable dynamic-stop controls remain actionable. Its allocation
        # impact is the unchanged current snapshot rather than a fictitious sale.
        balance = (
            await self._portfolio_balance.get_snapshot(user_id)
            if proposed_quantity == 0
            else await self._portfolio_balance.get_snapshot_after_sale(
                user_id, position.symbol, proposed_quantity
            )
        )
        config = await self._repo.get_active_config()
        return {
            "symbol": position.symbol,
            "quantity_total": position.quantity_total,
            "quantity_sellable": position.quantity_sellable,
            "avg_cost_vnd": position.avg_cost_vnd,
            "current_price_vnd": current_price,
            "source_buy_order_id": position.active_plan_buy_order_id,
            "original_stop_vnd": position.active_original_stop_vnd,
            "original_take_profit_vnd": position.active_original_take_profit_vnd,
            "dynamic_stop_vnd": position.active_dynamic_stop_vnd,
            "dynamic_stop_set_at": position.active_dynamic_stop_set_at,
            "can_update_dynamic_stop": bool(
                current_price is not None and current_price > position.avg_cost_vnd and position.quantity_total > 0
            ),
            "board_lot_size": config.board_lot_size if config else 100,
            "proposed_sale_quantity": proposed_quantity,
            "sector_impact": balance.model_dump(mode="json"),
        }

    @staticmethod
    def _exit_out(exit_row: Cap8Exit) -> dict:
        return {
            "id": exit_row.id, "symbol": exit_row.symbol,
            "matched_buy_order_id": exit_row.matched_buy_order_id,
            "sell_order_id": exit_row.sell_order_id, "exited_at": exit_row.exited_at,
            "quantity": exit_row.quantity, "filled_price_vnd": exit_row.filled_price_vnd,
            "remaining_position_pct": exit_row.remaining_position_pct,
            "exit_method": exit_row.exit_method, "original_stop_vnd": exit_row.original_stop_vnd,
            "original_take_profit_vnd": exit_row.original_take_profit_vnd,
            "effective_stop_vnd": exit_row.effective_stop_vnd,
            "dung_ke_hoach": exit_row.dung_ke_hoach, "ban_cam_xuc": exit_row.ban_cam_xuc,
            "classification_reason": exit_row.classification_reason,
        }

    async def record_exit(self, user_id: uuid.UUID, sell_order_id: uuid.UUID) -> dict:
        """Idempotently classify a user-owned FILLED SELL in one transaction."""
        progress = await self._require_progress(user_id, for_update=True)
        return await self._record_exit(progress, sell_order_id)

    async def _record_exit(self, progress: Cap8Progress, sell_order_id: uuid.UUID) -> dict:
        """Record one exit while the caller owns the user's progress lock."""
        user_id = progress.user_id
        existing = (await self._session.execute(
            select(Cap8Exit).where(Cap8Exit.sell_order_id == sell_order_id)
        )).scalar_one_or_none()
        if existing is not None:
            if existing.user_id != user_id:
                raise NotFoundError("lệnh bán")
            return self._exit_out(existing)

        sell = (await self._session.execute(
            select(VirtualOrder).where(
                VirtualOrder.id == sell_order_id,
                VirtualOrder.user_id == user_id,
                VirtualOrder.side == OrderSide.SELL,
                VirtualOrder.status == OrderStatus.FILLED,
            )
        )).scalar_one_or_none()
        if sell is None or sell.filled_price_vnd is None:
            raise BadRequestError("Chỉ ghi nhận lệnh BÁN đã khớp của chính bạn")

        snapshot_ready = (
            sell.exit_snapshot_at is not None
            and sell.position_quantity_before_fill is not None
            and sell.position_quantity_after_fill is not None
        )
        remaining = 0
        before_quantity = 0
        remaining_pct = 0.0
        matched_buy_id = None
        original_stop = None
        take_profit = None
        dynamic_stop = None
        dynamic_at = None
        plan_activated_at = None
        avg_cost = None
        effective_stop = None
        exit_method = "unknown"
        compliant = False
        emotional = False
        reason = "missing_execution_snapshot"
        if snapshot_ready:
            assert sell.position_quantity_before_fill is not None
            assert sell.position_quantity_after_fill is not None
            assert sell.exit_snapshot_at is not None
            before_quantity = sell.position_quantity_before_fill
            remaining = sell.position_quantity_after_fill
            if before_quantity <= 0 or remaining < 0 or remaining > before_quantity:
                reason = "invalid_execution_snapshot"
            else:
                remaining_pct = remaining / before_quantity * 100
                matched_buy_id = sell.exit_matched_buy_order_id
                original_stop = sell.exit_original_stop_vnd
                take_profit = sell.exit_original_take_profit_vnd
                dynamic_stop = sell.exit_dynamic_stop_vnd
                dynamic_at = sell.exit_dynamic_stop_set_at
                plan_activated_at = sell.exit_plan_activated_at
                avg_cost = sell.exit_avg_cost_vnd
                effective_stop = (
                    dynamic_stop if dynamic_stop is not None else original_stop
                )
                full = remaining == 0
                exit_method = "full" if full else "partial"
                reason = "missing_active_plan"

                if (
                    matched_buy_id is not None
                    and take_profit is not None
                    and original_stop is not None
                    and avg_cost is not None
                ):
                    if sell.filled_price_vnd >= take_profit:
                        compliant = True
                        reason = "take_profit_hit"
                    elif dynamic_stop is not None and sell.filled_price_vnd <= dynamic_stop:
                        if dynamic_at is None:
                            reason = "missing_dynamic_stop_timestamp"
                        elif dynamic_stop <= avg_cost:
                            reason = "dynamic_stop_does_not_lock_profit"
                        else:
                            history = await self._history(sell.symbol)
                            if history is None:
                                reason = "unknown_price_history"
                            else:
                                timely, reason = self._timely_stop(
                                    history,
                                    dynamic_stop,
                                    sell.exit_snapshot_at.date(),
                                    after=dynamic_at.date(),
                                )
                                if timely:
                                    compliant = True
                                    exit_method = "trailing_hit"
                                    reason = "timely_trailing_stop_exit"
                    elif sell.filled_price_vnd <= original_stop:
                        if plan_activated_at is None:
                            reason = "missing_plan_activation_timestamp"
                        else:
                            history = await self._history(sell.symbol)
                            if history is None:
                                reason = "unknown_price_history"
                            else:
                                timely, reason = self._timely_stop(
                                    history,
                                    original_stop,
                                    sell.exit_snapshot_at.date(),
                                    after=plan_activated_at.date(),
                                )
                                if timely:
                                    compliant = True
                                    reason = "timely_original_stop_exit"
                    elif full and sell.filled_price_vnd > avg_cost:
                        emotional = True
                        reason = "emotional_full_exit_below_target"
                    else:
                        reason = "price_did_not_hit_plan_threshold"

        exit_row = Cap8Exit(
            user_id=user_id, account_id=sell.account_id, symbol=sell.symbol,
            matched_buy_order_id=matched_buy_id, sell_order_id=sell.id,
            exited_at=sell.exit_snapshot_at or sell.updated_at or sell.created_at, quantity=sell.quantity,
            filled_price_vnd=sell.filled_price_vnd, remaining_position_pct=remaining_pct,
            exit_method=exit_method, original_stop_vnd=original_stop,
            original_take_profit_vnd=take_profit, effective_stop_vnd=effective_stop,
            dung_ke_hoach=compliant, ban_cam_xuc=emotional, classification_reason=reason,
        )
        self._session.add(exit_row)
        await self._session.flush()
        await self._recompute_progress(progress)
        return self._exit_out(exit_row)

    async def graduate(self, user_id: uuid.UUID) -> dict:
        progress = await self._require_progress(user_id, for_update=True)
        await self._bootstrap_open_positions(user_id)
        await self._reconcile_filled_exits(progress)
        await self._recompute_progress(progress)
        if progress.graduated_at is None:
            if progress.so_lenh_thoat_dung_ke_hoach < EXIT_TARGET:
                raise ConflictError("Cần 5 lệnh thoát tuân thủ kế hoạch sau khi vào Cấp 8")
            now = datetime.now(UTC)
            progress.graduated_at = now
            entered_at = progress.entered_at if progress.entered_at.tzinfo else progress.entered_at.replace(tzinfo=UTC)
            progress.time_to_graduate_hours = (now - entered_at).total_seconds() / 3600.0
            await self._session.flush()
        return self._progress_out(progress)
