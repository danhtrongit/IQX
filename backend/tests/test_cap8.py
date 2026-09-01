"""Focused Cấp 8 server-derived exit evidence contracts."""

from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap1 import LyDo, OrderKehoach, TrangThaiLucDat
from app.models.cap7 import Cap7Progress
from app.models.cap8 import Cap8Exit, Cap8Progress
from app.models.virtual_trading import (
    OrderSide,
    OrderStatus,
    OrderType,
    VirtualOrder,
    VirtualPosition,
    VirtualTradingAccount,
)
from app.services.cap8.service import EXIT_TARGET, Cap8Service


async def _exit_fixture(
    db_session,
    user,
    *,
    remaining: int = 0,
    sell_price: int = 120,
    target: int = 110,
):
    now = datetime.now(UTC)
    account = VirtualTradingAccount(
        user_id=user.id,
        initial_cash_vnd=1_000_000,
        cash_available_vnd=1_000_000,
        activated_at=now,
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
    buy.created_at = datetime(2026, 1, 5, 10, tzinfo=UTC)
    buy.updated_at = datetime(2026, 1, 5, 10, tzinfo=UTC)
    db_session.add(OrderKehoach(
        order_id=buy.id,
        lyDo=LyDo.KY_THUAT,
        trangThai_luc_dat=TrangThaiLucDat.UNG_HO,
        vung_mua=100,
        cat_lo=90,
        chot_loi=target,
    ))
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
    sell.created_at = datetime(2026, 1, 6, 10, tzinfo=UTC)
    sell.updated_at = datetime(2026, 1, 6, 10, tzinfo=UTC)
    sell.exit_snapshot_at = sell.updated_at
    sell.position_quantity_before_fill = remaining + sell.quantity
    sell.position_quantity_after_fill = remaining
    sell.exit_matched_buy_order_id = buy.id
    sell.exit_original_stop_vnd = position.active_original_stop_vnd
    sell.exit_original_take_profit_vnd = position.active_original_take_profit_vnd
    sell.exit_dynamic_stop_vnd = None
    sell.exit_dynamic_stop_set_at = None
    sell.exit_avg_cost_vnd = position.avg_cost_vnd
    sell.exit_plan_activated_at = buy.updated_at
    await db_session.flush()
    return Cap8Service(db_session), account, position, sell, progress


async def _qualifying_plan(
    db_session, account, user, *, stop: int, target: int, status: OrderStatus = OrderStatus.FILLED,
) -> VirtualOrder:
    buy = VirtualOrder(
        account_id=account.id, user_id=user.id, symbol="VCB", mode="thuc_chien",
        side=OrderSide.BUY, order_type=OrderType.MARKET, status=status,
        quantity=100, filled_price_vnd=100 if status == OrderStatus.FILLED else None,
        trading_date=date(2026, 1, 10),
    )
    db_session.add(buy)
    await db_session.flush()
    db_session.add(OrderKehoach(
        order_id=buy.id, lyDo=LyDo.KY_THUAT, trangThai_luc_dat=TrangThaiLucDat.UNG_HO,
        vung_mua=100, cat_lo=stop, chot_loi=target,
    ))
    await db_session.flush()
    return buy



@pytest.mark.asyncio
async def test_first_access_replaces_stale_active_plan_after_later_buy_fills(db_session, test_user) -> None:
    service, account, position, _, _ = await _exit_fixture(db_session, test_user, remaining=100)
    old_buy = position.active_plan_buy_order_id
    position.active_dynamic_stop_vnd = 105
    position.active_dynamic_stop_set_at = datetime(2026, 1, 9, tzinfo=UTC)
    later_buy = await _qualifying_plan(db_session, account, test_user, stop=95, target=125)

    refreshed = await service._bootstrap_plan(test_user.id, account.id, position)

    assert refreshed is True
    assert position.active_plan_buy_order_id == later_buy.id
    assert position.active_plan_buy_order_id != old_buy
    assert position.active_original_stop_vnd == 95
    assert position.active_original_take_profit_vnd == 125
    assert position.active_dynamic_stop_vnd is None


@pytest.mark.asyncio
async def test_pending_later_buy_never_replaces_active_plan(db_session, test_user) -> None:
    service, account, position, _, _ = await _exit_fixture(db_session, test_user, remaining=100)
    active_buy_id = position.active_plan_buy_order_id
    await _qualifying_plan(
        db_session, account, test_user, stop=95, target=125, status=OrderStatus.PENDING,
    )

    refreshed = await service._bootstrap_plan(test_user.id, account.id, position)

    assert refreshed is True
    assert position.active_plan_buy_order_id == active_buy_id



@pytest.mark.asyncio
async def test_enter_bootstraps_existing_positive_holding_plan(
    db_session, test_user,
) -> None:
    service, account, position, sell, progress = await _exit_fixture(db_session, test_user, remaining=100)
    sell.status = "pending"
    await db_session.delete(progress)
    db_session.add(Cap7Progress(
        user_id=test_user.id,
        entered_at=datetime.now(UTC),
        graduated_at=datetime.now(UTC),
    ))
    position.active_plan_buy_order_id = None
    position.active_original_stop_vnd = None
    position.active_original_take_profit_vnd = None
    qualified_buy = await _qualifying_plan(db_session, account, test_user, stop=95, target=125)

    await service.enter(test_user.id)

    assert position.active_plan_buy_order_id == qualified_buy.id
    assert position.active_original_stop_vnd == 95
    assert position.active_original_take_profit_vnd == 125


@pytest.mark.asyncio
async def test_bootstrap_clears_plan_from_a_closed_holding_cycle(
    db_session, test_user,
) -> None:
    service, account, position, sell, _ = await _exit_fixture(db_session, test_user, remaining=100)
    qualified_buy = await _qualifying_plan(db_session, account, test_user, stop=95, target=125)
    position.active_plan_buy_order_id = qualified_buy.id
    position.active_original_stop_vnd = 95
    position.active_original_take_profit_vnd = 125
    sell.position_quantity_after_fill = 0
    sell.exit_snapshot_at = datetime.now(UTC)
    sell.updated_at = sell.exit_snapshot_at
    await db_session.flush()

    found = await service._bootstrap_plan(test_user.id, account.id, position)

    assert found is False
    assert position.active_plan_buy_order_id is None
    assert position.active_original_stop_vnd is None
    assert position.active_original_take_profit_vnd is None

@pytest.mark.asyncio
async def test_dynamic_stop_requires_entering_level8_and_locks_in_profit(db_session, test_user, monkeypatch) -> None:
    service, _, position, _, progress = await _exit_fixture(db_session, test_user, remaining=100)
    monkeypatch.setattr(
        service._trading,
        "get_portfolio",
        lambda _user_id: __import__("asyncio").sleep(
            0, result={"positions": [{"symbol": "VCB", "current_price_vnd": 120}]}
        ),
    )
    await db_session.delete(progress)
    await db_session.flush()

    with pytest.raises(NotFoundError):
        await service.set_dynamic_stop(test_user.id, "VCB", 110)

    db_session.add(Cap8Progress(user_id=test_user.id, entered_at=datetime(2026, 1, 1, tzinfo=UTC)))
    await db_session.flush()
    with pytest.raises(BadRequestError):
        await service.set_dynamic_stop(test_user.id, "VCB", position.avg_cost_vnd)


@pytest.mark.asyncio
async def test_sync_plan_requires_level8_progress(db_session, test_user) -> None:
    service, _, position, _, progress = await _exit_fixture(db_session, test_user, remaining=100)
    await db_session.delete(progress)
    await db_session.flush()

    with pytest.raises(NotFoundError):
        await service.sync_plan(test_user.id, "VCB", position.active_plan_buy_order_id)


@pytest.mark.asyncio
async def test_exit_context_requires_level8_progress(db_session, test_user, monkeypatch) -> None:
    service, _, _, _, progress = await _exit_fixture(db_session, test_user, remaining=100)
    await db_session.delete(progress)
    await db_session.flush()
    monkeypatch.setattr(
        service._trading,
        "get_portfolio",
        lambda _user_id: __import__("asyncio").sleep(
            0, result={"positions": [{"symbol": "VCB", "current_price_vnd": 100}]}
        ),
    )
    monkeypatch.setattr(
        service._portfolio_balance,
        "get_snapshot",
        lambda _user_id: __import__("asyncio").sleep(
            0, result=SimpleNamespace(model_dump=lambda **_kwargs: {})
        ),
    )

    with pytest.raises(NotFoundError):
        await service.exit_context(test_user.id, "VCB")



@pytest.mark.asyncio
async def test_exit_context_keeps_dynamic_stop_available_when_t2_position_is_unsellable(
    db_session, test_user, monkeypatch,
) -> None:
    service, _, position, _, _ = await _exit_fixture(db_session, test_user, remaining=100)
    position.quantity_sellable = 0
    monkeypatch.setattr(
        service._trading,
        "get_portfolio",
        lambda _user_id: __import__("asyncio").sleep(
            0, result={"positions": [{"symbol": "VCB", "current_price_vnd": 120}]},
        ),
    )
    monkeypatch.setattr(
        service._portfolio_balance,
        "get_snapshot",
        lambda _user_id: __import__("asyncio").sleep(
            0, result=SimpleNamespace(model_dump=lambda **_kwargs: {"can_doi_ok": False}),
        ),
    )

    context = await service.exit_context(test_user.id, "VCB")

    assert context["quantity_sellable"] == 0
    assert context["proposed_sale_quantity"] == 0
    assert context["can_update_dynamic_stop"] is True
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
    assert first["effective_stop_vnd"] == 90
    assert duplicate["id"] == first["id"]
    assert progress.so_lenh_thoat_dung_ke_hoach == 1


@pytest.mark.asyncio
async def test_progress_reconciles_a_later_limit_sell_fill_once_using_lowercase_status(
    db_session, test_user,
) -> None:
    service, _, _, sell, progress = await _exit_fixture(db_session, test_user)
    sell.side = "sell"
    sell.status = "filled"
    sell.order_type = OrderType.LIMIT
    await db_session.flush()

    first = await service.get_progress(test_user.id)
    second = await service.get_progress(test_user.id)

    assert first is not None
    assert first["so_lenh_thoat_dung_ke_hoach"] == 1
    assert second is not None
    assert second["so_lenh_thoat_dung_ke_hoach"] == 1
    assert progress.so_lenh_thoat_dung_ke_hoach == 1
    assert (await db_session.execute(
        select(func.count(Cap8Exit.id)).where(Cap8Exit.sell_order_id == sell.id)
    )).scalar_one() == 1


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
    assert original["effective_stop_vnd"] == 90


@pytest.mark.asyncio
async def test_original_stop_ignores_crossings_before_matched_buy_activation(
    db_session, test_user, monkeypatch,
) -> None:
    service, _, position, sell, _ = await _exit_fixture(db_session, test_user, sell_price=90)
    buy = (await db_session.get(VirtualOrder, position.active_plan_buy_order_id))
    assert buy is not None
    buy.trading_date = date(2024, 1, 10)  # requested date is not fill evidence
    sell.trading_date = date(2024, 1, 11)
    buy.updated_at = datetime(2026, 1, 10, 10, tzinfo=UTC)
    sell.exit_snapshot_at = datetime(2026, 1, 11, 10, tzinfo=UTC)
    sell.exit_plan_activated_at = buy.updated_at
    sell.updated_at = datetime(2026, 1, 11, 10, tzinfo=UTC)
    monkeypatch.setattr(
        service,
        "_history",
        lambda _symbol: __import__("asyncio").sleep(
            0,
            result=[
                (date(2026, 1, 5), 89.0),
                (date(2026, 1, 10), 91.0),
                (date(2026, 1, 11), 89.0),
            ],
        ),
    )

    result = await service.record_exit(test_user.id, sell.id)

    assert result["dung_ke_hoach"] is True
    assert result["classification_reason"] == "timely_original_stop_exit"


@pytest.mark.asyncio
async def test_exit_evidence_uses_sell_fill_quantity_snapshot_not_later_position(
    db_session, test_user,
) -> None:
    service, _, _, sell, _ = await _exit_fixture(db_session, test_user, remaining=0)
    sell.position_quantity_before_fill = 200
    sell.position_quantity_after_fill = 100

    result = await service.record_exit(test_user.id, sell.id)

    assert result["exit_method"] == "partial"
    assert result["remaining_position_pct"] == 50


@pytest.mark.asyncio
async def test_delayed_exit_evidence_uses_plan_captured_at_sell_fill(
    db_session, test_user,
) -> None:
    service, account, position, sell, _ = await _exit_fixture(db_session, test_user, sell_price=120)
    later_buy = await _qualifying_plan(db_session, account, test_user, stop=95, target=130)
    await service._bootstrap_plan(test_user.id, account.id, position)
    assert position.active_plan_buy_order_id == later_buy.id

    result = await service.record_exit(test_user.id, sell.id)

    assert result["matched_buy_order_id"] != later_buy.id
    assert result["original_take_profit_vnd"] == 110
    assert result["dung_ke_hoach"] is True
    assert result["classification_reason"] == "take_profit_hit"


@pytest.mark.asyncio
async def test_legacy_sell_without_execution_snapshot_is_unknown_and_cannot_count(
    db_session, test_user,
) -> None:
    service, _, position, sell, _ = await _exit_fixture(db_session, test_user, sell_price=120)
    sell.exit_snapshot_at = None
    sell.position_quantity_before_fill = None
    sell.position_quantity_after_fill = None
    sell.exit_matched_buy_order_id = None
    sell.exit_original_stop_vnd = None
    sell.exit_original_take_profit_vnd = None
    sell.exit_dynamic_stop_vnd = None
    sell.exit_dynamic_stop_set_at = None
    sell.exit_avg_cost_vnd = None
    sell.exit_plan_activated_at = None
    position.active_original_take_profit_vnd = 110

    result = await service.record_exit(test_user.id, sell.id)

    assert result["exit_method"] == "unknown"
    assert result["dung_ke_hoach"] is False
    assert result["classification_reason"] == "missing_execution_snapshot"
    assert result["effective_stop_vnd"] is None


@pytest.mark.asyncio
async def test_timely_trailing_stop_exit_counts(db_session, test_user, monkeypatch) -> None:
    service, _, position, sell, _ = await _exit_fixture(db_session, test_user, sell_price=105)
    position.active_dynamic_stop_vnd = 105
    position.active_dynamic_stop_set_at = datetime(2026, 1, 5, tzinfo=UTC)
    sell.exit_dynamic_stop_vnd = 105
    sell.exit_dynamic_stop_set_at = position.active_dynamic_stop_set_at
    monkeypatch.setattr(
        service,
        "_history",
        lambda _symbol: __import__("asyncio").sleep(
            0,
            result=[
                (date(2026, 1, 5), 110.0),
                (date(2026, 1, 6), 104.0),
            ],
        ),
    )
    trailing = await service.record_exit(test_user.id, sell.id)
    assert trailing["dung_ke_hoach"] is True
    assert trailing["exit_method"] == "trailing_hit"
    assert trailing["classification_reason"] == "timely_trailing_stop_exit"
    assert trailing["effective_stop_vnd"] == 105


@pytest.mark.asyncio
async def test_dynamic_stop_rejects_unprofitable_or_nonraising_values(
    db_session, test_user, monkeypatch
) -> None:
    service, _, position, _, _ = await _exit_fixture(db_session, test_user, remaining=100)
    monkeypatch.setattr(
        service._trading,
        "get_portfolio",
        lambda _user_id: __import__("asyncio").sleep(
            0,
            result={"positions": [{"symbol": "VCB", "current_price_vnd": 100}]},
        ),
    )
    with pytest.raises(BadRequestError):
        await service.set_dynamic_stop(test_user.id, "VCB", 90)
    monkeypatch.setattr(
        service._trading,
        "get_portfolio",
        lambda _user_id: __import__("asyncio").sleep(
            0,
            result={"positions": [{"symbol": "VCB", "current_price_vnd": 120}]},
        ),
    )
    with pytest.raises(BadRequestError):
        await service.set_dynamic_stop(test_user.id, "VCB", 90)
    saved = await service.set_dynamic_stop(test_user.id, "VCB", 110)
    assert saved["dynamic_stop_vnd"] == 110
    assert position.active_dynamic_stop_vnd == 110


@pytest.mark.asyncio
async def test_fifth_compliant_exit_unlocks_terminal_graduation(db_session, test_user) -> None:
    service, account, _, fixture_sell, progress = await _exit_fixture(db_session, test_user)
    fixture_sell.status = OrderStatus.PENDING
    await db_session.flush()

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
