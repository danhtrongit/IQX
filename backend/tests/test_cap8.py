"""Focused Cấp 8 server-derived exit evidence contracts."""

from datetime import UTC, date, datetime

import pytest

from app.core.exceptions import BadRequestError, ConflictError
from app.models.cap8 import Cap8Exit, Cap8Progress
from app.models.virtual_trading import (
    OrderSide,
    OrderStatus,
    OrderType,
    VirtualOrder,
    VirtualPosition,
    VirtualTradingAccount,
)
from app.services.cap8.service import Cap8Service, EXIT_TARGET


async def _exit_fixture(db_session, user, *, remaining: int = 0, sell_price: int = 120, target: int = 110):
    now = datetime.now(UTC)
    account = VirtualTradingAccount(
        user_id=user.id, initial_cash_vnd=1_000_000, cash_available_vnd=1_000_000, activated_at=now
    )
    db_session.add(account)
    await db_session.flush()
    buy = VirtualOrder(
        account_id=account.id, user_id=user.id, symbol="VCB", mode="thuc_chien", side=OrderSide.BUY,
        order_type=OrderType.MARKET, status=OrderStatus.FILLED, quantity=100, filled_price_vnd=100,
        trading_date=date(2026, 1, 5),
    )
    db_session.add(buy)
    await db_session.flush()
    sell = VirtualOrder(
        account_id=account.id, user_id=user.id, symbol="VCB", mode="thuc_chien", side=OrderSide.SELL,
        order_type=OrderType.MARKET, status=OrderStatus.FILLED, quantity=100, filled_price_vnd=sell_price,
        trading_date=date(2026, 1, 6),
    )
    position = VirtualPosition(
        account_id=account.id, symbol="VCB", quantity_total=remaining, quantity_sellable=remaining,
        quantity_pending=0, quantity_reserved=0, avg_cost_vnd=100, active_plan_buy_order_id=buy.id,
        active_original_stop_vnd=90, active_original_take_profit_vnd=target,
    )
    progress = Cap8Progress(user_id=user.id, entered_at=datetime(2026, 1, 1, tzinfo=UTC))
    db_session.add_all([sell, position, progress])
    await db_session.flush()
    return Cap8Service(db_session), account, position, sell, progress


def test_stop_timeliness_allows_crossing_session_and_following_trading_session() -> None:
    history = [(date(2026, 1, 5), 101.0), (date(2026, 1, 6), 99.0), (date(2026, 1, 7), 97.0)]
    assert Cap8Service._timely_stop(history, 100, date(2026, 1, 6)) == (True, "timely_stop_exit")
    assert Cap8Service._timely_stop(history, 100, date(2026, 1, 7)) == (True, "timely_stop_exit")


def test_stop_timeliness_rejects_late_and_unverified_exits() -> None:
    history = [(date(2026, 1, 5), 101.0), (date(2026, 1, 6), 99.0), (date(2026, 1, 7), 98.0), (date(2026, 1, 8), 97.0)]
    assert Cap8Service._timely_stop(history, 100, date(2026, 1, 8)) == (False, "late_stop_exit")
    assert Cap8Service._timely_stop(history, 95, date(2026, 1, 8)) == (False, "stop_crossing_not_verified")


@pytest.mark.asyncio
async def test_take_profit_full_exit_counts_and_duplicate_post_is_idempotent(db_session, test_user) -> None:
    service, _, _, sell, progress = await _exit_fixture(db_session, test_user)
    first = await service.record_exit(test_user.id, sell.id)
    duplicate = await service.record_exit(test_user.id, sell.id)
    assert first["dung_ke_hoach"] is True
    assert first["exit_method"] == "full"
    assert duplicate["id"] == first["id"]
    assert progress.so_lenh_thoat_dung_ke_hoach == 1


@pytest.mark.asyncio
async def test_take_profit_partial_exit_counts_with_remaining_percentage(db_session, test_user) -> None:
    service, _, _, sell, _ = await _exit_fixture(db_session, test_user, remaining=100)
    result = await service.record_exit(test_user.id, sell.id)
    assert result["dung_ke_hoach"] is True
    assert result["exit_method"] == "partial"
    assert result["remaining_position_pct"] == 50


@pytest.mark.asyncio
async def test_profitable_full_exit_below_target_is_emotional_and_never_counts(db_session, test_user) -> None:
    service, _, _, sell, progress = await _exit_fixture(db_session, test_user, sell_price=105, target=110)
    result = await service.record_exit(test_user.id, sell.id)
    assert result["dung_ke_hoach"] is False
    assert result["ban_cam_xuc"] is True
    assert result["classification_reason"] == "emotional_full_exit_below_target"
    assert progress.so_lenh_thoat_dung_ke_hoach == 0


@pytest.mark.asyncio
async def test_timely_original_stop_exit_counts(db_session, test_user, monkeypatch) -> None:
    service, _, _, sell, _ = await _exit_fixture(db_session, test_user, sell_price=90)
    monkeypatch.setattr(
        service, "_history",
        lambda _symbol: __import__("asyncio").sleep(0, result=[(date(2026, 1, 5), 91.0), (date(2026, 1, 6), 89.0)]),
    )
    original = await service.record_exit(test_user.id, sell.id)
    assert original["classification_reason"] == "timely_original_stop_exit"
    assert original["dung_ke_hoach"] is True


@pytest.mark.asyncio
async def test_timely_trailing_stop_exit_counts(db_session, test_user, monkeypatch) -> None:
    service, _, position, sell, _ = await _exit_fixture(db_session, test_user, sell_price=105)
    position.active_dynamic_stop_vnd = 105
    position.active_dynamic_stop_set_at = datetime(2026, 1, 5, tzinfo=UTC)
    monkeypatch.setattr(
        service, "_history",
        lambda _symbol: __import__("asyncio").sleep(0, result=[(date(2026, 1, 5), 110.0), (date(2026, 1, 6), 104.0)]),
    )
    trailing = await service.record_exit(test_user.id, sell.id)
    assert trailing["dung_ke_hoach"] is True
    assert trailing["exit_method"] == "trailing_hit"
    assert trailing["classification_reason"] == "timely_trailing_stop_exit"


@pytest.mark.asyncio
async def test_dynamic_stop_rejects_unprofitable_or_nonraising_values(db_session, test_user, monkeypatch) -> None:
    service, _, position, _, _ = await _exit_fixture(db_session, test_user, remaining=100)
    monkeypatch.setattr(service._trading, "get_portfolio", lambda _user_id: __import__("asyncio").sleep(0, result={"positions": [{"symbol": "VCB", "current_price_vnd": 100}] }))
    with pytest.raises(BadRequestError):
        await service.set_dynamic_stop(test_user.id, "VCB", 95)
    monkeypatch.setattr(service._trading, "get_portfolio", lambda _user_id: __import__("asyncio").sleep(0, result={"positions": [{"symbol": "VCB", "current_price_vnd": 120}] }))
    with pytest.raises(BadRequestError):
        await service.set_dynamic_stop(test_user.id, "VCB", 90)
    saved = await service.set_dynamic_stop(test_user.id, "VCB", 110)
    assert saved["dynamic_stop_vnd"] == 110
    assert position.active_dynamic_stop_vnd == 110


@pytest.mark.asyncio
async def test_fifth_compliant_exit_unlocks_terminal_graduation(db_session, test_user) -> None:
    service, account, _, _, progress = await _exit_fixture(db_session, test_user)

    async def add_compliant_exit(number: int) -> None:
        sell = VirtualOrder(
            account_id=account.id, user_id=test_user.id, symbol=f"T{number}", mode="thuc_chien",
            side=OrderSide.SELL, order_type=OrderType.MARKET, status=OrderStatus.FILLED,
            quantity=100, filled_price_vnd=110, trading_date=date(2026, 1, 6),
        )
        db_session.add(sell)
        await db_session.flush()
        db_session.add(Cap8Exit(
            user_id=test_user.id, account_id=account.id, symbol=sell.symbol, sell_order_id=sell.id,
            exited_at=datetime(2026, 1, 2, tzinfo=UTC), quantity=100, filled_price_vnd=110,
            remaining_position_pct=0, exit_method="full", original_stop_vnd=90,
            original_take_profit_vnd=110, effective_stop_vnd=90, dung_ke_hoach=True,
            ban_cam_xuc=False, classification_reason="take_profit_hit",
        ))
        await db_session.flush()

    for number in range(EXIT_TARGET - 1):
        await add_compliant_exit(number)
    with pytest.raises(ConflictError):
        await service.graduate(test_user.id)
    await add_compliant_exit(EXIT_TARGET - 1)
    result = await service.graduate(test_user.id)
    assert result["so_lenh_thoat_dung_ke_hoach"] == EXIT_TARGET
    assert result["graduated_at"] is not None
