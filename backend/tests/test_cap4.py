"""Tests for the Cấp 4 «Thuần thục» backend — đọc + tự chấm 5 lớp, vũ khí /
điểm mù (đo bằng KẾT QUẢ THẬT), tỷ lệ thắng lệnh đồng thuận cao, Thách thức
Thuần thục (triple condition), graduation.

Mirrors ``tests/test_cap3.py``'s style. Uses the ``test_user``/``db_session``
fixtures from ``tests/conftest.py``.

NOTE on dates: ``Cap4Progress.entered_at`` is real wall-clock time (not
mocked) and Cấp 4's "kết sổ Cấp 4" window is ``OrderKetso.closed_at >=
entered_at``, so Cấp-4-period round trips use ``date.today()``. Cấp 0/1/2/3
setup dates mirror ``test_cap3.py``.

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
            user_id, buy.id, khau_vi="can_bang", muc_tu_tin=3,
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
            test_user.id, buy.id, khau_vi="can_bang", muc_tu_tin=3,
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
    assert progress.ty_le_thang_dong_thuan_cao == 0.0

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
# ty_le_thang_dong_thuan_cao
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_ty_le_thang_dong_thuan_cao(db_session, test_user):
    """Win rate among closed orders with so_lop_dong_thuan >= 3 only."""
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)

    ai_cao = _doc(ky_thuat="ok", dong_tien="ok", noi_bo="ok")  # 3 lớp AI Ủng hộ
    ai_thap = _doc(ky_thuat="ok")  # 1 lớp AI Ủng hộ

    # đồng thuận cao: 4 lệnh, 3 thắng → 75%
    for i in range(4):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"H{i}", doc_5_lop=_doc(), ai_5_lop=ai_cao, win=i < 3,
        )
    # đồng thuận thấp: 4 lệnh, 0 thắng — must NOT drag the number down
    for i in range(4):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"L{i}", doc_5_lop=_doc(), ai_5_lop=ai_thap, win=False,
        )

    progress = await cap4.get_progress(test_user.id)
    assert progress.ty_le_thang_dong_thuan_cao == pytest.approx(75.0)


@pytest.mark.asyncio
async def test_ty_le_thang_dong_thuan_cao_zero_without_data(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    progress = await cap4.get_progress(test_user.id)
    assert progress.ty_le_thang_dong_thuan_cao == 0.0


# ══════════════════════════════════════════════════════
# Nhiệm vụ ①②③
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_task1_and_task2_progression(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)

    # A partially-rated order does NOT complete ①.
    partial = {k: v for k, v in _doc().items() if k != "dinh_gia"}
    await _round_trip_cap4(
        db_session, cap1, cap4, account.id, test_user.id,
        symbol="Q0", doc_5_lop=partial, close=False,
    )
    progress = await cap4.get_progress(test_user.id)
    assert progress.task_1_done_at is None
    assert progress.task_2_done_at is None

    # First fully-rated order → ① done, ② still pending (no kết sổ yet).
    await _round_trip_cap4(
        db_session, cap1, cap4, account.id, test_user.id,
        symbol="Q1", doc_5_lop=_doc(ky_thuat="ok"), close=False,
    )
    progress = await cap4.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    assert progress.task_2_done_at is None

    # First Cấp 4 kết sổ → ② done.
    await _round_trip_cap4(
        db_session, cap1, cap4, account.id, test_user.id,
        symbol="Q2", doc_5_lop=_doc(ky_thuat="ok"), win=True,
    )
    progress = await cap4.get_progress(test_user.id)
    assert progress.task_2_done_at is not None


async def _twenty_orders_all_legs(db_session, cap1, cap4, account_id, user_id) -> None:
    """20 fully-rated Cấp 4 orders satisfying all 3 legs of nhiệm vụ ③:
    so_lenh 20 · vũ khí ky_thuat (10/12 = 83%) · điểm mù tin_tuc (2/8 = 25%) ·
    đồng thuận cao thắng 10/12 = 83%."""
    ai_cao = _doc(ky_thuat="ok", dong_tien="ok", noi_bo="ok")
    ai_thap = _doc(dinh_gia="ok")
    for i in range(12):
        await _round_trip_cap4(
            db_session, cap1, cap4, account_id, user_id,
            symbol=f"AA{i}", doc_5_lop=_doc(ky_thuat="ok"), ai_5_lop=ai_cao, win=i < 10,
        )
    for i in range(8):
        await _round_trip_cap4(
            db_session, cap1, cap4, account_id, user_id,
            symbol=f"BB{i}", doc_5_lop=_doc(tin_tuc="ok"), ai_5_lop=ai_thap, win=i < 2,
        )


@pytest.mark.asyncio
async def test_task3_done_when_all_three_met(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    await _twenty_orders_all_legs(db_session, cap1, cap4, account.id, test_user.id)

    progress = await cap4.get_progress(test_user.id)
    assert progress.so_lenh_doc_du_5lop == 20
    assert progress.vu_khi_lop == "ky_thuat"
    assert progress.diem_mu_lop == "tin_tuc"
    assert progress.ty_le_thang_dong_thuan_cao == pytest.approx(1000.0 / 12)
    assert progress.task_3_done_at is not None


@pytest.mark.asyncio
async def test_task3_fails_when_only_so_lenh_short(db_session, test_user):
    """Vũ khí + điểm mù found and đồng thuận cao ≥60%, but only 18 lệnh."""
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    ai_cao = _doc(ky_thuat="ok", dong_tien="ok", noi_bo="ok")
    ai_thap = _doc(dinh_gia="ok")
    for i in range(10):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"CC{i}", doc_5_lop=_doc(ky_thuat="ok"), ai_5_lop=ai_cao, win=i < 8,
        )
    for i in range(8):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"DD{i}", doc_5_lop=_doc(tin_tuc="ok"), ai_5_lop=ai_thap, win=i < 2,
        )

    progress = await cap4.get_progress(test_user.id)
    assert progress.so_lenh_doc_du_5lop == 18
    assert progress.vu_khi_lop == "ky_thuat"
    assert progress.diem_mu_lop == "tin_tuc"
    assert progress.ty_le_thang_dong_thuan_cao == pytest.approx(80.0)
    assert progress.task_3_done_at is None


@pytest.mark.asyncio
async def test_task3_fails_when_vu_khi_diem_mu_missing(db_session, test_user):
    """20 lệnh + đồng thuận cao thắng 100%, but no lớp ever self-rated Ủng hộ
    → hệ thống chưa đủ dữ liệu để chỉ ra vũ khí/điểm mù."""
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    ai_cao = _doc(ky_thuat="ok", dong_tien="ok", noi_bo="ok")
    for i in range(20):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"EE{i}", doc_5_lop=_doc(), ai_5_lop=ai_cao, win=True,
        )

    progress = await cap4.get_progress(test_user.id)
    assert progress.so_lenh_doc_du_5lop == 20
    assert progress.ty_le_thang_dong_thuan_cao == pytest.approx(100.0)
    assert progress.vu_khi_lop is None
    assert progress.diem_mu_lop is None
    assert progress.task_3_done_at is None


@pytest.mark.asyncio
async def test_task3_fails_when_only_ty_le_thang_short(db_session, test_user):
    """20 lệnh + vũ khí + điểm mù found, but đồng thuận cao only wins 33%."""
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    ai_trung_tinh = _doc()  # 0 lớp AI Ủng hộ
    ai_cao = _doc(ky_thuat="ok", dong_tien="ok", noi_bo="ok")

    for i in range(4):  # vũ khí ky_thuat — 4/4 thắng, đồng thuận thấp
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"GG{i}", doc_5_lop=_doc(ky_thuat="ok"), ai_5_lop=ai_trung_tinh, win=True,
        )
    for i in range(4):  # điểm mù tin_tuc — 0/4 thắng, đồng thuận thấp
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"HH{i}", doc_5_lop=_doc(tin_tuc="ok"), ai_5_lop=ai_trung_tinh, win=False,
        )
    for i in range(12):  # đồng thuận cao — chỉ 4/12 thắng = 33%
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"II{i}", doc_5_lop=_doc(), ai_5_lop=ai_cao, win=i < 4,
        )

    progress = await cap4.get_progress(test_user.id)
    assert progress.so_lenh_doc_du_5lop == 20
    assert progress.vu_khi_lop == "ky_thuat"
    assert progress.diem_mu_lop == "tin_tuc"
    assert progress.ty_le_thang_dong_thuan_cao == pytest.approx(100.0 / 3)
    assert progress.task_3_done_at is None


@pytest.mark.asyncio
async def test_mark_task_recomputes_only(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    with pytest.raises(BadRequestError):
        await cap4.mark_task(test_user.id, 9)

    # No qualifying history → PATCH does not fabricate completion.
    progress = await cap4.mark_task(test_user.id, 1)
    assert progress.task_1_done_at is None

    await _round_trip_cap4(
        db_session, cap1, cap4, account.id, test_user.id,
        symbol="M0", doc_5_lop=_doc(ky_thuat="ok"), close=False,
    )
    progress = await cap4.mark_task(test_user.id, 1)
    assert progress.task_1_done_at is not None


# ══════════════════════════════════════════════════════
# GET /cap4/thach-thuc
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_thach_thuc_requires_progress(db_session, test_user):
    cap4 = Cap4Service(db_session)
    with pytest.raises(NotFoundError):
        await cap4.thach_thuc(test_user.id)


@pytest.mark.asyncio
async def test_thach_thuc_shape_and_values(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)
    ai_cao = _doc(ky_thuat="ok", dong_tien="ok", noi_bo="ok")
    for i in range(4):
        await _round_trip_cap4(
            db_session, cap1, cap4, account.id, test_user.id,
            symbol=f"JJ{i}", doc_5_lop=_doc(ky_thuat="ok"), ai_5_lop=ai_cao, win=True,
        )

    result = await cap4.thach_thuc(test_user.id)
    assert result["dat_ca_3"] is False
    assert result["so_lenh_doc_du_5lop"]["gia_tri_hien_tai"] == 4
    assert result["so_lenh_doc_du_5lop"]["muc_tieu"] == 20
    assert result["so_lenh_doc_du_5lop"]["dat"] is False
    assert result["vu_khi_diem_mu"]["gia_tri_hien_tai"] == 1  # vũ khí only
    assert result["vu_khi_diem_mu"]["muc_tieu"] == 2
    assert result["vu_khi_diem_mu"]["dat"] is False
    assert result["ty_le_thang_dong_thuan_cao"]["gia_tri_hien_tai"] == pytest.approx(100.0)
    assert result["ty_le_thang_dong_thuan_cao"]["muc_tieu"] == 60.0
    assert result["ty_le_thang_dong_thuan_cao"]["dat"] is True
    for key in ("so_lenh_doc_du_5lop", "vu_khi_diem_mu", "ty_le_thang_dong_thuan_cao"):
        assert result[key]["ten"]
        assert result[key]["giai_thich"]  # §C12c


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
    baseline = await cap4.thach_thuc(test_user.id)
    baseline_progress = await cap4.get_progress(test_user.id)

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

    # so_lop_khac_ai feeds NOTHING: điểm/nhãn/nhiệm vụ unchanged apart from the
    # extra fully-rated order (which is a reading-habit count, not an AI score).
    after = await cap4.thach_thuc(test_user.id)
    after_progress = await cap4.get_progress(test_user.id)
    assert after["vu_khi_diem_mu"] == baseline["vu_khi_diem_mu"]
    assert after["ty_le_thang_dong_thuan_cao"] == baseline["ty_le_thang_dong_thuan_cao"]
    assert after_progress.vu_khi_lop == baseline_progress.vu_khi_lop
    assert after_progress.diem_mu_lop == baseline_progress.diem_mu_lop
    assert after_progress.ty_le_thang_dong_thuan_cao == pytest.approx(
        baseline_progress.ty_le_thang_dong_thuan_cao
    )
    assert after["so_lenh_doc_du_5lop"]["gia_tri_hien_tai"] == 5


# ══════════════════════════════════════════════════════
# Graduation
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_graduate_requires_3_of_3(db_session, test_user):
    cap1, cap4, account = await _enter_cap4(db_session, test_user.id)

    with pytest.raises(ConflictError):
        await cap4.graduate(test_user.id)

    await _twenty_orders_all_legs(db_session, cap1, cap4, account.id, test_user.id)
    progress = await cap4.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    assert progress.task_2_done_at is not None
    assert progress.task_3_done_at is not None

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
    assert r.json()["task_1_done_at"] is not None

    r = await client.get("/api/v1/cap4/vu-khi-diem-mu", headers=headers)
    assert r.status_code == 200, r.text
    vk_body = r.json()
    assert len(vk_body["lop"]) == 5
    assert vk_body["vu_khi_lop"] is None
    assert vk_body["so_lenh_toi_thieu"] == 3
    assert vk_body["giai_thich"]

    r = await client.get("/api/v1/cap4/thach-thuc", headers=headers)
    assert r.status_code == 200, r.text
    tt_body = r.json()
    assert "dat_ca_3" in tt_body
    assert "so_lenh_doc_du_5lop" in tt_body
    assert "vu_khi_diem_mu" in tt_body
    assert "ty_le_thang_dong_thuan_cao" in tt_body

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
