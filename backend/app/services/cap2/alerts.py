"""Durable Cấp 2 alert state machine (spec §§8–10).

The service separates *trigger observation*, *presentation*, and *action*:

* triggers are idempotent durable events;
* presentations are durable per-session impressions, capped at two;
* actions are immutable and update the consecutive-ignore escalation state.

Official-close alerts are fail-closed.  The scanner accepts only an injected
provider that identifies an observation as official for the exact requested
session.  Missing, stale, or unofficial data is reported as unavailable and
never substituted with an intraday/live quote.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Protocol

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import OrderKetso
from app.models.cap2 import Cap2Progress
from app.models.cap2_alert import (
    Cap2AlertEvent,
    Cap2AlertImpression,
    Cap2AlertSessionState,
    Cap2AlertTypeState,
)
from app.models.virtual_trading import OrderSide, OrderStatus, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.virtual_trading.price_resolver import PriceUnavailableError, resolve_price

_VN_TZ = timezone(timedelta(hours=7))

MAX_IMPORTANT_ALERTS_PER_SESSION = 2
AUTO_MUTE_LAST_CLOSES = 10
NHOI_LOSS_THRESHOLD_PCT = -3.0
CONFIRMATION_PHRASE = "Tôi hiểu"

_PRIORITY = {"nhoi_lenh": 100, "cham_cat_lo": 10}
_IGNORE_ACTION = {"nhoi_lenh": "proceed_buy", "cham_cat_lo": "hold"}
_RESPECT_ACTION = {"nhoi_lenh": "cancel_buy", "cham_cat_lo": "sell_ato"}


@dataclass(frozen=True, slots=True)
class OfficialCloseObservation:
    symbol: str
    session_date: date
    price_vnd: int
    closed_at: datetime
    source: str
    is_official: bool = True


class OfficialCloseProvider(Protocol):
    async def get_official_close(
        self, symbol: str, session_date: date
    ) -> OfficialCloseObservation | None: ...


class CurrentQuoteProvider(Protocol):
    async def get_current_price(self, symbol: str) -> int | None: ...


class MarketCurrentQuoteProvider:
    """Current quote source for the immediate pre-buy intervention."""

    async def get_current_price(self, symbol: str) -> int | None:
        try:
            result = await resolve_price(symbol)
        except PriceUnavailableError:
            return None
        return result.price_vnd if result.price_vnd > 0 else None


class UnavailableOfficialCloseProvider:
    """Safe default: an unwired official-close source produces no alert."""

    async def get_official_close(
        self, symbol: str, session_date: date
    ) -> OfficialCloseObservation | None:
        return None


def _now_utc() -> datetime:
    return datetime.now(UTC)


def current_session_date() -> date:
    return datetime.now(_VN_TZ).date()


def _escalation_for_next_ignore(ignored_streak: int) -> str:
    attempt = ignored_streak + 1
    if attempt >= 5:
        return "type_phrase"
    if attempt >= 3:
        return "delay_5s"
    return "normal"


class Cap2AlertService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        quote_provider: CurrentQuoteProvider | None = None,
    ) -> None:
        self._session = session
        self._vt = VirtualTradingRepository(session)
        self._quotes = quote_provider or MarketCurrentQuoteProvider()

    async def _require_progress(self, user_id: uuid.UUID) -> Cap2Progress:
        row = (
            await self._session.execute(
                select(Cap2Progress).where(Cap2Progress.user_id == user_id)
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError("tiến trình Cấp 2")
        return row

    async def _event_by_trigger(
        self, user_id: uuid.UUID, alert_type: str, trigger_key: str
    ) -> Cap2AlertEvent | None:
        return (
            await self._session.execute(
                select(Cap2AlertEvent).where(
                    Cap2AlertEvent.user_id == user_id,
                    Cap2AlertEvent.alert_type == alert_type,
                    Cap2AlertEvent.trigger_key == trigger_key,
                )
            )
        ).scalar_one_or_none()

    async def _create_event_idempotently(
        self,
        *,
        user_id: uuid.UUID,
        alert_type: str,
        symbol: str,
        session_date: date,
        trigger_key: str,
        observed_price_vnd: int,
        threshold_price_vnd: int | None = None,
        loss_pct: float | None = None,
        source_order_id: uuid.UUID | None = None,
        source_plan_order_id: uuid.UUID | None = None,
        official_close: OfficialCloseObservation | None = None,
        breach_session_no: int = 1,
        position_quantity: int | None = None,
        position_avg_cost_vnd: int | None = None,
        plan_started_at: datetime | None = None,
        intended_quantity: int | None = None,
        intended_order_type: str | None = None,
        intended_limit_price_vnd: int | None = None,
    ) -> Cap2AlertEvent:
        existing = await self._event_by_trigger(user_id, alert_type, trigger_key)
        if existing is not None:
            if existing.symbol != symbol:
                raise ConflictError("Khóa idempotency đã được dùng cho mã khác")
            return existing

        event = Cap2AlertEvent(
            user_id=user_id,
            alert_type=alert_type,
            symbol=symbol,
            session_date=session_date,
            trigger_key=trigger_key,
            source_order_id=source_order_id,
            source_plan_order_id=source_plan_order_id,
            observed_price_vnd=observed_price_vnd,
            threshold_price_vnd=threshold_price_vnd,
            loss_pct=loss_pct,
            position_quantity=position_quantity,
            position_avg_cost_vnd=position_avg_cost_vnd,
            plan_started_at=plan_started_at,
            intended_quantity=intended_quantity,
            intended_order_type=intended_order_type,
            intended_limit_price_vnd=intended_limit_price_vnd,
            official_close_session_date=(official_close.session_date if official_close else None),
            official_close_at=(official_close.closed_at if official_close else None),
            official_close_source=(official_close.source if official_close else None),
            breach_session_no=breach_session_no,
            status="pending",
        )
        try:
            async with self._session.begin_nested():
                self._session.add(event)
                await self._session.flush()
        except IntegrityError:
            existing = await self._event_by_trigger(user_id, alert_type, trigger_key)
            if existing is None:
                raise
            return existing
        await self._session.refresh(event)
        return event

    async def _type_state(
        self, user_id: uuid.UUID, alert_type: str, *, lock: bool = False
    ) -> Cap2AlertTypeState:
        stmt = select(Cap2AlertTypeState).where(
            Cap2AlertTypeState.user_id == user_id,
            Cap2AlertTypeState.alert_type == alert_type,
        )
        if lock:
            stmt = stmt.with_for_update()
        state = (await self._session.execute(stmt)).scalar_one_or_none()
        if state is None:
            candidate = Cap2AlertTypeState(
                user_id=user_id, alert_type=alert_type, ignored_streak=0
            )
            try:
                async with self._session.begin_nested():
                    self._session.add(candidate)
                    await self._session.flush()
            except IntegrityError:
                pass
            state = (
                await self._session.execute(stmt.with_for_update())
            ).scalar_one_or_none()
            if state is None:
                state = candidate
        return state

    async def _session_state(
        self, user_id: uuid.UUID, session_date: date
    ) -> Cap2AlertSessionState:
        stmt = (
            select(Cap2AlertSessionState)
            .where(
                Cap2AlertSessionState.user_id == user_id,
                Cap2AlertSessionState.session_date == session_date,
            )
            .with_for_update()
        )
        state = (await self._session.execute(stmt)).scalar_one_or_none()
        if state is None:
            impressions = int(
                (
                    await self._session.execute(
                        select(func.count(Cap2AlertImpression.id)).where(
                            Cap2AlertImpression.user_id == user_id,
                            Cap2AlertImpression.session_date == session_date,
                        )
                    )
                ).scalar_one()
                or 0
            )
            candidate = Cap2AlertSessionState(
                user_id=user_id,
                session_date=session_date,
                important_shown_count=min(impressions, MAX_IMPORTANT_ALERTS_PER_SESSION),
            )
            try:
                async with self._session.begin_nested():
                    self._session.add(candidate)
                    await self._session.flush()
            except IntegrityError:
                pass
            state = (await self._session.execute(stmt)).scalar_one_or_none()
            if state is None:
                state = candidate
        return state

    async def _impression_exists(self, event_id: uuid.UUID, session_date: date) -> bool:
        return (
            await self._session.execute(
                select(Cap2AlertImpression.id).where(
                    Cap2AlertImpression.event_id == event_id,
                    Cap2AlertImpression.session_date == session_date,
                )
            )
        ).scalar_one_or_none() is not None

    async def _is_auto_muted(
        self, user_id: uuid.UUID, alert_type: str, progress: Cap2Progress
    ) -> bool:
        rows = list(
            (
                await self._session.execute(
                    select(OrderKetso)
                    .join(VirtualOrder, VirtualOrder.id == OrderKetso.order_id)
                    .where(
                        VirtualOrder.user_id == user_id,
                        VirtualOrder.status == OrderStatus.FILLED,
                        OrderKetso.closed_at >= progress.entered_at,
                    )
                    .order_by(OrderKetso.closed_at.desc())
                    .limit(AUTO_MUTE_LAST_CLOSES)
                )
            ).scalars().all()
        )
        if len(rows) < AUTO_MUTE_LAST_CLOSES:
            return False

        if alert_type == "nhoi_lenh":
            clean = all(not row.nhoi_lenh_khi_lo for row in rows)
            ignore_action = "proceed_buy"
        else:
            clean = all(not row.cham_SL_khong_cat for row in rows)
            ignore_action = "hold"
        if not clean:
            return False

        # A violation recorded after the newest close immediately re-enables
        # the warning even before that action reaches a later Kết sổ row.
        newest_close = rows[0].closed_at
        if newest_close.tzinfo is None:
            newest_close = newest_close.replace(tzinfo=UTC)
        renewed_conditions = [
            Cap2AlertEvent.user_id == user_id,
            Cap2AlertEvent.alert_type == alert_type,
            Cap2AlertEvent.action == ignore_action,
            Cap2AlertEvent.acted_at > newest_close,
        ]
        if alert_type == "nhoi_lenh":
            renewed_conditions.append(Cap2AlertEvent.violation_confirmed_at.is_not(None))
        renewed = (
            await self._session.execute(
                select(Cap2AlertEvent.id).where(*renewed_conditions).limit(1)
            )
        ).scalar_one_or_none()
        return renewed is None

    async def _present_for_session(
        self, user_id: uuid.UUID, session_date: date
    ) -> list[Cap2AlertEvent]:
        """Claim eligible alerts in priority order and persist impressions."""
        progress = await self._require_progress(user_id)
        quota = await self._session_state(user_id, session_date)

        # Nhoi events are one-session interventions.  An unacted stop event is
        # persistent and may receive one new impression in each later session.
        candidates = list(
            (
                await self._session.execute(
                    select(Cap2AlertEvent)
                    .where(
                        Cap2AlertEvent.user_id == user_id,
                        Cap2AlertEvent.acted_at.is_(None),
                        or_(
                            (
                                (Cap2AlertEvent.alert_type == "nhoi_lenh")
                                & (Cap2AlertEvent.session_date == session_date)
                                & (Cap2AlertEvent.status == "pending")
                            ),
                            (
                                (Cap2AlertEvent.alert_type == "cham_cat_lo")
                                & (Cap2AlertEvent.session_date <= session_date)
                            ),
                        ),
                    )
                    .order_by(Cap2AlertEvent.created_at.asc())
                    .with_for_update()
                )
            ).scalars().all()
        )
        candidates.sort(key=lambda row: (-_PRIORITY[row.alert_type], row.created_at, str(row.id)))

        for event in candidates:
            if event.alert_type == "cham_cat_lo":
                account = await self._vt.get_account_by_user_id(user_id)
                position = (
                    await self._vt.get_position(account.id, event.symbol)
                    if account is not None
                    else None
                )
                if (
                    position is None
                    or position.quantity_total <= 0
                    or position.active_plan_buy_order_id != event.source_plan_order_id
                ):
                    event.status = "acted"
                    event.action = "position_closed"
                    event.acted_at = _now_utc()
                    event.suppression_reason = "position_closed"
                    continue
            # Resolve a stale persistent stop event before returning an
            # already-recorded impression.  The position may have been sold
            # manually after the first GET in this same display session.
            if await self._impression_exists(event.id, session_date):
                continue
            if await self._is_auto_muted(user_id, event.alert_type, progress):
                event.status = "suppressed"
                event.suppression_reason = "auto_mute_last_10_clean"
                continue
            if quota.important_shown_count >= MAX_IMPORTANT_ALERTS_PER_SESSION:
                event.status = "suppressed"
                event.suppression_reason = "session_limit"
                continue

            state = await self._type_state(user_id, event.alert_type, lock=True)
            escalation = _escalation_for_next_ignore(state.ignored_streak)
            now = _now_utc()
            impression = Cap2AlertImpression(
                event_id=event.id,
                user_id=user_id,
                session_date=session_date,
                escalation=escalation,
                shown_at=now,
            )
            self._session.add(impression)
            event.status = "shown"
            event.suppression_reason = None
            event.escalation = escalation
            event.impression_count += 1
            event.first_shown_at = event.first_shown_at or now
            event.last_shown_at = now
            quota.important_shown_count += 1
            await self._session.flush()
            from app.services.journey_events import record_journey_event

            shown_name = (
                "cap2_nhoi_lenh_alert_shown"
                if event.alert_type == "nhoi_lenh"
                else "cap2_cham_SL_alert_shown"
            )
            shown_fields = (
                {"ma": event.symbol, "pnl": event.loss_pct}
                if event.alert_type == "nhoi_lenh"
                else {
                    "order_id": (
                        str(event.source_plan_order_id)
                        if event.source_plan_order_id is not None
                        else None
                    ),
                    "phien": event.breach_session_no,
                }
            )
            await record_journey_event(
                self._session,
                user_id,
                shown_name,
                shown_fields,
                dedup_key=f"{event.id}:{session_date.isoformat()}",
            )
            await record_journey_event(
                self._session,
                user_id,
                "cap2_alert_escalation",
                {"loai": event.alert_type, "level": escalation},
                dedup_key=f"{event.id}:{session_date.isoformat()}:{escalation}",
            )

        await self._session.flush()
        active_ids = list(
            (
                await self._session.execute(
                    select(Cap2AlertImpression.event_id).where(
                        Cap2AlertImpression.user_id == user_id,
                        Cap2AlertImpression.session_date == session_date,
                    )
                )
            ).scalars().all()
        )
        if not active_ids:
            return []
        active = list(
            (
                await self._session.execute(
                    select(Cap2AlertEvent)
                    .where(
                        Cap2AlertEvent.id.in_(active_ids),
                        Cap2AlertEvent.acted_at.is_(None),
                    )
                )
            ).scalars().all()
        )
        active.sort(key=lambda row: (-_PRIORITY[row.alert_type], row.created_at, str(row.id)))
        return active

    async def evaluate_pre_buy(
        self,
        user_id: uuid.UUID,
        *,
        symbol: str,
        idempotency_key: str,
        quantity: int,
        order_type: str,
        limit_price_vnd: int | None,
        session_date: date | None = None,
    ) -> dict:
        """Detect averaging down and freeze the exact proposed BUY draft."""
        await self._require_progress(user_id)
        symbol = symbol.upper()
        day = session_date or current_session_date()
        existing = await self._event_by_trigger(
            user_id, "nhoi_lenh", f"prebuy:{idempotency_key}"
        )
        if existing is not None:
            if existing.symbol != symbol:
                raise ConflictError("Khóa idempotency đã được dùng cho mã khác")
            if (
                existing.intended_quantity != quantity
                or existing.intended_order_type != order_type
                or existing.intended_limit_price_vnd != limit_price_vnd
                or existing.session_date != day
            ):
                raise ConflictError("Khóa idempotency đã được dùng cho nội dung lệnh khác")
            await self._present_for_session(user_id, day)
            return {
                "data_status": "available",
                "triggered": True,
                "reason": "Kết quả kiểm tra đã được ghi nhận trước đó.",
                "alert": existing,
            }

        account = await self._vt.get_account_by_user_id(user_id)
        if account is None:
            raise NotFoundError("tài khoản giao dịch ảo")
        position = await self._vt.get_position(account.id, symbol)
        if position is None or position.quantity_total <= 0 or position.avg_cost_vnd <= 0:
            return {
                "data_status": "available",
                "triggered": False,
                "reason": "Không có vị thế đang mở cùng mã.",
                "alert": None,
            }

        current_price = await self._quotes.get_current_price(symbol)
        if current_price is None:
            return {
                "data_status": "unavailable",
                "triggered": False,
                "reason": "Không lấy được giá hiện tại; không tạo cảnh báo nhồi lệnh.",
                "alert": None,
            }
        loss_pct = (current_price - position.avg_cost_vnd) / position.avg_cost_vnd * 100.0
        if loss_pct >= NHOI_LOSS_THRESHOLD_PCT:
            return {
                "data_status": "available",
                "triggered": False,
                "reason": "Vị thế chưa lỗ quá 3%.",
                "alert": None,
            }

        active_plan = (
            await self._vt.get_order_by_id(position.active_plan_buy_order_id)
            if position.active_plan_buy_order_id is not None
            else None
        )
        event = await self._create_event_idempotently(
            user_id=user_id,
            alert_type="nhoi_lenh",
            symbol=symbol,
            session_date=day,
            trigger_key=f"prebuy:{idempotency_key}",
            observed_price_vnd=current_price,
            threshold_price_vnd=position.avg_cost_vnd,
            loss_pct=loss_pct,
            source_plan_order_id=position.active_plan_buy_order_id,
            position_quantity=position.quantity_total,
            position_avg_cost_vnd=position.avg_cost_vnd,
            plan_started_at=active_plan.created_at if active_plan is not None else None,
            intended_quantity=quantity,
            intended_order_type=order_type,
            intended_limit_price_vnd=limit_price_vnd,
        )
        await self._present_for_session(user_id, day)
        return {
            "data_status": "available",
            "triggered": True,
            "reason": "Vị thế cùng mã đang lỗ quá 3%.",
            "alert": event,
        }

    async def active_alerts(
        self, user_id: uuid.UUID, *, session_date: date | None = None
    ) -> list[Cap2AlertEvent]:
        return await self._present_for_session(user_id, session_date or current_session_date())

    async def validate_nhoi_order_link(
        self,
        user_id: uuid.UUID,
        alert_id: uuid.UUID,
        *,
        symbol: str,
        quantity: int,
        order_type: str,
        limit_price_vnd: int | None,
        session_date: date,
        allow_order_id: uuid.UUID | None = None,
    ) -> Cap2AlertEvent:
        """Lock and validate one acted averaging-down alert before cash moves."""
        event = (
            await self._session.execute(
                select(Cap2AlertEvent)
                .where(
                    Cap2AlertEvent.id == alert_id,
                    Cap2AlertEvent.user_id == user_id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if event is None:
            raise NotFoundError("cảnh báo Cấp 2")
        if event.alert_type != "nhoi_lenh" or event.action != "proceed_buy":
            raise ConflictError("Cảnh báo chưa ghi nhận lựa chọn vẫn mua")
        if event.source_order_id is not None and event.source_order_id != allow_order_id:
            raise ConflictError("Cảnh báo nhồi lệnh đã được gắn với một lệnh mua")
        if event.symbol != symbol.upper() or event.session_date != session_date:
            raise ConflictError("Cảnh báo không thuộc mã hoặc phiên của lệnh mua")
        if (
            event.intended_quantity != quantity
            or event.intended_order_type != order_type
            or event.intended_limit_price_vnd != limit_price_vnd
        ):
            raise ConflictError("Nội dung lệnh mua đã thay đổi sau cảnh báo")
        return event

    async def link_nhoi_order(
        self,
        user_id: uuid.UUID,
        alert_id: uuid.UUID,
        order: VirtualOrder,
        *,
        session_date: date,
    ) -> bool:
        """Bind an acted alert once, only to an accepted matching BUY."""
        if order.user_id != user_id:
            raise NotFoundError("lệnh")
        if order.status not in (OrderStatus.PENDING, OrderStatus.FILLED):
            return False
        if order.side != "buy" and order.side != OrderSide.BUY:
            raise BadRequestError("Cảnh báo nhồi lệnh chỉ gắn với lệnh MUA")
        order_type = (
            order.order_type.value
            if hasattr(order.order_type, "value")
            else str(order.order_type)
        )
        event = await self.validate_nhoi_order_link(
            user_id,
            alert_id,
            symbol=order.symbol,
            quantity=order.quantity,
            order_type=order_type,
            limit_price_vnd=order.limit_price_vnd,
            session_date=session_date,
            allow_order_id=order.id,
        )
        event.source_order_id = order.id
        await self._session.flush()
        if order.status == OrderStatus.FILLED:
            await self.confirm_nhoi_order_filled(user_id, order)
        return True

    async def confirm_nhoi_order_filled(
        self, user_id: uuid.UUID, order: VirtualOrder
    ) -> bool:
        """Confirm a linked violation once the BUY actually fills."""
        if (
            order.user_id != user_id
            or order.side != OrderSide.BUY
            or order.status != OrderStatus.FILLED
        ):
            return False
        event = (
            await self._session.execute(
                select(Cap2AlertEvent)
                .where(
                    Cap2AlertEvent.user_id == user_id,
                    Cap2AlertEvent.alert_type == "nhoi_lenh",
                    Cap2AlertEvent.source_order_id == order.id,
                    Cap2AlertEvent.action == "proceed_buy",
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if event is None:
            return False
        if event.violation_confirmed_at is not None:
            return True
        now = _now_utc()
        state = await self._type_state(user_id, "nhoi_lenh", lock=True)
        state.ignored_streak += 1
        state.last_ignored_at = now
        event.violation_confirmed_at = now
        await self._session.flush()
        return True

    async def act(
        self,
        user_id: uuid.UUID,
        alert_id: uuid.UUID,
        *,
        action: str,
        confirmation_phrase: str | None = None,
    ) -> tuple[Cap2AlertEvent, str]:
        """Persist one immutable response and update escalation state.

        A ``hold`` response is the durable violation evidence available before
        a SELL closes the position.  The later closeout path can project that
        evidence into ``OrderKetso.cham_SL_khong_cat`` once a SELL row exists.
        """
        event = (
            await self._session.execute(
                select(Cap2AlertEvent)
                .where(Cap2AlertEvent.id == alert_id, Cap2AlertEvent.user_id == user_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if event is None:
            raise NotFoundError("cảnh báo Cấp 2")

        allowed = {_IGNORE_ACTION[event.alert_type], _RESPECT_ACTION[event.alert_type]}
        if action not in allowed:
            raise BadRequestError("Hành động không hợp lệ với loại cảnh báo")
        if event.acted_at is not None:
            if event.action != action:
                raise ConflictError("Cảnh báo đã được xử lý bằng hành động khác")
            return event, "confirm_ato_sell" if action == "sell_ato" else "none"
        if event.status == "pending":
            raise ConflictError("Cảnh báo chưa được hiển thị")

        ignored = action == _IGNORE_ACTION[event.alert_type]
        if ignored and event.escalation == "type_phrase" and confirmation_phrase != CONFIRMATION_PHRASE:
            raise BadRequestError(f'Vui lòng nhập đúng "{CONFIRMATION_PHRASE}" để tiếp tục')

        now = _now_utc()
        # For nhoi_lenh/proceed_buy this is still intent. Rejected or cancelled
        # BUYs must not become violations; the authoritative FILLED transition
        # updates the streak in confirm_nhoi_order_filled().
        if not (ignored and event.alert_type == "nhoi_lenh"):
            state = await self._type_state(user_id, event.alert_type, lock=True)
            if ignored:
                state.ignored_streak += 1
                state.last_ignored_at = now
            else:
                state.ignored_streak = 0
                state.last_respected_at = now
        event.action = action
        event.acted_at = now
        event.status = "acted"
        await self._session.flush()
        from app.services.journey_events import record_journey_event

        action_name = (
            "cap2_nhoi_lenh_alert_action"
            if event.alert_type == "nhoi_lenh"
            else "cap2_cham_SL_alert_action"
        )
        action_fields = (
            {"ma": event.symbol, "action": action}
            if event.alert_type == "nhoi_lenh"
            else {
                "order_id": (
                    str(event.source_plan_order_id)
                    if event.source_plan_order_id is not None
                    else None
                ),
                "action": action,
            }
        )
        await record_journey_event(
            self._session,
            user_id,
            action_name,
            action_fields,
            dedup_key=str(event.id),
        )
        await self._session.refresh(event)
        return event, "confirm_ato_sell" if action == "sell_ato" else "none"

    async def scan_stop_closes(
        self,
        user_id: uuid.UUID,
        *,
        official_session_date: date,
        display_session_date: date,
        provider: OfficialCloseProvider,
    ) -> dict:
        """Create pending next-session banners from exact official closes only."""
        await self._require_progress(user_id)
        account = await self._vt.get_account_by_user_id(user_id)
        if account is None:
            raise NotFoundError("tài khoản giao dịch ảo")
        positions = await self._vt.list_positions(account.id)
        unavailable: list[str] = []
        pending = 0

        for position in positions:
            if position.quantity_total <= 0:
                continue
            plan_order_id = position.active_plan_buy_order_id
            stop = position.active_original_stop_vnd
            if plan_order_id is None or stop is None or stop <= 0:
                continue

            try:
                observation = await provider.get_official_close(
                    position.symbol, official_session_date
                )
            except Exception:
                # Provider failures must stay fail-closed.  The scheduled job
                # reports the symbol as unavailable and may retry next run;
                # an intraday quote is never substituted here.
                unavailable.append(position.symbol)
                continue
            close_time_is_exact = (
                observation is not None
                and observation.closed_at.tzinfo is not None
                and observation.closed_at.astimezone(_VN_TZ).date() == official_session_date
            )
            if (
                observation is None
                or not observation.is_official
                or observation.symbol.upper() != position.symbol.upper()
                or observation.session_date != official_session_date
                or not close_time_is_exact
                or observation.price_vnd <= 0
                or not observation.source.strip()
            ):
                unavailable.append(position.symbol)
                continue
            if observation.price_vnd > stop:
                continue

            open_event = (
                await self._session.execute(
                    select(Cap2AlertEvent)
                    .where(
                        Cap2AlertEvent.user_id == user_id,
                        Cap2AlertEvent.alert_type == "cham_cat_lo",
                        Cap2AlertEvent.symbol == position.symbol,
                        Cap2AlertEvent.source_plan_order_id == plan_order_id,
                        Cap2AlertEvent.acted_at.is_(None),
                    )
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if open_event is not None:
                prior_day = open_event.official_close_session_date
                if prior_day is None or official_session_date > prior_day:
                    open_event.official_close_session_date = official_session_date
                    open_event.official_close_at = observation.closed_at
                    open_event.official_close_source = observation.source
                    open_event.observed_price_vnd = observation.price_vnd
                    open_event.threshold_price_vnd = stop
                    open_event.position_quantity = position.quantity_total
                    open_event.position_avg_cost_vnd = position.avg_cost_vnd
                    open_event.breach_session_no += 1
                pending += 1
                continue

            previous_breach_no = int(
                (
                    await self._session.execute(
                        select(func.max(Cap2AlertEvent.breach_session_no)).where(
                            Cap2AlertEvent.user_id == user_id,
                            Cap2AlertEvent.alert_type == "cham_cat_lo",
                            Cap2AlertEvent.symbol == position.symbol,
                            Cap2AlertEvent.source_plan_order_id == plan_order_id,
                        )
                    )
                ).scalar_one()
                or 0
            )
            plan_order = await self._vt.get_order_by_id(plan_order_id)

            await self._create_event_idempotently(
                user_id=user_id,
                alert_type="cham_cat_lo",
                symbol=position.symbol,
                session_date=display_session_date,
                trigger_key=f"stop:{plan_order_id}:{official_session_date.isoformat()}",
                observed_price_vnd=observation.price_vnd,
                threshold_price_vnd=stop,
                source_plan_order_id=plan_order_id,
                official_close=observation,
                breach_session_no=previous_breach_no + 1,
                position_quantity=position.quantity_total,
                position_avg_cost_vnd=position.avg_cost_vnd,
                plan_started_at=plan_order.created_at if plan_order is not None else None,
            )
            pending += 1

        await self._session.flush()
        return {
            "official_session_date": official_session_date,
            "display_session_date": display_session_date,
            "positions_checked": sum(1 for p in positions if p.quantity_total > 0),
            "alerts_pending": pending,
            "unavailable_symbols": sorted(set(unavailable)),
        }
