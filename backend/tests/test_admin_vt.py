"""Tests for T24: admin VT freeze/unfreeze/cash-adjust endpoints."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

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
    VirtualCashLedger,
    VirtualTradingAccount,
    VirtualTradingConfig,
)

pytestmark = pytest.mark.asyncio

_VS = "app.services.virtual_trading.service.validate_symbol"
_PR = "app.services.virtual_trading.service.resolve_price"

# ── Helpers ──────────────────────────────────────────────────────────────────


async def _admin_headers(client: AsyncClient) -> dict[str, str]:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "Admin@1234"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_vt_account(
    db: AsyncSession,
    user: User,
    cash: int = 1_000_000_000,
) -> VirtualTradingAccount:
    """Create a VT account for the given user directly in the DB."""
    # Ensure config exists
    from sqlalchemy import select as _sel
    cfg = (await db.execute(_sel(VirtualTradingConfig).where(VirtualTradingConfig.is_active.is_(True)))).scalar_one_or_none()
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


async def _make_premium_user(db: AsyncSession) -> tuple[User, VirtualTradingAccount]:
    """Create a premium user + active subscription + VT account."""
    user = User(
        email=f"prem-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("Test@1234"),
        full_name="Prem User".strip(),
        role=UserRole.PREMIUM,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Ensure TRIAL_7D plan
    from sqlalchemy import select as _sel
    res = await db.execute(_sel(PremiumPlan).where(PremiumPlan.code == "TRIAL_7D"))
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

    now = datetime.now(UTC)
    sub = PremiumSubscription(
        user_id=user.id,
        current_plan_id=plan.id,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    )
    db.add(sub)
    await db.commit()

    acct = await _make_vt_account(db, user)
    return user, acct


# ── T24.1: Freeze a non-frozen account ───────────────────────────────────────


async def test_freeze_account(client: AsyncClient, db_session: AsyncSession, admin_user: User):
    _, acct = await _make_premium_user(db_session)
    headers = await _admin_headers(client)

    resp = await client.post(
        f"/api/v1/admin/vt/accounts/{acct.id}/freeze",
        json={"reason": "Suspected fraud"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["frozen_at"] is not None
    assert data["freeze_reason"] == "Suspected fraud"
    assert data["status"] == "suspended"

    # Verify audit row
    from sqlalchemy import select as _sel
    audit_rows = (
        await db_session.execute(
            _sel(AdminAuditLog).where(AdminAuditLog.action == "vt.account.freeze")
        )
    ).scalars().all()
    assert len(audit_rows) == 1
    assert audit_rows[0].target_id == str(acct.id)
    assert audit_rows[0].note == "Suspected fraud"


# ── T24.2: Freeze already-frozen account → 400 ───────────────────────────────


async def test_freeze_already_frozen_returns_400(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    _, acct = await _make_premium_user(db_session)
    headers = await _admin_headers(client)

    # First freeze
    r1 = await client.post(
        f"/api/v1/admin/vt/accounts/{acct.id}/freeze",
        json={"reason": "First freeze"},
        headers=headers,
    )
    assert r1.status_code == 200

    # Second freeze → 400
    r2 = await client.post(
        f"/api/v1/admin/vt/accounts/{acct.id}/freeze",
        json={"reason": "Double freeze"},
        headers=headers,
    )
    assert r2.status_code == 400


# ── T24.3: Unfreeze a frozen account ─────────────────────────────────────────


async def test_unfreeze_account(client: AsyncClient, db_session: AsyncSession, admin_user: User):
    _, acct = await _make_premium_user(db_session)
    headers = await _admin_headers(client)

    # Freeze first
    await client.post(
        f"/api/v1/admin/vt/accounts/{acct.id}/freeze",
        json={"reason": "Test freeze"},
        headers=headers,
    )

    resp = await client.post(
        f"/api/v1/admin/vt/accounts/{acct.id}/unfreeze",
        json={"reason": "Resolved"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["frozen_at"] is None
    assert data["freeze_reason"] is None
    assert data["status"] == "active"

    # Verify audit row for unfreeze
    from sqlalchemy import select as _sel
    audit_rows = (
        await db_session.execute(
            _sel(AdminAuditLog).where(AdminAuditLog.action == "vt.account.unfreeze")
        )
    ).scalars().all()
    assert len(audit_rows) == 1


# ── T24.4: Unfreeze a non-frozen account → 400 ───────────────────────────────


async def test_unfreeze_non_frozen_returns_400(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    _, acct = await _make_premium_user(db_session)
    headers = await _admin_headers(client)

    resp = await client.post(
        f"/api/v1/admin/vt/accounts/{acct.id}/unfreeze",
        json={"reason": "Nothing to unfreeze"},
        headers=headers,
    )
    assert resp.status_code == 400


# ── T24.5: Cash-adjust positive ──────────────────────────────────────────────


async def test_cash_adjust_positive(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    _, acct = await _make_premium_user(db_session)
    original_cash = acct.cash_available_vnd
    headers = await _admin_headers(client)

    resp = await client.post(
        f"/api/v1/admin/vt/accounts/{acct.id}/cash-adjust",
        json={"amount_vnd": 50_000_000, "reason": "Bonus adjustment"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["new_cash_available_vnd"] == original_cash + 50_000_000
    assert data["account"]["cash_available_vnd"] == original_cash + 50_000_000
    assert "ledger_id" in data

    # Verify ledger row
    from sqlalchemy import select as _sel
    ledger_rows = (
        await db_session.execute(
            _sel(VirtualCashLedger).where(VirtualCashLedger.account_id == acct.id)
        )
    ).scalars().all()
    assert any(r.kind == "admin_adjust" for r in ledger_rows)

    # Verify audit row
    audit_rows = (
        await db_session.execute(
            _sel(AdminAuditLog).where(AdminAuditLog.action == "vt.cash.adjust")
        )
    ).scalars().all()
    assert len(audit_rows) == 1


# ── T24.6: Cash-adjust negative within balance ───────────────────────────────


async def test_cash_adjust_negative_within_balance(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    _, acct = await _make_premium_user(db_session)
    original_cash = acct.cash_available_vnd
    headers = await _admin_headers(client)

    resp = await client.post(
        f"/api/v1/admin/vt/accounts/{acct.id}/cash-adjust",
        json={"amount_vnd": -100_000_000, "reason": "Penalty deduction"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["new_cash_available_vnd"] == original_cash - 100_000_000


# ── T24.7: Cash-adjust negative beyond balance → 400 ─────────────────────────


async def test_cash_adjust_negative_beyond_balance_returns_400(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    _, acct = await _make_premium_user(db_session)
    headers = await _admin_headers(client)

    resp = await client.post(
        f"/api/v1/admin/vt/accounts/{acct.id}/cash-adjust",
        json={"amount_vnd": -99_999_999_999, "reason": "Way too much"},
        headers=headers,
    )
    assert resp.status_code == 400


# ── T24.8: Place order on frozen account → 403 ───────────────────────────────


async def test_frozen_account_blocks_place_order(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    prem_user, acct = await _make_premium_user(db_session)
    admin_headers = await _admin_headers(client)

    # Freeze the account
    r = await client.post(
        f"/api/v1/admin/vt/accounts/{acct.id}/freeze",
        json={"reason": "Test block"},
        headers=admin_headers,
    )
    assert r.status_code == 200

    # Now try to place an order as the premium user
    token = create_access_token(subject=prem_user.id, extra_claims={"role": prem_user.role.value})
    prem_headers = {"Authorization": f"Bearer {token}"}

    with (
        patch(_VS, new=AsyncMock(return_value=True)),
        patch(
            _PR,
            new=AsyncMock(
                return_value=type(
                    "PR",
                    (),
                    {
                        "price_vnd": 100_000,
                        "source": "realtime",
                        "timestamp": datetime.now(UTC),
                    },
                )()
            ),
        ),
    ):
        resp = await client.post(
            "/api/v1/virtual-trading/orders",
            json={"symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100},
            headers=prem_headers,
        )
    assert resp.status_code == 403


# ── T24.9: Non-admin cannot access admin VT endpoints → 403 ──────────────────


async def test_non_admin_cannot_freeze(
    client: AsyncClient, db_session: AsyncSession, test_user: User
):
    _, acct = await _make_premium_user(db_session)
    resp_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "Test@1234"},
    )
    headers = {"Authorization": f"Bearer {resp_login.json()['access_token']}"}

    resp = await client.post(
        f"/api/v1/admin/vt/accounts/{acct.id}/freeze",
        json={"reason": "Unauthorized attempt"},
        headers=headers,
    )
    assert resp.status_code == 403
