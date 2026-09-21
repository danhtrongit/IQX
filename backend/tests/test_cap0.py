"""Cấp 0 trading evidence, optional product tours and graduation."""

from datetime import date

import pytest

from app.core.exceptions import BadRequestError, ConflictError
from app.models.cap0 import LY_DO_DOI_THUONG_LABELS
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap0.service import Cap0Service


async def _order(db, account_id, user_id, side=OrderSide.BUY):
    price = 20_000
    quantity = 100
    gross = price * quantity
    row = VirtualOrder(
        account_id=account_id,
        user_id=user_id,
        symbol="VNM",
        mode="san_tap",
        side=side,
        order_type=OrderType.MARKET,
        status=OrderStatus.FILLED,
        quantity=quantity,
        filled_price_vnd=price,
        gross_amount_vnd=gross,
        fee_vnd=0,
        tax_vnd=0,
        net_amount_vnd=-gross if side == OrderSide.BUY else gross,
        trading_date=date(2026, 1, 5),
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def _start(db, user_id):
    service = Cap0Service(db)
    progress = await service.enter(user_id)
    placement = await service.set_placement(user_id, answer="never")
    account = await VirtualTradingRepository(db).get_account_by_user_id(user_id)
    return service, progress, placement, account


@pytest.mark.asyncio
async def test_enter_seeds_100m_and_is_idempotent(db_session, test_user):
    service, progress, _, account = await _start(db_session, test_user.id)
    assert progress.virtual_balance_init == 100_000_000
    assert account.initial_cash_vnd == 100_000_000
    assert (await service.enter(test_user.id)).id == progress.id


@pytest.mark.asyncio
async def test_three_placement_answers_map_to_levels(db_session, test_user):
    service = Cap0Service(db_session)
    assert (await service.set_placement(test_user.id, answer="never")).placed_level == 0
    assert (await service.set_placement(test_user.id, answer="unsure")).placed_level == 1
    placement = await service.set_placement(test_user.id, answer="regular")
    assert placement.placed_level == 2
    assert placement.experience.value == "regular"


@pytest.mark.asyncio
async def test_task1_requires_filled_planned_buy_and_star(db_session, test_user):
    service, _, _, account = await _start(db_session, test_user.id)
    with pytest.raises(BadRequestError):
        await service.complete_task(test_user.id, 1)
    buy = await _order(db_session, account.id, test_user.id)
    await service.record_kehoach(
        test_user.id, buy.id, ly_do_doi_thuong="thu_cho_biet"
    )
    progress = await service.complete_task(test_user.id, 1, gate="star")
    assert progress.task_1_done_at is not None
    assert progress.task1_star_clicked is True


@pytest.mark.asyncio
async def test_tours_are_persisted_and_complete_tasks_2_to_4(db_session, test_user):
    service, _, _, account = await _start(db_session, test_user.id)
    with pytest.raises(ConflictError):
        await service.complete_tour(test_user.id, "phantich")
    buy = await _order(db_session, account.id, test_user.id)
    await service.record_kehoach(test_user.id, buy.id, ly_do_doi_thuong="thu_cho_biet")
    await service.complete_task(test_user.id, 1, gate="star")
    for tour in ("phantich", "bantin", "bctc"):
        placement, completed = await service.complete_tour(test_user.id, tour)
    progress = await service.get_progress(test_user.id)
    assert completed == ["phantich", "bantin", "bctc"]
    assert placement.da_xem_tour is True
    assert all(getattr(progress, f"task_{n}_done_at") for n in (2, 3, 4))


@pytest.mark.asyncio
async def test_graduation_requires_task5_sell_and_debrief(db_session, test_user):
    service, _, _, account = await _start(db_session, test_user.id)
    buy = await _order(db_session, account.id, test_user.id)
    await service.record_kehoach(test_user.id, buy.id, ly_do_doi_thuong="thu_cho_biet")
    await service.complete_task(test_user.id, 1, gate="star")
    with pytest.raises(ConflictError):
        await service.graduate(test_user.id)
    with pytest.raises(ConflictError):
        await service.complete_task(test_user.id, 5, gate="debrief")
    await _order(db_session, account.id, test_user.id, side=OrderSide.SELL)
    with pytest.raises(BadRequestError):
        await service.complete_task(test_user.id, 5)
    progress = await service.complete_task(test_user.id, 5, gate="debrief")
    assert progress.task5_debrief_done is True
    assert all(getattr(progress, f"task_{n}_done_at") is None for n in (2, 3, 4))
    graduated = await service.graduate(test_user.id)
    assert graduated.graduated_at is not None
    assert (await service.get_placement(test_user.id)).da_xem_tour is True
    assert (await service.graduate(test_user.id)).graduated_at == graduated.graduated_at


def test_everyday_reason_contract_has_exactly_five_chips():
    assert len(LY_DO_DOI_THUONG_LABELS) == 5
    assert set(reason.value for reason in LY_DO_DOI_THUONG_LABELS) == {
        "cong_ty_toi_biet",
        "nguoi_quen_gioi_thieu",
        "thay_tren_mang",
        "gia_dang_tang",
        "thu_cho_biet",
    }
