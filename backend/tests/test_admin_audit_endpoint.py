"""Tests for admin audit log viewer endpoint (T10)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.admin_audit import AdminAuditLog
from app.models.user import User, UserRole, UserStatus

pytestmark = pytest.mark.asyncio


# ── helpers ───────────────────────────────────────────────────────────────────


async def _make_admin(db: AsyncSession) -> tuple[User, dict[str, str]]:
    user = User(
        email=f"adm-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Adm@1234"),
        first_name="Adm",
        last_name="In",
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    return user, {"Authorization": f"Bearer {token}"}


async def _seed_audit_row(
    db: AsyncSession,
    admin_id: uuid.UUID,
    action: str = "test.action",
    target_entity: str | None = "plan",
    target_id: str | None = "abc",
) -> AdminAuditLog:
    row = AdminAuditLog(
        admin_user_id=admin_id,
        action=action,
        target_entity=target_entity,
        target_id=target_id,
        payload_before={"x": 1},
        payload_after={"x": 2},
        note="test note",
        ip="127.0.0.1",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


# ── tests ──────────────────────────────────────────────────────────────────────


async def test_list_audit_logs_empty(db_session, client):
    _, headers = await _make_admin(db_session)
    resp = await client.get("/api/v1/admin/audit", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


async def test_list_audit_logs_with_admin_email(db_session, client):
    admin, headers = await _make_admin(db_session)
    await _seed_audit_row(db_session, admin.id, action="premium.plan.create")

    resp = await client.get("/api/v1/admin/audit", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1

    item = data["items"][0]
    # admin_email should be populated from the extra query
    assert item["admin_email"] == admin.email
    assert item["admin_user_id"] == str(admin.id)
    assert item["action"] == "premium.plan.create"
    assert item["payload_before"] == {"x": 1}
    assert item["payload_after"] == {"x": 2}


async def test_list_audit_filter_by_action_prefix(db_session, client):
    admin, headers = await _make_admin(db_session)
    await _seed_audit_row(db_session, admin.id, action="premium.plan.create")
    await _seed_audit_row(db_session, admin.id, action="subscription.cancel")

    resp = await client.get("/api/v1/admin/audit?action_prefix=premium", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["action"] == "premium.plan.create"


async def test_list_audit_filter_by_target_entity(db_session, client):
    admin, headers = await _make_admin(db_session)
    await _seed_audit_row(db_session, admin.id, action="a.b", target_entity="plan")
    await _seed_audit_row(db_session, admin.id, action="c.d", target_entity="subscription")

    resp = await client.get("/api/v1/admin/audit?target_entity=plan", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["target_entity"] == "plan"


async def test_list_audit_filter_by_admin_user_id(db_session, client):
    admin1, headers1 = await _make_admin(db_session)
    admin2, _ = await _make_admin(db_session)
    await _seed_audit_row(db_session, admin1.id, action="a.1")
    await _seed_audit_row(db_session, admin2.id, action="a.2")

    resp = await client.get(
        f"/api/v1/admin/audit?admin_user_id={admin1.id}", headers=headers1
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["admin_user_id"] == str(admin1.id)


async def test_list_audit_null_admin_rows(db_session, client):
    """System rows with admin_user_id=None should have admin_email=None."""
    _, headers = await _make_admin(db_session)
    row = AdminAuditLog(
        admin_user_id=None,
        action="system.expiry_sweep",
        target_entity=None,
    )
    db_session.add(row)
    await db_session.commit()

    resp = await client.get("/api/v1/admin/audit?action_prefix=system", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["admin_email"] is None


async def test_list_audit_pagination(db_session, client):
    admin, headers = await _make_admin(db_session)
    for i in range(5):
        await _seed_audit_row(db_session, admin.id, action=f"test.action.{i}")

    resp = await client.get("/api/v1/admin/audit?page=1&page_size=3", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 3
    assert data["total_pages"] == 2


async def test_non_admin_blocked(db_session, client):
    user = User(
        email=f"u-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Pwd@1234"),
        first_name="U",
        last_name="U",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    resp = await client.get(
        "/api/v1/admin/audit",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
