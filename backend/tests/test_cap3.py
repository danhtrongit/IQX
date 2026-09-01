"""Focused behavior tests for Cấp 3's two concurrent sizing-confidence tasks."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from app.core.exceptions import BadRequestError, ConflictError
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap0.service import Cap0Service
from app.services.cap1.service import Cap1Service
from app.services.cap2.service import Cap2Service
from app.services.cap3.service import Cap3Service


async def _make_order(db_session, account_id, user_id, *, symbol: str, side: OrderSide, price: int = 20_000):
    quantity = 100
    gross = quantity * price
    order = VirtualOrder(
        account_id=account_id,
        user_id=user_id,
        symbol=symbol,
        mode="thuc_chien",
        side=side,
        order_type=OrderType.MARKET,
        status=OrderStatus.FILLED,
        quantity=quantity,
        filled_price_vnd=price,
        gross_amount_vnd=gross,
        fee_vnd=0,
        tax_vnd=0,
        net_amount_vnd=-gross if side == OrderSide.BUY else gross,
        trading_date=date.today(),
    )
    db_session.add(order)
    await db_session.flush()
    return order


async def _graduate_to_cap3(db_session, user_id):
    cap0 = Cap0Service(db_session)
    await cap0.enter(user_id)
    for task_no in (1, 2, 3):
        await cap0.complete_task(user_id, task_no)
    await cap0.complete_task(user_id, 4, gate="debrief")
    await cap0.graduate(user_id)

    cap1 = Cap1Service(db_session)
    await cap1.enter(user_id)
    repo = VirtualTradingRepository(db_session)
    account = await repo.get_account_by_user_id(user_id)
    reasons = ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]
    for index in range(10):
        buy = await _make_order(db_session, account.id, user_id, symbol=f"L1{index}", side=OrderSide.BUY)
        await cap1.record_kehoach(
            user_id,
            buy.id,
            ly_do=reasons[index % len(reasons)],
            trang_thai_luc_dat="ung_ho",
            vung_mua=20_000,
        )
    sell = await _make_order(db_session, account.id, user_id, symbol="L10", side=OrderSide.SELL, price=21_000)
    await cap1.record_ketso(user_id, sell.id)
    await cap1.graduate(user_id)

    cap2 = Cap2Service(db_session)
    await cap2.enter(user_id)
    for index in range(10):
        buy = await _make_order(db_session, account.id, user_id, symbol=f"L2{index}", side=OrderSide.BUY)
        await cap1.record_kehoach(
            user_id,
            buy.id,
            ly_do="ky_thuat",
            trang_thai_luc_dat="ung_ho",
            vung_mua=20_000,
        )
        await cap2.record_kehoach(
            user_id,
            buy.id,
            phuong_phap_sl_tp="bien_do_dao_dong",
            cat_lo=18_000,
            chot_loi=25_000,
        )
    await cap2.graduate(user_id)

    cap3 = Cap3Service(db_session)
    await cap3.enter(user_id)
    await cap3.set_khau_vi(user_id, "can_bang")
    return cap1, cap3, account


async def _record_qualified_plan(
    db_session,
    cap1: Cap1Service,
    cap3: Cap3Service,
    account_id,
    user_id,
    *,
    symbol: str,
    confidence: int,
):
    buy = await _make_order(db_session, account_id, user_id, symbol=symbol, side=OrderSide.BUY)
    await cap1.record_kehoach(
        user_id,
        buy.id,
        ly_do="ky_thuat",
        trang_thai_luc_dat="ung_ho",
        vung_mua=20_000,
    )
    await cap3.record_kehoach(
        user_id,
        buy.id,
        khau_vi="can_bang",
        muc_tu_tin=confidence,
        cach_khoi_luong="linh_hoat",
        khoi_luong=100,
        pct_von=20.0,
    )
    return buy


@pytest.mark.asyncio
async def test_nine_qualified_plans_do_not_complete_sizing_task(db_session, test_user):
    cap1, cap3, account = await _graduate_to_cap3(db_session, test_user.id)

    for index in range(9):
        await _record_qualified_plan(
            db_session, cap1, cap3, account.id, test_user.id, symbol=f"Q{index}", confidence=1
        )

    progress = await cap3.get_progress(test_user.id)
    assert progress is not None
    assert progress.so_lenh_quan_ly_von == 9
    assert progress.muc_tu_tin_da_dung == [1]
    assert progress.so_muc_tu_tin_da_dung == 1
    assert progress.task_1_done_at is None
    assert progress.task_2_done_at is None


@pytest.mark.asyncio
async def test_tenth_qualified_plan_completes_only_sizing_task_without_all_confidence_levels(
    db_session, test_user
):
    cap1, cap3, account = await _graduate_to_cap3(db_session, test_user.id)

    for index in range(10):
        await _record_qualified_plan(
            db_session,
            cap1,
            cap3,
            account.id,
            test_user.id,
            symbol=f"Q{index}",
            confidence=1 if index < 9 else 2,
        )

    progress = await cap3.get_progress(test_user.id)
    assert progress is not None
    assert progress.so_lenh_quan_ly_von == 10
    assert progress.muc_tu_tin_da_dung == [1, 2]
    assert progress.task_1_done_at is not None
    assert progress.task_2_done_at is None


@pytest.mark.asyncio
async def test_all_three_confidence_levels_complete_coverage_task_independently(db_session, test_user):
    cap1, cap3, account = await _graduate_to_cap3(db_session, test_user.id)

    for confidence in (1, 2, 3):
        await _record_qualified_plan(
            db_session,
            cap1,
            cap3,
            account.id,
            test_user.id,
            symbol=f"C{confidence}",
            confidence=confidence,
        )

    progress = await cap3.get_progress(test_user.id)
    assert progress is not None
    assert progress.so_lenh_quan_ly_von == 3
    assert progress.muc_tu_tin_da_dung == [1, 2, 3]
    assert progress.so_muc_tu_tin_da_dung == 3
    assert progress.task_1_done_at is None
    assert progress.task_2_done_at is not None


@pytest.mark.asyncio
async def test_profit_does_not_complete_either_level3_task(db_session, test_user):
    cap1, cap3, account = await _graduate_to_cap3(db_session, test_user.id)
    buy = await _make_order(db_session, account.id, test_user.id, symbol="PNL", side=OrderSide.BUY)
    await cap1.record_kehoach(
        test_user.id,
        buy.id,
        ly_do="ky_thuat",
        trang_thai_luc_dat="ung_ho",
        vung_mua=20_000,
    )
    sell = await _make_order(db_session, account.id, test_user.id, symbol="PNL", side=OrderSide.SELL, price=25_000)
    await cap1.record_ketso(test_user.id, sell.id)

    progress = await cap3.get_progress(test_user.id)
    assert progress is not None
    assert progress.lai_pct_cap3 > 0
    assert progress.so_lenh_quan_ly_von == 0
    assert progress.task_1_done_at is None
    assert progress.task_2_done_at is None


@pytest.mark.asyncio
async def test_task_recompute_rejects_removed_third_task(db_session, test_user):
    _, cap3, _ = await _graduate_to_cap3(db_session, test_user.id)

    with pytest.raises(BadRequestError, match="task_no không hợp lệ"):
        await cap3.mark_task(test_user.id, 3)


def test_legacy_challenge_route_is_not_registered():
    from app.api.v1.endpoints.cap3 import router

    assert not any(route.path.endswith("/thach-thuc") for route in router.routes)


@pytest.mark.asyncio
async def test_graduation_requires_both_independent_task_stamps(db_session, test_user):
    cap1, cap3, account = await _graduate_to_cap3(db_session, test_user.id)

    for index in range(10):
        await _record_qualified_plan(
            db_session,
            cap1,
            cap3,
            account.id,
            test_user.id,
            symbol=f"G{index}",
            confidence=(index % 3) + 1,
        )

    progress = await cap3.get_progress(test_user.id)
    assert progress is not None
    assert progress.task_1_done_at is not None
    assert progress.task_2_done_at is not None

    graduated = await cap3.graduate(test_user.id)
    assert graduated.graduated_at is not None
    assert graduated.time_to_graduate_hours is not None


@pytest.mark.asyncio
async def test_graduate_returns_existing_graduate_without_new_task_evidence(db_session, test_user):
    _, cap3, _ = await _graduate_to_cap3(db_session, test_user.id)
    progress = await cap3.get_progress(test_user.id)
    assert progress is not None
    preserved_graduated_at = datetime(2026, 8, 1, tzinfo=UTC)
    progress.graduated_at = preserved_graduated_at
    progress.time_to_graduate_hours = 72.5
    await db_session.flush()

    result = await cap3.graduate(test_user.id)

    assert result.graduated_at == preserved_graduated_at
    assert result.time_to_graduate_hours == 72.5
    assert result.task_1_done_at is None
    assert result.task_2_done_at is None


@pytest.mark.asyncio
async def test_graduate_rejects_when_confidence_coverage_is_incomplete(db_session, test_user):
    cap1, cap3, account = await _graduate_to_cap3(db_session, test_user.id)
    for index in range(10):
        await _record_qualified_plan(
            db_session, cap1, cap3, account.id, test_user.id, symbol=f"I{index}", confidence=1
        )

    with pytest.raises(ConflictError, match="2 nhiệm vụ"):
        await cap3.graduate(test_user.id)
