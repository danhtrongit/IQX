"""Tests for the Cấp 1 «Học việc» backend — progression, kế hoạch, kết sổ,
task counters, graduation.

Mirrors ``tests/test_cap0.py``'s style. Uses the ``test_user``/``db_session``
fixtures from ``tests/conftest.py``.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from unittest.mock import patch

import pytest

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap0.service import Cap0Service
from app.services.cap1.service import Cap1Service
from app.services.virtual_trading.price_resolver import PriceResult


async def _valid_symbol(_symbol: str) -> bool:
    return True


async def _fixed_price(_symbol: str, **_kwargs) -> PriceResult:
    return PriceResult(
        price_vnd=20_000,
        source="cap1-test",
        timestamp=datetime.now(UTC),
    )


async def _graduate_cap0(db_session, user_id) -> None:
    """Complete the documented five-task Cấp 0 flow as setup."""
    cap0 = Cap0Service(db_session)
    await cap0.enter(user_id)
    await cap0.set_placement(user_id, answer="never")
    account = await VirtualTradingRepository(db_session).get_account_by_user_id(user_id)
    buy = await _make_order(db_session, account.id, user_id, symbol="VNM", mode="san_tap")
    await cap0.record_kehoach(user_id, buy.id, ly_do_doi_thuong="thu_cho_biet")
    await cap0.complete_task(user_id, 1, gate="star")
    for tour in ("phantich", "bantin", "bctc"):
        await cap0.complete_tour(user_id, tour)
    await _make_order(
        db_session, account.id, user_id, symbol="VNM", side=OrderSide.SELL,
        mode="san_tap", trading_date=date(2026, 1, 8),
    )
    await cap0.complete_task(user_id, 5, gate="debrief")
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
    """Directly create a filled VirtualOrder (bypasses the matching engine —
    cap1's service only reads order/trade data, so this is sufficient setup)."""
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


@pytest.mark.asyncio
async def test_enter_requires_cap0_graduated(db_session, test_user):
    svc = Cap1Service(db_session)

    # No Cấp 0 progress at all.
    with pytest.raises(NotFoundError):
        await svc.enter(test_user.id)

    # Entered Cấp 0 but not graduated.
    cap0 = Cap0Service(db_session)
    await cap0.enter(test_user.id)
    with pytest.raises(ConflictError):
        await svc.enter(test_user.id)

    # Graduate the documented five-task journey → enter Cấp 1 succeeds.
    await _graduate_cap0(db_session, test_user.id)

    progress = await svc.enter(test_user.id)
    assert progress.user_id == test_user.id
    assert progress.graduated_at is None
    assert progress.da_xem_tour is True  # Nhánh A: came from Cấp 0 → skip tours

    # idempotent
    progress2 = await svc.enter(test_user.id)
    assert progress2.id == progress.id


@pytest.mark.asyncio
async def test_direct_cap1_placement_is_tour_gated_until_all_three_tours_complete(
    db_session, test_user
):
    """Nhánh B enters Cấp 1 without graduating Cấp 0, but cannot write its
    first plan until the single shared three-tour flag becomes true."""
    cap0 = Cap0Service(db_session)
    placement = await cap0.set_placement(test_user.id, answer="unsure")
    assert placement.placed_level == 1
    assert placement.da_xem_tour is False

    account = await VirtualTradingRepository(db_session).create_account(
        test_user.id, 100_000_000
    )
    svc = Cap1Service(db_session)
    assert await svc.get_current_level(test_user.id) == 1
    progress = await svc.enter(test_user.id)
    assert progress.da_xem_tour is False

    order = await _make_order(db_session, account.id, test_user.id)
    with pytest.raises(ConflictError, match="3 tour"):
        await svc.record_kehoach(
            test_user.id,
            order.id,
            ly_do="ky_thuat",
            trang_thai_luc_dat="ung_ho",
            vung_mua=20_000,
        )

    for index, tour in enumerate(("phantich", "bantin", "bctc"), start=1):
        placement, completed = await cap0.complete_tour(test_user.id, tour)
        assert len(completed) == index
        assert placement.da_xem_tour is (index == 3)

    await db_session.refresh(progress)
    assert progress.da_xem_tour is True
    kehoach = await svc.record_kehoach(
        test_user.id,
        order.id,
        ly_do="ky_thuat",
        trang_thai_luc_dat="ung_ho",
        vung_mua=20_000,
    )
    assert kehoach.order_id == order.id


@pytest.mark.asyncio
async def test_record_kehoach_marks_task1_and_supports_idempotent_recovery(
    db_session, test_user
):
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    await svc.enter(test_user.id)

    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    order = await _make_order(db_session, account.id, test_user.id, symbol="AAA")

    kehoach = await svc.record_kehoach(
        test_user.id,
        order.id,
        ly_do="ky_thuat",
        trang_thai_luc_dat="ung_ho",
        vung_mua=20_000,
        co_bam_doc_chi_tiet=True,
    )
    assert kehoach.order_id == order.id
    assert kehoach.lyDo.value == "ky_thuat"
    assert kehoach.co_bam_doc_chi_tiet is True

    progress = await svc.get_progress(test_user.id)
    assert progress.task_1_done_at is not None
    assert progress.so_ly_do_da_dung == 1
    assert progress.so_lenh_ly_do_ung_ho == 1

    recovered = await svc.record_kehoach(
        test_user.id,
        order.id,
        ly_do="ky_thuat",
        trang_thai_luc_dat="ung_ho",
        vung_mua=20_000,
        co_bam_doc_chi_tiet=True,
    )
    assert recovered.id == kehoach.id

    # The retry path can recover the already-committed row, but cannot rewrite
    # the immutable buy-time decision with a different payload.
    with pytest.raises(ConflictError):
        await svc.record_kehoach(
            test_user.id,
            order.id,
            ly_do="tin_tuc",
            trang_thai_luc_dat="trung_tinh",
            vung_mua=20_000,
        )


@pytest.mark.asyncio
async def test_record_kehoach_rejects_sell_order_and_foreign_order(db_session, test_user):
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    await svc.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    sell_order = await _make_order(db_session, account.id, test_user.id, side=OrderSide.SELL)

    with pytest.raises(BadRequestError):
        await svc.record_kehoach(
            test_user.id, sell_order.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=1,
        )

    san_tap = await _make_order(
        db_session, account.id, test_user.id, symbol="PRACTICE", mode="san_tap"
    )
    with pytest.raises(BadRequestError, match="Thực chiến"):
        await svc.record_kehoach(
            test_user.id,
            san_tap.id,
            ly_do="ky_thuat",
            trang_thai_luc_dat="ung_ho",
            vung_mua=20_000,
        )

    cancelled = await _make_order(
        db_session,
        account.id,
        test_user.id,
        symbol="CANCELLED",
        status=OrderStatus.CANCELLED,
    )
    with pytest.raises(BadRequestError, match="đang chờ hoặc đã khớp"):
        await svc.record_kehoach(
            test_user.id,
            cancelled.id,
            ly_do="ky_thuat",
            trang_thai_luc_dat="ung_ho",
            vung_mua=20_000,
        )


@pytest.mark.asyncio
async def test_task3_counts_distinct_ly_do_and_task4_counts_ung_ho(db_session, test_user):
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    await svc.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    ly_dos = ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]
    for i, ld in enumerate(ly_dos):
        order = await _make_order(db_session, account.id, test_user.id, symbol=f"S{i}")
        await svc.record_kehoach(
            test_user.id,
            order.id,
            ly_do=ld,
            trang_thai_luc_dat="ung_ho" if i < 3 else "trung_tinh",
            vung_mua=20_000,
        )

    progress = await svc.get_progress(test_user.id)
    assert progress.so_ly_do_da_dung == 5
    assert progress.task_3_done_at is not None
    assert progress.so_lenh_ly_do_ung_ho == 3
    assert progress.task_4_done_at is not None


@pytest.mark.asyncio
async def test_record_ketso_computes_pnl_and_marks_task2(db_session, test_user):
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    await svc.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    buy = await _make_order(
        db_session, account.id, test_user.id, symbol="AAA", side=OrderSide.BUY,
        qty=100, price=20_000, trading_date=date(2026, 1, 5),
    )
    await svc.record_kehoach(
        test_user.id, buy.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )
    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="AAA", side=OrderSide.SELL,
        qty=100, price=22_000, trading_date=date(2026, 1, 8),
    )

    ketso = await svc.record_ketso(test_user.id, sell.id, cam_xuc="binh_tinh")
    assert ketso.gia_ra == 22_000
    assert ketso.pnl_vnd == 200_000  # (22000 - 20000) * 100, no fees in test fixture
    assert round(ketso.pnl_pct, 2) == 10.0
    assert ketso.so_ngay_lich == 3
    assert ketso.so_phien_giu > 0
    assert ketso.cam_xuc.value == "binh_tinh"

    progress = await svc.get_progress(test_user.id)
    assert progress.task_2_done_at is not None

    # Recovery retry is idempotent and keeps the first non-null reflection.
    again = await svc.record_ketso(test_user.id, sell.id)
    assert again.id == ketso.id
    assert again.cam_xuc.value == "binh_tinh"


@pytest.mark.asyncio
async def test_ketso_allows_one_first_emotion_enrichment_then_is_idempotent(
    db_session, test_user
):
    """A pre-flight closeout may have no emotion. The first later reflection
    enriches that row exactly once; retries preserve it and a conflicting edit
    is rejected."""
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    await svc.enter(test_user.id)
    account = await VirtualTradingRepository(db_session).get_account_by_user_id(test_user.id)

    buy = await _make_order(db_session, account.id, test_user.id, symbol="EMO")
    await svc.record_kehoach(
        test_user.id,
        buy.id,
        ly_do="tin_tuc",
        trang_thai_luc_dat="can_chu_y",
        vung_mua=20_000,
    )
    sell = await _make_order(
        db_session,
        account.id,
        test_user.id,
        symbol="EMO",
        side=OrderSide.SELL,
        price=19_000,
        trading_date=date(2026, 1, 8),
    )
    sell.exit_matched_buy_order_id = buy.id
    await db_session.flush()

    preflight = await svc.record_ketso(test_user.id, sell.id)
    assert preflight.cam_xuc is None

    enriched = await svc.record_ketso(test_user.id, sell.id, cam_xuc="so")
    assert enriched.id == preflight.id
    assert enriched.cam_xuc.value == "so"

    same_retry = await svc.record_ketso(test_user.id, sell.id, cam_xuc="so")
    null_retry = await svc.record_ketso(test_user.id, sell.id)
    assert same_retry.id == preflight.id
    assert null_retry.id == preflight.id
    assert null_retry.cam_xuc.value == "so"

    with pytest.raises(ConflictError, match="đã được chốt"):
        await svc.record_ketso(test_user.id, sell.id, cam_xuc="hoi_tiec")


@pytest.mark.asyncio
async def test_task5_counts_only_planned_filled_thuc_chien_buys(db_session, test_user):
    """⑤ is exactly ten filled BUYs carrying the cumulative Cấp-1 plan.

    SELLs, unplanned BUYs and still-pending planned BUYs are not progress.
    A delayed fill becomes progress on the next authoritative recompute.
    """
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    await svc.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    for i in range(9):
        order = await _make_order(db_session, account.id, test_user.id, symbol=f"T{i}")
        await svc.record_kehoach(
            test_user.id, order.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )

    # 9/10 is not enough — the threshold is the old ⑥'s 10, not the old ⑤'s 3.
    progress = await svc.get_progress(test_user.id)
    assert progress.so_lenh_thuc_chien == 9
    assert progress.task_5_done_at is None

    await _make_order(
        db_session,
        account.id,
        test_user.id,
        symbol="T0",
        side=OrderSide.SELL,
        trading_date=date(2026, 1, 8),
    )
    await _make_order(db_session, account.id, test_user.id, symbol="UNPLANNED")
    pending = await _make_order(
        db_session,
        account.id,
        test_user.id,
        symbol="PENDING",
        status=OrderStatus.PENDING,
    )
    await svc.record_kehoach(
        test_user.id,
        pending.id,
        ly_do="ky_thuat",
        trang_thai_luc_dat="ung_ho",
        vung_mua=20_000,
    )
    progress = await svc.get_progress(test_user.id)
    assert progress.so_lenh_thuc_chien == 9
    assert progress.task_5_done_at is None

    pending.status = OrderStatus.FILLED
    pending.filled_price_vnd = 20_000
    pending.gross_amount_vnd = 2_000_000
    pending.fee_vnd = 0
    pending.tax_vnd = 0
    pending.net_amount_vnd = -2_000_000
    await db_session.flush()

    progress = await svc.get_progress(test_user.id)
    assert progress.so_lenh_thuc_chien == 10
    assert progress.task_5_done_at is not None

    # san_tap orders never count
    await _make_order(db_session, account.id, test_user.id, symbol="ZZZ", mode="san_tap")
    await svc.mark_task(test_user.id, 1)  # trigger a recompute pass
    progress = await svc.get_progress(test_user.id)
    assert progress.so_lenh_thuc_chien == 10


@pytest.mark.asyncio
async def test_authoritative_trade_history_uses_frozen_buy_link_and_persisted_plan(
    db_session, test_user
):
    """History comes from server rows and the SELL's immutable match, not a
    browser-local latest-symbol guess."""
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    await svc.enter(test_user.id)
    account = await VirtualTradingRepository(db_session).get_account_by_user_id(test_user.id)

    intended_buy = await _make_order(
        db_session,
        account.id,
        test_user.id,
        symbol="HIS",
        price=20_000,
        trading_date=date(2026, 1, 5),
    )
    intended_plan = await svc.record_kehoach(
        test_user.id,
        intended_buy.id,
        ly_do="dong_tien",
        trang_thai_luc_dat="ung_ho",
        vung_mua=19_800,
    )
    newer_buy = await _make_order(
        db_session,
        account.id,
        test_user.id,
        symbol="HIS",
        price=21_000,
        trading_date=date(2026, 1, 6),
    )
    await svc.record_kehoach(
        test_user.id,
        newer_buy.id,
        ly_do="tin_tuc",
        trang_thai_luc_dat="trung_tinh",
        vung_mua=21_000,
    )
    sell = await _make_order(
        db_session,
        account.id,
        test_user.id,
        symbol="HIS",
        side=OrderSide.SELL,
        price=22_000,
        trading_date=date(2026, 1, 8),
    )
    sell.exit_matched_buy_order_id = intended_buy.id
    await db_session.flush()
    ketso = await svc.record_ketso(test_user.id, sell.id, cam_xuc="binh_tinh")

    history = await svc.list_trade_history(test_user.id)
    assert len(history) == 1
    row = history[0]
    assert row["matched_by"] == "snapshot"
    assert row["buy_order_id"] == intended_buy.id
    assert row["sell_order_id"] == sell.id
    assert row["lyDo"] == intended_plan.lyDo
    assert row["trangThai_luc_dat"] == intended_plan.trangThai_luc_dat
    assert row["vung_mua"] == 19_800
    assert row["pnl_vnd"] == ketso.pnl_vnd
    assert row["cam_xuc"].value == "binh_tinh"


@pytest.mark.asyncio
async def test_portfolio_view_task_is_gone(db_session, test_user):
    """«Xem lại danh mục» was removed from the level: no counter, no view log,
    no dedicated endpoint behaviour. ``task_no=5`` is now a plain recompute
    like ①-④, and ``task_no=6`` no longer exists."""
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    progress = await svc.enter(test_user.id)

    assert not hasattr(svc, "record_portfolio_view")
    assert not hasattr(progress, "so_lan_xem_danh_muc")
    assert not hasattr(progress, "last_danh_muc_view_date")
    assert not hasattr(progress, "task_6_done_at")

    # Calling ⑤ repeatedly cannot manufacture progress out of nothing.
    for _ in range(5):
        progress = await svc.mark_task(test_user.id, 5)
    assert progress.task_5_done_at is None
    assert progress.so_lenh_thuc_chien == 0

    with pytest.raises(BadRequestError):
        await svc.mark_task(test_user.id, 6)


@pytest.mark.asyncio
async def test_graduate_requires_5_of_5(db_session, test_user):
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    await svc.enter(test_user.id)

    with pytest.raises(ConflictError):
        await svc.graduate(test_user.id)

    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    ly_dos = ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]
    for i in range(9):
        ld = ly_dos[i % 5]
        order = await _make_order(db_session, account.id, test_user.id, symbol=f"G{i}")
        await svc.record_kehoach(
            test_user.id, order.id, ly_do=ld, trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )

    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="G0", side=OrderSide.SELL,
        qty=100, price=21_000, trading_date=date(2026, 1, 8),
    )
    await svc.record_ketso(test_user.id, sell.id)

    # ①②③④ done, ⑤ (10 lệnh Thực chiến) still short → graduation is refused.
    progress = await svc.mark_task(test_user.id, 5)
    assert all(getattr(progress, f"task_{n}_done_at") is not None for n in (1, 2, 3, 4))
    assert progress.so_lenh_thuc_chien == 9
    assert progress.task_5_done_at is None
    with pytest.raises(ConflictError):
        await svc.graduate(test_user.id)

    order = await _make_order(db_session, account.id, test_user.id, symbol="G9")
    await svc.record_kehoach(
        test_user.id, order.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
    )

    progress = await svc.graduate(test_user.id)
    assert progress.graduated_at is not None
    assert progress.time_to_graduate_hours is not None

@pytest.mark.asyncio
@pytest.mark.parametrize("missing_task", (1, 2, 3, 4))
async def test_graduate_rejects_task5_when_any_earlier_task_is_missing(
    db_session, test_user, missing_task
):
    """⑤'s 10 live orders do not substitute for any individual task among ①–④."""
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    await svc.enter(test_user.id)
    progress = await svc.get_progress(test_user.id)
    progress.task_5_done_at = progress.entered_at
    for task_no in (1, 2, 3, 4):
        if task_no != missing_task:
            setattr(progress, f"task_{task_no}_done_at", progress.task_5_done_at)
    await db_session.flush()

    assert getattr(progress, f"task_{missing_task}_done_at") is None
    with pytest.raises(ConflictError):
        await svc.graduate(test_user.id)

@pytest.mark.asyncio
async def test_cap1_endpoints_wired_and_free(client, db_session, test_user):
    """Router mounted under /api/v1/cap1, gated by CurrentUser (not premium)."""
    from app.core.security import create_access_token

    await _graduate_cap0(db_session, test_user.id)

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/v1/cap1/progress", headers=headers)
    assert r.status_code == 200
    assert r.json() is None

    r = await client.post("/api/v1/cap1/enter", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["da_xem_tour"] is True

    r = await client.post("/api/v1/cap1/graduate", headers=headers)
    assert r.status_code == 409

    # Kế hoạch + Kết sổ round-trip through the wire schemas (lyDo/trangThai_luc_dat
    # camelCase-ish field names, JSON snapshot, enum serialization).
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    buy = await _make_order(
        db_session, account.id, test_user.id, symbol="AAA", side=OrderSide.BUY,
        qty=100, price=20_000, trading_date=date(2026, 1, 5),
    )
    await db_session.commit()

    r = await client.post(
        "/api/v1/cap1/kehoach",
        headers=headers,
        json={
            "order_id": str(buy.id),
            "lyDo": "ky_thuat",
            "trangThai_luc_dat": "ung_ho",
            "vung_mua": 20_000,
            "co_bam_doc_chi_tiet": True,
            "snapshot": {"trend": "up"},
        },
    )
    assert r.status_code == 200, r.text
    kehoach_body = r.json()
    assert kehoach_body["lyDo"] == "ky_thuat"
    assert kehoach_body["snapshot_lop_du_lieu"] == {"trend": "up"}

    sell = await _make_order(
        db_session, account.id, test_user.id, symbol="AAA", side=OrderSide.SELL,
        qty=100, price=22_000, trading_date=date(2026, 1, 8),
    )
    await db_session.commit()

    r = await client.post(
        "/api/v1/cap1/ketso",
        headers=headers,
        json={"order_id": str(sell.id), "cam_xuc": "binh_tinh"},
    )
    assert r.status_code == 200, r.text
    ketso_body = r.json()
    assert ketso_body["pnl_vnd"] == 200_000
    assert ketso_body["cam_xuc"] == "binh_tinh"

    r = await client.get("/api/v1/cap1/trades", headers=headers)
    assert r.status_code == 200, r.text
    history_body = r.json()
    assert history_body["total"] == 1
    assert history_body["trades"][0]["buy_order_id"] == str(buy.id)
    assert history_body["trades"][0]["sell_order_id"] == str(sell.id)
    assert history_body["trades"][0]["lyDo"] == "ky_thuat"

    # ⑤ is a derived task now — PATCH just triggers a recompute, and the
    # «Xem lại danh mục» counter is gone from the wire entirely.
    r = await client.patch(
        "/api/v1/cap1/task", headers=headers, json={"task_no": 5}
    )
    assert r.status_code == 200
    task_body = r.json()
    assert "so_lan_xem_danh_muc" not in task_body
    assert "task_6_done_at" not in task_body
    assert task_body["so_lenh_thuc_chien"] == 1  # only planned filled BUYs count
    assert task_body["task_5_done_at"] is None

    r = await client.patch("/api/v1/cap1/task", headers=headers, json={"task_no": 6})
    assert r.status_code == 400

    # Unauthenticated is rejected
    r = await client.get("/api/v1/cap1/progress")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_atomic_order_plan_write_and_legacy_recovery_retry(
    client, db_session, test_user
):
    """The canonical order endpoint validates the Cap1 plan before execution,
    saves both in one request, and remains compatible with an old client that
    retries the same `/cap1/kehoach` write after receiving the order response."""
    from app.core.security import create_access_token

    cap0 = Cap0Service(db_session)
    await cap0.set_placement(test_user.id, answer="unsure")
    await cap0.complete_tours(test_user.id)
    await VirtualTradingRepository(db_session).create_account(test_user.id, 100_000_000)
    progress = await Cap1Service(db_session).enter(test_user.id)
    assert progress.da_xem_tour is True

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}
    base_order = {
        "symbol": "VCB",
        "side": "buy",
        "order_type": "market",
        "quantity": 100,
    }

    with (
        patch("app.services.virtual_trading.service.validate_symbol", new=_valid_symbol),
        patch("app.services.virtual_trading.service.resolve_price", new=_fixed_price),
    ):
        rejected = await client.post(
            "/api/v1/virtual-trading/orders", headers=headers, json=base_order
        )
        assert rejected.status_code == 400
        assert (
            await client.get("/api/v1/virtual-trading/orders", headers=headers)
        ).json()["total"] == 0

        payload = {
            **base_order,
            "journey_plan": {
                "lyDo": "dong_tien",
                "trangThai_luc_dat": "ung_ho",
                "vung_mua": 19_800,
                "co_bam_doc_chi_tiet": True,
                "snapshot": {"source": "ai-insight", "signal": "support"},
            },
        }
        created = await client.post(
            "/api/v1/virtual-trading/orders", headers=headers, json=payload
        )

    assert created.status_code == 201, created.text
    order_body = created.json()
    assert order_body["mode"] == "thuc_chien"
    assert order_body["status"] == "filled"
    assert order_body["journey_plan_saved_levels"] == [1]

    recovery_payload = {
        "order_id": order_body["id"],
        **payload["journey_plan"],
    }
    recovered = await client.post(
        "/api/v1/cap1/kehoach", headers=headers, json=recovery_payload
    )
    assert recovered.status_code == 200, recovered.text
    assert recovered.json()["order_id"] == order_body["id"]

    changed = await client.post(
        "/api/v1/cap1/kehoach",
        headers=headers,
        json={**recovery_payload, "vung_mua": 18_000},
    )
    assert changed.status_code == 409

    latest_progress = (
        await client.get("/api/v1/cap1/progress", headers=headers)
    ).json()
    assert latest_progress["so_lenh_thuc_chien"] == 1
    assert latest_progress["task_1_done_at"] is not None


# ── Migration: 6 nhiệm vụ → 5 (bỏ «Xem lại danh mục») ───


#: The shape production is on today, at revision ``5c7d2e9a4f18``. Written out
#: by hand so this test pins the migration against the columns that actually
#: exist in prod, not against whatever the ORM says after the change.
_PROD_CAP1_PROGRESS_DDL = """
CREATE TABLE cap1_progress (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    entered_at TIMESTAMP NOT NULL,
    da_xem_tour BOOLEAN NOT NULL DEFAULT false,
    task_1_done_at TIMESTAMP,
    task_2_done_at TIMESTAMP,
    task_3_done_at TIMESTAMP,
    task_4_done_at TIMESTAMP,
    task_5_done_at TIMESTAMP,
    task_6_done_at TIMESTAMP,
    so_ly_do_da_dung INTEGER NOT NULL DEFAULT 0,
    so_lenh_ly_do_ung_ho INTEGER NOT NULL DEFAULT 0,
    so_lan_xem_danh_muc INTEGER NOT NULL DEFAULT 0,
    so_lenh_thuc_chien INTEGER NOT NULL DEFAULT 0,
    last_danh_muc_view_date DATE,
    graduated_at TIMESTAMP,
    time_to_graduate_hours FLOAT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""


def _load_cap1_5tasks_migration():
    """Import the revision module by path — ``alembic/versions`` is not a package."""
    import importlib.util
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "4d8e6b2a1c93_cap1_five_tasks_drop_portfolio_view.py"
    )
    spec = importlib.util.spec_from_file_location("_cap1_5tasks_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_migration(conn, direction: str) -> None:
    """Run the real ``upgrade()``/``downgrade()`` body against ``conn``.

    ``Operations.context`` installs the proxy that backs the migration module's
    ``from alembic import op``, so this executes the shipped code — not a
    paraphrase of it.
    """
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    module = _load_cap1_5tasks_migration()
    with Operations.context(MigrationContext.configure(conn)):
        getattr(module, direction)()


def _columns(conn) -> list[str]:
    return [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(cap1_progress)").fetchall()]


def _rows(conn) -> dict[str, dict]:
    cols = _columns(conn)
    out = {}
    for row in conn.exec_driver_sql(f"SELECT {', '.join(cols)} FROM cap1_progress").fetchall():
        record = dict(zip(cols, row, strict=True))
        out[record["id"]] = record
    return out


def _seed_prod_shaped_rows(conn) -> None:
    """The two rows production actually holds.

    ``huy33`` is the row that matters: ①-④ done, old ⑤ «xem danh mục 3 lần»
    NOT done (1/3 views), old ⑥ «10 lệnh Thực chiến» DONE with 13 lệnh. Under
    the new numbering that user is finished — 5/5 — but has never pressed
    "tốt nghiệp", so ``graduated_at`` must stay NULL.

    Every task column carries a DIFFERENT timestamp so the assertions can tell
    "new ⑤ came from old ⑥" apart from "new ⑤ kept whatever was in slot 5".
    """
    conn.exec_driver_sql(_PROD_CAP1_PROGRESS_DDL)
    conn.exec_driver_sql(
        """
        INSERT INTO cap1_progress (
            id, user_id, entered_at, da_xem_tour,
            task_1_done_at, task_2_done_at, task_3_done_at, task_4_done_at,
            task_5_done_at, task_6_done_at,
            so_ly_do_da_dung, so_lenh_ly_do_ung_ho, so_lan_xem_danh_muc,
            so_lenh_thuc_chien, last_danh_muc_view_date, graduated_at
        ) VALUES (
            'huy33', 'u-huy33', '2026-01-01 00:00:00', true,
            '2026-01-01 01:00:00',  -- ① lệnh đầu có kế hoạch
            '2026-01-01 02:00:00',  -- ② kết sổ đầu tiên
            '2026-01-01 03:00:00',  -- ③ đủ 5 lý do
            '2026-01-01 04:00:00',  -- ④ 3 lệnh ✅ Ủng hộ
            NULL,                   -- ⑤ cũ: xem danh mục 1/3  (bị xoá)
            '2026-01-01 06:00:00',  -- ⑥ cũ: 13 lệnh Thực chiến → thành ⑤
            5, 4, 1, 13, '2026-01-01', NULL
        )
        """
    )
    conn.exec_driver_sql(
        """
        INSERT INTO cap1_progress (
            id, user_id, entered_at, da_xem_tour, so_lan_xem_danh_muc,
            last_danh_muc_view_date
        ) VALUES ('huy3396', 'u-huy3396', '2026-02-01 00:00:00', true, 1, '2026-02-01')
        """
    )


def test_migration_carries_the_thuc_chien_row_to_5_of_5_without_graduating_it():
    """★ The row that must survive: ①-④ + 13 lệnh Thực chiến, old ⑤ never done.

    After the migration they read **5/5 — ready to graduate, NOT graduated**.
    Graduation is a user action (``POST /cap1/graduate``); a migration that
    stamped ``graduated_at`` would silently push them into Cấp 2 without the
    "tốt nghiệp" moment the level is built around.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_prod_shaped_rows(conn)
        _run_migration(conn, "upgrade")

        cols = _columns(conn)
        assert "task_6_done_at" not in cols
        assert "so_lan_xem_danh_muc" not in cols
        assert "last_danh_muc_view_date" not in cols

        row = _rows(conn)["huy33"]
        # ①-④ keep their own timestamps.
        for n, hour in ((1, "01"), (2, "02"), (3, "03"), (4, "04")):
            assert row[f"task_{n}_done_at"] == f"2026-01-01 {hour}:00:00"
        # ⑤ is the old ⑥ (06:00) — the 13 lệnh Thực chiến, not the NULL that
        # sat in slot 5 under the old numbering.
        assert row["task_5_done_at"] == "2026-01-01 06:00:00"
        # 5/5 …
        assert all(row[f"task_{n}_done_at"] is not None for n in (1, 2, 3, 4, 5))
        # … but NOT graduated.
        assert row["graduated_at"] is None
        assert row["time_to_graduate_hours"] is None
        # Surviving counters are untouched.
        assert row["so_lenh_thuc_chien"] == 13
        assert row["so_ly_do_da_dung"] == 5
        assert row["so_lenh_ly_do_ung_ho"] == 4


def test_migration_leaves_the_untouched_prod_row_at_0_of_5():
    """The other prod row did nothing but open Phân tích danh mục once. That
    single view was the old ⑤'s currency and is worth nothing now — it must not
    be laundered into a completed task."""
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_prod_shaped_rows(conn)
        _run_migration(conn, "upgrade")

        row = _rows(conn)["huy3396"]
        assert all(row[f"task_{n}_done_at"] is None for n in (1, 2, 3, 4, 5))
        assert row["graduated_at"] is None
        assert row["entered_at"] == "2026-02-01 00:00:00"


def test_migration_revokes_a_task_5_earned_by_viewing_the_portfolio():
    """★ The mapping is an ASSIGNMENT, not a merge.

    A mid-flight user who finished the OLD ⑤ (3 lượt xem danh mục) but not the
    old ⑥ must come out with ⑤ OUTSTANDING — the task they completed no longer
    exists, and the one now numbered ⑤ is 10 lệnh Thực chiến, which they have
    not done. A ``COALESCE``-style merge would hand them a free 5/5.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_prod_shaped_rows(conn)
        conn.exec_driver_sql(
            """
            INSERT INTO cap1_progress (
                id, user_id, entered_at, da_xem_tour,
                task_1_done_at, task_5_done_at, task_6_done_at,
                so_lan_xem_danh_muc, so_lenh_thuc_chien
            ) VALUES (
                'viewer', 'u-viewer', '2026-03-01 00:00:00', true,
                '2026-03-01 01:00:00', '2026-03-01 05:00:00', NULL, 3, 2
            )
            """
        )
        _run_migration(conn, "upgrade")

        row = _rows(conn)["viewer"]
        assert row["task_1_done_at"] == "2026-03-01 01:00:00"
        assert row["task_5_done_at"] is None
        assert row["so_lenh_thuc_chien"] == 2


def test_migration_round_trips_up_down_up():
    """upgrade → downgrade → upgrade lands on the same 5-task state.

    The downgrade is LOSSY by construction (the view log was discarded on the
    way up), so what it restores is the SHAPE plus the facts that still exist —
    see the revision's module docstring.
    """
    import sqlalchemy as sa

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        _seed_prod_shaped_rows(conn)
        _run_migration(conn, "upgrade")
        after_first = _rows(conn)

        _run_migration(conn, "downgrade")
        cols = _columns(conn)
        assert "task_6_done_at" in cols
        assert "so_lan_xem_danh_muc" in cols
        assert "last_danh_muc_view_date" in cols

        down = _rows(conn)["huy33"]
        # 10 lệnh Thực chiến goes back to the ⑥ slot under the old numbering…
        assert down["task_6_done_at"] == "2026-01-01 06:00:00"
        # … and slot 5 is vacated rather than left claiming a «xem danh mục»
        # streak that no longer has any data behind it (the view counts come
        # back as 0/NULL — those facts are unrecoverable).
        assert down["task_5_done_at"] is None
        assert down["so_lan_xem_danh_muc"] == 0
        assert down["last_danh_muc_view_date"] is None
        assert down["graduated_at"] is None

        _run_migration(conn, "upgrade")
        assert _rows(conn) == after_first
