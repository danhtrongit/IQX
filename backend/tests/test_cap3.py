"""Tests for the Cấp 3 «Bản lĩnh» backend — progression, khẩu vị rủi ro, mức
tự tin, khối lượng mua (quản lý vốn), Thách thức Bản lĩnh (triple condition),
graduation.

Mirrors ``tests/test_cap2.py``'s style. Uses the ``test_user``/``db_session``
fixtures from ``tests/conftest.py``.

NOTE on dates: ``Cap3Progress.entered_at`` is real wall-clock time (not
mocked), and ``diem_ky_luat_tb_cap3`` is windowed on
``VirtualOrder.trading_date >= entered_at.date()``. Cấp-3-period round trips
in these tests therefore use ``date.today()`` (not arbitrary historical
dates) so they fall inside that window. Cấp 0/1/2 setup dates are unrelated
to this window and use fixed historical dates like ``test_cap1.py``/
``test_cap2.py`` do.
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
from app.services.cap3.service import Cap3Service

# ══════════════════════════════════════════════════════
# Setup helpers — fast-track a user through Cấp 0/1/2 graduation.
# ══════════════════════════════════════════════════════


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


async def _round_trip_cap2(
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
    """Cấp 1+2 round trip (setup helper — Cấp 2 graduation prerequisite)."""
    buy = await _make_order(
        db_session, account_id, user_id, symbol=symbol, side=OrderSide.BUY,
        price=buy_price, trading_date=trading_date,
    )
    await cap1.record_kehoach(
        user_id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=buy_price,
    )
    await cap2.record_kehoach(
        user_id, buy.id,
        phuong_phap_sl_tp=phuong_phap_sl_tp, cat_lo=cat_lo, chot_loi=chot_loi,
    )
    sell = await _make_order(
        db_session, account_id, user_id, symbol=symbol, side=OrderSide.SELL,
        price=sell_price, trading_date=trading_date,
    )
    await cap1.record_ketso(user_id, sell.id)
    ketso = await cap2.record_ketso(user_id, sell.id, **vi_pham_flags)
    return ketso


async def _graduate_cap2(db_session, user_id) -> None:
    """Fast-track a user through Cấp 0 + Cấp 1 + Cấp 2 graduation (setup helper)."""
    await _graduate_cap1(db_session, user_id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(user_id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(user_id)

    day0 = date(2026, 2, 1)
    # 5 clean round trips w/ cắt lỗ đúng + chốt lời đúng, satisfying ①②③④,
    # then pad to 20 total with 0 further violations for ⑤ (mirrors
    # test_cap2.py's test_graduate_requires_5_of_5 recipe exactly).
    for i in range(5):
        await _round_trip_cap2(
            db_session, cap1, cap2, account.id, user_id,
            symbol=f"P{i}", trading_date=day0 + timedelta(days=i),
            buy_price=20_000, sell_price=25_500, chot_loi=25_000,
            cham_sl_cat_dung_phien_ke=True,
        )
    for i in range(15):
        await _round_trip_cap2(
            db_session, cap1, cap2, account.id, user_id,
            symbol=f"P{5 + i}", trading_date=day0 + timedelta(days=5 + i),
        )
    await cap2.graduate(user_id)


async def _enter_cap3(db_session, user_id, *, khau_vi: str | None = "can_bang"):
    """Fast-track a user through graduation up to (and entering) Cấp 3.

    Returns ``(cap1, cap2, cap3, account)`` service instances + the user's
    virtual trading account, ready for Cấp-3-period round trips.
    """
    await _graduate_cap2(db_session, user_id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    cap3 = Cap3Service(db_session)
    await cap3.enter(user_id)
    if khau_vi is not None:
        await cap3.set_khau_vi(user_id, khau_vi)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(user_id)
    return cap1, cap2, cap3, account


async def _round_trip_cap3(
    db_session,
    cap1: Cap1Service,
    cap2: Cap2Service,
    cap3: Cap3Service,
    account_id,
    user_id,
    *,
    symbol: str,
    buy_price: int = 20_000,
    sell_price: int = 25_500,
    qty: int = 100,
    trading_date: date,
    cat_lo: int = 18_000,
    chot_loi: int = 25_000,
    cham_sl_cat_dung_phien_ke: bool = True,
    record_cap3_fields: bool = True,
    khau_vi: str = "can_bang",
    muc_tu_tin: int = 3,
    cach_khoi_luong: str = "linh_hoat",
    khoi_luong: int = 100,
    pct_von: float = 20.0,
    **vi_pham_flags,
):
    """Full Cấp 3 round trip: buy w/ kế hoạch (Cấp1 + Cấp2 SL/TP + Cấp3 quản
    lý vốn) → sell w/ kết sổ (Cấp1 pnl + Cấp2 vi phạm flags). Cấp 3 adds no
    new ``order_ketso`` columns (§10), so the sell side is pure Cấp 1+2."""
    buy = await _make_order(
        db_session, account_id, user_id, symbol=symbol, side=OrderSide.BUY,
        qty=qty, price=buy_price, trading_date=trading_date,
    )
    await cap1.record_kehoach(
        user_id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=buy_price,
    )
    await cap2.record_kehoach(
        user_id, buy.id, phuong_phap_sl_tp="bien_do_dao_dong", cat_lo=cat_lo, chot_loi=chot_loi,
    )
    if record_cap3_fields:
        await cap3.record_kehoach(
            user_id, buy.id, khau_vi=khau_vi, muc_tu_tin=muc_tu_tin,
            cach_khoi_luong=cach_khoi_luong, khoi_luong=khoi_luong, pct_von=pct_von,
        )
    sell = await _make_order(
        db_session, account_id, user_id, symbol=symbol, side=OrderSide.SELL,
        qty=qty, price=sell_price, trading_date=trading_date,
    )
    await cap1.record_ketso(user_id, sell.id)
    ketso = await cap2.record_ketso(
        user_id, sell.id, cham_sl_cat_dung_phien_ke=cham_sl_cat_dung_phien_ke, **vi_pham_flags,
    )
    return ketso


# ══════════════════════════════════════════════════════
# Tests
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_enter_requires_cap2_graduated(db_session, test_user):
    svc = Cap3Service(db_session)

    # No Cấp 2 progress at all.
    with pytest.raises(NotFoundError):
        await svc.enter(test_user.id)

    # Entered Cấp 2 but not graduated.
    await _graduate_cap1(db_session, test_user.id)
    cap2 = Cap2Service(db_session)
    await cap2.enter(test_user.id)
    with pytest.raises(ConflictError):
        await svc.enter(test_user.id)

    # Graduate Cấp 2 → enter Cấp 3 succeeds.
    cap1 = Cap1Service(db_session)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    day0 = date(2026, 2, 1)
    for i in range(5):
        await _round_trip_cap2(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"P{i}", trading_date=day0 + timedelta(days=i),
            buy_price=20_000, sell_price=25_500, chot_loi=25_000,
            cham_sl_cat_dung_phien_ke=True,
        )
    for i in range(15):
        await _round_trip_cap2(
            db_session, cap1, cap2, account.id, test_user.id,
            symbol=f"P{5 + i}", trading_date=day0 + timedelta(days=5 + i),
        )
    await cap2.graduate(test_user.id)

    progress = await svc.enter(test_user.id)
    assert progress.user_id == test_user.id
    assert progress.graduated_at is None
    assert progress.khau_vi_da_dat is False
    assert progress.khau_vi is None
    assert progress.von_ban_dau == 100_000_000

    # idempotent
    progress2 = await svc.enter(test_user.id)
    assert progress2.id == progress.id


@pytest.mark.asyncio
async def test_set_khau_vi_requires_progress(db_session, test_user):
    svc = Cap3Service(db_session)
    with pytest.raises(NotFoundError):
        await svc.set_khau_vi(test_user.id, "can_bang")


@pytest.mark.asyncio
async def test_set_khau_vi_sets_and_updates(db_session, test_user):
    await _graduate_cap2(db_session, test_user.id)
    cap3 = Cap3Service(db_session)
    await cap3.enter(test_user.id)

    progress = await cap3.set_khau_vi(test_user.id, "than_trong")
    assert progress.khau_vi.value == "than_trong"
    assert progress.khau_vi_da_dat is True

    # Đổi khẩu vị = đổi cho toàn tài khoản, có thể sửa lại (spec §5.2).
    progress = await cap3.set_khau_vi(test_user.id, "tan_cong")
    assert progress.khau_vi.value == "tan_cong"
    assert progress.khau_vi_da_dat is True


@pytest.mark.asyncio
async def test_set_khau_vi_rejects_invalid(db_session, test_user):
    await _graduate_cap2(db_session, test_user.id)
    cap3 = Cap3Service(db_session)
    await cap3.enter(test_user.id)
    with pytest.raises(BadRequestError):
        await cap3.set_khau_vi(test_user.id, "tuy_thich")


@pytest.mark.asyncio
async def test_record_kehoach_requires_khau_vi_da_dat(db_session, test_user):
    cap1, cap2, cap3, account = await _enter_cap3(db_session, test_user.id, khau_vi=None)

    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    with pytest.raises(ConflictError):
        await cap3.record_kehoach(
            test_user.id, buy.id, khau_vi="can_bang", muc_tu_tin=3,
            cach_khoi_luong="linh_hoat", khoi_luong=100, pct_von=20.0,
        )


@pytest.mark.asyncio
async def test_record_kehoach_requires_existing_cap1_row(db_session, test_user):
    cap1, cap2, cap3, account = await _enter_cap3(db_session, test_user.id)

    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    with pytest.raises(NotFoundError):
        await cap3.record_kehoach(
            test_user.id, buy.id, khau_vi="can_bang", muc_tu_tin=3,
            cach_khoi_luong="linh_hoat", khoi_luong=100, pct_von=20.0,
        )


@pytest.mark.asyncio
async def test_record_kehoach_adds_fields_to_existing_row(db_session, test_user):
    cap1, cap2, cap3, account = await _enter_cap3(db_session, test_user.id)

    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    kehoach_1 = await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )

    kehoach_2 = await cap3.record_kehoach(
        test_user.id, buy.id, khau_vi="tan_cong", muc_tu_tin=2,
        cach_khoi_luong="ky_luat", khoi_luong=300, pct_von=30.0,
    )
    assert kehoach_2.id == kehoach_1.id  # same row, extended in place
    assert kehoach_2.lyDo.value == "ky_thuat"  # Cấp 1 fields untouched
    assert kehoach_2.khau_vi.value == "tan_cong"
    assert kehoach_2.muc_tu_tin == 2
    assert kehoach_2.cach_khoi_luong.value == "ky_luat"
    assert kehoach_2.khoi_luong == 300
    assert kehoach_2.pct_von == 30.0


@pytest.mark.asyncio
async def test_record_kehoach_rejects_invalid_values(db_session, test_user):
    cap1, cap2, cap3, account = await _enter_cap3(db_session, test_user.id)
    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )

    with pytest.raises(BadRequestError):
        await cap3.record_kehoach(
            test_user.id, buy.id, khau_vi="qua_tay", muc_tu_tin=3,
            cach_khoi_luong="linh_hoat", khoi_luong=100, pct_von=20.0,
        )
    with pytest.raises(BadRequestError):
        await cap3.record_kehoach(
            test_user.id, buy.id, khau_vi="can_bang", muc_tu_tin=4,
            cach_khoi_luong="linh_hoat", khoi_luong=100, pct_von=20.0,
        )
    with pytest.raises(BadRequestError):
        await cap3.record_kehoach(
            test_user.id, buy.id, khau_vi="can_bang", muc_tu_tin=3,
            cach_khoi_luong="tuy_y", khoi_luong=100, pct_von=20.0,
        )
    with pytest.raises(BadRequestError):
        await cap3.record_kehoach(
            test_user.id, buy.id, khau_vi="can_bang", muc_tu_tin=3,
            cach_khoi_luong="linh_hoat", khoi_luong=0, pct_von=20.0,
        )
    with pytest.raises(BadRequestError):
        await cap3.record_kehoach(
            test_user.id, buy.id, khau_vi="can_bang", muc_tu_tin=3,
            cach_khoi_luong="linh_hoat", khoi_luong=100, pct_von=0,
        )


@pytest.mark.asyncio
async def test_record_kehoach_rejects_sell_order(db_session, test_user):
    cap1, cap2, cap3, account = await _enter_cap3(db_session, test_user.id)
    sell_order = await _make_order(db_session, account.id, test_user.id, side=OrderSide.SELL)
    with pytest.raises(BadRequestError):
        await cap3.record_kehoach(
            test_user.id, sell_order.id, khau_vi="can_bang", muc_tu_tin=3,
            cach_khoi_luong="linh_hoat", khoi_luong=100, pct_von=20.0,
        )


@pytest.mark.asyncio
async def test_task1_and_task2_progression(db_session, test_user):
    cap1, cap2, cap3, account = await _enter_cap3(db_session, test_user.id)
    today = date.today()

    # Round trip #1 — clean round trip WITHOUT the Cấp 3 quản lý vốn block.
    await _round_trip_cap3(
        db_session, cap1, cap2, cap3, account.id, test_user.id,
        symbol="R0", trading_date=today, record_cap3_fields=False,
    )
    progress = await cap3.get_progress(test_user.id)
    assert progress.so_lenh_cap3 == 1
    assert progress.task_1_done_at is None
    assert progress.task_2_done_at is None  # gated behind ①, even w/ so_lenh_cap3 >= 1

    # A new buy order WITH the full quản lý vốn block → nhiệm vụ ① done.
    buy = await _make_order(db_session, account.id, test_user.id, symbol="R1", trading_date=today)
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    await cap3.record_kehoach(
        test_user.id, buy.id, khau_vi="can_bang", muc_tu_tin=3,
        cach_khoi_luong="linh_hoat", khoi_luong=100, pct_von=20.0,
    )
    progress = await cap3.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    # so_lenh_cap3 was already >= 1 from round trip #1 → ② unlocks in the same pass.
    assert progress.task_2_done_at is not None


@pytest.mark.asyncio
async def test_task3_fails_when_only_lai_pct_short(db_session, test_user):
    """so_lenh >= 15 and điểm kỷ luật >= 80 but lãi < 5% → ③ not done."""
    cap1, cap2, cap3, account = await _enter_cap3(db_session, test_user.id)
    today = date.today()
    for i in range(15):
        await _round_trip_cap3(
            db_session, cap1, cap2, cap3, account.id, test_user.id,
            symbol=f"A{i}", trading_date=today,
            buy_price=20_000, sell_price=20_300, chot_loi=20_000,
            cham_sl_cat_dung_phien_ke=True,
        )
    progress = await cap3.get_progress(test_user.id)
    assert progress.so_lenh_cap3 == 15
    assert progress.diem_ky_luat_tb_cap3 == pytest.approx(100.0)
    assert progress.lai_pct_cap3 == pytest.approx(0.45)
    assert progress.lai_pct_cap3 < 5.0
    assert progress.task_3_done_at is None


@pytest.mark.asyncio
async def test_task3_fails_when_only_so_lenh_short(db_session, test_user):
    """lãi >= 5% and điểm kỷ luật >= 80 but so_lenh < 15 → ③ not done."""
    cap1, cap2, cap3, account = await _enter_cap3(db_session, test_user.id)
    today = date.today()
    for i in range(5):
        await _round_trip_cap3(
            db_session, cap1, cap2, cap3, account.id, test_user.id,
            symbol=f"B{i}", trading_date=today,
            buy_price=20_000, sell_price=40_000, chot_loi=35_000,
            cham_sl_cat_dung_phien_ke=True,
        )
    progress = await cap3.get_progress(test_user.id)
    assert progress.so_lenh_cap3 == 5
    assert progress.so_lenh_cap3 < 15
    assert progress.lai_pct_cap3 == pytest.approx(10.0)
    assert progress.diem_ky_luat_tb_cap3 == pytest.approx(100.0)
    assert progress.task_3_done_at is None


@pytest.mark.asyncio
async def test_task3_fails_when_only_diem_short(db_session, test_user):
    """lãi >= 5% and so_lenh >= 15 but điểm kỷ luật < 80 → ③ not done."""
    cap1, cap2, cap3, account = await _enter_cap3(db_session, test_user.id)
    today = date.today()
    for i in range(15):
        await _round_trip_cap3(
            db_session, cap1, cap2, cap3, account.id, test_user.id,
            symbol=f"C{i}", trading_date=today,
            buy_price=20_000, sell_price=25_500, chot_loi=30_000,  # target never reached
            cham_sl_cat_dung_phien_ke=False,  # never cắt lỗ đúng phiên
        )
    progress = await cap3.get_progress(test_user.id)
    assert progress.so_lenh_cap3 == 15
    assert progress.lai_pct_cap3 == pytest.approx(8.25)
    assert progress.lai_pct_cap3 >= 5.0
    assert progress.diem_ky_luat_tb_cap3 < 80.0
    assert progress.task_3_done_at is None


@pytest.mark.asyncio
async def test_task3_done_when_all_three_met(db_session, test_user):
    cap1, cap2, cap3, account = await _enter_cap3(db_session, test_user.id)
    today = date.today()
    for i in range(15):
        await _round_trip_cap3(
            db_session, cap1, cap2, cap3, account.id, test_user.id,
            symbol=f"D{i}", trading_date=today,
            buy_price=20_000, sell_price=25_500, chot_loi=25_000,
            cham_sl_cat_dung_phien_ke=True,
        )
    progress = await cap3.get_progress(test_user.id)
    assert progress.so_lenh_cap3 == 15
    assert progress.lai_pct_cap3 == pytest.approx(8.25)
    assert progress.diem_ky_luat_tb_cap3 == pytest.approx(100.0)
    assert progress.task_3_done_at is not None


@pytest.mark.asyncio
async def test_thach_thuc_requires_progress(db_session, test_user):
    cap3 = Cap3Service(db_session)
    with pytest.raises(NotFoundError):
        await cap3.thach_thuc(test_user.id)


@pytest.mark.asyncio
async def test_thach_thuc_shape_and_values(db_session, test_user):
    cap1, cap2, cap3, account = await _enter_cap3(db_session, test_user.id)
    today = date.today()
    for i in range(15):
        await _round_trip_cap3(
            db_session, cap1, cap2, cap3, account.id, test_user.id,
            symbol=f"E{i}", trading_date=today,
            buy_price=20_000, sell_price=25_500, chot_loi=30_000,
            cham_sl_cat_dung_phien_ke=False,
        )
    result = await cap3.thach_thuc(test_user.id)

    assert result["dat_ca_3"] is False
    assert result["so_lenh"]["dat"] is True
    assert result["so_lenh"]["gia_tri_hien_tai"] == 15
    assert result["so_lenh"]["muc_tieu"] == 15
    assert result["lai_pct"]["dat"] is True
    assert result["lai_pct"]["gia_tri_hien_tai"] == pytest.approx(8.25)
    assert result["diem_ky_luat"]["dat"] is False
    assert result["diem_ky_luat"]["gia_tri_hien_tai"] < 80.0
    assert "kỷ luật" in result["diem_ky_luat"]["giai_thich"]
    for key in ("lai_pct", "so_lenh", "diem_ky_luat"):
        assert result[key]["giai_thich"]  # always non-empty (§C12c)


@pytest.mark.asyncio
async def test_graduate_requires_3_of_3(db_session, test_user):
    cap1, cap2, cap3, account = await _enter_cap3(db_session, test_user.id)

    with pytest.raises(ConflictError):
        await cap3.graduate(test_user.id)

    today = date.today()
    for i in range(15):
        await _round_trip_cap3(
            db_session, cap1, cap2, cap3, account.id, test_user.id,
            symbol=f"F{i}", trading_date=today,
            buy_price=20_000, sell_price=25_500, chot_loi=25_000,
            cham_sl_cat_dung_phien_ke=True,
        )
    progress = await cap3.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    assert progress.task_2_done_at is not None
    assert progress.task_3_done_at is not None

    progress = await cap3.graduate(test_user.id)
    assert progress.graduated_at is not None
    assert progress.time_to_graduate_hours is not None

    # idempotent — graduating again doesn't move the timestamp.
    graduated_at_1 = progress.graduated_at
    progress2 = await cap3.graduate(test_user.id)
    assert progress2.graduated_at == graduated_at_1


@pytest.mark.asyncio
async def test_cap3_endpoints_wired_and_free(client, db_session, test_user):
    """Router mounted under /api/v1/cap3, gated by CurrentUser (not premium)."""
    from app.core.security import create_access_token

    await _graduate_cap2(db_session, test_user.id)
    await db_session.commit()

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/v1/cap3/progress", headers=headers)
    assert r.status_code == 200
    assert r.json() is None

    r = await client.post("/api/v1/cap3/enter", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["khau_vi_da_dat"] is False
    assert body["von_ban_dau"] == 100_000_000

    r = await client.post("/api/v1/cap3/graduate", headers=headers)
    assert r.status_code == 409

    r = await client.post(
        "/api/v1/cap3/khau-vi", headers=headers, json={"khau_vi": "can_bang"}
    )
    assert r.status_code == 200, r.text
    khau_vi_body = r.json()
    assert khau_vi_body["khau_vi"] == "can_bang"
    assert khau_vi_body["khau_vi_da_dat"] is True

    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    cap1 = Cap1Service(db_session)
    buy = await _make_order(
        db_session, account.id, test_user.id, symbol="AAA", side=OrderSide.BUY,
        qty=100, price=20_000, trading_date=date.today(),
    )
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    await db_session.commit()

    r = await client.post(
        "/api/v1/cap3/kehoach",
        headers=headers,
        json={
            "order_id": str(buy.id),
            "khau_vi": "can_bang",
            "muc_tu_tin": 3,
            "cach_khoi_luong": "linh_hoat",
            "khoi_luong": 300,
            "pct_von": 20.0,
        },
    )
    assert r.status_code == 200, r.text
    kehoach_body = r.json()
    assert kehoach_body["muc_tu_tin"] == 3
    assert kehoach_body["cach_khoi_luong"] == "linh_hoat"
    assert kehoach_body["khoi_luong"] == 300

    r = await client.patch("/api/v1/cap3/task", headers=headers, json={"task_no": 1})
    assert r.status_code == 200
    assert r.json()["task_1_done_at"] is not None

    r = await client.get("/api/v1/cap3/thach-thuc", headers=headers)
    assert r.status_code == 200, r.text
    thach_thuc_body = r.json()
    assert "lai_pct" in thach_thuc_body
    assert "so_lenh" in thach_thuc_body
    assert "diem_ky_luat" in thach_thuc_body
    assert "dat_ca_3" in thach_thuc_body

    # Unauthenticated is rejected
    r = await client.get("/api/v1/cap3/progress")
    assert r.status_code == 401
