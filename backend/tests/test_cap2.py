"""Tests for the Cấp 2 «Kỷ luật» backend — progression, cắt lỗ/chốt lời, đo
lường 4 vi phạm kỷ luật, điểm kỷ luật, **ĐÚNG MỘT nhiệm vụ**, graduation.

Cấp 2 has exactly one nhiệm vụ: ① «10 lệnh Thực chiến có đặt cắt lỗ / chốt
lời». Tốt nghiệp là 1/1 (mockup ``iqx-cap2-hanhtrinh.html``: ``CẤP 2 · 0/1``).

★ Nhiệm vụ ② «Thực hiện đúng khi giá chạm mốc» is GONE, and so is
``task_2_done_at``. The 🛑/🎯/✅ counters
(``so_lan_cat_lo_dung``/``so_lan_chot_loi_dung``/``so_lan_thuc_hien_dung``) are
still computed and still tested — but as ANALYTICS for «Phân tích danh mục»
khối ④, never as a nhiệm vụ. Tests below pin BOTH halves of that: the numbers
stay correct, and no value of them ever opens or closes the tốt-nghiệp gate.

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
    # ⑤ «10 lệnh Thực chiến» is already satisfied by the 10 buys above.
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
    with_sl_tp: bool = True,
    **vi_pham_flags,
):
    """Full Cấp 2 round trip: buy w/ kế hoạch (Cấp1 + Cấp2 SL/TP) → sell w/
    kết sổ (Cấp1 pnl + Cấp2 vi phạm flags). Returns the (kehoach, ketso) rows.

    ``with_sl_tp=False`` stops after Cấp 1's kế hoạch — a plan with no cắt lỗ /
    chốt lời, which is what nhiệm vụ ① must refuse to count."""
    buy = await _make_order(
        db_session, account_id, user_id, symbol=symbol, side=OrderSide.BUY,
        price=buy_price, trading_date=trading_date,
    )
    kehoach = await cap1.record_kehoach(
        user_id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=buy_price,
    )
    if with_sl_tp:
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
    # ⑤ «10 lệnh Thực chiến» is already satisfied by the 10 buys above.
    await cap1.graduate(test_user.id)

    progress = await svc.enter(test_user.id)
    assert progress.user_id == test_user.id
    assert progress.graduated_at is None
    assert progress.so_lenh_co_cl_tp == 0
    assert progress.so_lan_thuc_hien_dung == 0
    assert not hasattr(progress, "task_2_done_at")

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
async def test_counter_1_counts_only_buys_carrying_both_marks(db_session, test_user):
    """① đếm lệnh MUA Thực chiến đã khớp có ĐỦ CẢ cắt lỗ VÀ chốt lời."""
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    for i in range(3):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"C{i}", trading_date=date(2026, 2, 1 + i),
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.so_lenh_co_cl_tp == 3

    # Two more round trips whose kế hoạch never got the Cấp 2 SL/TP block —
    # a Cấp 1-shaped plan does not count toward ①.
    for i in range(2):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"N{i}", trading_date=date(2026, 2, 10 + i), with_sl_tp=False,
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.so_lenh_co_cl_tp == 3
    assert progress.task_1_done_at is None


@pytest.mark.asyncio
async def test_counter_1_refuses_a_half_filled_plan(db_session, test_user):
    """★ ① wants BOTH marks — a plan with only cắt lỗ is not «có đặt CL/CL».

    ``record_kehoach`` always writes the pair, so a half-filled row can only be
    produced below the service (a stray backfill, a future level writing one
    leg). Asserted at the row level precisely because the API cannot express it.
    """
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    buy = await _make_order(db_session, account.id, test_user.id, symbol="HALF")
    kehoach = await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho",
        vung_mua=20_000,
    )
    kehoach.cat_lo = 18_000  # …and chot_loi stays NULL.
    await db_session.flush()

    progress = await cap2.mark_task(test_user.id, 1)
    assert progress.so_lenh_co_cl_tp == 0

    # The mirror case — chốt lời alone — is equally not enough.
    kehoach.cat_lo = None
    kehoach.chot_loi = 25_000
    await db_session.flush()
    progress = await cap2.mark_task(test_user.id, 1)
    assert progress.so_lenh_co_cl_tp == 0


@pytest.mark.asyncio
async def test_counter_1_moves_on_kehoach_alone_no_sell_needed(db_session, test_user):
    """★ ① is about PLACING the marks — it must not wait for a Kết sổ.

    Ten buys that carry cắt lỗ + chốt lời and have never been sold complete ①
    on the spot; recomputing only on ``record_ketso`` would hold the journey at
    0/10 for a user who did everything the task asks.
    """
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    for i in range(10):
        buy = await _make_order(
            db_session, account.id, test_user.id, symbol=f"K{i}",
            trading_date=date(2026, 3, 1),
        )
        await cap1.record_kehoach(
            test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho",
            vung_mua=20_000,
        )
        await cap2.record_kehoach(
            test_user.id, buy.id, phuong_phap_sl_tp="bien_do_dao_dong",
            cat_lo=18_000, chot_loi=25_000,
        )

    progress = await cap2.get_progress(test_user.id)
    assert progress.so_lenh_co_cl_tp == 10
    assert progress.task_1_done_at is not None
    # …and the 🛑/🎯/✅ analytics are untouched: nothing has been sold, so
    # nothing was executed.
    assert progress.so_lan_thuc_hien_dung == 0


@pytest.mark.asyncio
async def test_task1_stamps_at_10_and_not_at_9(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    day0 = date(2026, 4, 1)
    for i in range(9):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"T{i}", trading_date=day0 + timedelta(days=i),
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.so_lenh_co_cl_tp == 9
    assert progress.task_1_done_at is None

    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="T9", trading_date=day0 + timedelta(days=9),
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.so_lenh_co_cl_tp == 10
    assert progress.task_1_done_at is not None
    first_done_at = progress.task_1_done_at

    # Stamped once, never re-stamped.
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="T10", trading_date=day0 + timedelta(days=10),
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_1_done_at == first_done_at
    assert progress.so_lenh_co_cl_tp == 11


@pytest.mark.asyncio
async def test_analytics_counts_a_cat_lo_and_a_chot_loi_without_gating_anything(
    db_session, test_user
):
    """★ 🛑/🎯/✅ are still counted — but they are ANALYTICS, not a nhiệm vụ.

    Two executions arrive after only two lệnh. The counters must move (khối ④
    of «Phân tích danh mục» reads them) and the tốt-nghiệp gate must NOT budge:
    ① is still 2/10, so graduation is still refused.
    """
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    # ① Giá chạm cắt lỗ → cắt đúng phiên kế.
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="SL", trading_date=date(2026, 5, 1),
        buy_price=20_000, sell_price=18_000,
        cham_sl_cuoi_phien=True, cham_sl_cat_dung_phien_ke=True,
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.so_lan_cat_lo_dung == 1
    assert progress.so_lan_chot_loi_dung == 0
    assert progress.so_lan_thuc_hien_dung == 1

    # ② Giá chạm chốt lời → bán theo kế hoạch (không giữ tiếp làm hụt).
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="TP", trading_date=date(2026, 5, 2),
        buy_price=20_000, sell_price=25_500, chot_loi=25_000,
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.so_lan_cat_lo_dung == 1
    assert progress.so_lan_chot_loi_dung == 1
    assert progress.so_lan_thuc_hien_dung == 2
    # Invariant khối ④ dựa vào: ✅ = 🛑 + 🎯.
    assert progress.so_lan_thuc_hien_dung == (
        progress.so_lan_cat_lo_dung + progress.so_lan_chot_loi_dung
    )

    # ★★ …và cổng tốt nghiệp KHÔNG nhích một milimet: ① mới 2/10. Hai lần "thực
    # hiện đúng" từng là nhiệm vụ ② và từng đủ để tick một ô — giờ thì không.
    assert progress.so_lenh_co_cl_tp == 2
    assert progress.task_1_done_at is None
    with pytest.raises(ConflictError):
        await cap2.graduate(test_user.id)


@pytest.mark.asyncio
async def test_analytics_ignores_a_touched_mark_the_user_did_not_act_on(db_session, test_user):
    """Chạm mốc nhưng KHÔNG làm theo kế hoạch → không tính lần nào.

    ``cham_SL_khong_cat`` (giữ tiếp khi chạm cắt lỗ) and
    ``cham_TP_giu_lam_hut`` (giữ tiếp khi chạm chốt lời, rồi hụt) are exactly
    the two "chạm mốc nhưng không thực hiện" shapes.
    """
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="X1", trading_date=date(2026, 6, 1),
        buy_price=20_000, sell_price=17_000,
        cham_sl_cuoi_phien=True, cham_sl_khong_cat=True, giu_cham_sl_bao_nhieu_phien=3,
    )
    # Chạm chốt lời, giữ tiếp, cuối cùng vẫn bán trên mốc — vẫn là hụt.
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="X2", trading_date=date(2026, 6, 2),
        buy_price=20_000, sell_price=25_500, chot_loi=25_000,
        cham_tp_giu_lam_hut=True,
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.so_lan_cat_lo_dung == 0
    assert progress.so_lan_chot_loi_dung == 0
    assert progress.so_lan_thuc_hien_dung == 0


@pytest.mark.asyncio
async def test_analytics_ignores_a_sale_that_never_reached_the_mark(db_session, test_user):
    """Bán khi giá CHƯA chạm chốt lời không phải "thực hiện đúng khi chạm mốc"."""
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    for i in range(3):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"U{i}", trading_date=date(2026, 6, 10 + i),
            buy_price=20_000, sell_price=24_900, chot_loi=25_000,
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.so_lan_thuc_hien_dung == 0


@pytest.mark.asyncio
async def test_task1_alone_is_the_whole_gate_even_with_zero_executions(db_session, test_user):
    """★ ① done at 10 lệnh, 🛑/🎯/✅ all still 0 → tốt nghiệp NGAY.

    This is the behavioural heart of the 2 → 1 nhiệm vụ change: under the old
    model this user sat at 1/2 forever, waiting for a market event that may
    never come. Now ① is the whole gate.
    """
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    day0 = date(2026, 7, 1)
    for i in range(10):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"O{i}", trading_date=day0 + timedelta(days=i),
            buy_price=20_000, sell_price=21_000, chot_loi=25_000,
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    assert progress.so_lan_cat_lo_dung == 0
    assert progress.so_lan_chot_loi_dung == 0
    assert progress.so_lan_thuc_hien_dung == 0

    graduated = await cap2.graduate(test_user.id)
    assert graduated.graduated_at is not None


@pytest.mark.asyncio
async def test_mark_task_rejects_the_removed_task_numbers(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)

    # ★ 2 is now on this list — nhiệm vụ ② is gone, so ``PATCH /cap2/task``
    # must refuse it instead of silently "recomputing" a nhiệm vụ that is not
    # there any more.
    for bad in (0, 2, 3, 4, 5):
        with pytest.raises(BadRequestError):
            await cap2.mark_task(test_user.id, bad)

    progress = await cap2.mark_task(test_user.id, 1)
    assert progress.task_1_done_at is None


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
async def test_graduate_requires_1_of_1(db_session, test_user):
    await _graduate_cap1(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    with pytest.raises(ConflictError):
        await cap2.graduate(test_user.id)

    day0 = date(2026, 11, 1)

    # ★★ Hai lần "thực hiện đúng khi giá chạm mốc" — thứ TỪNG là nhiệm vụ ② và
    # từng tick một ô của 2/2. Sau khi bỏ ②, chúng KHÔNG mở cổng nào.
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="F0", trading_date=day0,
        buy_price=20_000, sell_price=18_000,
        cham_sl_cuoi_phien=True, cham_sl_cat_dung_phien_ke=True,
    )
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="F1", trading_date=day0 + timedelta(days=1),
        buy_price=20_000, sell_price=25_500, chot_loi=25_000,
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.so_lan_thuc_hien_dung == 2
    assert progress.task_1_done_at is None
    with pytest.raises(ConflictError):
        await cap2.graduate(test_user.id)

    # 9/10 lệnh — cổng vẫn đóng.
    for i in range(7):
        await _round_trip(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"F{2 + i}", trading_date=day0 + timedelta(days=2 + i),
        )
    progress = await cap2.get_progress(test_user.id)
    assert progress.so_lenh_co_cl_tp == 9
    assert progress.task_1_done_at is None
    with pytest.raises(ConflictError):
        await cap2.graduate(test_user.id)

    # …lệnh thứ 10 mở cổng, một mình.
    await _round_trip(
        db_session, cap1, cap2, account.id, test_user.id,
        symbol="F9", trading_date=day0 + timedelta(days=9),
    )
    progress = await cap2.get_progress(test_user.id)
    assert progress.so_lenh_co_cl_tp == 10
    assert progress.task_1_done_at is not None

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
    assert body["so_lenh_co_cl_tp"] == 0
    assert body["so_lan_thuc_hien_dung"] == 0
    assert body["task_1_done_at"] is None
    # ★ ``task_2_done_at`` phải RỜI HẲN wire, không phải "còn đó nhưng luôn
    # null": một trường luôn null vẫn mời client vẽ thêm một dòng checklist
    # chết. Chuỗi / 5-nhiệm-vụ apparatus cũng off the wire entirely.
    for gone in ("chuoi_current", "chuoi_record", "last_chuoi_reset_at",
                 "task_2_done_at", "task_3_done_at", "task_4_done_at",
                 "task_5_done_at"):
        assert gone not in body
    # …và ba con số ANALYTICS thì PHẢI còn (khối ④ «Phân tích danh mục» đọc).
    for kept in ("so_lan_cat_lo_dung", "so_lan_chot_loi_dung", "so_lan_thuc_hien_dung"):
        assert kept in body

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
    # task_no 2 không còn tồn tại — 400, không phải 200 im lặng.
    r = await client.patch("/api/v1/cap2/task", headers=headers, json={"task_no": 2})
    assert r.status_code == 400, r.text

    # Unauthenticated is rejected
    r = await client.get("/api/v1/cap2/progress")
    assert r.status_code == 401


# ── Migration `8f1a5c7d2e64`: 5 nhiệm vụ + kỷ luật apparatus → 2 nhiệm vụ ──


#: The shape production is on today, at revision ``f809de621bd0``. Written out
#: by hand so this test pins the migration against the columns that actually
#: exist in prod, not against whatever the ORM says after the change.
_PROD_CAP2_PROGRESS_DDL = """
CREATE TABLE cap2_progress (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    entered_at TIMESTAMP NOT NULL,
    task_1_done_at TIMESTAMP,
    task_2_done_at TIMESTAMP,
    task_3_done_at TIMESTAMP,
    task_4_done_at TIMESTAMP,
    task_5_done_at TIMESTAMP,
    chuoi_current INTEGER NOT NULL DEFAULT 0,
    chuoi_record INTEGER NOT NULL DEFAULT 0,
    last_chuoi_reset_at TIMESTAMP,
    graduated_at TIMESTAMP,
    time_to_graduate_hours FLOAT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""


def _load_cap2_2tasks_migration():
    """Import the revision module by path — ``alembic/versions`` is not a package."""
    import importlib.util
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "8f1a5c7d2e64_cap2_two_tasks_drop_discipline_metrics.py"
    )
    spec = importlib.util.spec_from_file_location("_cap2_2tasks_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_cap2_migration(conn, direction: str) -> None:
    """Run the real ``upgrade()``/``downgrade()`` body against ``conn``."""
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    module = _load_cap2_2tasks_migration()
    with Operations.context(MigrationContext.configure(conn)):
        getattr(module, direction)()


def _cap2_columns(conn) -> list[str]:
    return [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(cap2_progress)").fetchall()]


def _cap2_rows(conn) -> dict[str, dict]:
    cols = _cap2_columns(conn)
    out = {}
    for row in conn.exec_driver_sql(
        f"SELECT {', '.join(cols)} FROM cap2_progress"
    ).fetchall():
        record = dict(zip(cols, row, strict=True))
        out[record["id"]] = record
    return out


def _seed_old_shape_cap2_row(conn) -> None:
    """One old-shape row, mid-flight under the 5-task model.

    Every task column carries a DIFFERENT timestamp so the assertions can tell
    "① and ② survived in place" apart from "something got shuffled".
    """
    conn.exec_driver_sql(_PROD_CAP2_PROGRESS_DDL)
    conn.exec_driver_sql(
        """
        INSERT INTO cap2_progress (
            id, user_id, entered_at,
            task_1_done_at, task_2_done_at, task_3_done_at, task_4_done_at,
            task_5_done_at, chuoi_current, chuoi_record, last_chuoi_reset_at,
            graduated_at
        ) VALUES (
            'kyluat1', 'u-kyluat1', '2026-01-01 00:00:00',
            '2026-01-01 01:00:00',  -- ① cũ: chuỗi 5 lệnh không vi phạm
            '2026-01-01 02:00:00',  -- ② cũ: 5 lần cắt lỗ đúng phiên / 15
            '2026-01-01 03:00:00',  -- ③ cũ: 0 nhồi lệnh   (bị xoá)
            '2026-01-01 04:00:00',  -- ④ cũ: 3 chốt lời đúng / 15  (bị xoá)
            NULL,                   -- ⑤ cũ: ≤2 vi phạm / 20       (bị xoá)
            4, 7, '2026-01-01 05:00:00',
            NULL
        )
        """
    )
    # A second, untouched row — entered Cấp 2 and did nothing.
    conn.exec_driver_sql(
        """
        INSERT INTO cap2_progress (id, user_id, entered_at)
        VALUES ('kyluat2', 'u-kyluat2', '2026-02-01 00:00:00')
        """
    )


def test_cap2_migration_keeps_tasks_1_2_and_drops_the_discipline_apparatus():
    """★ ① and ② stay in their own slots; ③④⑤ and the kỷ luật metrics go."""
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_old_shape_cap2_row(conn)
        _run_cap2_migration(conn, "upgrade")

        cols = _cap2_columns(conn)
        for gone in (
            "task_3_done_at",
            "task_4_done_at",
            "task_5_done_at",
            "chuoi_current",
            "chuoi_record",
            "last_chuoi_reset_at",
        ):
            assert gone not in cols
        for added in (
            "so_lenh_co_cl_tp",
            "so_lan_cat_lo_dung",
            "so_lan_chot_loi_dung",
            "so_lan_thuc_hien_dung",
        ):
            assert added in cols

        row = _cap2_rows(conn)["kyluat1"]
        assert row["task_1_done_at"] == "2026-01-01 01:00:00"
        assert row["task_2_done_at"] == "2026-01-01 02:00:00"
        # The new counters start at 0 — they are re-derived from
        # order_kehoach/order_ketso on the next recompute, not guessed here.
        assert row["so_lenh_co_cl_tp"] == 0
        assert row["so_lan_cat_lo_dung"] == 0
        assert row["so_lan_chot_loi_dung"] == 0
        assert row["so_lan_thuc_hien_dung"] == 0
        # Graduation is a user action — the migration never stamps it.
        assert row["graduated_at"] is None

        untouched = _cap2_rows(conn)["kyluat2"]
        assert untouched["task_1_done_at"] is None
        assert untouched["task_2_done_at"] is None
        assert untouched["so_lenh_co_cl_tp"] == 0
        assert untouched["entered_at"] == "2026-02-01 00:00:00"


def test_cap2_migration_round_trips_up_down_up():
    """upgrade → downgrade → upgrade lands on the same 2-task state.

    The downgrade is LOSSY by construction — see the revision's docstring.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_old_shape_cap2_row(conn)
        _run_cap2_migration(conn, "upgrade")
        after_first = _cap2_rows(conn)

        _run_cap2_migration(conn, "downgrade")
        cols = _cap2_columns(conn)
        for back in (
            "task_3_done_at",
            "task_4_done_at",
            "task_5_done_at",
            "chuoi_current",
            "chuoi_record",
            "last_chuoi_reset_at",
        ):
            assert back in cols
        for gone in ("so_lenh_co_cl_tp", "so_lan_thuc_hien_dung"):
            assert gone not in cols

        down = _cap2_rows(conn)["kyluat1"]
        # ① and ② come back untouched…
        assert down["task_1_done_at"] == "2026-01-01 01:00:00"
        assert down["task_2_done_at"] == "2026-01-01 02:00:00"
        # …but ③④⑤ and the chuỗi state are unrecoverable — they come back at
        # their defaults rather than pretending to remember.
        assert down["task_3_done_at"] is None
        assert down["task_4_done_at"] is None
        assert down["task_5_done_at"] is None
        assert down["chuoi_current"] == 0
        assert down["chuoi_record"] == 0
        assert down["last_chuoi_reset_at"] is None
        assert down["graduated_at"] is None

        _run_cap2_migration(conn, "upgrade")
        assert _cap2_rows(conn) == after_first


# ── Migration `9c3f7ad10b52`: 2 nhiệm vụ → ĐÚNG MỘT (bỏ task_2_done_at) ──────
#
# ★ The upgrade → downgrade → upgrade round trip was ALSO run against real
# Postgres (scratch db, ``alembic upgrade b2e6f4a17c93`` → ``head`` →
# ``downgrade -1`` → ``head``) with two seeded rows, comparing
# ``information_schema.columns`` snapshots and the row contents at each step.
# The tests below are the deterministic, in-suite half of that (this suite runs
# on SQLite — see ``tests/conftest.py``), pinned the same way the
# ``8f1a5c7d2e64`` pair above is.


#: The shape at revision ``b2e6f4a17c93`` — i.e. what ``9c3f7ad10b52`` upgrades
#: FROM. Written out by hand so this test pins the migration against the columns
#: that actually exist, not against whatever the ORM says after the change.
_TWO_TASK_CAP2_PROGRESS_DDL = """
CREATE TABLE cap2_progress (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    entered_at TIMESTAMP NOT NULL,
    task_1_done_at TIMESTAMP,
    task_2_done_at TIMESTAMP,
    so_lenh_co_cl_tp INTEGER NOT NULL DEFAULT 0,
    so_lan_cat_lo_dung INTEGER NOT NULL DEFAULT 0,
    so_lan_chot_loi_dung INTEGER NOT NULL DEFAULT 0,
    so_lan_thuc_hien_dung INTEGER NOT NULL DEFAULT 0,
    graduated_at TIMESTAMP,
    time_to_graduate_hours FLOAT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""


def _load_cap2_1task_migration():
    """Import the revision module by path — ``alembic/versions`` is not a package."""
    import importlib.util
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "9c3f7ad10b52_cap2_one_task_drop_task_2_done_at.py"
    )
    spec = importlib.util.spec_from_file_location("_cap2_1task_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_cap2_1task_migration(conn, direction: str) -> None:
    """Run the real ``upgrade()``/``downgrade()`` body against ``conn``."""
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    module = _load_cap2_1task_migration()
    with Operations.context(MigrationContext.configure(conn)):
        getattr(module, direction)()


def _seed_two_task_cap2_rows(conn) -> None:
    """One mid-flight row under the 2-task model + one untouched row.

    ① and ② carry DIFFERENT timestamps, and the three analytics counters carry
    three DIFFERENT non-default values, so the assertions can tell "① survived
    in place, the counters survived" apart from "something got shuffled or
    reset to its default".
    """
    conn.exec_driver_sql(_TWO_TASK_CAP2_PROGRESS_DDL)
    conn.exec_driver_sql(
        """
        INSERT INTO cap2_progress (
            id, user_id, entered_at, task_1_done_at, task_2_done_at,
            so_lenh_co_cl_tp, so_lan_cat_lo_dung, so_lan_chot_loi_dung,
            so_lan_thuc_hien_dung, graduated_at
        ) VALUES (
            'ky1', 'u-ky1', '2026-01-01 00:00:00',
            '2026-01-01 01:00:00',  -- ①: 10 lệnh có CL/CL
            '2026-01-01 02:00:00',  -- ②: 2 lần thực hiện đúng  (bị xoá)
            13, 3, 4, 7,
            NULL
        )
        """
    )
    conn.exec_driver_sql(
        """
        INSERT INTO cap2_progress (id, user_id, entered_at)
        VALUES ('ky2', 'u-ky2', '2026-02-01 00:00:00')
        """
    )


def test_cap2_1task_migration_drops_only_task_2_and_keeps_the_analytics():
    """★ ``task_2_done_at`` goes; ① and the 🛑/🎯/✅ counters stay untouched."""
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_two_task_cap2_rows(conn)
        before = _cap2_columns(conn)
        assert "task_2_done_at" in before

        _run_cap2_1task_migration(conn, "upgrade")

        after = _cap2_columns(conn)
        assert "task_2_done_at" not in after
        # ★ EXACTLY one column left, nothing else added or removed. A plain
        # "task_2 is gone" assertion would still pass if the revision had also
        # dropped the analytics counters «Phân tích danh mục» khối ④ reads.
        assert sorted(after) == sorted(c for c in before if c != "task_2_done_at")
        for kept in (
            "so_lenh_co_cl_tp",
            "so_lan_cat_lo_dung",
            "so_lan_chot_loi_dung",
            "so_lan_thuc_hien_dung",
        ):
            assert kept in after

        row = _cap2_rows(conn)["ky1"]
        assert row["task_1_done_at"] == "2026-01-01 01:00:00"
        # Counters keep their seeded (non-default) values — the migration does
        # not recompute or zero them.
        assert row["so_lenh_co_cl_tp"] == 13
        assert row["so_lan_cat_lo_dung"] == 3
        assert row["so_lan_chot_loi_dung"] == 4
        assert row["so_lan_thuc_hien_dung"] == 7
        # Graduation is a user action — the migration never stamps it.
        assert row["graduated_at"] is None

        untouched = _cap2_rows(conn)["ky2"]
        assert untouched["task_1_done_at"] is None
        assert untouched["so_lenh_co_cl_tp"] == 0
        assert untouched["entered_at"] == "2026-02-01 00:00:00"


def test_cap2_1task_migration_round_trips_up_down_up():
    """upgrade → downgrade → upgrade lands on the same 1-task state.

    The downgrade is LOSSY by construction — see the revision's docstring.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_two_task_cap2_rows(conn)
        before_cols = _cap2_columns(conn)

        _run_cap2_1task_migration(conn, "upgrade")
        after_first = _cap2_rows(conn)

        _run_cap2_1task_migration(conn, "downgrade")
        assert sorted(_cap2_columns(conn)) == sorted(before_cols)

        down = _cap2_rows(conn)["ky1"]
        # ① and the counters come back untouched…
        assert down["task_1_done_at"] == "2026-01-01 01:00:00"
        assert down["so_lenh_co_cl_tp"] == 13
        assert down["so_lan_thuc_hien_dung"] == 7
        # …but ②'s exact completion timestamp is unrecoverable — it comes back
        # NULL rather than pretending to remember (and NULL, not epoch: "chưa
        # biết" must never be drawn as a value).
        assert down["task_2_done_at"] is None
        assert down["graduated_at"] is None

        _run_cap2_1task_migration(conn, "upgrade")
        assert _cap2_rows(conn) == after_first


def test_cap2_1task_migration_chains_onto_the_2task_one():
    """★ The two revisions compose: prod's 5-task shape → 2 tasks → 1 task.

    Pins the revision ORDER as well as each step, so a future rebase that
    re-points ``down_revision`` shows up here.
    """
    import sqlalchemy as sa

    assert _load_cap2_1task_migration().down_revision == "b2e6f4a17c93"

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_old_shape_cap2_row(conn)  # the real prod (5-task) DDL
        _run_cap2_migration(conn, "upgrade")  # 8f1a5c7d2e64
        _run_cap2_1task_migration(conn, "upgrade")  # 9c3f7ad10b52

        cols = _cap2_columns(conn)
        assert "task_1_done_at" in cols
        for gone in (
            "task_2_done_at",
            "task_3_done_at",
            "task_4_done_at",
            "task_5_done_at",
            "chuoi_current",
            "chuoi_record",
            "last_chuoi_reset_at",
        ):
            assert gone not in cols

        row = _cap2_rows(conn)["kyluat1"]
        assert row["task_1_done_at"] == "2026-01-01 01:00:00"
