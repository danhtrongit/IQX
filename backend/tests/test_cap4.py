"""Tests for the Cấp 4 «Thuần thục» backend — MỘT nhiệm vụ ("Đọc và chấm đủ 5
lớp qua 20 lệnh"), vũ khí / điểm mù (đo bằng KẾT QUẢ THẬT), graduation.

Mirrors ``tests/test_cap3.py``'s style. Uses the ``test_user``/``db_session``
fixtures from ``tests/conftest.py``.

★ HÌNH DẠNG MỚI (mockup ``iqx-cap4-hanhtrinh.html``): Cấp 4 có ĐÚNG MỘT nhiệm
vụ — ``so_lenh_doc_du_5lop >= 20``. "Lệnh đầu tiên đọc đủ 5 lớp", "Kết sổ lệnh
đầu Cấp 4" và khối "Thách thức Thuần thục" (3 điều kiện) đã bị GỠ cùng cột
``task_2_done_at``/``task_3_done_at``/``ty_le_thang_dong_thuan_cao``. Vũ khí /
điểm mù SỐNG TIẾP (spec §7 khối ⑨ + Khối 1 màn tốt nghiệp) nhưng KHÔNG còn là
cổng tốt nghiệp.

NOTE on dates: ``Cap4Progress.entered_at`` is real wall-clock time (not
mocked); Cấp-4-period round trips use ``date.today()``. Cấp 0/1/2/3 setup dates
mirror ``test_cap3.py``.

NOTE on the CRITICAL PRINCIPLE (spec §4/§9): nothing here rewards agreeing
with AI or penalises differing from it — ``so_lop_khac_ai`` is a neutral
count. ``test_khac_ai_is_neutral`` pins that down.
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
from app.services.cap4.service import Cap4Service

# ══════════════════════════════════════════════════════
# Setup helpers — fast-track a user through Cấp 0/1/2/3 graduation.
# ══════════════════════════════════════════════════════

_ALL_NEU = {
    "ky_thuat": "neu",
    "dong_tien": "neu",
    "noi_bo": "neu",
    "tin_tuc": "neu",
    "dinh_gia": "neu",
}


def _doc(**overrides: str) -> dict[str, str]:
    """A fully-rated ``doc_5_lop`` with all 5 lớp = 'neu' unless overridden."""
    return {**_ALL_NEU, **overrides}


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
    cat_lo: int = 18_000,
    chot_loi: int = 25_000,
    **vi_pham_flags,
):
    buy = await _make_order(
        db_session, account_id, user_id, symbol=symbol, side=OrderSide.BUY,
        price=buy_price, trading_date=trading_date,
    )
    await cap1.record_kehoach(
        user_id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=buy_price,
    )
    await cap2.record_kehoach(
        user_id, buy.id,
        phuong_phap_sl_tp="bien_do_dao_dong", cat_lo=cat_lo, chot_loi=chot_loi,
    )
    sell = await _make_order(
        db_session, account_id, user_id, symbol=symbol, side=OrderSide.SELL,
        price=sell_price, trading_date=trading_date,
    )
    await cap1.record_ketso(user_id, sell.id)
    return await cap2.record_ketso(user_id, sell.id, **vi_pham_flags)


async def _graduate_cap2(db_session, user_id) -> None:
    await _graduate_cap1(db_session, user_id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap2.enter(user_id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(user_id)

    day0 = date(2026, 2, 1)
    # Cấp 2 = 2 nhiệm vụ song song: ① 10 lệnh có đặt cắt lỗ + chốt lời, ② 2 lần
    # thực hiện đúng khi giá chạm mốc (lệnh 0 chốt lời đúng, lệnh 1 cắt lỗ đúng).
    for i in range(10):
        await _round_trip_cap2(
            db_session, cap1, cap2, account.id, user_id,
            symbol=f"P{i}", trading_date=day0 + timedelta(days=i),
            buy_price=20_000,
            sell_price=25_500 if i == 0 else 20_000,
            chot_loi=25_000,
            cham_sl_cat_dung_phien_ke=(i == 1),
        )
    await cap2.graduate(user_id)


async def _graduate_cap3(db_session, user_id) -> None:
    """Fast-track through Cấp 0+1+2+3 graduation (Cấp 4 prerequisite)."""
    await _graduate_cap2(db_session, user_id)
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    cap3 = Cap3Service(db_session)
    await cap3.enter(user_id)
    await cap3.set_khau_vi(user_id, "can_bang")
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(user_id)

    today = date.today()
    for i in range(15):
        buy = await _make_order(
            db_session, account.id, user_id, symbol=f"Z{i}", price=20_000, trading_date=today,
        )
        await cap1.record_kehoach(
            user_id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )
        await cap2.record_kehoach(
            user_id, buy.id, phuong_phap_sl_tp="bien_do_dao_dong",
            cat_lo=18_000, chot_loi=25_000,
        )
        await cap3.record_kehoach(
            user_id, buy.id, khau_vi="can_bang", muc_tu_tin=(i % 3) + 1,
            cach_khoi_luong="linh_hoat", khoi_luong=100, pct_von=20.0,
        )
        # ★ 30,000 (không phải 25,500): lãi % của Cấp 3 chia cho vốn THẬT của
        # tài khoản ảo (250,000,000đ), không phải hằng số 100tr của ví dụ trong
        # spec — xem `Cap3Service._sync_von_ban_dau`. 15 × 100cp × 10,000đ =
        # 15,000,000đ = 6% > mốc +5% của Thách thức Bản lĩnh.
        sell = await _make_order(
            db_session, account.id, user_id, symbol=f"Z{i}", side=OrderSide.SELL,
            price=30_000, trading_date=today,
        )
        await cap1.record_ketso(user_id, sell.id)
        await cap2.record_ketso(user_id, sell.id, cham_sl_cat_dung_phien_ke=True)
    await cap3.graduate(user_id)


async def _enter_cap4(db_session, user_id):
    """Graduate Cấp 0-3 then enter Cấp 4. Returns ``(cap1, cap4, account)``."""
    await _graduate_cap3(db_session, user_id)
    cap1 = Cap1Service(db_session)
    cap4 = Cap4Service(db_session)
    await cap4.enter(user_id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(user_id)
    return cap1, cap4, account


async def _round_trip_cap4(
    db_session,
    cap1: Cap1Service,
    cap4: Cap4Service,
    account_id,
    user_id,
    *,
    symbol: str,
    doc_5_lop: dict[str, str] | None,
    ai_5_lop: dict[str, str] | None = None,
    win: bool = True,
    buy_price: int = 20_000,
    close: bool = True,
):
    """Minimal Cấp 4 round trip: buy + Cấp 1 kế hoạch + Cấp 4 đọc 5 lớp
    (optional) → sell + Cấp 1 kết sổ (optional).

    Cấp 2/3's SL-TP + quản lý vốn blocks are deliberately skipped — Cấp 4's
    own metrics never read them, and every extra service call multiplies the
    setup cost of these tests.
    """
    today = date.today()
    sell_price = 22_000 if win else 18_000
    buy = await _make_order(
        db_session, account_id, user_id, symbol=symbol, price=buy_price, trading_date=today,
    )
    await cap1.record_kehoach(
        user_id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=buy_price,
    )
    if doc_5_lop is not None:
        await cap4.record_kehoach(
            user_id, buy.id, doc_5_lop=doc_5_lop, ai_5_lop=ai_5_lop,
        )
    if not close:
        return None
    sell = await _make_order(
        db_session, account_id, user_id, symbol=symbol, side=OrderSide.SELL,
        price=sell_price, trading_date=today,
    )
    return await cap1.record_ketso(user_id, sell.id)


# ══════════════════════════════════════════════════════
# Enter / prerequisites
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_enter_requires_cap3_graduated(db_session, test_user):
    svc = Cap4Service(db_session)

    # No Cấp 3 progress at all.
    with pytest.raises(NotFoundError):
        await svc.enter(test_user.id)

    # Entered Cấp 3 but not graduated.
    await _graduate_cap2(db_session, test_user.id)
    cap3 = Cap3Service(db_session)
    await cap3.enter(test_user.id)
    with pytest.raises(ConflictError):
        await svc.enter(test_user.id)

    # Graduate Cấp 3 → enter Cấp 4 succeeds.
    cap1 = Cap1Service(db_session)
    cap2 = Cap2Service(db_session)
    await cap3.set_khau_vi(test_user.id, "can_bang")
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    today = date.today()
    for i in range(15):
        buy = await _make_order(
            db_session, account.id, test_user.id, symbol=f"Z{i}",
            price=20_000, trading_date=today,
        )
        await cap1.record_kehoach(
            test_user.id, buy.id, ly_do="ky_thuat",
            trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )
        await cap2.record_kehoach(
            test_user.id, buy.id, phuong_phap_sl_tp="bien_do_dao_dong",
            cat_lo=18_000, chot_loi=25_000,
        )
        await cap3.record_kehoach(
            test_user.id, buy.id, khau_vi="can_bang", muc_tu_tin=(i % 3) + 1,
            cach_khoi_luong="linh_hoat", khoi_luong=100, pct_von=20.0,
        )
        sell = await _make_order(
            db_session, account.id, test_user.id, symbol=f"Z{i}",
            # ★ 30,000 — xem chú thích ở `_graduate_cap3` (vốn thật 250tr).
            side=OrderSide.SELL, price=30_000, trading_date=today,
        )
        await cap1.record_ketso(test_user.id, sell.id)
        await cap2.record_ketso(test_user.id, sell.id, cham_sl_cat_dung_phien_ke=True)
    await cap3.graduate(test_user.id)

    progress = await svc.enter(test_user.id)
    assert progress.user_id == test_user.id
    assert progress.graduated_at is None
    assert progress.so_lenh_doc_du_5lop == 0
    assert progress.vu_khi_lop is None
    assert progress.diem_mu_lop is None
    assert progress.task_1_done_at is None

    # idempotent
    progress2 = await svc.enter(test_user.id)
    assert progress2.id == progress.id


@pytest.mark.asyncio
async def test_get_progress_none_before_enter(db_session, test_user):
    svc = Cap4Service(db_session)
    assert await svc.get_progress(test_user.id) is None


# ══════════════════════════════════════════════════════
# POST /cap4/kehoach — đọc 5 lớp onto the EXISTING order_kehoach row
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_record_kehoach_requires_progress(db_session, test_user):
    await _graduate_cap3(db_session, test_user.id)
    cap1 = Cap1Service(db_session)
    cap4 = Cap4Service(db_session)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    with pytest.raises(NotFoundError):
        await cap4.record_kehoach(test_user.id, buy.id, doc_5_lop=_doc())


@pytest.mark.asyncio
async def test_record_kehoach_requires_existing_cap1_row(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    # No Cấp 1 kế hoạch row for this order → 404 (same convention as cap2/cap3).
    with pytest.raises(NotFoundError):
        await cap4.record_kehoach(test_user.id, buy.id, doc_5_lop=_doc())


@pytest.mark.asyncio
async def test_record_kehoach_adds_json_and_counts_to_existing_row(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    kehoach_1 = await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )

    doc = _doc(ky_thuat="ok", dong_tien="ok", tin_tuc="bad")
    ai = _doc(ky_thuat="ok", dong_tien="ok", noi_bo="ok", tin_tuc="neu")
    kehoach_2 = await cap4.record_kehoach(
        test_user.id, buy.id, doc_5_lop=doc, ai_5_lop=ai,
    )

    assert kehoach_2.id == kehoach_1.id  # same row, extended in place
    assert kehoach_2.lyDo.value == "ky_thuat"  # Cấp 1 fields untouched
    assert kehoach_2.vung_mua == 20_000
    assert kehoach_2.doc_5_lop == doc
    assert kehoach_2.ai_5_lop == ai
    # AI rated 3 lớp Ủng hộ → điểm đồng thuận 3/5 (spec §5.2)
    assert kehoach_2.so_lop_dong_thuan == 3
    # user differs from AI on noi_bo (neu vs ok) + tin_tuc (bad vs neu) → 2
    assert kehoach_2.so_lop_khac_ai == 2


@pytest.mark.asyncio
async def test_record_kehoach_without_ai_leaves_counts_null(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    kehoach = await cap4.record_kehoach(test_user.id, buy.id, doc_5_lop=_doc(ky_thuat="ok"))
    assert kehoach.ai_5_lop is None
    assert kehoach.so_lop_dong_thuan is None
    assert kehoach.so_lop_khac_ai is None


@pytest.mark.asyncio
async def test_record_kehoach_recomputes_counts_ignoring_client_values(db_session, test_user):
    """Client-sent counts are advisory only — the server derives them from the
    two JSON blobs (never trust the client)."""
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    kehoach = await cap4.record_kehoach(
        test_user.id, buy.id,
        doc_5_lop=_doc(ky_thuat="ok"),
        ai_5_lop=_doc(ky_thuat="ok", dong_tien="ok"),
        so_lop_dong_thuan=5,  # bogus
        so_lop_khac_ai=0,  # bogus
    )
    assert kehoach.so_lop_dong_thuan == 2
    assert kehoach.so_lop_khac_ai == 1


@pytest.mark.asyncio
async def test_record_kehoach_rejects_invalid_payloads(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    buy = await _make_order(db_session, account.id, test_user.id, symbol="AAA")
    await cap1.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )

    with pytest.raises(BadRequestError):  # unknown lớp
        await cap4.record_kehoach(
            test_user.id, buy.id, doc_5_lop={"thanh_khoan": "ok"},
        )
    with pytest.raises(BadRequestError):  # invalid rating
        await cap4.record_kehoach(
            test_user.id, buy.id, doc_5_lop=_doc(ky_thuat="tot"),
        )
    with pytest.raises(BadRequestError):  # empty
        await cap4.record_kehoach(test_user.id, buy.id, doc_5_lop={})
    with pytest.raises(BadRequestError):  # not a mapping
        await cap4.record_kehoach(test_user.id, buy.id, doc_5_lop=["ok"])
    with pytest.raises(BadRequestError):  # invalid ai rating
        await cap4.record_kehoach(
            test_user.id, buy.id, doc_5_lop=_doc(), ai_5_lop={"ky_thuat": "rat_manh"},
        )


@pytest.mark.asyncio
async def test_record_kehoach_rejects_sell_order(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    sell = await _make_order(db_session, account.id, test_user.id, side=OrderSide.SELL)
    with pytest.raises(BadRequestError):
        await cap4.record_kehoach(test_user.id, sell.id, doc_5_lop=_doc())


# ══════════════════════════════════════════════════════
# so_lenh_doc_du_5lop — only fully-rated orders count
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_so_lenh_doc_du_5lop_counts_only_fully_rated(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)

    # 2 fully-rated (all 5 lớp) — counted.
    for i in range(2):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"F{i}", doc_5_lop=_doc(ky_thuat="ok"), close=False,
        )
    # 1 partially rated (only 4 lớp) — NOT counted.
    partial = {k: v for k, v in _doc().items() if k != "dinh_gia"}
    await _round_trip_cap4(
        db_session, cap1, cap4, account.id, test_user.id,
        symbol="PART", doc_5_lop=partial, close=False,
    )
    # 1 with no Cấp 4 block at all — NOT counted.
    await _round_trip_cap4(
        db_session, cap1, cap4, account.id, test_user.id,
        symbol="NONE", doc_5_lop=None, close=False,
    )

    progress = await cap4.get_progress(test_user.id)
    assert progress.so_lenh_doc_du_5lop == 2


# ══════════════════════════════════════════════════════
# GET /cap4/vu-khi-diem-mu — per-lớp REAL win rate
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_vu_khi_diem_mu_requires_progress(db_session, test_user):
    cap4 = Cap4Service(db_session)
    with pytest.raises(NotFoundError):
        await cap4.vu_khi_diem_mu(test_user.id)


@pytest.mark.asyncio
async def test_vu_khi_diem_mu_needs_3_closed_orders_per_lop(db_session, test_user):
    """2 winning orders self-rated Ủng hộ on a lớp → 'chưa đủ dữ liệu', no
    vũ khí (spec §8: cần ≥3 lệnh/lớp)."""
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    for i in range(2):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"W{i}", doc_5_lop=_doc(ky_thuat="ok"), win=True,
        )

    result = await cap4.vu_khi_diem_mu(test_user.id)
    by_lop = {row["lop"]: row for row in result["lop"]}
    assert by_lop["ky_thuat"]["n_orders"] == 2
    assert by_lop["ky_thuat"]["n_wins"] == 2
    assert by_lop["ky_thuat"]["nhan"] == "chua_du_du_lieu"
    assert result["vu_khi_lop"] is None
    assert result["diem_mu_lop"] is None
    assert result["so_lenh_toi_thieu"] == 3
    # lớp never self-rated Ủng hộ → 0 lệnh, no win rate at all
    assert by_lop["dinh_gia"]["n_orders"] == 0
    assert by_lop["dinh_gia"]["win_rate"] is None
    assert by_lop["dinh_gia"]["nhan"] == "chua_du_du_lieu"
    for row in result["lop"]:
        assert row["giai_thich"]  # §C12c — provenance always present
        assert row["ten"]

    progress = await cap4.get_progress(test_user.id)
    assert progress.vu_khi_lop is None
    assert progress.diem_mu_lop is None


@pytest.mark.asyncio
async def test_vu_khi_diem_mu_thresholds(db_session, test_user):
    """≥70% = vũ khí · <50% = điểm mù · in between = no label."""
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)

    # ky_thuat: 3 lệnh, 3 thắng → 100% → vũ khí
    for i in range(3):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"K{i}", doc_5_lop=_doc(ky_thuat="ok"), win=True,
        )
    # tin_tuc: 3 lệnh, 0 thắng → 0% → điểm mù
    for i in range(3):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"T{i}", doc_5_lop=_doc(tin_tuc="ok"), win=False,
        )
    # noi_bo: 3 lệnh, 2 thắng → 66.7% → no label (between 50 and 70)
    for i in range(3):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"N{i}", doc_5_lop=_doc(noi_bo="ok"), win=i < 2,
        )

    result = await cap4.vu_khi_diem_mu(test_user.id)
    by_lop = {row["lop"]: row for row in result["lop"]}

    assert by_lop["ky_thuat"]["win_rate"] == pytest.approx(100.0)
    assert by_lop["ky_thuat"]["nhan"] == "vu_khi"
    assert by_lop["tin_tuc"]["win_rate"] == pytest.approx(0.0)
    assert by_lop["tin_tuc"]["nhan"] == "diem_mu"
    assert by_lop["noi_bo"]["n_orders"] == 3
    assert by_lop["noi_bo"]["win_rate"] == pytest.approx(200.0 / 3)
    assert by_lop["noi_bo"]["nhan"] is None

    assert result["vu_khi_lop"] == "ky_thuat"
    assert result["diem_mu_lop"] == "tin_tuc"

    # sorted by win rate desc, lớp with no data last (spec §7⑨)
    rates = [r["win_rate"] for r in result["lop"] if r["win_rate"] is not None]
    assert rates == sorted(rates, reverse=True)

    # persisted onto the progress row
    progress = await cap4.get_progress(test_user.id)
    assert progress.vu_khi_lop == "ky_thuat"
    assert progress.diem_mu_lop == "tin_tuc"


@pytest.mark.asyncio
async def test_vu_khi_diem_mu_ignores_open_and_unrated_orders(db_session, test_user):
    """Only CLOSED orders (with a kết sổ) count; 'neu'/'bad' ratings never do."""
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)

    for i in range(3):  # open (no sell) — must not count
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"O{i}", doc_5_lop=_doc(ky_thuat="ok"), close=False,
        )
    for i in range(3):  # closed but rated 'bad' — must not count for ky_thuat
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"B{i}", doc_5_lop=_doc(ky_thuat="bad"), win=True,
        )

    result = await cap4.vu_khi_diem_mu(test_user.id)
    by_lop = {row["lop"]: row for row in result["lop"]}
    assert by_lop["ky_thuat"]["n_orders"] == 0
    assert result["vu_khi_lop"] is None


# ══════════════════════════════════════════════════════
# Nhiệm vụ DUY NHẤT — "Đọc và chấm đủ 5 lớp qua 20 lệnh"
# ══════════════════════════════════════════════════════


async def _twenty_reads(db_session, cap1, cap4, account_id, user_id) -> None:
    """20 lệnh đã đọc + chấm đủ 5 lớp — đúng cổng duy nhất của Cấp 4.

    Cố tình KHÔNG dựng vũ khí/điểm mù: chúng không còn là điều kiện tốt
    nghiệp, và một helper dựng sẵn chúng sẽ che mất chính hồi quy đó.
    """
    for i in range(20):
        await _round_trip_cap4(
            db_session, cap1, cap4, account_id, user_id,
            symbol=f"AA{i}", doc_5_lop=_doc(), win=i < 10,
        )


@pytest.mark.asyncio
async def test_nhiem_vu_needs_20_fully_rated_orders(db_session, test_user):
    """★ Cổng DUY NHẤT của Cấp 4: 20 lệnh đọc + chấm đủ 5 lớp.

    Một lệnh chấm thiếu lớp không được tính; 19 lệnh chưa xong; lệnh thứ 20
    mới đóng dấu.
    """
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)

    # Lệnh chấm thiếu 1 lớp → không tính.
    partial = {k: v for k, v in _doc().items() if k != "dinh_gia"}
    await _round_trip_cap4(
        db_session, cap1, cap4, account.id, test_user.id,
        symbol="Q0", doc_5_lop=partial, close=False,
    )
    progress = await cap4.get_progress(test_user.id)
    assert progress.so_lenh_doc_du_5lop == 0
    assert progress.task_1_done_at is None

    # 19 lệnh đủ 5 lớp → vẫn chưa xong (không có "gần đủ thì cho qua").
    for i in range(19):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"R{i}", doc_5_lop=_doc(), close=False,
        )
    progress = await cap4.get_progress(test_user.id)
    assert progress.so_lenh_doc_du_5lop == 19
    assert progress.task_1_done_at is None

    # Lệnh thứ 20 → đóng dấu.
    await _round_trip_cap4(
        db_session, cap1, cap4, account.id, test_user.id,
        symbol="R19", doc_5_lop=_doc(), close=False,
    )
    progress = await cap4.get_progress(test_user.id)
    assert progress.so_lenh_doc_du_5lop == 20
    assert progress.task_1_done_at is not None

    # Đã đóng dấu thì KHÔNG bao giờ gỡ ra (quy ước Cấp 1/2/3).
    stamped = progress.task_1_done_at
    progress = await cap4.get_progress(test_user.id)
    assert progress.task_1_done_at == stamped


@pytest.mark.asyncio
async def test_nhiem_vu_does_not_need_ket_so_or_vu_khi(db_session, test_user):
    """★ HỒI QUY: hai nhiệm vụ cũ (Kết sổ lệnh đầu · Thách thức Thuần thục 3
    điều kiện) đã bị GỠ — 20 lệnh MỞ, không lệnh nào đóng, không lớp nào tự
    chấm Ủng hộ, vẫn đủ điều kiện tốt nghiệp."""
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    for i in range(20):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"OP{i}", doc_5_lop=_doc(), close=False,
        )

    progress = await cap4.get_progress(test_user.id)
    assert progress.so_lenh_doc_du_5lop == 20
    assert progress.task_1_done_at is not None
    # Chưa có lệnh đóng nào → chưa kết luận được vũ khí/điểm mù, và đó KHÔNG
    # phải lý do chặn tốt nghiệp nữa.
    assert progress.vu_khi_lop is None
    assert progress.diem_mu_lop is None

    graduated = await cap4.graduate(test_user.id)
    assert graduated.graduated_at is not None


@pytest.mark.asyncio
async def test_progress_row_has_no_removed_columns(db_session, test_user):
    """Cột của 2 nhiệm vụ đã gỡ + tỷ lệ đồng thuận cao KHÔNG còn tồn tại.

    ★ Luật 1: ``ty_le_thang_dong_thuan_cao`` là ``NOT NULL DEFAULT 0`` — "chưa
    có lệnh đồng thuận cao nào" bị in ra thành 0%. Nó đi cùng khối Thách thức.
    """
    _cap1, cap4, _account = await _enter_cap4(db_session, test_user.id)
    progress = await cap4.get_progress(test_user.id)
    for gone in ("task_2_done_at", "task_3_done_at", "ty_le_thang_dong_thuan_cao"):
        assert not hasattr(progress, gone), gone


@pytest.mark.asyncio
async def test_mark_task_recomputes_only(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    # Cấp 4 chỉ còn nhiệm vụ ① — ② và ③ không còn là task_no hợp lệ.
    for bad in (0, 2, 3, 9):
        with pytest.raises(BadRequestError):
            await cap4.mark_task(test_user.id, bad)

    # No qualifying history → PATCH does not fabricate completion.
    progress = await cap4.mark_task(test_user.id, 1)
    assert progress.task_1_done_at is None

    await _twenty_reads(db_session, cap1, cap4, account.id, test_user.id)
    progress = await cap4.mark_task(test_user.id, 1)
    assert progress.task_1_done_at is not None


@pytest.mark.asyncio
async def test_thach_thuc_endpoint_is_gone(db_session, test_user):
    """Khối "Thách thức Thuần thục" (3 điều kiện) đã bị gỡ khỏi service."""
    cap4 = Cap4Service(db_session)
    assert not hasattr(cap4, "thach_thuc")


# ══════════════════════════════════════════════════════
# CRITICAL PRINCIPLE — khác AI is NEVER scored đúng/sai
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_khac_ai_is_neutral(db_session, test_user):
    """Two identical histories that differ ONLY in how much the user's reading
    diverges from AI must produce IDENTICAL Cấp 4 metrics (spec §4/§9)."""
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)

    # 4 lệnh where the user reads EXACTLY like AI, all winning.
    same = _doc(ky_thuat="ok", dong_tien="ok", noi_bo="ok")
    for i in range(4):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"S{i}", doc_5_lop=same, ai_5_lop=same, win=True,
        )
    baseline = await cap4.vu_khi_diem_mu(test_user.id)
    baseline_progress = await cap4.get_progress(test_user.id)
    # ★ Chụp GIÁ TRỊ, không giữ tham chiếu: `get_progress` trả về CÙNG một
    # object ORM (identity map của session), nên so sánh object với chính nó
    # sau khi recompute là một bài canh luôn xanh.
    baseline_vu_khi = baseline_progress.vu_khi_lop
    baseline_diem_mu = baseline_progress.diem_mu_lop
    baseline_so_lenh = baseline_progress.so_lenh_doc_du_5lop

    other = await _make_order(db_session, account.id, test_user.id, symbol="XX")
    await cap1.record_kehoach(
        test_user.id, other.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    kehoach = await cap4.record_kehoach(
        test_user.id, other.id,
        doc_5_lop=_doc(ky_thuat="bad", dong_tien="bad", noi_bo="bad", tin_tuc="bad"),
        ai_5_lop=same,
    )
    assert kehoach.so_lop_khac_ai == 4  # neutral count, recorded

    # so_lop_khac_ai feeds NOTHING: nhãn/vũ khí/điểm mù không đổi, chỉ có số
    # lệnh đọc đủ 5 lớp tăng (thói quen đọc, không phải điểm khớp AI).
    after = await cap4.vu_khi_diem_mu(test_user.id)
    after_progress = await cap4.get_progress(test_user.id)
    assert after["lop"] == baseline["lop"]
    assert after["vu_khi_lop"] == baseline["vu_khi_lop"]
    assert after["diem_mu_lop"] == baseline["diem_mu_lop"]
    assert after_progress.vu_khi_lop == baseline_vu_khi
    assert after_progress.diem_mu_lop == baseline_diem_mu
    assert after_progress.so_lenh_doc_du_5lop == baseline_so_lenh + 1


# ══════════════════════════════════════════════════════
# Graduation
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_graduate_requires_the_single_task(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)

    with pytest.raises(ConflictError):
        await cap4.graduate(test_user.id)

    # 19 lệnh — vẫn chưa được.
    for i in range(19):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"T{i}", doc_5_lop=_doc(), close=False,
        )
    with pytest.raises(ConflictError):
        await cap4.graduate(test_user.id)

    await _round_trip_cap4(
        db_session, cap1, cap4, account.id, test_user.id,
        symbol="T19", doc_5_lop=_doc(), close=False,
    )
    progress = await cap4.get_progress(test_user.id)
    assert progress.task_1_done_at is not None

    progress = await cap4.graduate(test_user.id)
    assert progress.graduated_at is not None
    assert progress.time_to_graduate_hours is not None

    graduated_at_1 = progress.graduated_at
    progress2 = await cap4.graduate(test_user.id)
    assert progress2.graduated_at == graduated_at_1


# ══════════════════════════════════════════════════════
# HTTP wiring
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_cap4_endpoints_wired_and_free(client, db_session, test_user):
    """Router mounted under /api/v1/cap4, gated by CurrentUser (not premium)."""
    from app.core.security import create_access_token

    await _graduate_cap3(db_session, test_user.id)
    await db_session.commit()

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/v1/cap4/progress", headers=headers)
    assert r.status_code == 200
    assert r.json() is None

    r = await client.post("/api/v1/cap4/enter", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["so_lenh_doc_du_5lop"] == 0
    assert body["vu_khi_lop"] is None
    # Wire shape của Cấp 4 mới — 1 nhiệm vụ, không tỷ lệ đồng thuận cao.
    assert "task_1_done_at" in body
    for gone in ("task_2_done_at", "task_3_done_at", "ty_le_thang_dong_thuan_cao"):
        assert gone not in body, gone

    r = await client.post("/api/v1/cap4/graduate", headers=headers)
    assert r.status_code == 409

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
        "/api/v1/cap4/kehoach",
        headers=headers,
        json={
            "order_id": str(buy.id),
            "doc_5_lop": _doc(ky_thuat="ok", tin_tuc="bad"),
            "ai_5_lop": _doc(ky_thuat="ok", dong_tien="ok"),
            "so_lop_dong_thuan": 2,
            "so_lop_khac_ai": 2,
        },
    )
    assert r.status_code == 200, r.text
    kehoach_body = r.json()
    assert kehoach_body["doc_5_lop"]["ky_thuat"] == "ok"
    assert kehoach_body["ai_5_lop"]["dong_tien"] == "ok"
    assert kehoach_body["so_lop_dong_thuan"] == 2
    assert kehoach_body["so_lop_khac_ai"] == 2

    r = await client.patch("/api/v1/cap4/task", headers=headers, json={"task_no": 1})
    assert r.status_code == 200, r.text
    # 1 lệnh đọc đủ 5 lớp — CHƯA đủ 20, nên nhiệm vụ vẫn chưa xong.
    assert r.json()["task_1_done_at"] is None

    r = await client.get("/api/v1/cap4/vu-khi-diem-mu", headers=headers)
    assert r.status_code == 200, r.text
    vk_body = r.json()
    assert len(vk_body["lop"]) == 5
    assert vk_body["vu_khi_lop"] is None
    assert vk_body["so_lenh_toi_thieu"] == 3
    assert vk_body["giai_thich"]

    # Khối "Thách thức Thuần thục" đã bị gỡ cùng 2 nhiệm vụ kia.
    r = await client.get("/api/v1/cap4/thach-thuc", headers=headers)
    assert r.status_code == 404

    # Invalid payload → 400 from the service's own validation.
    r = await client.post(
        "/api/v1/cap4/kehoach",
        headers=headers,
        json={"order_id": str(buy.id), "doc_5_lop": {"thanh_khoan": "ok"}},
    )
    assert r.status_code == 400, r.text

    # Unauthenticated is rejected
    r = await client.get("/api/v1/cap4/progress")
    assert r.status_code == 401


# ── Migration: 3 nhiệm vụ + Thách thức Thuần thục → 1 nhiệm vụ ───


#: The shape production is on today, at revision ``b76c7019f77b``. Written out
#: by hand so this test pins the migration against the columns that actually
#: exist in prod, not against whatever the ORM says after the change.
_PROD_CAP4_PROGRESS_DDL = """
CREATE TABLE cap4_progress (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    entered_at TIMESTAMP NOT NULL,
    task_1_done_at TIMESTAMP,
    task_2_done_at TIMESTAMP,
    task_3_done_at TIMESTAMP,
    so_lenh_doc_du_5lop INTEGER NOT NULL DEFAULT 0,
    vu_khi_lop VARCHAR(32),
    diem_mu_lop VARCHAR(32),
    ty_le_thang_dong_thuan_cao FLOAT NOT NULL DEFAULT 0,
    graduated_at TIMESTAMP,
    time_to_graduate_hours FLOAT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""


def _load_cap4_1task_migration():
    """Import the revision module by path — ``alembic/versions`` is not a package."""
    import importlib.util
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "a3f7c1d9e2b8_cap4_one_task_doc_5_lop_20_lenh.py"
    )
    spec = importlib.util.spec_from_file_location("_cap4_1task_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_cap4_migration(conn, direction: str) -> None:
    """Run the real ``upgrade()``/``downgrade()`` body against ``conn``."""
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    module = _load_cap4_1task_migration()
    with Operations.context(MigrationContext.configure(conn)):
        getattr(module, direction)()


def _cap4_columns(conn) -> list[str]:
    return [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(cap4_progress)").fetchall()]


def _cap4_rows(conn) -> dict[str, dict]:
    cols = _cap4_columns(conn)
    out = {}
    for row in conn.exec_driver_sql(f"SELECT {', '.join(cols)} FROM cap4_progress").fetchall():
        record = dict(zip(cols, row, strict=True))
        out[record["id"]] = record
    return out


def _seed_old_shape_cap4_rows(conn) -> None:
    """Old-shape rows under the 3-task model.

    ★ PROD kỳ vọng 0 dòng ``cap4_progress`` (trần cấp đang là 3, không ai vào
    được Cấp 4) — nhưng "kỳ vọng" không phải "chứng minh", nên ánh xạ vẫn phải
    được kiểm trên dữ liệu kiểu-prod thật. Mỗi cột nhiệm vụ mang một mốc thời
    gian KHÁC NHAU để phân biệt "ánh xạ đúng ô" với "bị xáo".
    """
    conn.exec_driver_sql(_PROD_CAP4_PROGRESS_DDL)
    # ① Người đã xong cả 3 nhiệm vụ cũ và đã tốt nghiệp.
    conn.exec_driver_sql(
        """
        INSERT INTO cap4_progress (
            id, user_id, entered_at, task_1_done_at, task_2_done_at, task_3_done_at,
            so_lenh_doc_du_5lop, vu_khi_lop, diem_mu_lop, ty_le_thang_dong_thuan_cao,
            graduated_at
        ) VALUES (
            'tn1', 'u-tn1', '2026-01-01 00:00:00',
            '2026-01-01 01:00:00',  -- ① cũ: lệnh ĐẦU TIÊN đọc đủ 5 lớp (1 lệnh!)
            '2026-01-01 02:00:00',  -- ② cũ: kết sổ lệnh đầu Cấp 4   (bị xoá)
            '2026-01-01 03:00:00',  -- ③ cũ: Thách thức Thuần thục ⇒ ĐÃ có ≥20 lệnh
            24, 'ky_thuat', 'tin_tuc', 83.3,
            '2026-01-01 04:00:00'
        )
        """
    )
    # ② Người mới đọc được 6 lệnh — ① cũ đã đóng dấu, ③ thì chưa.
    conn.exec_driver_sql(
        """
        INSERT INTO cap4_progress (
            id, user_id, entered_at, task_1_done_at, task_2_done_at, task_3_done_at,
            so_lenh_doc_du_5lop, ty_le_thang_dong_thuan_cao
        ) VALUES (
            'dd1', 'u-dd1', '2026-02-01 00:00:00',
            '2026-02-01 01:00:00', '2026-02-01 02:00:00', NULL,
            6, 0
        )
        """
    )
    # ③ Người vừa vào cấp, chưa làm gì.
    conn.exec_driver_sql(
        """
        INSERT INTO cap4_progress (id, user_id, entered_at, so_lenh_doc_du_5lop,
                                   ty_le_thang_dong_thuan_cao)
        VALUES ('tr1', 'u-tr1', '2026-03-01 00:00:00', 0, 0)
        """
    )


def test_cap4_migration_maps_task3_into_the_single_task_slot():
    """★ Ánh xạ: nhiệm vụ DUY NHẤT mới = ③ cũ (mốc duy nhất bảo chứng ≥20 lệnh).

    ① cũ ("lệnh ĐẦU TIÊN đọc đủ 5 lớp") chỉ bảo chứng 1 lệnh — giữ nó lại trong
    ô ① mới sẽ tặng không một dấu tick 20-lệnh cho người mới đọc 1 lệnh, và
    ``graduate()`` mới chỉ nhìn đúng ô đó. Nên nó bị xoá.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_old_shape_cap4_rows(conn)
        _run_cap4_migration(conn, "upgrade")

        cols = _cap4_columns(conn)
        for gone in ("task_2_done_at", "task_3_done_at", "ty_le_thang_dong_thuan_cao"):
            assert gone not in cols, gone
        for kept in ("task_1_done_at", "so_lenh_doc_du_5lop", "vu_khi_lop", "diem_mu_lop"):
            assert kept in cols, kept

        rows = _cap4_rows(conn)
        # Người đã xong ③ cũ → giữ nguyên mốc ③, KHÔNG phải mốc ① cũ.
        assert rows["tn1"]["task_1_done_at"] == "2026-01-01 03:00:00"
        assert rows["tn1"]["graduated_at"] == "2026-01-01 04:00:00"
        assert rows["tn1"]["so_lenh_doc_du_5lop"] == 24
        assert rows["tn1"]["vu_khi_lop"] == "ky_thuat"
        # Người mới 6 lệnh: ① cũ bị gỡ — họ CHƯA đạt cổng 20 lệnh.
        assert rows["dd1"]["task_1_done_at"] is None
        assert rows["dd1"]["so_lenh_doc_du_5lop"] == 6
        # Người chưa làm gì: không đổi.
        assert rows["tr1"]["task_1_done_at"] is None
        assert rows["tr1"]["entered_at"] == "2026-03-01 00:00:00"


def test_cap4_migration_round_trips_up_down_up_twice():
    """upgrade → downgrade → upgrade → downgrade → upgrade là bất động.

    Downgrade LOSSY theo thiết kế — xem docstring của revision.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_old_shape_cap4_rows(conn)
        _run_cap4_migration(conn, "upgrade")
        after_first = _cap4_rows(conn)

        _run_cap4_migration(conn, "downgrade")
        cols = _cap4_columns(conn)
        for back in ("task_2_done_at", "task_3_done_at", "ty_le_thang_dong_thuan_cao"):
            assert back in cols, back

        down = _cap4_rows(conn)
        # ③ cũ quay lại từ ô nhiệm vụ duy nhất…
        assert down["tn1"]["task_3_done_at"] == "2026-01-01 03:00:00"
        # …nhưng ① và ② cũ, cùng tỷ lệ đồng thuận cao, KHÔNG dựng lại được.
        assert down["tn1"]["task_1_done_at"] is None
        assert down["tn1"]["task_2_done_at"] is None
        assert down["tn1"]["ty_le_thang_dong_thuan_cao"] == 0
        assert down["dd1"]["task_3_done_at"] is None

        _run_cap4_migration(conn, "upgrade")
        assert _cap4_rows(conn) == after_first

        # Vòng thứ hai — không được trôi thêm.
        _run_cap4_migration(conn, "downgrade")
        _run_cap4_migration(conn, "upgrade")
        assert _cap4_rows(conn) == after_first
