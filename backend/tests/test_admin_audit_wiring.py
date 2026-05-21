"""Tests for T27: audit wiring on all existing admin mutations.

Asserts that every admin mutation endpoint produces an audit row with the
correct action, target_entity, and target_id.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.admin_audit import AdminAuditLog
from app.models.premium import PremiumPlan, PremiumSubscription, SubscriptionStatus
from app.models.user import User, UserRole, UserStatus
from app.models.virtual_trading import (
    AccountStatus,
    VirtualTradingAccount,
    VirtualTradingConfig,
)

pytestmark = pytest.mark.asyncio


# ── Helpers ──────────────────────────────────────────────────────────────────


def _token(user: User) -> str:
    return create_access_token(subject=user.id, extra_claims={"role": user.role.value})


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(user)}"}


async def _admin_headers(client: AsyncClient) -> dict[str, str]:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "Admin@1234"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _audit_rows(db: AsyncSession, action: str) -> list[AdminAuditLog]:
    return list(
        (
            await db.execute(
                select(AdminAuditLog).where(AdminAuditLog.action == action)
            )
        )
        .scalars()
        .all()
    )


async def _ensure_trial_plan(db: AsyncSession) -> PremiumPlan:
    res = await db.execute(select(PremiumPlan).where(PremiumPlan.code == "TRIAL_7D"))
    plan = res.scalar_one_or_none()
    if plan is None:
        plan = PremiumPlan(
            code="TRIAL_7D",
            name="Dùng thử 7 ngày",
            price_vnd=0,
            duration_days=7,
            is_active=True,
            sort_order=-1,
        )
        db.add(plan)
        await db.commit()
        await db.refresh(plan)
    return plan


async def _make_vt_account(db: AsyncSession, user: User, cash: int = 500_000_000) -> VirtualTradingAccount:
    res = await db.execute(
        select(VirtualTradingConfig).where(VirtualTradingConfig.is_active.is_(True))
    )
    cfg = res.scalar_one_or_none()
    if cfg is None:
        cfg = VirtualTradingConfig(
            initial_cash_vnd=cash,
            buy_fee_rate_bps=15,
            sell_fee_rate_bps=15,
            sell_tax_rate_bps=10,
            is_active=True,
        )
        db.add(cfg)
        await db.flush()

    acct = VirtualTradingAccount(
        user_id=user.id,
        status=AccountStatus.ACTIVE,
        initial_cash_vnd=cash,
        cash_available_vnd=cash,
        cash_reserved_vnd=0,
        cash_pending_vnd=0,
        activated_at=datetime.now(UTC),
    )
    db.add(acct)
    await db.commit()
    await db.refresh(acct)
    return acct


# ── T27.1: user.create audit row ─────────────────────────────────────────────


async def test_admin_create_user_records_audit(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    headers = await _admin_headers(client)
    resp = await client.post(
        "/api/v1/users/",
        json={
            "email": "newuser@example.com",
            "password": "NewUser@1234",
            "first_name": "New",
            "last_name": "User",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    user_id = resp.json()["id"]

    rows = await _audit_rows(db_session, "user.create")
    assert len(rows) == 1
    assert rows[0].target_id == user_id
    assert rows[0].target_entity == "user"
    assert rows[0].payload_before is None
    assert rows[0].payload_after is not None


# ── T27.2: user.update audit row ─────────────────────────────────────────────


async def test_admin_update_user_records_audit(
    client: AsyncClient, db_session: AsyncSession, admin_user: User, test_user: User
):
    headers = await _admin_headers(client)
    resp = await client.patch(
        f"/api/v1/users/{test_user.id}",
        json={"role": "premium"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    rows = await _audit_rows(db_session, "user.update")
    assert len(rows) == 1
    assert rows[0].target_id == str(test_user.id)
    # Before should have the old role, after the new one
    assert rows[0].payload_before == {"role": "user"}
    assert rows[0].payload_after == {"role": "premium"}


# ── T27.3: user.delete audit row ─────────────────────────────────────────────


async def test_admin_delete_user_records_audit(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    # Create a user to delete
    user = User(
        email="todelete@example.com",
        hashed_password=hash_password("Pass@1234"),
        first_name="To",
        last_name="Delete",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    headers = await _admin_headers(client)
    resp = await client.delete(f"/api/v1/users/{user.id}", headers=headers)
    assert resp.status_code == 200, resp.text

    rows = await _audit_rows(db_session, "user.delete")
    assert len(rows) == 1
    assert rows[0].target_id == str(user.id)
    assert rows[0].payload_before == {"status": "active"}
    assert rows[0].payload_after == {"status": "deleted"}


# ── T27.4: premium.grant audit row ───────────────────────────────────────────


async def test_admin_grant_premium_records_audit(
    client: AsyncClient, db_session: AsyncSession, admin_user: User, test_user: User
):
    plan = await _ensure_trial_plan(db_session)
    headers = await _admin_headers(client)

    resp = await client.post(
        f"/api/v1/premium/admin/users/{test_user.id}/grant",
        json={"plan_id": str(plan.id), "note": "Manual grant for audit test"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text

    rows = await _audit_rows(db_session, "premium.grant")
    assert len(rows) == 1
    assert rows[0].target_entity == "subscription"
    assert rows[0].payload_after is not None
    assert rows[0].payload_after["user_id"] == str(test_user.id)


# ── T27.5: vt.config.update audit row ────────────────────────────────────────


async def test_admin_update_vt_config_records_audit(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    headers = await _admin_headers(client)
    resp = await client.patch(
        "/api/v1/virtual-trading/admin/config",
        json={"buy_fee_rate_bps": 20},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    rows = await _audit_rows(db_session, "vt.config.update")
    assert len(rows) == 1
    assert rows[0].payload_before == {"buy_fee_rate_bps": 15}
    assert rows[0].payload_after == {"buy_fee_rate_bps": 20}


# ── T27.6: vt.account.reset audit row ────────────────────────────────────────


async def test_admin_reset_vt_account_records_audit(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    # Need a user with a VT account to reset
    user = User(
        email=f"vtuser-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("Pass@1234"),
        first_name="VT",
        last_name="User",
        role=UserRole.PREMIUM,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    await _make_vt_account(db_session, user)

    headers = await _admin_headers(client)
    resp = await client.post(
        f"/api/v1/virtual-trading/admin/users/{user.id}/reset",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    rows = await _audit_rows(db_session, "vt.account.reset")
    assert len(rows) == 1
    assert rows[0].note is not None and str(user.id) in rows[0].note


# ── T27.7: vt.account.reset_all audit row ────────────────────────────────────


async def test_admin_reset_all_vt_accounts_records_audit(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    headers = await _admin_headers(client)
    resp = await client.post(
        "/api/v1/virtual-trading/admin/reset-all",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    rows = await _audit_rows(db_session, "vt.account.reset_all")
    assert len(rows) == 1
    assert rows[0].payload_after is not None
    assert "count" in rows[0].payload_after
