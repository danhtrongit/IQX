"""Legacy mascot recovery is explicit, frozen, and separately attributed."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.core.exceptions import ConflictError, ForbiddenError
from app.models.admin_audit import AdminAuditLog
from app.models.cap1 import LyDo, OrderKehoach, TrangThaiLucDat
from app.models.cap4 import LOP_KEYS, Cap4Progress
from app.models.cap6 import Cap6Progress
from app.models.journey_identity import BotMascotProfile
from app.models.user import UserStatus
from app.models.virtual_trading import (
    AccountStatus,
    OrderSide,
    OrderStatus,
    OrderType,
    VirtualOrder,
    VirtualTradingAccount,
)
from app.services.journey_identity.legacy_recovery import (
    LEGACY_RECOVERY_ACTION,
    grant_legacy_mascot,
    read_legacy_mascot,
)
from app.services.journey_identity.service import JourneyIdentityService

START = datetime(2026, 9, 1, 8, tzinfo=UTC)
END = datetime(2026, 9, 10, 8, tzinfo=UTC)


async def completed_journey(db, user):
    db.add(
        Cap4Progress(
            user_id=user.id,
            entered_at=START,
            graduated_at=START + timedelta(days=2),
        )
    )
    db.add(
        Cap6Progress(
            user_id=user.id,
            entered_at=START + timedelta(days=4),
            graduated_at=END,
        )
    )
    account = VirtualTradingAccount(
        user_id=user.id,
        status=AccountStatus.ACTIVE,
        initial_cash_vnd=100_000_000,
        cash_available_vnd=100_000_000,
        cash_reserved_vnd=0,
        cash_pending_vnd=0,
        activated_at=START,
    )
    db.add(account)
    await db.flush()
    return account


def answers(*matching_layers: str) -> tuple[dict, dict]:
    ai = dict.fromkeys(LOP_KEYS, "ok")
    user = {layer: ("ok" if layer in matching_layers else "bad") for layer in LOP_KEYS}
    return user, ai


async def add_plan(
    db,
    user,
    account,
    *,
    symbol: str,
    trading_date: date,
    created_at: datetime,
    matching_layers: tuple[str, ...] = (),
    side: OrderSide = OrderSide.BUY,
    mode: str = "thuc_chien",
    complete: bool = True,
    plan_created_at: datetime | None = None,
):
    order = VirtualOrder(
        account_id=account.id,
        user_id=user.id,
        symbol=symbol,
        mode=mode,
        side=side,
        order_type=OrderType.MARKET,
        status=OrderStatus.FILLED,
        quantity=100,
        reserved_cash_vnd=0,
        reserved_quantity=0,
        trading_date=trading_date,
        created_at=created_at,
        updated_at=created_at,
    )
    db.add(order)
    await db.flush()
    user_answers, ai_answers = answers(*matching_layers)
    plan_created_at = plan_created_at or created_at
    plan = OrderKehoach(
        order_id=order.id,
        lyDo=LyDo.KY_THUAT,
        trangThai_luc_dat=TrangThaiLucDat.TRUNG_TINH,
        vung_mua=10_000,
        doc_5_lop=user_answers if complete else {"ky_thuat": "ok"},
        ai_5_lop=ai_answers if complete else None,
        created_at=plan_created_at,
        updated_at=plan_created_at,
    )
    db.add(plan)
    await db.flush()
    return order, plan


@pytest.mark.asyncio
async def test_mapping_tie_window_and_first_complete_session_dedupe(db_session, test_user, admin_user):
    account = await completed_journey(db_session, test_user)
    first_a, _ = await add_plan(
        db_session,
        test_user,
        account,
        symbol="aaa",
        trading_date=date(2026, 9, 2),
        created_at=START + timedelta(days=1),
        matching_layers=("ky_thuat", "dong_tien"),
    )
    await add_plan(
        db_session,
        test_user,
        account,
        symbol="AAA",
        trading_date=date(2026, 9, 2),
        created_at=START + timedelta(days=1, minutes=1),
        matching_layers=tuple(LOP_KEYS),
    )
    await add_plan(
        db_session,
        test_user,
        account,
        symbol="BBB",
        trading_date=date(2026, 9, 3),
        created_at=START + timedelta(days=2),
        matching_layers=("dong_tien", "noi_bo"),
    )
    await add_plan(
        db_session,
        test_user,
        account,
        symbol="CCC",
        trading_date=date(2026, 9, 4),
        created_at=START + timedelta(days=3),
        matching_layers=("ky_thuat", "noi_bo"),
    )
    # Complete-looking rows outside the source contract never enter the receipt.
    await add_plan(
        db_session,
        test_user,
        account,
        symbol="OLD",
        trading_date=date(2026, 8, 31),
        created_at=START - timedelta(seconds=1),
        matching_layers=tuple(LOP_KEYS),
    )
    await add_plan(
        db_session,
        test_user,
        account,
        symbol="SELL",
        trading_date=date(2026, 9, 5),
        created_at=START + timedelta(days=4),
        matching_layers=tuple(LOP_KEYS),
        side=OrderSide.SELL,
    )
    await add_plan(
        db_session,
        test_user,
        account,
        symbol="PRACTICE",
        trading_date=date(2026, 9, 6),
        created_at=START + timedelta(days=5),
        matching_layers=tuple(LOP_KEYS),
        mode="san_tap",
    )
    await add_plan(
        db_session,
        test_user,
        account,
        symbol="LATEPLAN",
        trading_date=date(2026, 9, 7),
        created_at=START + timedelta(days=6),
        plan_created_at=END + timedelta(seconds=1),
        matching_layers=tuple(LOP_KEYS),
    )

    receipt = await grant_legacy_mascot(
        db_session, test_user.id, admin_user.id, "Recover real historical Cấp 4 records"
    )
    payload = receipt.payload_after
    assert payload["assignment_basis"] == "legacy_order_snapshot"
    assert payload["valid_pair_count"] == 3
    assert payload["match_counts"] == {
        "ky_thuat": 2,
        "dong_tien": 2,
        "noi_bo": 2,
        "tin_tuc": 0,
        "dinh_gia": 0,
    }
    assert payload["tied_layers"] == ["ky_thuat", "dong_tien", "noi_bo"]
    assert payload["mascot_id"] == "bach_ho"
    assert payload["selected_order_refs"][0]["order_id"] == str(first_a.id)
    assert payload["selected_order_refs"][0]["symbol"] == "AAA"
    assert all(ref["source_hash"] for ref in payload["selected_order_refs"])

    before = await db_session.scalar(select(func.count()).select_from(AdminAuditLog))
    mascot = await read_legacy_mascot(db_session, test_user.id, END)
    after = await db_session.scalar(select(func.count()).select_from(AdminAuditLog))
    assert before == after
    assert mascot["id"] == "bach_ho"
    assert mascot["assignment_basis"] == "legacy_order_snapshot"
    assert mascot["valid_pair_count"] == 3

    state = await JourneyIdentityService(db_session).get(test_user.id)
    assert state["mascot"] == mascot
    assert await JourneyIdentityService(db_session).initialize(test_user.id) is None
    assert await db_session.scalar(select(func.count()).select_from(BotMascotProfile)) == 0

    again = await grant_legacy_mascot(db_session, test_user.id, admin_user.id, "Retry")
    assert again.id == receipt.id


@pytest.mark.asyncio
async def test_ambiguous_exact_first_timestamp_is_rejected(db_session, test_user, admin_user):
    account = await completed_journey(db_session, test_user)
    first_at = START + timedelta(days=1)
    for _ in range(2):
        await add_plan(
            db_session,
            test_user,
            account,
            symbol="AAA",
            trading_date=date(2026, 9, 2),
            created_at=first_at,
            matching_layers=("ky_thuat",),
        )
    with pytest.raises(ConflictError, match="đầu tiên"):
        await grant_legacy_mascot(db_session, test_user.id, admin_user.id, "Ambiguous")


@pytest.mark.asyncio
async def test_no_complete_pair_never_assigns(db_session, test_user, admin_user):
    account = await completed_journey(db_session, test_user)
    assert await read_legacy_mascot(db_session, test_user.id, END) is None
    await add_plan(
        db_session,
        test_user,
        account,
        symbol="AAA",
        trading_date=date(2026, 9, 2),
        created_at=START + timedelta(days=1),
        complete=False,
    )
    with pytest.raises(ConflictError, match="Không có bản đọc legacy"):
        await grant_legacy_mascot(db_session, test_user.id, admin_user.id, "No evidence")
    assert await db_session.scalar(
        select(func.count()).select_from(AdminAuditLog).where(AdminAuditLog.action == LEGACY_RECOVERY_ACTION)
    ) == 0


@pytest.mark.asyncio
async def test_grant_requires_active_admin_and_completed_levels(db_session, test_user, admin_user):
    account = await completed_journey(db_session, test_user)
    await add_plan(
        db_session,
        test_user,
        account,
        symbol="AAA",
        trading_date=date(2026, 9, 2),
        created_at=START + timedelta(days=1),
        matching_layers=("ky_thuat",),
    )
    with pytest.raises(ForbiddenError):
        await grant_legacy_mascot(db_session, test_user.id, test_user.id, "Not admin")
    admin_user.status = UserStatus.SUSPENDED
    await db_session.flush()
    with pytest.raises(ForbiddenError):
        await grant_legacy_mascot(db_session, test_user.id, admin_user.id, "Inactive admin")


@pytest.mark.asyncio
async def test_grant_requires_completed_cap4_and_cap6(db_session, test_user, admin_user):
    with pytest.raises(ConflictError, match="Cấp 4"):
        await grant_legacy_mascot(db_session, test_user.id, admin_user.id, "No levels")

    db_session.add(
        Cap4Progress(
            user_id=test_user.id,
            entered_at=START,
            graduated_at=START + timedelta(days=2),
        )
    )
    await db_session.flush()
    with pytest.raises(ConflictError, match="Cấp 6"):
        await grant_legacy_mascot(db_session, test_user.id, admin_user.id, "No Cấp 6")


@pytest.mark.asyncio
async def test_canonical_assignment_blocks_legacy_grant(db_session, test_user, admin_user):
    account = await completed_journey(db_session, test_user)
    await add_plan(
        db_session,
        test_user,
        account,
        symbol="AAA",
        trading_date=date(2026, 9, 2),
        created_at=START + timedelta(days=1),
        matching_layers=("ky_thuat",),
    )
    assigned_at = END + timedelta(seconds=1)
    db_session.add(
        BotMascotProfile(
            user_id=test_user.id,
            mascot_rules_version=1,
            assignment_status="assigned",
            mascot_id="bach_ho",
            dominant_layer="ky_thuat",
            assignment_basis="ai_match_count",
            window_start=START,
            window_end=END,
            valid_pair_count=1,
            match_counts={layer: int(layer == "ky_thuat") for layer in LOP_KEYS},
            tied_layers=["ky_thuat"],
            selected_assessment_refs=[{"assessment_id": "canonical"}],
            dataset_hash="0" * 64,
            excluded_records_summary={},
            assigned_at=assigned_at,
            created_at=assigned_at,
            updated_at=assigned_at,
        )
    )
    await db_session.flush()
    with pytest.raises(ConflictError, match="canonical"):
        await grant_legacy_mascot(db_session, test_user.id, admin_user.id, "Must not replace")


@pytest.mark.asyncio
async def test_receipt_is_frozen_and_detects_selected_source_changes(db_session, test_user, admin_user):
    account = await completed_journey(db_session, test_user)
    _, selected_plan = await add_plan(
        db_session,
        test_user,
        account,
        symbol="AAA",
        trading_date=date(2026, 9, 2),
        created_at=START + timedelta(days=1),
        matching_layers=("ky_thuat",),
    )
    receipt = await grant_legacy_mascot(db_session, test_user.id, admin_user.id, "Frozen")

    # A later row for the same session cannot reroll the frozen receipt.
    await add_plan(
        db_session,
        test_user,
        account,
        symbol="AAA",
        trading_date=date(2026, 9, 2),
        created_at=START + timedelta(days=1, minutes=1),
        matching_layers=tuple(LOP_KEYS),
    )
    mascot = await read_legacy_mascot(db_session, test_user.id, END)
    assert mascot["match_counts"] == receipt.payload_after["match_counts"]

    changed = dict(selected_plan.doc_5_lop)
    changed["ky_thuat"] = "bad"
    selected_plan.doc_5_lop = changed
    await db_session.flush()
    with pytest.raises(ConflictError, match="cần được kiểm tra"):
        await read_legacy_mascot(db_session, test_user.id, END)
