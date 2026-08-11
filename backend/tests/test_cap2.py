"""Tests for the Cấp 2 «Kỷ luật» backend — progression, cắt lỗ/chốt lời, đo
lường 4 vi phạm kỷ luật, chuỗi lệnh kỷ luật, điểm kỷ luật, 5 nhiệm vụ, graduation.

Mirrors ``tests/test_cap1.py``'s style. Uses the ``test_user``/``db_session``
fixtures from ``tests/conftest.py``.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap0.service import Cap0Service
from app.services.cap1.service import Cap1Service
from app.services.cap2.service import Cap2Service


async def _graduate_cap0(db_session, user_id) -> None:
    cap0 = Cap0Service(db_session)
    await cap0.enter(user_id)
    # Cấp 0: 4 nhiệm vụ, 1 cổng hành vi (đóng Kết sổ ở ④). ② và ③ chỉ tính
    # sau ①, nên vòng lặp phải chạy đúng thứ tự ①②③.
    for n in (1, 2, 3):
        await cap0.complete_task(user_id, n)
    await cap0.complete_task(user_id, 4, gate="debrief")
    await cap0.graduate(user_id)


async def _make_order(
    db_session,
    account_id,
    user_id,
    *,
    symbol: str = "AAA",
    side: OrderSide = OrderSide.BUY,
    qty: int = 100,
    price: int = 20_000,
    trading_date: date | None = None,
    mode: str = "thuc_chien",
    status: OrderStatus = OrderStatus.FILLED,
) -> VirtualOrder:
    trading_date = trading_date or date(2026, 1, 5)
    gross = price * qty
    net = -gross if side == OrderSide.BUY else gross
    order = VirtualOrder(
        account_id=account_id,
        user_id=user_id,
        symbol=symbol,
        mode=mode,
        side=side,
        order_type=OrderType.MARKET,
        status=status,
        quantity=qty,
        filled_price_vnd=price if status == OrderStatus.FILLED else None,
        gross_amount_vnd=gross if status == OrderStatus.FILLED else None,
        fee_vnd=0,
        tax_vnd=0,
        net_amount_vnd=net if status == OrderStatus.FILLED else None,
        trading_date=trading_date,
    )
    db_session.add(order)
    await db_session.flush()
    await db_session.refresh(order)
    return order


async def _graduate_cap1(db_session, user_id) -> None:
    """Fast-track a user through Cấp 0 + Cấp 1 graduation (setup helper)."""
    await _graduate_cap0(db_session, user_id)
    cap1 = Cap1Service(db_session)
    await cap1.enter(user_id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(user_id)

    ly_dos = ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]
    for i in range(10):
        ld = ly_dos[i % 5]
        order = await _make_order(db_session, account.id, user_id, symbol=f"G{i}")
        await cap1.record_kehoach(
            user_id, order.id, ly_do=ld, trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )
    sell = await _make_order(
        db_session, account.id, user_id, symbol="G0", side=OrderSide.SELL,
        qty=100, price=21_000, trading_date=date(2026, 1, 8),
    )
    await cap1.record_ketso(user_id, sell.id)
    await cap1.record_portfolio_view(user_id, as_of=date(2026, 1, 10))
    await cap1.record_portfolio_view(user_id, as_of=date(2026, 1, 11))
    await cap1.record_portfolio_view(user_id, as_of=date(2026, 1, 12))
    await cap1.graduate(user_id)


async def _round_trip(
    db_session,
    cap1: Cap1Service,
    cap2: Cap2Service,
    account_id,
    user_id,
    *,
    symbol: str,
    buy_price: int = 20_000,
    sell_price: int = 20_000,
    trading_date: date,
    phuong_phap_sl_tp: str = "bien_do_dao_dong",
    cat_lo: int = 18_000,
    chot_loi: int = 25_000,
    **vi_pham_flags,
):
    """Full Cấp 2 round trip: buy w/ kế hoạch (Cấp1 + Cấp2 SL/TP) → sell w/
    kết sổ (Cấp1 pnl + Cấp2 vi phạm flags). Returns the (kehoach, ketso) rows."""
    buy = await _make_order(
        db_session, account_id, user_id, symbol=symbol, side=OrderSide.BUY,
        price=buy_price, trading_date=trading_date,
    )
    await cap1.record_kehoach(
        user_id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=buy_price,
    )
    kehoach = await cap2.record_kehoach(
        user_id, buy.id,
        phuong_phap_sl_tp=phuong_phap_sl_tp, cat_lo=cat_lo, chot_loi=chot_loi,
    )
    sell = await _make_order(
        db_session, account_id, user_id, symbol=symbol, side=OrderSide.SELL,
        price=sell_price, trading_date=trading_date,
    )
    await cap1.record_ketso(user_id, sell.id)
    ketso = await cap2.record_ketso(user_id, sell.id, **vi_pham_flags)
    return kehoach, ketso


@pytest.mark.asyncio
async def test_enter_requires_cap1_graduated(db_session, test_user):
    svc = Cap2Service(db_session)

    # No Cấp 1 progress at all.
    with pytest.raises(NotFoundError):
        await svc.enter(test_user.id)

    # Entered Cấp 1 but not graduated.
    await _graduate_cap0(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    await cap1.enter(test_user.id)
    with pytest.raises(ConflictError):
        await svc.enter(test_user.id)

    # Graduate Cấp 1 → enter Cấp 2 succeeds.
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    ly_dos = ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]
    for i in range(10):
        ld = ly_dos[i % 5]
        order = await _make_order(db_session, account.id, test_user.id, symbol=f"G{i}")
        await cap1.record_kehoach(
            test_user.id, order.id, ly_do=ld, trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )
    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="G0", side=OrderSide.SELL,
        qty=100, price=21_000, trading_date=date(2026, 1, 8),
    )
    await cap1.record_ketso(test_user.id, sell.id)
    await cap1.record_portfolio_view(test_user.id, as_of=date(2026, 1, 10))
    await cap1.record_portfolio_view(test_user.id, as_of=date(2026, 1, 11))
    await cap1.record_portfolio_view(test_user.id, as_of=date(2026, 1, 12))
    await cap1.graduate(test_user.id)

    progress = await svc.enter(test_user.id)
    assert progress.user_id == test_user.id
    assert progress.graduated_at is None
    assert progress.chuoi_current == 0

    # idempotent
    progress2 = await svc.enter(test_user.id)
    assert progress2.id == progress.id


@pytest.mark.asyncio
async def test_record_kehoach_requires_existing_cap1_row(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    with pytest.raises(NotFoundError):
        await cap2.record_kehoach(
            test_user.id, buy.id,
            phuong_phap_sl_tp="bien_do_dao_dong", cat_lo=18_000, chot_loi=25_000,
        )


@pytest.mark.asyncio
async def test_record_kehoach_adds_sl_tp_to_existing_row(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    kehoach_1 = await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )

    kehoach_2 = await cap2.record_kehoach(
        test_user.id, buy.id,
        phuong_phap_sl_tp="ho_tro_khang_cu", cat_lo=19_000, chot_loi=23_000,
    )
    assert kehoach_2.id == kehoach_1.id  # same row, extended in place
    assert kehoach_2.lyDo.value == "ky_thuat"  # Cấp 1 fields untouched
    assert kehoach_2.phuong_phap_sl_tp.value == "ho_tro_khang_cu"
    assert kehoach_2.cat_lo == 19_000
    assert kehoach_2.chot_loi == 23_000


@pytest.mark.asyncio
async def test_record_kehoach_rejects_invalid_method_and_bad_values(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )

    with pytest.raises(BadRequestError):
        await cap2.record_kehoach(
            test_user.id, buy.id, phuong_phap_sl_tp="tuy_chon", cat_lo=1, chot_loi=2,
        )
    with pytest.raises(BadRequestError):
        await cap2.record_kehoach(
            test_user.id, buy.id, phuong_phap_sl_tp="bien_do_dao_dong", cat_lo=0, chot_loi=2,
        )


@pytest.mark.asyncio
async def test_record_kehoach_rejects_sell_order(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    sell_order = await _make_order(db_session, account.id, test_user.id, side=OrderSide.SELL)

    with pytest.raises(BadRequestError):
        await cap2.record_kehoach(
            test_user.id, sell_order.id,
            phuong_phap_sl_tp="bien_do_dao_dong", cat_lo=1, chot_loi=2,
        )


@pytest.mark.asyncio
async def test_record_ketso_requires_existing_cap1_row_and_persists_flags(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="AAA", side=OrderSide.SELL, price=22_000,
    )

    with pytest.raises(NotFoundError):
        await cap2.record_ketso(test_user.id, sell.id, nhoi_lenh_khi_lo=True)

    await cap1.record_ketso(test_user.id, sell.id)
    ketso = await cap2.record_ketso(
        test_user.id, sell.id,
        cham_sl_khong_cat=True, giu_cham_sl_bao_nhieu_phien=2,
    )
    assert ketso.cham_SL_khong_cat is True
    assert ketso.giu_cham_SL_bao_nhieu_phien == 2
    assert ketso.nhoi_lenh_khi_lo is False  # untouched flags default false
    assert ketso.pnl_vnd == 200_000  # Cấp 1 fields untouched


@pytest.mark.asyncio
async def test_chuoi_increments_then_resets_on_violation(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    for i in range(3):
        _, ketso = await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"C{i}", trading_date=date(2026, 2, 1 + i),
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.chuoi_current == 3
    assert progress.chuoi_record == 3
    assert progress.last_chuoi_reset_at is None

    # A violating round trip resets the streak.
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="CV", trading_date=date(2026, 2, 5), cham_sl_khong_cat=True,
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.chuoi_current == 0
    assert progress.chuoi_record == 3  # record preserved
    assert progress.last_chuoi_reset_at is not None

    # Streak builds again from 0 after the reset.
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="C4", trading_date=date(2026, 2, 6),
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.chuoi_current == 1


@pytest.mark.asyncio
async def test_task1_done_at_5_streak_and_persists_after_later_reset(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    for i in range(4):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"T{i}", trading_date=date(2026, 3, 1 + i),
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_1_done_at is None  # only 4/5 so far

    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="T4", trading_date=date(2026, 3, 5),
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    first_done_at = progress.task_1_done_at

    # A later violation resets chuỗi but must NOT un-stamp task ①.
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="T5", trading_date=date(2026, 3, 6), ban_som_khi_lo_nhe=True,
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_1_done_at == first_done_at
    assert progress.chuoi_current == 0


@pytest.mark.asyncio
async def test_task3_not_done_until_task1_done_even_with_zero_nhoi(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    # 2 clean round trips — 0 nhồi so far, but ① (streak 5) not yet done.
    for i in range(2):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"N{i}", trading_date=date(2026, 4, 1 + i),
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_1_done_at is None
    assert progress.task_3_done_at is None  # gated behind ①


@pytest.mark.asyncio
async def test_task2_needs_5_cham_sl_cat_dung_in_last_15(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    # First reach ① (5 clean round trips).
    for i in range(5):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"S{i}", trading_date=date(2026, 5, 1 + i),
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    assert progress.task_2_done_at is None

    # 4 more with cham_SL_cat_dung_phien_ke=True — still short of 5.
    for i in range(4):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"S{5 + i}", trading_date=date(2026, 5, 6 + i),
            cham_sl_cat_dung_phien_ke=True,
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_2_done_at is None

    # 5th cắt lỗ đúng phiên → task ② done.
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="S9", trading_date=date(2026, 5, 10),
        cham_sl_cat_dung_phien_ke=True,
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_2_done_at is not None


@pytest.mark.asyncio
async def test_task4_needs_3_chot_loi_dung_in_last_15(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    for i in range(5):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"P{i}", trading_date=date(2026, 6, 1 + i),
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    assert progress.task_4_done_at is None

    # 2 lệnh chạm chốt lời và bán đúng phiên (gia_ra >= chot_loi, không hụt).
    for i in range(2):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"P{5 + i}", trading_date=date(2026, 6, 6 + i),
            buy_price=20_000, sell_price=25_500, chot_loi=25_000,
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_4_done_at is None  # only 2/3

    # 3rd one → task ④ done.
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="P9", trading_date=date(2026, 6, 10),
        buy_price=20_000, sell_price=25_500, chot_loi=25_000,
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_4_done_at is not None


@pytest.mark.asyncio
async def test_task4_not_counted_when_held_past_target(db_session, test_user):
    """cham_TP_giu_lam_hut=True means the target WAS touched but the user held
    on and gave the gain back — must NOT count as chốt lời đúng even if the
    eventual gia_ra still cleared the target."""
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    for i in range(5):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"H{i}", trading_date=date(2026, 7, 1 + i),
        )
    for i in range(3):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"H{5 + i}", trading_date=date(2026, 7, 6 + i),
            buy_price=20_000, sell_price=25_500, chot_loi=25_000,
            cham_tp_giu_lam_hut=True,
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_4_done_at is None


@pytest.mark.asyncio
async def test_task5_needs_20_orders(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    day0 = date(2026, 8, 1)
    # 19 clean round trips: task ⑤ unlock condition (>=20 orders) not yet met,
    # even though 0 vi phạm easily satisfies the <=2 threshold.
    for i in range(19):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"W{i}", trading_date=day0 + timedelta(days=i),
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_5_done_at is None

    # 20th round trip → window now has exactly 20 → task ⑤ done (0 vi phạm).
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="W19", trading_date=day0 + timedelta(days=19),
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_5_done_at is not None


@pytest.mark.asyncio
async def test_task5_threshold_exact(db_session, test_user):
    """Directly engineer a 20-order window with exactly 3 vs exactly 2 vi phạm."""
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    day0 = date(2026, 9, 1)

    # 20 round trips: rows 0,1,2 violate (nhồi lệnh), rest clean → 3 vi phạm/20.
    for i in range(20):
        flags = {"nhoi_lenh_khi_lo": True} if i < 3 else {}
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"E{i}", trading_date=day0 + timedelta(days=i), **flags,
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_5_done_at is None  # 3 > 2

    # One more clean round trip shifts the window — oldest violating row (i=0)
    # falls out of the last-20 window, leaving only 2 vi phạm → task ⑤ done.
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="E20", trading_date=day0 + timedelta(days=20),
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_5_done_at is not None


@pytest.mark.asyncio
async def test_diem_ky_luat_no_orders_returns_no_score(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)

    result = await cap2.diem_ky_luat(test_user.id, date(2026, 10, 1))
    assert result["co_giao_dich"] is False
    assert result["diem"] is None


@pytest.mark.asyncio
async def test_diem_ky_luat_no_test_situation_caps_at_ke_hoach_component(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    ngay = date(2026, 10, 5)
    buy = await _make_order(
        db_session, account.id, test_user.id, symbol="D1", trading_date=ngay,
    )
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    await cap2.record_kehoach(
        test_user.id, buy.id,
        phuong_phap_sl_tp="bien_do_dao_dong", cat_lo=18_000, chot_loi=25_000,
    )

    result = await cap2.diem_ky_luat(test_user.id, ngay)
    assert result["co_giao_dich"] is True
    assert result["co_tinh_huong"] is False
    assert result["diem"] == 40
    assert result["xep_loai"] is None
    assert result["thanh_phan"]["ke_hoach"] == 40


@pytest.mark.asyncio
async def test_diem_ky_luat_incomplete_plan_reduces_ke_hoach_component(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    ngay = date(2026, 10, 6)
    buy1 = await _make_order(
        db_session, account.id, test_user.id, symbol="D2", trading_date=ngay,
    )
    await cap1.record_kehoach(
        test_user.id, buy1.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    await cap2.record_kehoach(
        test_user.id, buy1.id,
        phuong_phap_sl_tp="bien_do_dao_dong", cat_lo=18_000, chot_loi=25_000,
    )
    # 2nd order placed same day never got its Cấp 2 SL/TP filled in.
    buy2 = await _make_order(
        db_session, account.id, test_user.id, symbol="D3", trading_date=ngay,
    )
    await cap1.record_kehoach(
        test_user.id, buy2.id, ly_do="tin_tuc", trang_thai_luc_dat="trung_tinh", vung_mua=15_000,
    )

    result = await cap2.diem_ky_luat(test_user.id, ngay)
    assert result["thanh_phan"]["ke_hoach"] == 20  # 1/2 complete * 40


@pytest.mark.asyncio
async def test_diem_ky_luat_full_formula_with_test_situations(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    ngay = date(2026, 10, 7)
    # 1 round trip: full kế hoạch (40) + cắt lỗ đúng (20) + không nhồi (10) +
    # chốt lời đúng (10) = raw 80 / 140 * 100 ≈ 57.14.
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="D4", trading_date=ngay,
        buy_price=20_000, sell_price=25_500, chot_loi=25_000,
        cham_sl_cat_dung_phien_ke=True,
    )

    result = await cap2.diem_ky_luat(test_user.id, ngay)
    assert result["co_tinh_huong"] is True
    thanh_phan = result["thanh_phan"]
    assert thanh_phan["ke_hoach"] == 40
    assert thanh_phan["cat_lo_dung"] == 20
    assert thanh_phan["khong_nhoi"] == 10
    assert thanh_phan["chot_loi_dung"] == 10
    assert result["diem"] == pytest.approx(80 / 140 * 100)
    assert result["xep_loai"] == "do"  # ~57.1 < 70


@pytest.mark.asyncio
async def test_graduate_requires_5_of_5(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    with pytest.raises(ConflictError):
        await cap2.graduate(test_user.id)

    day0 = date(2026, 11, 1)
    from datetime import timedelta

    # 5 clean round trips w/ cắt lỗ đúng + chốt lời đúng flags, satisfying
    # ①②③④ together, then pad to 20 total with 0 further violations for ⑤.
    for i in range(5):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"F{i}", trading_date=day0 + timedelta(days=i),
            buy_price=20_000, sell_price=25_500, chot_loi=25_000,
            cham_sl_cat_dung_phien_ke=True,
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    assert progress.task_2_done_at is not None  # 5/5 cắt lỗ đúng
    assert progress.task_3_done_at is not None  # 0 nhồi
    assert progress.task_4_done_at is not None  # 5/5 chốt lời đúng

    for i in range(15):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"F{5 + i}", trading_date=day0 + timedelta(days=5 + i),
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_5_done_at is not None

    progress = await cap2.graduate(test_user.id)
    assert progress.graduated_at is not None
    assert progress.time_to_graduate_hours is not None


@pytest.mark.asyncio
async def test_cap2_endpoints_wired_and_free(client, db_session, test_user):
    """Router mounted under /api/v1/cap2, gated by CurrentUser (not premium)."""
    from app.core.security import create_access_token

    await _graduate_cap1(db_session, test_user.id)
    await db_session.commit()

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/v1/cap2/progress", headers=headers)
    assert r.status_code == 200
    assert r.json() is None

    r = await client.post("/api/v1/cap2/enter", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["chuoi_current"] == 0

    r = await client.post("/api/v1/cap2/graduate", headers=headers)
    assert r.status_code == 409

    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    cap1 = Cap1Service(db_session)
    buy = await _make_order(
        db_session, account.id, test_user.id, symbol="AAA", side=OrderSide.BUY,
        qty=100, price=20_000, trading_date=date(2026, 1, 5),
    )
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    await db_session.commit()

    r = await client.post(
        "/api/v1/cap2/kehoach",
        headers=headers,
        json={
            "order_id": str(buy.id),
            "phuong_phap_sl_tp": "bien_do_dao_dong",
            "cat_lo": 18_000,
            "chot_loi": 25_000,
        },
    )
    assert r.status_code == 200, r.text
    kehoach_body = r.json()
    assert kehoach_body["phuong_phap_sl_tp"] == "bien_do_dao_dong"
    assert kehoach_body["cat_lo"] == 18_000

    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="AAA", side=OrderSide.SELL,
        qty=100, price=22_000, trading_date=date(2026, 1, 8),
    )
    await cap1.record_ketso(test_user.id, sell.id)
    await db_session.commit()

    r = await client.post(
        "/api/v1/cap2/ketso",
        headers=headers,
        json={"order_id": str(sell.id), "cham_SL_cat_dung_phien_ke": True},
    )
    assert r.status_code == 200, r.text
    ketso_body = r.json()
    assert ketso_body["cham_SL_cat_dung_phien_ke"] is True
    assert ketso_body["pnl_vnd"] == 200_000

    r = await client.get("/api/v1/cap2/diem-ky-luat?ngay=2026-01-05", headers=headers)
    assert r.status_code == 200, r.text
    diem_body = r.json()
    assert diem_body["co_giao_dich"] is True

    r = await client.patch("/api/v1/cap2/task", headers=headers, json={"task_no": 1})
    assert r.status_code == 200

    # Unauthenticated is rejected
    r = await client.get("/api/v1/cap2/progress")
    assert r.status_code == 401
