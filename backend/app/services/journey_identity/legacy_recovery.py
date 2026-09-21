"""Audited compatibility recovery from frozen legacy order snapshots.

Legacy Cấp 4 stored the user's five-layer reading and the contemporaneous AI
reading directly on ``OrderKehoach``.  This module can expose those real rows as
a separately attributed mascot receipt.  It never creates a JourneyAssessment,
rewrites a dataset, or claims the commit-then-reveal proof used by the canonical
classifier.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models.admin_audit import AdminAuditLog
from app.models.cap1 import OrderKehoach
from app.models.cap4 import LOP_KEYS, Cap4Progress
from app.models.cap6 import Cap6Progress
from app.models.journey_identity import BotMascotProfile
from app.models.user import User, UserRole, UserStatus
from app.models.virtual_trading import OrderSide, VirtualOrder
from app.services.journey_identity.classification import MASCOTS, RULES_VERSION, choose_mascot, digest, utc

LEGACY_RECOVERY_ACTION = "journey.mascot_legacy_recovery"
LEGACY_RECOVERY_BASIS = "legacy_order_snapshot"
LEGACY_RECOVERY_PURPOSE = "legacy_order_snapshot_compatibility"


def _timestamp(value: datetime) -> str:
    return str(utc(value).isoformat())


def _complete_map(value: object) -> bool:
    return (
        isinstance(value, dict)
        and set(value) == set(LOP_KEYS)
        and all(item in ("ok", "neu", "bad") for item in value.values())
    )


def _source_ref(order: VirtualOrder, plan: OrderKehoach) -> dict:
    contribution = {
        layer: int(plan.doc_5_lop[layer] == plan.ai_5_lop[layer])
        for layer in LOP_KEYS
    }
    source = {
        "order_id": str(order.id),
        "plan_id": str(plan.id),
        "symbol": order.symbol.strip().upper(),
        "trading_date": str(order.trading_date),
        "order_created_at": _timestamp(order.created_at),
        "plan_created_at": _timestamp(plan.created_at),
        "user_answers": dict(plan.doc_5_lop),
        "ai_answers": dict(plan.ai_5_lop),
        "contribution": contribution,
    }
    return {**source, "source_hash": digest(source)}


async def _legacy_rows(
    session: AsyncSession,
    user_id: uuid.UUID,
    window_start: datetime,
    window_end: datetime,
) -> list[tuple[VirtualOrder, OrderKehoach]]:
    rows = (
        await session.execute(
            select(VirtualOrder, OrderKehoach)
            .join(OrderKehoach, OrderKehoach.order_id == VirtualOrder.id)
            .where(
                VirtualOrder.user_id == user_id,
                VirtualOrder.side == OrderSide.BUY,
                VirtualOrder.mode == "thuc_chien",
            )
        )
    ).all()
    return [
        (order, plan)
        for order, plan in rows
        if utc(window_start) <= utc(order.created_at) <= utc(window_end)
        and utc(plan.created_at) <= utc(window_end)
        and _complete_map(plan.doc_5_lop)
        and _complete_map(plan.ai_5_lop)
    ]


def _select_first_per_session(
    rows: list[tuple[VirtualOrder, OrderKehoach]],
) -> list[tuple[VirtualOrder, OrderKehoach]]:
    grouped: dict[tuple[str, date], list[tuple[VirtualOrder, OrderKehoach]]] = defaultdict(list)
    for order, plan in rows:
        grouped[(order.symbol.strip().upper(), order.trading_date)].append((order, plan))

    selected = []
    for (symbol, trading_date), candidates in grouped.items():
        first_at = min(utc(order.created_at) for order, _ in candidates)
        first = [pair for pair in candidates if utc(pair[0].created_at) == first_at]
        if len(first) != 1:
            raise ConflictError(
                f"Không xác định được bản đọc legacy đầu tiên cho {symbol} ngày {trading_date}"
            )
        selected.append(first[0])
    return sorted(
        selected,
        key=lambda pair: (
            utc(pair[0].created_at),
            pair[0].symbol.strip().upper(),
            pair[0].trading_date,
        ),
    )


def _classification(source_refs: list[dict]) -> dict:
    if not source_refs:
        raise ConflictError("Không có bản đọc legacy đủ chứng cứ để khôi phục Linh thú")
    counts = dict.fromkeys(LOP_KEYS, 0)
    for ref in source_refs:
        for layer, value in ref["contribution"].items():
            counts[layer] += value
    result = choose_mascot(counts, len(source_refs))
    if result["assignment_status"] != "assigned":  # defensive: n is positive
        raise ConflictError("Không thể phân loại Linh thú từ bản đọc legacy")
    return {
        "mascot_id": result["mascot_id"],
        "dominant_layer": result["dominant_layer"],
        "tied_layers": result["tied_layers"],
        "valid_pair_count": len(source_refs),
        "match_counts": counts,
    }


def _receipt_payload(
    user_id: uuid.UUID,
    cap4: Cap4Progress,
    cap6: Cap6Progress,
    source_refs: list[dict],
) -> dict:
    outcome = _classification(source_refs)
    return {
        "purpose": LEGACY_RECOVERY_PURPOSE,
        "user_id": str(user_id),
        "mascot_rules_version": RULES_VERSION,
        "assignment_basis": LEGACY_RECOVERY_BASIS,
        "cap4_entered_at": _timestamp(cap4.entered_at),
        "cap4_graduated_at": _timestamp(cap4.graduated_at),
        "cap6_graduated_at": _timestamp(cap6.graduated_at),
        **outcome,
        "selected_order_refs": source_refs,
        "source_snapshot_hash": digest(source_refs),
    }


async def _receipts(session: AsyncSession, user_id: uuid.UUID) -> list[AdminAuditLog]:
    return list(
        (
            await session.execute(
                select(AdminAuditLog)
                .where(
                    AdminAuditLog.action == LEGACY_RECOVERY_ACTION,
                    AdminAuditLog.target_entity == "user",
                    AdminAuditLog.target_id == str(user_id),
                )
                .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
            )
        )
        .scalars()
        .all()
    )


async def _completed_progress(
    session: AsyncSession, user_id: uuid.UUID
) -> tuple[Cap4Progress, Cap6Progress]:
    cap4 = await session.scalar(select(Cap4Progress).where(Cap4Progress.user_id == user_id))
    cap6 = await session.scalar(select(Cap6Progress).where(Cap6Progress.user_id == user_id))
    if cap4 is None or cap4.graduated_at is None:
        raise ConflictError("Người dùng chưa hoàn thành Cấp 4")
    if cap6 is None or cap6.graduated_at is None:
        raise ConflictError("Người dùng chưa hoàn thành Cấp 6")
    if utc(cap4.entered_at) > utc(cap6.graduated_at):
        raise ConflictError("Cửa sổ dữ liệu legacy không hợp lệ")
    return cap4, cap6


async def grant_legacy_mascot(
    session: AsyncSession,
    user_id: uuid.UUID,
    admin_id: uuid.UUID,
    reason: str,
) -> AdminAuditLog:
    """Create one append-only legacy recovery receipt; caller owns commit."""
    if not isinstance(reason, str) or not reason.strip():
        raise BadRequestError("Cần nêu lý do khôi phục Linh thú legacy")
    reason = reason.strip()
    if len(reason) > 1000:
        raise BadRequestError("Lý do khôi phục không được vượt quá 1000 ký tự")

    admin = (
        await session.execute(select(User).where(User.id == admin_id).with_for_update())
    ).scalar_one_or_none()
    if admin is None:
        raise NotFoundError("quản trị viên")
    if admin.role != UserRole.ADMIN or admin.status != UserStatus.ACTIVE:
        raise ForbiddenError("Người khôi phục phải là quản trị viên đang hoạt động")

    user = (
        await session.execute(select(User).where(User.id == user_id).with_for_update())
    ).scalar_one_or_none()
    if user is None:
        raise NotFoundError("người dùng")

    profile = await session.scalar(
        select(BotMascotProfile).where(
            BotMascotProfile.user_id == user_id,
            BotMascotProfile.mascot_rules_version == RULES_VERSION,
        )
    )
    if profile is not None and profile.assignment_status == "assigned":
        raise ConflictError("Người dùng đã có Linh thú từ chứng cứ canonical")

    cap4, cap6 = await _completed_progress(session, user_id)
    selected = _select_first_per_session(
        await _legacy_rows(session, user_id, cap4.entered_at, cap6.graduated_at)
    )
    payload = _receipt_payload(
        user_id,
        cap4,
        cap6,
        [_source_ref(order, plan) for order, plan in selected],
    )

    existing = await _receipts(session, user_id)
    for receipt in existing:
        if receipt.payload_after == payload:
            return receipt
        raise ConflictError("Biên nhận khôi phục Linh thú legacy đã tồn tại với dữ liệu khác")

    receipt = AdminAuditLog(
        admin_user_id=admin_id,
        action=LEGACY_RECOVERY_ACTION,
        target_entity="user",
        target_id=str(user_id),
        payload_before=None,
        payload_after=payload,
        note=reason,
    )
    session.add(receipt)
    await session.flush()
    await session.refresh(receipt)
    return receipt


def _parse_timestamp(payload: dict, key: str) -> datetime:
    value = payload.get(key)
    if not isinstance(value, str):
        raise ValueError(key)
    return datetime.fromisoformat(value)


async def _validate_receipt(
    session: AsyncSession,
    receipt: AdminAuditLog,
    user_id: uuid.UUID,
    graduated_at: datetime,
) -> dict:
    payload = receipt.payload_after
    if not isinstance(payload, dict):
        raise ConflictError("Biên nhận Linh thú legacy cần được kiểm tra")
    try:
        cap4, cap6 = await _completed_progress(session, user_id)
        refs = payload["selected_order_refs"]
        if (
            payload.get("purpose") != LEGACY_RECOVERY_PURPOSE
            or payload.get("user_id") != str(user_id)
            or payload.get("mascot_rules_version") != RULES_VERSION
            or payload.get("assignment_basis") != LEGACY_RECOVERY_BASIS
            or not isinstance(refs, list)
            or not refs
            or utc(_parse_timestamp(payload, "cap4_entered_at")) != utc(cap4.entered_at)
            or utc(_parse_timestamp(payload, "cap4_graduated_at")) != utc(cap4.graduated_at)
            or utc(_parse_timestamp(payload, "cap6_graduated_at")) != utc(cap6.graduated_at)
            or utc(cap6.graduated_at) != utc(graduated_at)
            or payload.get("source_snapshot_hash") != digest(refs)
        ):
            raise ValueError("receipt header")

        rebuilt = [
            _source_ref(order, plan)
            for order, plan in _select_first_per_session(
                await _legacy_rows(session, user_id, cap4.entered_at, cap6.graduated_at)
            )
        ]
        if rebuilt != refs:
            raise ValueError("source selection changed")

        outcome = _classification(rebuilt)
        if any(payload.get(key) != value for key, value in outcome.items()):
            raise ValueError("classification changed")
    except (KeyError, TypeError, ValueError, AttributeError) as error:
        raise ConflictError("Biên nhận Linh thú legacy cần được kiểm tra") from error
    return payload


async def read_legacy_mascot(
    session: AsyncSession,
    user_id: uuid.UUID,
    graduated_at: datetime,
) -> dict | None:
    """Read and verify a frozen legacy receipt without writing or rerolling."""
    receipts = await _receipts(session, user_id)
    if not receipts:
        return None

    profile = await session.scalar(
        select(BotMascotProfile).where(
            BotMascotProfile.user_id == user_id,
            BotMascotProfile.mascot_rules_version == RULES_VERSION,
        )
    )
    if profile is not None and profile.assignment_status == "assigned":
        return None
    payloads = [await _validate_receipt(session, row, user_id, graduated_at) for row in receipts]
    if any(payload != payloads[0] for payload in payloads[1:]):
        raise ConflictError("Có nhiều biên nhận Linh thú legacy không đồng nhất")

    payload = payloads[0]
    layer = payload["dominant_layer"]
    mascot_id, name = MASCOTS[layer]
    if mascot_id != payload["mascot_id"]:
        raise ConflictError("Biên nhận Linh thú legacy cần được kiểm tra")
    return {
        "id": mascot_id,
        "name": name,
        "dominant_layer": layer,
        "assignment_basis": LEGACY_RECOVERY_BASIS,
        "valid_pair_count": payload["valid_pair_count"],
        "match_counts": payload["match_counts"],
        "tied_layers": payload["tied_layers"],
        "window_start": datetime.fromisoformat(payload["cap4_entered_at"]),
        "window_end": graduated_at,
        "assigned_at": utc(receipts[0].created_at),
    }
