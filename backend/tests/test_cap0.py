"""Tests for the Cấp 0 onboarding backend — progress, placement, tasks, graduate,
kế hoạch (chip lý do đời thường).

Spec v3.0: Cấp 0 has **5 nhiệm vụ** and exactly **ONE** behaviour gate (đóng màn
Kết sổ ở ⑤). There is no cắt lỗ/chốt lời anywhere in Cấp 0, hence no
``sl_typed`` gate and no 6th task.

The brief's illustrative tests use a ``user`` fixture; this repo names it
``test_user`` (see tests/conftest.py), so they are bound to that name here.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.cap0 import LY_DO_DOI_THUONG_LABELS, Cap0OrderKehoach, LyDoDoiThuong
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.services.cap0.service import Cap0Service


async def _make_order(
    db_session,
    account_id,
    user_id,
    *,
    symbol: str = "VNM",
    side: OrderSide = OrderSide.BUY,
    qty: int = 100,
    price: int = 61_800,
    trading_date: date | None = None,
    mode: str = "san_tap",
    status: OrderStatus = OrderStatus.FILLED,
) -> VirtualOrder:
    """Directly create a filled VirtualOrder (bypasses the matching engine —
    the Cấp 0 service only reads order data, so this is sufficient setup)."""
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


async def _entered_with_account(db_session, user_id):
    svc = Cap0Service(db_session)
    await svc.enter(user_id)
    account = await VirtualTradingRepository(db_session).get_account_by_user_id(user_id)
    return svc, account


@pytest.mark.asyncio
async def test_enter_creates_progress_and_seeds_250tr(db_session, test_user):
    svc = Cap0Service(db_session)
    p = await svc.enter(test_user.id)
    assert p.virtual_balance_init == 250_000_000

    # A 250tr virtual account is seeded for a user with no prior account.
    account = await VirtualTradingRepository(db_session).get_account_by_user_id(test_user.id)
    assert account is not None
    assert account.initial_cash_vnd == 250_000_000

    # idempotent
    p2 = await svc.enter(test_user.id)
    assert p2.id == p.id


@pytest.mark.asyncio
async def test_placement_maps_level(db_session, test_user):
    svc = Cap0Service(db_session)
    assert (await svc.set_placement(test_user.id, has_traded=False)).placed_level == 0
    # re-answer overwrites or idempotent — assert no crash
    assert (await svc.set_placement(test_user.id, has_traded=True)).placed_level == 2


@pytest.mark.asyncio
async def test_graduate_requires_five_tasks_and_the_single_gate(db_session, test_user):
    svc = Cap0Service(db_session)
    await svc.enter(test_user.id)
    with pytest.raises(ConflictError):  # 409 — chưa đủ
        await svc.graduate(test_user.id)
    for n in (1, 2, 3, 4):
        await svc.complete_task(test_user.id, n, gate=None)
    # ①-④ done but ⑤ (and its gate) outstanding → still 409.
    with pytest.raises(ConflictError):
        await svc.graduate(test_user.id)

    await svc.complete_task(test_user.id, 5, gate="debrief")
    await svc.complete_task(test_user.id, 1, gate="star")
    g = await svc.graduate(test_user.id)
    assert g.graduated_at is not None
    assert g.time_to_graduate_hours is not None


@pytest.mark.asyncio
async def test_star_gate_is_recorded_but_is_not_a_graduation_gate(db_session, test_user):
    """Spec v3.0 §9: ONE behaviour gate (đóng Kết sổ). ★ stays a recorded fact."""
    svc = Cap0Service(db_session)
    await svc.enter(test_user.id)
    for n in (1, 2, 3, 4):
        await svc.complete_task(test_user.id, n)
    p = await svc.complete_task(test_user.id, 5, gate="debrief")
    assert p.task1_star_clicked is False  # never clicked ★
    g = await svc.graduate(test_user.id)  # graduates anyway
    assert g.graduated_at is not None


@pytest.mark.asyncio
async def test_task_no_6_is_rejected(db_session, test_user):
    svc = Cap0Service(db_session)
    await svc.enter(test_user.id)
    with pytest.raises(BadRequestError):
        await svc.complete_task(test_user.id, 6, gate="debrief")
    with pytest.raises(BadRequestError):
        await svc.complete_task(test_user.id, 0)


@pytest.mark.asyncio
async def test_sl_typed_gate_is_rejected(db_session, test_user):
    """v3.0 removes cắt lỗ from Cấp 0 — the old gate name must 400, not silently pass."""
    svc = Cap0Service(db_session)
    await svc.enter(test_user.id)
    with pytest.raises(BadRequestError):
        await svc.complete_task(test_user.id, 5, gate="sl_typed")


@pytest.mark.asyncio
async def test_task_5_requires_the_debrief_gate(db_session, test_user):
    """⑤ is earned ONLY by closing the Kết sổ — a bare {task_no: 5} must not
    mark it done (spec §4 Chặng 3: cổng hành vi duy nhất)."""
    svc = Cap0Service(db_session)
    await svc.enter(test_user.id)
    with pytest.raises(BadRequestError):
        await svc.complete_task(test_user.id, 5)
    p = await svc.get_progress(test_user.id)
    assert p is not None
    assert p.task_5_done_at is None
    assert p.task5_debrief_done is False

    # The wrong gate on ⑤ is also refused.
    with pytest.raises(BadRequestError):
        await svc.complete_task(test_user.id, 5, gate="star")
    p = await svc.get_progress(test_user.id)
    assert p is not None
    assert p.task_5_done_at is None


@pytest.mark.asyncio
async def test_task_completion_is_idempotent_and_sets_gates(db_session, test_user):
    svc = Cap0Service(db_session)
    await svc.enter(test_user.id)
    p1 = await svc.complete_task(test_user.id, 1, gate="star")
    first_ts = p1.task_1_done_at
    assert first_ts is not None
    assert p1.task1_star_clicked is True
    # re-completing keeps the original timestamp (idempotent)
    p2 = await svc.complete_task(test_user.id, 1, gate=None)
    assert p2.task_1_done_at == first_ts

    p3 = await svc.complete_task(test_user.id, 5, gate="debrief")
    ts5 = p3.task_5_done_at
    assert ts5 is not None
    assert p3.task5_debrief_done is True
    p4 = await svc.complete_task(test_user.id, 5, gate="debrief")
    assert p4.task_5_done_at == ts5


@pytest.mark.asyncio
async def test_progress_model_has_no_cat_lo_fields(db_session, test_user):
    """The v2.2 columns are gone from the ORM — nothing can read them back."""
    svc = Cap0Service(db_session)
    p = await svc.enter(test_user.id)
    assert not hasattr(p, "task_6_done_at")
    assert not hasattr(p, "task5_sl_typed")
    assert not hasattr(p, "task6_debrief_done")
    assert hasattr(p, "task5_debrief_done")


# ── Kế hoạch Cấp 0 — chip lý do đời thường (spec §10) ────────


@pytest.mark.asyncio
async def test_record_kehoach_persists_the_chip(db_session, test_user):
    svc, account = await _entered_with_account(db_session, test_user.id)
    order = await _make_order(db_session, account.id, test_user.id)

    kh = await svc.record_kehoach(
        test_user.id, order.id, ly_do_doi_thuong="cong_ty_toi_biet"
    )
    assert kh.ly_do_doi_thuong is LyDoDoiThuong.CONG_TY_TOI_BIET
    assert kh.order_id == order.id


@pytest.mark.asyncio
async def test_record_kehoach_accepts_the_verbatim_chip_label(db_session, test_user):
    """The FE holds the spec §4 Vietnamese chip label; both it and the slug are
    accepted so a copy tweak on either side can't silently drop the chip."""
    svc, account = await _entered_with_account(db_session, test_user.id)
    order = await _make_order(db_session, account.id, test_user.id)

    kh = await svc.record_kehoach(
        test_user.id, order.id, ly_do_doi_thuong="Người quen giới thiệu"
    )
    assert kh.ly_do_doi_thuong is LyDoDoiThuong.NGUOI_QUEN_GIOI_THIEU
    assert LY_DO_DOI_THUONG_LABELS[kh.ly_do_doi_thuong] == "Người quen giới thiệu"


@pytest.mark.asyncio
async def test_record_kehoach_is_an_upsert(db_session, test_user):
    svc, account = await _entered_with_account(db_session, test_user.id)
    order = await _make_order(db_session, account.id, test_user.id)

    first = await svc.record_kehoach(test_user.id, order.id, ly_do_doi_thuong="thu_cho_biet")
    again = await svc.record_kehoach(test_user.id, order.id, ly_do_doi_thuong="gia_dang_tang")
    assert again.id == first.id
    assert again.ly_do_doi_thuong is LyDoDoiThuong.GIA_DANG_TANG


@pytest.mark.asyncio
async def test_record_kehoach_validates_order_and_chip(db_session, test_user):
    svc, account = await _entered_with_account(db_session, test_user.id)

    sell = await _make_order(db_session, account.id, test_user.id, side=OrderSide.SELL)
    with pytest.raises(BadRequestError):
        await svc.record_kehoach(test_user.id, sell.id, ly_do_doi_thuong="thu_cho_biet")

    live = await _make_order(db_session, account.id, test_user.id, mode="thuc_chien")
    with pytest.raises(BadRequestError):
        await svc.record_kehoach(test_user.id, live.id, ly_do_doi_thuong="thu_cho_biet")

    buy = await _make_order(db_session, account.id, test_user.id)
    with pytest.raises(BadRequestError):
        await svc.record_kehoach(test_user.id, buy.id, ly_do_doi_thuong="ky_thuat")
    with pytest.raises(BadRequestError):
        # Cấp 2 concept — must never be storable as a Cấp 0 chip.
        await svc.record_kehoach(test_user.id, buy.id, ly_do_doi_thuong="cat_lo")

    import uuid as _uuid

    with pytest.raises(NotFoundError):
        await svc.record_kehoach(test_user.id, _uuid.uuid4(), ly_do_doi_thuong="thu_cho_biet")


@pytest.mark.asyncio
async def test_record_kehoach_requires_cap0_progress(db_session, test_user):
    svc = Cap0Service(db_session)
    account = await VirtualTradingRepository(db_session).create_account(
        test_user.id, 250_000_000
    )
    order = await _make_order(db_session, account.id, test_user.id)
    with pytest.raises(NotFoundError):
        await svc.record_kehoach(test_user.id, order.id, ly_do_doi_thuong="thu_cho_biet")


@pytest.mark.asyncio
async def test_cap0_chip_cannot_collide_with_or_clobber_cap1_kehoach(db_session, test_user):
    """Cấp 0's chip lives in its OWN table, so recording it can never 409 a later
    Cấp 1 ``record_kehoach`` on the same order, nor inflate Cấp 1's ③ counter
    (DISTINCT ``order_kehoach.lyDo``)."""
    from app.services.cap1.service import Cap1Service

    svc, account = await _entered_with_account(db_session, test_user.id)
    for n in (1, 2, 3, 4):
        await svc.complete_task(test_user.id, n)
    await svc.complete_task(test_user.id, 5, gate="debrief")
    await svc.graduate(test_user.id)

    cap1 = Cap1Service(db_session)
    await cap1.enter(test_user.id)

    order = await _make_order(db_session, account.id, test_user.id)
    cap0_kh = await svc.record_kehoach(
        test_user.id, order.id, ly_do_doi_thuong="thay_tren_mang"
    )

    # Cấp 1 writes its own row for the SAME order — no ConflictError.
    cap1_kh = await cap1.record_kehoach(
        test_user.id,
        order.id,
        ly_do="ky_thuat",
        trang_thai_luc_dat="ung_ho",
        vung_mua=61_800,
    )
    assert cap1_kh.lyDo.value == "ky_thuat"

    # Neither row clobbered the other.
    await db_session.refresh(cap0_kh)
    assert cap0_kh.ly_do_doi_thuong is LyDoDoiThuong.THAY_TREN_MANG

    # Cấp 1's ③ counter sees exactly ONE lý do — the Cấp 0 chip is invisible to it.
    cap1_progress = await cap1.get_progress(test_user.id)
    assert cap1_progress is not None
    assert cap1_progress.so_ly_do_da_dung == 1


@pytest.mark.asyncio
async def test_latest_kehoach_view_derives_hold_time_from_the_order(db_session, test_user):
    """``Thời gian giữ`` is DERIVED from ``virtual_orders``, never stored twice."""
    svc, account = await _entered_with_account(db_session, test_user.id)

    old = await _make_order(
        db_session, account.id, test_user.id, trading_date=date(2026, 1, 5)
    )
    await svc.record_kehoach(test_user.id, old.id, ly_do_doi_thuong="thu_cho_biet")
    new = await _make_order(
        db_session, account.id, test_user.id, trading_date=date(2026, 1, 12)
    )
    await svc.record_kehoach(test_user.id, new.id, ly_do_doi_thuong="gia_dang_tang")

    # Most recent recorded BUY for the symbol wins.
    view = await svc.get_latest_kehoach_view(
        test_user.id, "VNM", den_ngay=date(2026, 1, 14)
    )
    assert view is not None
    assert view.ly_do_doi_thuong is LyDoDoiThuong.GIA_DANG_TANG
    assert view.ly_do_label == "Giá đang tăng"
    assert view.symbol == "VNM"
    assert view.mua_luc == new.created_at
    assert view.gia_vao == 61_800
    # 12→14 Jan 2026 = Mon→Wed ⇒ 2 phiên.
    assert view.so_phien_giu == 2

    # Same-session round trip is 0 phiên, not a fabricated 1.
    same_day = await svc.get_latest_kehoach_view(
        test_user.id, "VNM", den_ngay=date(2026, 1, 12)
    )
    assert same_day is not None
    assert same_day.so_phien_giu == 0

    # Unknown symbol → None (never a fabricated row).
    assert await svc.get_latest_kehoach_view(test_user.id, "FPT") is None


@pytest.mark.asyncio
async def test_latest_kehoach_view_is_scoped_to_the_user(db_session, test_user):
    svc, account = await _entered_with_account(db_session, test_user.id)
    order = await _make_order(db_session, account.id, test_user.id)
    await svc.record_kehoach(test_user.id, order.id, ly_do_doi_thuong="thu_cho_biet")

    from app.core.security import hash_password
    from app.models.user import User, UserRole, UserStatus

    other = User(
        email="other-cap0@iqx.vn",
        hashed_password=hash_password("Test@1234"),
        full_name="Other",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db_session.add(other)
    await db_session.flush()

    assert await svc.get_latest_kehoach_view(other.id, "VNM") is None


# ── API wiring ───────────────────────────────────────


@pytest.mark.asyncio
async def test_cap0_endpoints_wired_and_free(client, test_user):
    """Router is mounted under /api/v1/cap0 and gated by CurrentUser (not premium)."""
    from app.core.security import create_access_token

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}

    # No progress yet
    r = await client.get("/api/v1/cap0/progress", headers=headers)
    assert r.status_code == 200
    assert r.json() is None

    # Enter creates progress
    r = await client.post("/api/v1/cap0/enter", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["virtual_balance_init"] == 250_000_000
    # v3.0 wire shape: one gate flag, five task timestamps.
    assert "task5_debrief_done" in body
    assert "task_6_done_at" not in body
    assert "task5_sl_typed" not in body
    assert "task6_debrief_done" not in body

    # Placement
    r = await client.post(
        "/api/v1/cap0/placement", headers=headers, json={"has_traded_before": True}
    )
    assert r.status_code == 200
    assert r.json()["placed_level"] == 2

    # Unauthenticated is rejected
    r = await client.get("/api/v1/cap0/progress")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_task_endpoint_rejects_v22_shapes(client, test_user):
    from app.core.security import create_access_token

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/api/v1/cap0/enter", headers=headers)

    # task_no 6 is out of range → 422 (schema), not a silent write.
    r = await client.patch(
        "/api/v1/cap0/task", headers=headers, json={"task_no": 6, "gate": "debrief"}
    )
    assert r.status_code == 422

    # sl_typed is no longer a valid gate → 422.
    r = await client.patch(
        "/api/v1/cap0/task", headers=headers, json={"task_no": 5, "gate": "sl_typed"}
    )
    assert r.status_code == 422

    # ⑤ without its gate → 400.
    r = await client.patch("/api/v1/cap0/task", headers=headers, json={"task_no": 5})
    assert r.status_code == 400

    # ⑤ with its gate → 200 and both fields set.
    r = await client.patch(
        "/api/v1/cap0/task", headers=headers, json={"task_no": 5, "gate": "debrief"}
    )
    assert r.status_code == 200
    assert r.json()["task5_debrief_done"] is True
    assert r.json()["task_5_done_at"] is not None


@pytest.mark.asyncio
async def test_kehoach_endpoints_wired(client, db_session, test_user):
    from app.core.security import create_access_token

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/api/v1/cap0/enter", headers=headers)

    account = await VirtualTradingRepository(db_session).get_account_by_user_id(test_user.id)
    assert account is not None
    order = await _make_order(db_session, account.id, test_user.id)
    await db_session.commit()

    r = await client.post(
        "/api/v1/cap0/kehoach",
        headers=headers,
        json={"order_id": str(order.id), "ly_do_doi_thuong": "Công ty tôi biết"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["ly_do_doi_thuong"] == "cong_ty_toi_biet"
    assert r.json()["ly_do_label"] == "Công ty tôi biết"
    assert r.json()["mode"] == "san_tap"

    r = await client.get("/api/v1/cap0/kehoach/latest", headers=headers, params={"symbol": "vnm"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body is not None
    assert body["ly_do_doi_thuong"] == "cong_ty_toi_biet"
    assert body["gia_vao"] == 61_800
    assert body["so_phien_giu"] >= 0

    r = await client.get("/api/v1/cap0/kehoach/latest", headers=headers, params={"symbol": "FPT"})
    assert r.status_code == 200
    assert r.json() is None

    r = await client.post(
        "/api/v1/cap0/kehoach",
        json={"order_id": str(order.id), "ly_do_doi_thuong": "cong_ty_toi_biet"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_cap0_kehoach_table_is_separate_from_cap1(db_session):
    """Structural guard: the Cấp 0 chip must not live on ``order_kehoach``."""
    from app.models.cap1 import OrderKehoach

    assert Cap0OrderKehoach.__tablename__ == "cap0_order_kehoach"
    assert OrderKehoach.__tablename__ == "order_kehoach"
    assert not hasattr(OrderKehoach, "ly_do_doi_thuong")
    # Cấp 0's chips and Cấp 1's analytical lý do are disjoint vocabularies.
    from app.models.cap1 import LyDo

    assert not ({m.value for m in LyDoDoiThuong} & {m.value for m in LyDo})
