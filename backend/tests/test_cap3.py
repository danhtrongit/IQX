"""Focused behavior tests for Cấp 3's two concurrent sizing-confidence tasks."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.core.exceptions import BadRequestError, ConflictError
from app.core.security import create_access_token
from app.models.cap1 import CachKhoiLuong, KhauViRuiRo
from app.models.virtual_trading import OrderSide, OrderStatus, OrderType, VirtualOrder
from app.repositories.virtual_trading import VirtualTradingRepository
from app.schemas.cap3 import Cap3PlanOut, Cap3TradeAnalysisOut, KehoachRequest
from app.services.cap0.service import Cap0Service
from app.services.cap1.service import Cap1Service
from app.services.cap2.service import Cap2Service
from app.services.cap3.service import Cap3Service


async def _make_order(
    db_session,
    account_id,
    user_id,
    *,
    symbol: str,
    side: OrderSide,
    price: int = 20_000,
    quantity: int = 100,
    status: OrderStatus = OrderStatus.FILLED,
    mode: str = "thuc_chien",
    created_at: datetime | None = None,
):
    gross = quantity * price
    row_created_at = created_at or datetime.now(UTC)
    order = VirtualOrder(
        account_id=account_id,
        user_id=user_id,
        symbol=symbol,
        mode=mode,
        side=side,
        order_type=OrderType.MARKET,
        status=status,
        quantity=quantity,
        filled_price_vnd=price,
        gross_amount_vnd=gross,
        fee_vnd=0,
        tax_vnd=0,
        net_amount_vnd=-gross if side == OrderSide.BUY else gross,
        trading_date=date.today(),
        created_at=row_created_at,
        updated_at=row_created_at,
    )
    db_session.add(order)
    await db_session.flush()
    return order


async def _graduate_to_cap3(db_session, user_id):
    cap0 = Cap0Service(db_session)
    await cap0.enter(user_id)
    await cap0.set_placement(user_id, answer="never")
    repo = VirtualTradingRepository(db_session)
    account = await repo.get_account_by_user_id(user_id)
    intro_buy = await _make_order(db_session, account.id, user_id, symbol="VNM", side=OrderSide.BUY)
    intro_buy.mode = "san_tap"
    await cap0.record_kehoach(user_id, intro_buy.id, ly_do_doi_thuong="thu_cho_biet")
    await cap0.complete_task(user_id, 1, gate="star")
    for tour in ("phantich", "bantin", "bctc"):
        await cap0.complete_tour(user_id, tour)
    intro_sell = await _make_order(db_session, account.id, user_id, symbol="VNM", side=OrderSide.SELL)
    intro_sell.mode = "san_tap"
    await cap0.complete_task(user_id, 5, gate="debrief")
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
    price: int = 20_000,
    quantity: int = 100,
    method: str = "khau_vi_tu_tin",
):
    buy = await _make_order(
        db_session,
        account_id,
        user_id,
        symbol=symbol,
        side=OrderSide.BUY,
        price=price,
        quantity=quantity,
    )
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
        cach_khoi_luong=method,
        khoi_luong=quantity,
        pct_von=quantity * price / 100_000_000 * 100,
    )
    return buy


async def _close_order(
    db_session,
    cap1: Cap1Service,
    account_id,
    user_id,
    buy: VirtualOrder,
    *,
    sell_price: int,
):
    sell = await _make_order(
        db_session,
        account_id,
        user_id,
        symbol=buy.symbol,
        side=OrderSide.SELL,
        price=sell_price,
        quantity=buy.quantity,
    )
    sell.exit_matched_buy_order_id = buy.id
    await db_session.flush()
    ketso = await cap1.record_ketso(user_id, sell.id)
    return sell, ketso


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
    buy = await _record_qualified_plan(
        db_session,
        cap1,
        cap3,
        account.id,
        test_user.id,
        symbol="PNL",
        confidence=1,
    )
    await _close_order(
        db_session, cap1, account.id, test_user.id, buy, sell_price=25_000
    )

    progress = await cap3.get_progress(test_user.id)
    assert progress is not None
    assert progress.lai_pct_cap3 > 0
    assert progress.so_lenh_quan_ly_von == 1
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

    assert result.graduated_at.replace(tzinfo=UTC) == preserved_graduated_at
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


def test_sizing_method_wire_schema_is_canonical_while_legacy_aliases_normalize():
    base = {
        "order_id": "00000000-0000-0000-0000-000000000001",
        "khau_vi": "can_bang",
        "muc_tu_tin": 2,
        "khoi_luong": 100,
        "pct_von": 2.0,
    }

    assert KehoachRequest(**base, cach_khoi_luong="khau_vi_tu_tin").cach_khoi_luong == (
        "khau_vi_tu_tin"
    )
    assert KehoachRequest(**base, cach_khoi_luong="chia_deu").cach_khoi_luong == "chia_deu"
    assert KehoachRequest(**base, cach_khoi_luong="linh_hoat").cach_khoi_luong == (
        "khau_vi_tu_tin"
    )
    assert KehoachRequest(**base, cach_khoi_luong="ky_luat").cach_khoi_luong == "chia_deu"

    method_schema = KehoachRequest.model_json_schema()["properties"]["cach_khoi_luong"]
    assert method_schema["enum"] == ["khau_vi_tu_tin", "chia_deu"]
    with pytest.raises(ValidationError):
        KehoachRequest(**base, cach_khoi_luong="khong_hop_le")


@pytest.mark.asyncio
async def test_plan_persists_server_owned_quantity_and_actual_capital_percentage(
    db_session, test_user
):
    cap1, cap3, account = await _graduate_to_cap3(db_session, test_user.id)
    buy = await _make_order(
        db_session,
        account.id,
        test_user.id,
        symbol="OWN",
        side=OrderSide.BUY,
        price=25_000,
        quantity=300,
    )
    await cap1.record_kehoach(
        test_user.id,
        buy.id,
        ly_do="ky_thuat",
        trang_thai_luc_dat="ung_ho",
        vung_mua=25_000,
    )

    with pytest.raises(BadRequestError, match="khớp khối lượng lệnh"):
        await cap3.record_kehoach(
            test_user.id,
            buy.id,
            khau_vi="can_bang",
            muc_tu_tin=2,
            cach_khoi_luong="khau_vi_tu_tin",
            khoi_luong=100,
            pct_von=7.5,
        )
    with pytest.raises(BadRequestError, match="không khớp giá trị thực tế"):
        await cap3.record_kehoach(
            test_user.id,
            buy.id,
            khau_vi="can_bang",
            muc_tu_tin=2,
            cach_khoi_luong="khau_vi_tu_tin",
            khoi_luong=300,
            pct_von=19.0,
        )

    stored = await cap3.record_kehoach(
        test_user.id,
        buy.id,
        khau_vi="can_bang",
        muc_tu_tin=2,
        # A compatibility alias is accepted at input, but never stored/returned.
        cach_khoi_luong="linh_hoat",
        khoi_luong=300,
        pct_von=7.49,
    )

    assert stored.khoi_luong == 300
    assert stored.pct_von == pytest.approx(7.5)
    assert stored.cach_khoi_luong == CachKhoiLuong.KHAU_VI_TU_TIN


@pytest.mark.asyncio
async def test_progress_excludes_rejected_old_and_incomplete_plans(db_session, test_user):
    cap1, cap3, account = await _graduate_to_cap3(db_session, test_user.id)
    progress = await cap3.get_progress(test_user.id)
    assert progress is not None

    async def seed_non_authoritative_plan(
        symbol: str,
        *,
        status: OrderStatus = OrderStatus.FILLED,
        created_at: datetime | None = None,
        complete: bool = True,
    ) -> None:
        order = await _make_order(
            db_session,
            account.id,
            test_user.id,
            symbol=symbol,
            side=OrderSide.BUY,
            status=OrderStatus.FILLED,
            created_at=created_at,
        )
        plan = await cap1.record_kehoach(
            test_user.id,
            order.id,
            ly_do="ky_thuat",
            trang_thai_luc_dat="ung_ho",
            vung_mua=20_000,
        )
        order.status = status
        plan.khau_vi = KhauViRuiRo.CAN_BANG
        plan.muc_tu_tin = 3
        plan.cach_khoi_luong = CachKhoiLuong.KHAU_VI_TU_TIN
        if complete:
            plan.khoi_luong = order.quantity
            plan.pct_von = 2.0
        await db_session.flush()

    await seed_non_authoritative_plan("REJ", status=OrderStatus.REJECTED)
    await seed_non_authoritative_plan(
        "OLD", created_at=progress.entered_at - timedelta(seconds=1)
    )
    await seed_non_authoritative_plan("INC", complete=False)
    await _record_qualified_plan(
        db_session,
        cap1,
        cap3,
        account.id,
        test_user.id,
        symbol="GOOD",
        confidence=1,
    )

    recomputed = await cap3.get_progress(test_user.id)
    assert recomputed is not None
    assert recomputed.so_lenh_quan_ly_von == 1
    assert recomputed.muc_tu_tin_da_dung == [1]


@pytest.mark.asyncio
@pytest.mark.parametrize("window_tz", [None, UTC, timezone(timedelta(hours=7))])
@pytest.mark.parametrize("graduated", [False, True])
async def test_sizing_evidence_window_uses_utc_order_times(
    db_session, test_user, window_tz, graduated
):
    cap1, cap3, account = await _graduate_to_cap3(db_session, test_user.id)
    progress = await cap3._get_progress_row(test_user.id)
    entered = datetime(2026, 1, 5, 12, 30, 1, 123456, tzinfo=UTC)
    ended = datetime(2026, 1, 5, 12, 31, 1, 654321, tzinfo=UTC)

    def window_time(value):
        return value.replace(tzinfo=None) if window_tz is None else value.astimezone(window_tz)

    progress.entered_at = window_time(entered)
    progress.graduated_at = window_time(ended) if graduated else None
    lower = entered.replace(tzinfo=None, microsecond=0)
    upper = ended.replace(tzinfo=None)
    rows = {}
    for label, created in [
        ("BEFORE", lower - timedelta(microseconds=1)),
        ("LOWER", lower),
        ("INSIDE", entered.replace(tzinfo=None)),
        ("UPPER", upper),
        ("AFTER", upper + timedelta(microseconds=1)),
    ]:
        order = await _make_order(
            db_session, account.id, test_user.id,
            symbol=label, side=OrderSide.BUY, created_at=created,
        )
        plan = await cap1.record_kehoach(
            test_user.id, order.id,
            ly_do="ky_thuat", trang_thai_luc_dat="ung_ho", vung_mua=20_000,
        )
        plan.khau_vi = KhauViRuiRo.CAN_BANG
        plan.muc_tu_tin = 1
        plan.cach_khoi_luong = CachKhoiLuong.KHAU_VI_TU_TIN
        plan.khoi_luong = order.quantity
        plan.pct_von = 2.0
        rows[label] = order.id
    await db_session.flush()

    qualified = await cap3._qualified_kehoach(test_user.id, progress)
    expected = [rows[key] for key in ("LOWER", "INSIDE", "UPPER")]
    if not graduated:
        expected.append(rows["AFTER"])
    assert [plan.order_id for plan in qualified] == expected


@pytest.mark.asyncio
async def test_get_plan_returns_cumulative_cap1_to_cap3_composite(db_session, test_user, client):
    cap1, cap3, account = await _graduate_to_cap3(db_session, test_user.id)
    cap2 = Cap2Service(db_session)
    buy = await _make_order(
        db_session,
        account.id,
        test_user.id,
        symbol="CMP",
        side=OrderSide.BUY,
        price=25_000,
        quantity=300,
    )
    await cap1.record_kehoach(
        test_user.id,
        buy.id,
        ly_do="dong_tien",
        trang_thai_luc_dat="ung_ho",
        vung_mua=24_500,
    )
    await cap2.record_kehoach(
        test_user.id,
        buy.id,
        phuong_phap_sl_tp="ho_tro_khang_cu",
        cat_lo=22_000,
        chot_loi=30_000,
    )
    await cap3.record_kehoach(
        test_user.id,
        buy.id,
        khau_vi="can_bang",
        muc_tu_tin=3,
        cach_khoi_luong="chia_deu",
        khoi_luong=300,
        pct_von=7.5,
    )

    payload = Cap3PlanOut.model_validate(await cap3.get_plan(test_user.id, buy.id)).model_dump(
        mode="json"
    )

    assert payload == {
        "id": payload["id"],
        "order_id": str(buy.id),
        "symbol": "CMP",
        "quantity": 300,
        "bought_at": payload["bought_at"],
        "gia_vao": 25_000,
        "lyDo": "dong_tien",
        "trangThai_luc_dat": "ung_ho",
        "vung_mua": 24_500,
        "phuong_phap_sl_tp": "ho_tro_khang_cu",
        "cat_lo": 22_000,
        "chot_loi": 30_000,
        "khau_vi": "can_bang",
        "muc_tu_tin": 3,
        "cach_khoi_luong": "chia_deu",
        "khoi_luong": 300,
        "pct_von": 7.5,
    }

    token = create_access_token(subject=test_user.id, extra_claims={"role": test_user.role.value})
    response = await client.get(
        f"/api/v1/cap3/plans/{buy.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json() == payload


@pytest.mark.asyncio
async def test_trade_analysis_returns_durable_rows_and_three_confidence_buckets(
    db_session, test_user, client
):
    cap1, cap3, account = await _graduate_to_cap3(db_session, test_user.id)
    cases = (
        ("HI1", 3, 20_000, 100, 25_000, "khau_vi_tu_tin"),
        ("HI2", 3, 10_000, 200, 11_000, "chia_deu"),
        ("LOW", 1, 20_000, 100, 18_000, "khau_vi_tu_tin"),
    )
    expected_ids = set()
    for symbol, confidence, buy_price, quantity, sell_price, method in cases:
        buy = await _record_qualified_plan(
            db_session,
            cap1,
            cap3,
            account.id,
            test_user.id,
            symbol=symbol,
            confidence=confidence,
            price=buy_price,
            quantity=quantity,
            method=method,
        )
        sell, _ = await _close_order(
            db_session,
            cap1,
            account.id,
            test_user.id,
            buy,
            sell_price=sell_price,
        )
        expected_ids.add((str(buy.id), str(sell.id)))

    payload = Cap3TradeAnalysisOut.model_validate(
        await cap3.trade_analysis(test_user.id)
    ).model_dump(mode="json")

    assert payload["total"] == 3
    assert {(row["buy_order_id"], row["sell_order_id"]) for row in payload["trades"]} == (
        expected_ids
    )
    assert {row["matched_by"] for row in payload["trades"]} == {"snapshot"}
    assert {row["cach_khoi_luong"] for row in payload["trades"]} == {
        "khau_vi_tu_tin",
        "chia_deu",
    }

    high, medium, low = payload["by_confidence"]
    assert high == {
        "muc_tu_tin": 3,
        "count": 2,
        "wins": 2,
        "win_rate": 100.0,
        "avg_pnl_pct": pytest.approx(17.5),
        "avg_khoi_luong": 150.0,
        "avg_pct_von": 2.0,
    }
    assert medium == {
        "muc_tu_tin": 2,
        "count": 0,
        "wins": 0,
        "win_rate": None,
        "avg_pnl_pct": None,
        "avg_khoi_luong": None,
        "avg_pct_von": None,
    }
    assert low == {
        "muc_tu_tin": 1,
        "count": 1,
        "wins": 0,
        "win_rate": 0.0,
        "avg_pnl_pct": pytest.approx(-10.0),
        "avg_khoi_luong": 100.0,
        "avg_pct_von": 2.0,
    }


    token = create_access_token(subject=test_user.id, extra_claims={"role": test_user.role.value})
    response = await client.get(
        "/api/v1/cap3/trades/analysis",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json() == payload
