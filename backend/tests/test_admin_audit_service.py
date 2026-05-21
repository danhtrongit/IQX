"""Tests for AdminAuditService — record + list + diff."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps_audit import AuditContext
from app.services.admin_audit import AdminAuditService, diff_dict


pytestmark = pytest.mark.asyncio


def _ctx(admin_id: uuid.UUID | None = None) -> AuditContext:
    return AuditContext(
        admin_id=admin_id or uuid.uuid4(),
        ip="127.0.0.1",
        user_agent="pytest",
        request_id=str(uuid.uuid4()),
    )


async def test_record_inserts_row(db_session: AsyncSession) -> None:
    ctx = _ctx()
    svc = AdminAuditService(db_session)
    row = await svc.record(
        ctx,
        action="user.update",
        target_entity="user",
        target_id=str(uuid.uuid4()),
        before={"role": "user"},
        after={"role": "premium"},
        note="manual upgrade",
    )
    assert row.id is not None
    assert row.action == "user.update"
    assert row.admin_user_id == ctx.admin_id
    assert row.payload_before == {"role": "user"}
    assert row.payload_after == {"role": "premium"}
    assert row.note == "manual upgrade"
    assert row.ip == "127.0.0.1"


async def test_record_with_no_ctx_for_system_action(db_session: AsyncSession) -> None:
    svc = AdminAuditService(db_session)
    row = await svc.record(
        None,
        action="system.expiry_sweep",
        note="auto-expired 3 subscriptions",
    )
    assert row.admin_user_id is None
    assert row.ip is None
    assert row.action == "system.expiry_sweep"


async def test_list_filters_by_action_prefix(db_session: AsyncSession) -> None:
    ctx = _ctx()
    svc = AdminAuditService(db_session)
    await svc.record(ctx, action="user.update")
    await svc.record(ctx, action="user.delete")
    await svc.record(ctx, action="plan.create")

    result = await svc.list(action_prefix="user.")
    assert result.total == 2
    assert {r.action for r in result.items} == {"user.update", "user.delete"}


async def test_list_filters_by_target(db_session: AsyncSession) -> None:
    ctx = _ctx()
    target = str(uuid.uuid4())
    svc = AdminAuditService(db_session)
    await svc.record(ctx, action="user.update", target_entity="user", target_id=target)
    await svc.record(ctx, action="user.update", target_entity="user", target_id=str(uuid.uuid4()))

    result = await svc.list(target_entity="user", target_id=target)
    assert result.total == 1
    assert result.items[0].target_id == target


async def test_list_filters_by_date_range(db_session: AsyncSession) -> None:
    ctx = _ctx()
    svc = AdminAuditService(db_session)
    await svc.record(ctx, action="user.update")

    now = datetime.now(UTC)
    result = await svc.list(date_from=now - timedelta(minutes=5), date_to=now + timedelta(minutes=5))
    assert result.total == 1

    far_past = await svc.list(date_from=now - timedelta(days=30), date_to=now - timedelta(days=15))
    assert far_past.total == 0


async def test_list_pagination(db_session: AsyncSession) -> None:
    ctx = _ctx()
    svc = AdminAuditService(db_session)
    for i in range(7):
        await svc.record(ctx, action="user.update", note=f"#{i}")

    page1 = await svc.list(page=1, page_size=3)
    assert page1.total == 7
    assert page1.total_pages == 3
    assert len(page1.items) == 3

    page3 = await svc.list(page=3, page_size=3)
    assert len(page3.items) == 1


async def test_list_sorts_newest_first(db_session: AsyncSession) -> None:
    ctx = _ctx()
    svc = AdminAuditService(db_session)
    a = await svc.record(ctx, action="user.update", note="first")
    b = await svc.record(ctx, action="user.update", note="second")
    result = await svc.list()
    # newest first
    assert result.items[0].id == b.id
    assert result.items[1].id == a.id


def test_diff_dict_basic() -> None:
    before, after = diff_dict(
        {"a": 1, "b": 2, "c": 3},
        {"a": 1, "b": 22, "d": 4},
    )
    # 'a' unchanged → dropped. 'b' changed. 'c' removed. 'd' added.
    assert before == {"b": 2, "c": 3, "d": None}
    assert after == {"b": 22, "c": None, "d": 4}


def test_diff_dict_no_changes() -> None:
    assert diff_dict({"a": 1}, {"a": 1}) == (None, None)


def test_diff_dict_empty() -> None:
    assert diff_dict(None, None) == (None, None)
    assert diff_dict({}, {}) == (None, None)
