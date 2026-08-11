"""Tests for the Cấp 1 «Học việc» backend — progression, kế hoạch, kết sổ,
task counters, graduation.

Mirrors ``tests/test_cap0.py``'s style. Uses the ``test_user``/``db_session``
fixtures from ``tests/conftest.py``.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap0.service import Cap0Service
from app.services.cap1.service import Cap1Service


async def _graduate_cap0(db_session, user_id) -> None:
    """Fast-track a user through Cấp 0 graduation (setup helper, not under test)."""
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

    # Graduate Cấp 0 → enter Cấp 1 succeeds.
    # Cấp 0: 4 nhiệm vụ, 1 cổng hành vi (đóng Kết sổ ở ④). ② và ③ chỉ tính
    # sau ①, nên vòng lặp phải chạy đúng thứ tự ①②③.
    for n in (1, 2, 3):
        await cap0.complete_task(test_user.id, n)
    await cap0.complete_task(test_user.id, 4, gate="debrief")
    await cap0.graduate(test_user.id)

    progress = await svc.enter(test_user.id)
    assert progress.user_id == test_user.id
    assert progress.graduated_at is None
    assert progress.da_xem_tour is True  # Nhánh A: came from Cấp 0 → skip tours

    # idempotent
    progress2 = await svc.enter(test_user.id)
    assert progress2.id == progress.id


@pytest.mark.asyncio
async def test_record_kehoach_marks_task1_and_rejects_duplicate(db_session, test_user):
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

    # duplicate ketso for the same sell order rejected
    with pytest.raises(ConflictError):
        await svc.record_ketso(test_user.id, sell.id)


@pytest.mark.asyncio
async def test_task6_counts_thuc_chien_orders(db_session, test_user):
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    await svc.enter(test_user.id)
    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)

    for i in range(10):
        order = await _make_order(db_session, account.id, test_user.id, symbol=f"T{i}")
        await svc.record_kehoach(
            test_user.id, order.id, ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )

    progress = await svc.get_progress(test_user.id)
    assert progress.so_lenh_thuc_chien == 10
    assert progress.task_6_done_at is not None

    # san_tap orders never count
    await _make_order(db_session, account.id, test_user.id, symbol="ZZZ", mode="san_tap")
    await svc.mark_task(test_user.id, 1)  # trigger a recompute pass
    progress = await svc.get_progress(test_user.id)
    assert progress.so_lenh_thuc_chien == 10


@pytest.mark.asyncio
async def test_record_portfolio_view_counts_distinct_days_only(db_session, test_user):
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    await svc.enter(test_user.id)

    p = await svc.record_portfolio_view(test_user.id, as_of=date(2026, 1, 10))
    assert p.so_lan_xem_danh_muc == 1
    # same day again — no bump
    p = await svc.record_portfolio_view(test_user.id, as_of=date(2026, 1, 10))
    assert p.so_lan_xem_danh_muc == 1
    p = await svc.record_portfolio_view(test_user.id, as_of=date(2026, 1, 11))
    assert p.so_lan_xem_danh_muc == 2
    assert p.task_5_done_at is None
    p = await svc.record_portfolio_view(test_user.id, as_of=date(2026, 1, 12))
    assert p.so_lan_xem_danh_muc == 3
    assert p.task_5_done_at is not None


@pytest.mark.asyncio
async def test_graduate_requires_6_of_6(db_session, test_user):
    await _graduate_cap0(db_session, test_user.id)
    svc = Cap1Service(db_session)
    await svc.enter(test_user.id)

    with pytest.raises(ConflictError):
        await svc.graduate(test_user.id)

    vt_repo = VirtualTradingRepository(db_session)
    account = await vt_repo.get_account_by_user_id(test_user.id)
    ly_dos = ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]
    for i in range(10):
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

    await svc.record_portfolio_view(test_user.id, as_of=date(2026, 1, 10))
    await svc.record_portfolio_view(test_user.id, as_of=date(2026, 1, 11))
    await svc.record_portfolio_view(test_user.id, as_of=date(2026, 1, 12))

    progress = await svc.graduate(test_user.id)
    assert progress.graduated_at is not None
    assert progress.time_to_graduate_hours is not None


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

    r = await client.patch(
        "/api/v1/cap1/task", headers=headers, json={"task_no": 5}
    )
    assert r.status_code == 200
    assert r.json()["so_lan_xem_danh_muc"] == 1

    # Unauthenticated is rejected
    r = await client.get("/api/v1/cap1/progress")
    assert r.status_code == 401
