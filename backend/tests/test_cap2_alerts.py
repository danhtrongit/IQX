"""Durable Cấp 2 alert state-machine coverage (spec §§8–10)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import func, select

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import Cap1Progress, OrderKehoach, OrderKetso
from app.models.cap2 import Cap2Progress
from app.models.cap2_alert import (
    Cap2AlertEvent,
    Cap2AlertImpression,
    Cap2AlertTypeState,
)
from app.models.journey_event import JourneyEvent
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap2.alerts import (
    Cap2AlertService,
    OfficialCloseObservation,
    UnavailableOfficialCloseProvider,
    current_session_date,
)
from app.services.cap2.service import Cap2Service
from app.services.jobs.cap2_alerts import run_cap2_stop_close_scan_job
from app.services.virtual_trading.price_resolver import PriceResult, PriceUnavailableError


class StaticQuoteProvider:
    def __init__(self, price: int | None) -> None:
        self.price = price

    async def get_current_price(self, symbol: str) -> int | None:
        return self.price


class StaticCloseProvider:
    def __init__(self, rows: dict[tuple[str, date], OfficialCloseObservation]) -> None:
        self.rows = rows

    async def get_official_close(
        self, symbol: str, session_date: date
    ) -> OfficialCloseObservation | None:
        return self.rows.get((symbol, session_date))


async def _valid_symbol(_symbol: str) -> bool:
    return True


async def _fixed_order_price(_symbol: str, **_kwargs) -> PriceResult:
    return PriceResult(
        price_vnd=90_000,
        source="cap2-alert-test",
        timestamp=datetime.now(UTC),
    )


async def _unavailable_order_price(_symbol: str, **_kwargs) -> PriceResult:
    raise PriceUnavailableError(_symbol)


async def _limit_fill_price(_symbol: str, **_kwargs) -> PriceResult:
    return PriceResult(
        price_vnd=88_000,
        source="cap2-alert-limit-fill-test",
        timestamp=datetime.now(UTC),
    )


class RaisingCloseProvider:
    async def get_official_close(
        self, symbol: str, session_date: date
    ) -> OfficialCloseObservation | None:
        raise RuntimeError("provider offline")


async def _seed_cap2(db, user_id):
    entered_at = datetime(2026, 1, 1, tzinfo=UTC)
    db.add(
        Cap1Progress(
            user_id=user_id,
            entered_at=entered_at,
            da_xem_tour=True,
            graduated_at=entered_at,
        )
    )
    db.add(Cap2Progress(user_id=user_id, entered_at=entered_at))
    repo = VirtualTradingRepository(db)
    account = await repo.create_account(user_id, 100_000_000)
    await db.flush()
    return account


async def _seed_position(db, account, *, symbol="VNM", avg_cost=100_000):
    return await VirtualTradingRepository(db).upsert_position(
        account.id,
        symbol,
        quantity_total=100,
        quantity_sellable=100,
        quantity_pending=0,
        quantity_reserved=0,
        avg_cost_vnd=avg_cost,
    )


async def _link_filled_nhoi(db, service, account, user_id, event, day):
    order = VirtualOrder(
        account_id=account.id,
        user_id=user_id,
        symbol=event.symbol,
        mode="thuc_chien",
        side=OrderSide.BUY,
        order_type=OrderType(event.intended_order_type),
        status=OrderStatus.FILLED,
        quantity=event.intended_quantity,
        limit_price_vnd=event.intended_limit_price_vnd,
        filled_price_vnd=90_000,
        trading_date=day,
    )
    db.add(order)
    await db.flush()
    await service.link_nhoi_order(user_id, event.id, order, session_date=day)
    return order


async def _seed_clean_close(db, account, user_id, *, n: int, day: date) -> None:
    order = VirtualOrder(
        account_id=account.id,
        user_id=user_id,
        symbol=f"C{n}",
        mode="thuc_chien",
        side=OrderSide.SELL,
        order_type=OrderType.MARKET,
        status=OrderStatus.FILLED,
        quantity=100,
        filled_price_vnd=100_000,
        trading_date=day,
    )
    db.add(order)
    await db.flush()
    db.add(
        OrderKetso(
            order_id=order.id,
            gia_ra=100_000,
            so_phien_giu=1,
            so_ngay_lich=1,
            pnl_pct=0,
            pnl_vnd=0,
            closed_at=datetime.combine(day, datetime.min.time(), tzinfo=UTC),
            cham_SL_khong_cat=False,
            nhoi_lenh_khi_lo=False,
        )
    )
    await db.flush()


@pytest.mark.asyncio
async def test_prebuy_detects_strictly_worse_than_three_percent_and_is_idempotent(
    db_session, test_user
):
    account = await _seed_cap2(db_session, test_user.id)
    await _seed_position(db_session, account)
    day = date(2026, 2, 2)

    at_boundary = Cap2AlertService(
        db_session, quote_provider=StaticQuoteProvider(97_000)
    )
    result = await at_boundary.evaluate_pre_buy(
        test_user.id,
        symbol="vnm",
        idempotency_key="attempt-boundary",
        quantity=100,
        order_type="market",
        limit_price_vnd=None,
        session_date=day,
    )
    assert result["triggered"] is False

    service = Cap2AlertService(db_session, quote_provider=StaticQuoteProvider(96_999))
    first = await service.evaluate_pre_buy(
        test_user.id,
        symbol="vnm",
        idempotency_key="attempt-0001",
        quantity=100,
        order_type="market",
        limit_price_vnd=None,
        session_date=day,
    )
    second = await service.evaluate_pre_buy(
        test_user.id,
        symbol="VNM",
        idempotency_key="attempt-0001",
        quantity=100,
        order_type="market",
        limit_price_vnd=None,
        session_date=day,
    )
    assert first["triggered"] is True
    assert first["alert"].id == second["alert"].id
    assert first["alert"].loss_pct == pytest.approx(-3.001)
    assert first["alert"].position_quantity == 100
    assert first["alert"].position_avg_cost_vnd == 100_000
    assert first["alert"].impression_count == 1
    assert (
        await db_session.scalar(select(func.count(Cap2AlertImpression.id)))
    ) == 1


@pytest.mark.asyncio
async def test_prebuy_quote_unavailable_is_explicit_and_creates_no_alert(db_session, test_user):
    account = await _seed_cap2(db_session, test_user.id)
    await _seed_position(db_session, account)
    result = await Cap2AlertService(
        db_session, quote_provider=StaticQuoteProvider(None)
    ).evaluate_pre_buy(
        test_user.id,
        symbol="VNM",
        idempotency_key="attempt-no-price",
        quantity=100,
        order_type="market",
        limit_price_vnd=None,
        session_date=date(2026, 2, 2),
    )
    assert result["data_status"] == "unavailable"
    assert result["triggered"] is False
    assert await db_session.scalar(select(func.count(Cap2AlertEvent.id))) == 0


@pytest.mark.asyncio
async def test_priority_and_strict_two_alert_session_quota(db_session, test_user):
    account = await _seed_cap2(db_session, test_user.id)
    service = Cap2AlertService(db_session, quote_provider=StaticQuoteProvider(90_000))
    day = date(2026, 3, 2)
    for symbol in ("AAA", "BBB"):
        position = await _seed_position(db_session, account, symbol=symbol)
        plan = VirtualOrder(
            account_id=account.id,
            user_id=test_user.id,
            symbol=symbol,
            mode="thuc_chien",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            status=OrderStatus.FILLED,
            quantity=100,
            filled_price_vnd=100_000,
            trading_date=day - timedelta(days=1),
        )
        db_session.add(plan)
        await db_session.flush()
        position.active_plan_buy_order_id = plan.id
        position.active_original_stop_vnd = 95_000
        await db_session.flush()
        await service._create_event_idempotently(
            user_id=test_user.id,
            alert_type="cham_cat_lo",
            symbol=symbol,
            session_date=day,
            trigger_key=f"stop-{symbol}",
            observed_price_vnd=90_000,
            threshold_price_vnd=95_000,
            source_plan_order_id=plan.id,
        )
    await service._create_event_idempotently(
        user_id=test_user.id,
        alert_type="nhoi_lenh",
        symbol="CCC",
        session_date=day,
        trigger_key="buy-CCC",
        observed_price_vnd=90_000,
        threshold_price_vnd=100_000,
        loss_pct=-10,
    )

    active = await service.active_alerts(test_user.id, session_date=day)
    assert [event.alert_type for event in active] == ["nhoi_lenh", "cham_cat_lo"]
    rows = list((await db_session.scalars(select(Cap2AlertEvent))).all())
    assert sum(row.impression_count for row in rows) == 2
    suppressed = [row for row in rows if row.status == "suppressed"]
    assert len(suppressed) == 1
    assert suppressed[0].suppression_reason == "session_limit"


@pytest.mark.asyncio
async def test_ignore_escalation_and_action_idempotency(db_session, test_user):
    account = await _seed_cap2(db_session, test_user.id)
    service = Cap2AlertService(db_session)
    start = date(2026, 4, 1)
    expected = ["normal", "normal", "delay_5s", "delay_5s", "type_phrase"]

    events = []
    for i, level in enumerate(expected):
        day = start + timedelta(days=i)
        event = await service._create_event_idempotently(
            user_id=test_user.id,
            alert_type="nhoi_lenh",
            symbol="VNM",
            session_date=day,
            trigger_key=f"attempt-{i}",
            observed_price_vnd=90_000,
            threshold_price_vnd=100_000,
            loss_pct=-10,
            intended_quantity=100,
            intended_order_type="market",
        )
        await service.active_alerts(test_user.id, session_date=day)
        assert event.escalation == level
        if level == "type_phrase":
            with pytest.raises(BadRequestError):
                await service.act(test_user.id, event.id, action="proceed_buy")
        await service.act(
            test_user.id,
            event.id,
            action="proceed_buy",
            confirmation_phrase="Tôi hiểu" if level == "type_phrase" else None,
        )
        await _link_filled_nhoi(
            db_session, service, account, test_user.id, event, day
        )
        events.append(event)

    same, _ = await service.act(test_user.id, events[-1].id, action="proceed_buy")
    assert same.id == events[-1].id
    with pytest.raises(ConflictError):
        await service.act(test_user.id, events[-1].id, action="cancel_buy")


@pytest.mark.asyncio
async def test_auto_mute_after_ten_clean_closes_and_renewed_violation_reenables(
    db_session, test_user
):
    account = await _seed_cap2(db_session, test_user.id)
    for i in range(10):
        await _seed_clean_close(
            db_session, account, test_user.id, n=i, day=date(2026, 5, 1) + timedelta(days=i)
        )

    service = Cap2AlertService(db_session)
    muted = await service._create_event_idempotently(
        user_id=test_user.id,
        alert_type="nhoi_lenh",
        symbol="VNM",
        session_date=date(2026, 5, 20),
        trigger_key="muted-attempt",
        observed_price_vnd=90_000,
        threshold_price_vnd=100_000,
        loss_pct=-10,
        intended_quantity=100,
        intended_order_type="market",
    )
    assert await service.active_alerts(test_user.id, session_date=date(2026, 5, 20)) == []
    assert muted.status == "suppressed"
    assert muted.suppression_reason == "auto_mute_last_10_clean"

    # The caller records the actual buy even though the warning was muted.  The
    # durable action re-enables the next intervention immediately.
    await service.act(test_user.id, muted.id, action="proceed_buy")
    await _link_filled_nhoi(
        db_session,
        service,
        account,
        test_user.id,
        muted,
        date(2026, 5, 20),
    )
    renewed = await service._create_event_idempotently(
        user_id=test_user.id,
        alert_type="nhoi_lenh",
        symbol="VNM",
        session_date=date(2026, 5, 21),
        trigger_key="renewed-attempt",
        observed_price_vnd=89_000,
        threshold_price_vnd=100_000,
        loss_pct=-11,
    )
    active = await service.active_alerts(test_user.id, session_date=date(2026, 5, 21))
    assert [event.id for event in active] == [renewed.id]


@pytest.mark.asyncio
async def test_stop_scan_never_fabricates_close_and_persists_across_sessions(
    db_session, test_user
):
    account = await _seed_cap2(db_session, test_user.id)
    position = await _seed_position(db_session, account)
    buy = VirtualOrder(
        account_id=account.id,
        user_id=test_user.id,
        symbol="VNM",
        mode="thuc_chien",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        status=OrderStatus.FILLED,
        quantity=100,
        filled_price_vnd=100_000,
        trading_date=date(2026, 6, 1),
    )
    db_session.add(buy)
    await db_session.flush()
    position.active_plan_buy_order_id = buy.id
    position.active_original_stop_vnd = 95_000
    await db_session.flush()

    service = Cap2AlertService(db_session)
    close_day = date(2026, 6, 2)
    display_day = date(2026, 6, 3)
    unavailable = await service.scan_stop_closes(
        test_user.id,
        official_session_date=close_day,
        display_session_date=display_day,
        provider=UnavailableOfficialCloseProvider(),
    )
    assert unavailable["unavailable_symbols"] == ["VNM"]
    assert await db_session.scalar(select(func.count(Cap2AlertEvent.id))) == 0

    observation = OfficialCloseObservation(
        symbol="VNM",
        session_date=close_day,
        price_vnd=94_000,
        closed_at=datetime(2026, 6, 2, 8, 0, tzinfo=UTC),
        source="official-eod-test",
    )
    provider = StaticCloseProvider({("VNM", close_day): observation})
    scanned = await service.scan_stop_closes(
        test_user.id,
        official_session_date=close_day,
        display_session_date=display_day,
        provider=provider,
    )
    assert scanned["alerts_pending"] == 1
    first = (await service.active_alerts(test_user.id, session_date=display_day))[0]
    assert first.observed_price_vnd == 94_000
    assert first.official_close_session_date == close_day
    assert first.impression_count == 1
    await service.active_alerts(test_user.id, session_date=display_day)
    assert first.impression_count == 1

    # Unacted stop banners persist and can be shown once in the next session.
    next_display = date(2026, 6, 4)
    assert (await service.active_alerts(test_user.id, session_date=next_display))[0].id == first.id
    assert first.impression_count == 2
    acted, next_step = await service.act(test_user.id, first.id, action="sell_ato")
    assert acted.status == "acted"
    assert next_step == "confirm_ato_sell"


@pytest.mark.asyncio
async def test_stop_alert_resolves_when_position_was_closed_outside_banner(
    db_session, test_user
):
    account = await _seed_cap2(db_session, test_user.id)
    position = await _seed_position(db_session, account)
    buy = VirtualOrder(
        account_id=account.id,
        user_id=test_user.id,
        symbol="VNM",
        mode="thuc_chien",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        status=OrderStatus.FILLED,
        quantity=100,
        filled_price_vnd=100_000,
        trading_date=date(2026, 7, 1),
    )
    db_session.add(buy)
    await db_session.flush()
    position.active_plan_buy_order_id = buy.id
    position.active_original_stop_vnd = 95_000
    await db_session.flush()

    close_day = date(2026, 7, 2)
    display_day = date(2026, 7, 3)
    provider = StaticCloseProvider(
        {
            ("VNM", close_day): OfficialCloseObservation(
                symbol="VNM",
                session_date=close_day,
                price_vnd=94_000,
                closed_at=datetime(2026, 7, 2, 8, 0, tzinfo=UTC),
                source="official-eod-test",
            )
        }
    )
    service = Cap2AlertService(db_session)
    await service.scan_stop_closes(
        test_user.id,
        official_session_date=close_day,
        display_session_date=display_day,
        provider=provider,
    )
    event = (await db_session.scalars(select(Cap2AlertEvent))).one()
    assert [row.id for row in await service.active_alerts(
        test_user.id, session_date=display_day
    )] == [event.id]

    position.quantity_total = 0
    position.quantity_sellable = 0
    position.active_plan_buy_order_id = None
    await db_session.flush()
    assert await service.active_alerts(test_user.id, session_date=display_day) == []
    assert event.status == "acted"
    assert event.action == "position_closed"
    assert event.suppression_reason == "position_closed"


@pytest.mark.asyncio
async def test_scan_job_default_is_unavailable_and_injected_provider_is_exact_date(
    db_session, test_user
):
    account = await _seed_cap2(db_session, test_user.id)
    position = await _seed_position(db_session, account)
    buy = VirtualOrder(
        account_id=account.id,
        user_id=test_user.id,
        symbol="VNM",
        mode="thuc_chien",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        status=OrderStatus.FILLED,
        quantity=100,
        filled_price_vnd=100_000,
        trading_date=date(2026, 8, 3),
    )
    db_session.add(buy)
    await db_session.flush()
    position.active_plan_buy_order_id = buy.id
    position.active_original_stop_vnd = 95_000
    await db_session.flush()

    close_day = date(2026, 8, 3)
    display_day = date(2026, 8, 4)
    fallback = await run_cap2_stop_close_scan_job(
        session=db_session,
        now=datetime(2026, 8, 7, 8, 5, tzinfo=UTC),
    )
    assert fallback["official_session_date"] == date(2026, 8, 7)
    assert fallback["display_session_date"] == date(2026, 8, 10)
    assert fallback["calendar_source"] == "weekday_fallback"
    assert fallback["provider_ready"] is False

    default = await run_cap2_stop_close_scan_job(
        official_session_date=close_day,
        display_session_date=display_day,
        session=db_session,
    )
    assert default["provider_ready"] is False
    assert default["alerts_pending"] == 0
    assert default["unavailable_count"] == 1

    failed = await run_cap2_stop_close_scan_job(
        official_session_date=close_day,
        display_session_date=display_day,
        provider=RaisingCloseProvider(),
        session=db_session,
    )
    assert failed["provider_ready"] is True
    assert failed["alerts_pending"] == 0
    assert failed["unavailable_count"] == 1

    # A payload whose declared session is right but timestamp belongs to the
    # previous Vietnam date is rejected as stale/mismatched.
    stale = StaticCloseProvider(
        {
            ("VNM", close_day): OfficialCloseObservation(
                symbol="VNM",
                session_date=close_day,
                price_vnd=94_000,
                closed_at=datetime(2026, 8, 2, 8, 0, tzinfo=UTC),
                source="official-eod-test",
            )
        }
    )
    rejected = await run_cap2_stop_close_scan_job(
        official_session_date=close_day,
        display_session_date=display_day,
        provider=stale,
        session=db_session,
    )
    assert rejected["provider_ready"] is True
    assert rejected["alerts_pending"] == 0
    assert rejected["unavailable_count"] == 1

    exact = StaticCloseProvider(
        {
            ("VNM", close_day): OfficialCloseObservation(
                symbol="VNM",
                session_date=close_day,
                price_vnd=94_000,
                closed_at=datetime(2026, 8, 3, 8, 0, tzinfo=UTC),
                source="official-eod-test",
            )
        }
    )
    accepted = await run_cap2_stop_close_scan_job(
        official_session_date=close_day,
        display_session_date=display_day,
        provider=exact,
        session=db_session,
    )
    assert accepted["alerts_pending"] == 1
    assert accepted["unavailable_count"] == 0

    calendar_blocked = await run_cap2_stop_close_scan_job(
        official_session_date=close_day,
        provider=exact,
        session=db_session,
    )
    assert calendar_blocked["provider_ready"] is True
    assert calendar_blocked["calendar_ready"] is False
    assert calendar_blocked["alerts_pending"] == 0
    assert calendar_blocked["skipped_reason"] == "verified_next_trading_date_required"


@pytest.mark.asyncio
async def test_alert_http_contract_presents_and_records_action(
    client, db_session, test_user
):
    from app.core.security import create_access_token

    await _seed_cap2(db_session, test_user.id)
    day = date(2026, 9, 14)
    event = await Cap2AlertService(db_session)._create_event_idempotently(
        user_id=test_user.id,
        alert_type="nhoi_lenh",
        symbol="VNM",
        session_date=day,
        trigger_key="http-attempt-1",
        observed_price_vnd=94_000,
        threshold_price_vnd=100_000,
        loss_pct=-6.0,
        position_quantity=100,
        position_avg_cost_vnd=100_000,
    )
    await db_session.commit()
    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get(
        f"/api/v1/cap2/alerts/active?session_date={day.isoformat()}",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["session_date"] == day.isoformat()
    assert len(body["alerts"]) == 1
    alert = body["alerts"][0]
    assert alert["id"] == str(event.id)
    assert alert["alert_type"] == "nhoi_lenh"
    assert alert["priority"] == "immediate"
    assert alert["status"] == "shown"
    assert alert["escalation"] == "normal"
    assert alert["position_quantity"] == 100
    assert alert["position_avg_cost_vnd"] == 100_000

    response = await client.post(
        f"/api/v1/cap2/alerts/{event.id}/action",
        headers=headers,
        json={"action": "cancel_buy"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["alert"]["status"] == "acted"
    assert response.json()["alert"]["action"] == "cancel_buy"
    assert response.json()["next_step"] == "none"
    analytics = list(
        (
            await db_session.scalars(
                select(JourneyEvent)
                .where(JourneyEvent.user_id == test_user.id)
                .order_by(JourneyEvent.name)
            )
        ).all()
    )
    assert [row.name for row in analytics] == [
        "cap2_alert_escalation",
        "cap2_nhoi_lenh_alert_action",
        "cap2_nhoi_lenh_alert_shown",
    ]


@pytest.mark.asyncio
async def test_hold_action_projects_authoritative_violation_into_later_closeout(
    db_session, test_user
):
    account = await _seed_cap2(db_session, test_user.id)
    position = await _seed_position(db_session, account)
    buy = VirtualOrder(
        account_id=account.id,
        user_id=test_user.id,
        symbol="VNM",
        mode="thuc_chien",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        status=OrderStatus.FILLED,
        quantity=100,
        filled_price_vnd=100_000,
        trading_date=date(2026, 9, 1),
    )
    db_session.add(buy)
    await db_session.flush()
    db_session.add(
        OrderKehoach(
            order_id=buy.id,
            lyDo="ky_thuat",
            trangThai_luc_dat="ung_ho",
            vung_mua=100_000,
            phuong_phap_sl_tp="ho_tro_khang_cu",
            cat_lo=95_000,
            chot_loi=110_000,
        )
    )
    position.active_plan_buy_order_id = buy.id
    position.active_original_stop_vnd = 95_000
    alert_service = Cap2AlertService(db_session)
    stop_event = await alert_service._create_event_idempotently(
        user_id=test_user.id,
        alert_type="cham_cat_lo",
        symbol="VNM",
        session_date=date(2026, 9, 2),
        trigger_key=f"stop:{buy.id}:2026-09-01",
        observed_price_vnd=94_000,
        threshold_price_vnd=95_000,
        source_plan_order_id=buy.id,
        breach_session_no=3,
    )
    await alert_service.active_alerts(test_user.id, session_date=date(2026, 9, 2))
    await alert_service.act(test_user.id, stop_event.id, action="hold")

    sell = VirtualOrder(
        account_id=account.id,
        user_id=test_user.id,
        symbol="VNM",
        mode="thuc_chien",
        side=OrderSide.SELL,
        order_type=OrderType.MARKET,
        status=OrderStatus.FILLED,
        quantity=100,
        filled_price_vnd=93_000,
        trading_date=date(2026, 9, 3),
        exit_matched_buy_order_id=buy.id,
    )
    db_session.add(sell)
    await db_session.flush()
    db_session.add(
        OrderKetso(
            order_id=sell.id,
            gia_ra=93_000,
            so_phien_giu=2,
            so_ngay_lich=2,
            pnl_pct=-7,
            pnl_vnd=-700_000,
            closed_at=datetime(2026, 9, 3, tzinfo=UTC),
        )
    )
    await db_session.flush()

    closeout = await Cap2Service(db_session).record_ketso(test_user.id, sell.id)
    assert closeout.cham_SL_cuoi_phien is True
    assert closeout.cham_SL_khong_cat is True
    assert closeout.giu_cham_SL_bao_nhieu_phien == 3


@pytest.mark.asyncio
async def test_proceed_alert_binds_atomic_buy_and_projects_nhoi_into_closeout(
    client, db_session, test_user
):
    from app.core.security import create_access_token

    account = await _seed_cap2(db_session, test_user.id)
    await _seed_position(db_session, account)
    day = current_session_date()
    alert_service = Cap2AlertService(
        db_session, quote_provider=StaticQuoteProvider(90_000)
    )
    preflight = await alert_service.evaluate_pre_buy(
        test_user.id,
        symbol="VNM",
        idempotency_key="atomic-buy-attempt",
        quantity=100,
        order_type="market",
        limit_price_vnd=None,
        session_date=day,
    )
    event = preflight["alert"]
    assert event is not None
    await alert_service.act(test_user.id, event.id, action="proceed_buy")
    await db_session.commit()

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}
    with (
        patch(
            "app.services.virtual_trading.service.validate_symbol",
            side_effect=_valid_symbol,
        ),
        patch(
            "app.services.virtual_trading.service.resolve_price",
            side_effect=_fixed_order_price,
        ),
    ):
        response = await client.post(
            "/api/v1/virtual-trading/orders",
            headers=headers,
            json={
                "symbol": "VNM",
                "side": "buy",
                "order_type": "market",
                "quantity": 100,
                "journey_plan": {
                    "lyDo": "ky_thuat",
                    "trangThai_luc_dat": "ung_ho",
                    "vung_mua": 90_000,
                    "phuong_phap_sl_tp": "ho_tro_khang_cu",
                    "cat_lo": 85_000,
                    "chot_loi": 100_000,
                    "nhoi_lenh_alert_id": str(event.id),
                },
            },
        )
    assert response.status_code == 201, response.text
    order_body = response.json()
    assert order_body["status"] == "filled"
    assert order_body["nhoi_lenh_alert_linked"] is True
    buy_id = uuid.UUID(order_body["id"])
    await db_session.refresh(event)
    assert event.source_order_id == buy_id
    assert event.violation_confirmed_at is not None
    state = await db_session.scalar(
        select(Cap2AlertTypeState).where(
            Cap2AlertTypeState.user_id == test_user.id,
            Cap2AlertTypeState.alert_type == "nhoi_lenh",
        )
    )
    assert state is not None and state.ignored_streak == 1

    linked_buy = await db_session.get(VirtualOrder, buy_id)
    assert linked_buy is not None
    assert await alert_service.link_nhoi_order(
        test_user.id, event.id, linked_buy, session_date=day
    )

    sell = VirtualOrder(
        account_id=account.id,
        user_id=test_user.id,
        symbol="VNM",
        mode="thuc_chien",
        side=OrderSide.SELL,
        order_type=OrderType.MARKET,
        status=OrderStatus.FILLED,
        quantity=100,
        filled_price_vnd=95_000,
        trading_date=day,
        exit_matched_buy_order_id=buy_id,
    )
    db_session.add(sell)
    await db_session.flush()
    db_session.add(
        OrderKetso(
            order_id=sell.id,
            gia_ra=95_000,
            so_phien_giu=1,
            so_ngay_lich=1,
            pnl_pct=5.5,
            pnl_vnd=500_000,
            closed_at=datetime.now(UTC),
        )
    )
    await db_session.flush()

    closeout = await Cap2Service(db_session).record_ketso(
        test_user.id, sell.id, nhoi_lenh_khi_lo=False
    )
    assert closeout.nhoi_lenh_khi_lo is True


@pytest.mark.asyncio
async def test_nhoi_link_rejects_foreign_spoof_and_changed_draft(
    db_session, test_user
):
    account = await _seed_cap2(db_session, test_user.id)
    await _seed_position(db_session, account)
    day = current_session_date()
    service = Cap2AlertService(
        db_session, quote_provider=StaticQuoteProvider(90_000)
    )
    event = (
        await service.evaluate_pre_buy(
            test_user.id,
            symbol="VNM",
            idempotency_key="validated-draft",
            quantity=100,
            order_type="limit",
            limit_price_vnd=89_000,
            session_date=day,
        )
    )["alert"]
    assert event is not None
    await service.act(test_user.id, event.id, action="proceed_buy")

    foreign_order = VirtualOrder(
        id=uuid.uuid4(),
        account_id=account.id,
        user_id=uuid.uuid4(),
        symbol="VNM",
        mode="thuc_chien",
        side=OrderSide.BUY,
        order_type=OrderType.LIMIT,
        status=OrderStatus.PENDING,
        quantity=100,
        limit_price_vnd=89_000,
        trading_date=day,
    )
    with pytest.raises(NotFoundError):
        await service.link_nhoi_order(
            test_user.id, event.id, foreign_order, session_date=day
        )

    with pytest.raises(NotFoundError):
        await service.validate_nhoi_order_link(
            uuid.uuid4(),
            event.id,
            symbol="VNM",
            quantity=100,
            order_type="limit",
            limit_price_vnd=89_000,
            session_date=day,
        )
    for changed in (
        {"symbol": "FPT", "quantity": 100, "limit_price_vnd": 89_000},
        {"symbol": "VNM", "quantity": 200, "limit_price_vnd": 89_000},
        {"symbol": "VNM", "quantity": 100, "limit_price_vnd": 88_000},
    ):
        with pytest.raises(ConflictError):
            await service.validate_nhoi_order_link(
                test_user.id,
                event.id,
                order_type="limit",
                session_date=day,
                **changed,
            )
    with pytest.raises(ConflictError):
        await service.validate_nhoi_order_link(
            test_user.id,
            event.id,
            symbol="VNM",
            quantity=100,
            order_type="limit",
            limit_price_vnd=89_000,
            session_date=day + timedelta(days=1),
        )

    pending = VirtualOrder(
        account_id=account.id,
        user_id=test_user.id,
        symbol="VNM",
        mode="thuc_chien",
        side=OrderSide.BUY,
        order_type=OrderType.LIMIT,
        status=OrderStatus.PENDING,
        quantity=100,
        limit_price_vnd=89_000,
        reserved_cash_vnd=8_900_000,
        trading_date=day,
    )
    db_session.add(pending)
    await db_session.flush()
    assert await service.link_nhoi_order(
        test_user.id, event.id, pending, session_date=day
    )
    # Retrying linkage for the exact same accepted order is idempotent.
    assert await service.link_nhoi_order(
        test_user.id, event.id, pending, session_date=day
    )

    another = VirtualOrder(
        account_id=account.id,
        user_id=test_user.id,
        symbol="VNM",
        mode="thuc_chien",
        side=OrderSide.BUY,
        order_type=OrderType.LIMIT,
        status=OrderStatus.PENDING,
        quantity=100,
        limit_price_vnd=89_000,
        reserved_cash_vnd=8_900_000,
        trading_date=day,
    )
    db_session.add(another)
    await db_session.flush()
    with pytest.raises(ConflictError):
        await service.link_nhoi_order(
            test_user.id, event.id, another, session_date=day
        )


@pytest.mark.asyncio
async def test_rejected_buy_does_not_consume_or_link_nhoi_alert(
    client, db_session, test_user
):
    from app.core.security import create_access_token

    account = await _seed_cap2(db_session, test_user.id)
    await _seed_position(db_session, account)
    day = current_session_date()
    service = Cap2AlertService(
        db_session, quote_provider=StaticQuoteProvider(90_000)
    )
    event = (
        await service.evaluate_pre_buy(
            test_user.id,
            symbol="VNM",
            idempotency_key="rejected-buy-draft",
            quantity=100,
            order_type="market",
            limit_price_vnd=None,
            session_date=day,
        )
    )["alert"]
    assert event is not None
    await service.act(test_user.id, event.id, action="proceed_buy")
    await db_session.commit()
    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}

    with (
        patch(
            "app.services.virtual_trading.service.validate_symbol",
            side_effect=_valid_symbol,
        ),
        patch(
            "app.services.virtual_trading.service.resolve_price",
            side_effect=_unavailable_order_price,
        ),
    ):
        response = await client.post(
            "/api/v1/virtual-trading/orders",
            headers=headers,
            json={
                "symbol": "VNM",
                "side": "buy",
                "order_type": "market",
                "quantity": 100,
                "journey_plan": {
                    "lyDo": "ky_thuat",
                    "trangThai_luc_dat": "ung_ho",
                    "vung_mua": 90_000,
                    "phuong_phap_sl_tp": "ho_tro_khang_cu",
                    "cat_lo": 85_000,
                    "chot_loi": 100_000,
                    "nhoi_lenh_alert_id": str(event.id),
                },
            },
        )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "rejected"
    assert response.json()["nhoi_lenh_alert_linked"] is False
    await db_session.refresh(event)
    assert event.source_order_id is None
    assert event.violation_confirmed_at is None
    state = await db_session.scalar(
        select(Cap2AlertTypeState).where(
            Cap2AlertTypeState.user_id == test_user.id,
            Cap2AlertTypeState.alert_type == "nhoi_lenh",
        )
    )
    assert state is not None and state.ignored_streak == 0


@pytest.mark.asyncio
async def test_cancelled_linked_buy_does_not_create_closeout_violation(
    db_session, test_user
):
    account = await _seed_cap2(db_session, test_user.id)
    await _seed_position(db_session, account)
    day = current_session_date()
    service = Cap2AlertService(
        db_session, quote_provider=StaticQuoteProvider(90_000)
    )
    event = (
        await service.evaluate_pre_buy(
            test_user.id,
            symbol="VNM",
            idempotency_key="cancelled-buy-draft",
            quantity=100,
            order_type="limit",
            limit_price_vnd=89_000,
            session_date=day,
        )
    )["alert"]
    assert event is not None
    await service.act(test_user.id, event.id, action="proceed_buy")
    cancelled_buy = VirtualOrder(
        account_id=account.id,
        user_id=test_user.id,
        symbol="VNM",
        mode="thuc_chien",
        side=OrderSide.BUY,
        order_type=OrderType.LIMIT,
        status=OrderStatus.PENDING,
        quantity=100,
        limit_price_vnd=89_000,
        reserved_cash_vnd=8_900_000,
        trading_date=day,
    )
    db_session.add(cancelled_buy)
    await db_session.flush()
    await service.link_nhoi_order(
        test_user.id, event.id, cancelled_buy, session_date=day
    )
    assert event.violation_confirmed_at is None
    cancelled_buy.status = OrderStatus.CANCELLED
    db_session.add(
        OrderKehoach(
            order_id=cancelled_buy.id,
            lyDo="ky_thuat",
            trangThai_luc_dat="ung_ho",
            vung_mua=89_000,
            phuong_phap_sl_tp="ho_tro_khang_cu",
            cat_lo=85_000,
            chot_loi=100_000,
        )
    )
    sell = VirtualOrder(
        account_id=account.id,
        user_id=test_user.id,
        symbol="VNM",
        mode="thuc_chien",
        side=OrderSide.SELL,
        order_type=OrderType.MARKET,
        status=OrderStatus.FILLED,
        quantity=100,
        filled_price_vnd=95_000,
        trading_date=day,
        exit_matched_buy_order_id=cancelled_buy.id,
    )
    db_session.add(sell)
    await db_session.flush()
    db_session.add(
        OrderKetso(
            order_id=sell.id,
            gia_ra=95_000,
            so_phien_giu=1,
            so_ngay_lich=1,
            pnl_pct=0,
            pnl_vnd=0,
            closed_at=datetime.now(UTC),
        )
    )
    await db_session.flush()

    closeout = await Cap2Service(db_session).record_ketso(test_user.id, sell.id)
    assert closeout.nhoi_lenh_khi_lo is False


@pytest.mark.asyncio
async def test_pending_nhoi_buy_is_confirmed_only_when_refresh_fills(
    client, db_session, test_user
):
    from app.core.security import create_access_token

    account = await _seed_cap2(db_session, test_user.id)
    position = await _seed_position(db_session, account)
    day = current_session_date()
    alert_service = Cap2AlertService(
        db_session, quote_provider=StaticQuoteProvider(90_000)
    )
    event = (
        await alert_service.evaluate_pre_buy(
            test_user.id,
            symbol="VNM",
            idempotency_key="pending-limit-fill",
            quantity=100,
            order_type="limit",
            limit_price_vnd=89_000,
            session_date=day,
        )
    )["alert"]
    assert event is not None
    await alert_service.act(test_user.id, event.id, action="proceed_buy")
    await db_session.commit()

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}
    with patch(
        "app.services.virtual_trading.service.validate_symbol",
        side_effect=_valid_symbol,
    ):
        response = await client.post(
            "/api/v1/virtual-trading/orders",
            headers=headers,
            json={
                "symbol": "VNM",
                "side": "buy",
                "order_type": "limit",
                "quantity": 100,
                "limit_price_vnd": 89_000,
                "journey_plan": {
                    "lyDo": "ky_thuat",
                    "trangThai_luc_dat": "ung_ho",
                    "vung_mua": 89_000,
                    "phuong_phap_sl_tp": "ho_tro_khang_cu",
                    "cat_lo": 85_000,
                    "chot_loi": 100_000,
                    "nhoi_lenh_alert_id": str(event.id),
                },
            },
        )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "pending"
    assert body["nhoi_lenh_alert_linked"] is True
    pending_buy_id = uuid.UUID(body["id"])
    await db_session.refresh(event)
    assert event.source_order_id == pending_buy_id
    assert event.violation_confirmed_at is None

    state = await db_session.scalar(
        select(Cap2AlertTypeState).where(
            Cap2AlertTypeState.user_id == test_user.id,
            Cap2AlertTypeState.alert_type == "nhoi_lenh",
        )
    )
    assert state is not None and state.ignored_streak == 0

    with patch(
        "app.services.virtual_trading.service.resolve_price",
        side_effect=_limit_fill_price,
    ):
        refreshed = await client.post(
            "/api/v1/virtual-trading/refresh", headers=headers
        )
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["orders_filled"] == 1
    await db_session.refresh(event)
    await db_session.refresh(position)
    await db_session.refresh(state)
    assert event.violation_confirmed_at is not None
    assert state.ignored_streak == 1
    assert position.active_plan_buy_order_id == pending_buy_id
