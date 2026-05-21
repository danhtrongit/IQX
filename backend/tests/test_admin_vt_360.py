"""Tests for T28: admin VT account 360 endpoints (positions/orders/trades/ledger/settlements/stats)."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.premium import PremiumPlan, PremiumSubscription, SubscriptionStatus
from app.models.user import User, UserRole, UserStatus
from app.models.virtual_trading import (
    AccountStatus,
    OrderSide,
    OrderStatus,
    OrderType,
    SettlementKind,
    SettlementStatus,
    VirtualCashLedger,
    VirtualOrder,
    VirtualPosition,
    VirtualSettlement,
    VirtualTrade,
    VirtualTradingAccount,
    VirtualTradingConfig,
)

pytestmark = pytest.mark.asyncio


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _admin_headers(client: AsyncClient) -> dict[str, str]:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "Admin@1234"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _user_headers(client: AsyncClient, email: str) -> dict[str, str]:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Test@1234"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _seed_full_account(db: AsyncSession) -> tuple[User, VirtualTradingAccount]:
    """Seed: user + vt_account + 2 orders + 2 trades + 1 position + 1 ledger + 1 settlement."""
    # Ensure config
    from sqlalchemy import select as _sel
    cfg = (
        await db.execute(
            _sel(VirtualTradingConfig).where(VirtualTradingConfig.is_active.is_(True))
        )
    ).scalar_one_or_none()
    if cfg is None:
        cfg = VirtualTradingConfig(
            initial_cash_vnd=1_000_000_000,
            buy_fee_rate_bps=15,
            sell_fee_rate_bps=15,
            sell_tax_rate_bps=10,
            is_active=True,
        )
        db.add(cfg)
        await db.flush()

    # Ensure plan
    plan = (
        await db.execute(_sel(PremiumPlan).where(PremiumPlan.code == "TRIAL_7D"))
    ).scalar_one_or_none()
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
        await db.flush()

    # User
    user = User(
        email=f"vt360-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("Test@1234"),
        first_name="VT360",
        last_name="User",
        role=UserRole.PREMIUM,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.flush()

    now = datetime.now(UTC)
    sub = PremiumSubscription(
        user_id=user.id,
        current_plan_id=plan.id,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    )
    db.add(sub)
    await db.flush()

    # VT Account
    acct = VirtualTradingAccount(
        user_id=user.id,
        status=AccountStatus.ACTIVE,
        initial_cash_vnd=1_000_000_000,
        cash_available_vnd=900_000_000,
        cash_reserved_vnd=0,
        cash_pending_vnd=0,
        activated_at=now,
    )
    db.add(acct)
    await db.flush()
    await db.refresh(acct)

    today = date.today()

    # Order 1 — filled buy
    order1 = VirtualOrder(
        account_id=acct.id,
        user_id=user.id,
        symbol="VCB",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        status=OrderStatus.FILLED,
        quantity=100,
        trading_date=today,
        filled_price_vnd=90_000,
        gross_amount_vnd=9_000_000,
        fee_vnd=13_500,
        tax_vnd=0,
        net_amount_vnd=-9_013_500,
    )
    db.add(order1)
    await db.flush()
    await db.refresh(order1)

    # Order 2 — pending sell
    order2 = VirtualOrder(
        account_id=acct.id,
        user_id=user.id,
        symbol="VCB",
        side=OrderSide.SELL,
        order_type=OrderType.LIMIT,
        status=OrderStatus.PENDING,
        quantity=50,
        limit_price_vnd=95_000,
        trading_date=today,
    )
    db.add(order2)
    await db.flush()
    await db.refresh(order2)

    # Trade 1 — buy fill
    trade1 = VirtualTrade(
        order_id=order1.id,
        account_id=acct.id,
        symbol="VCB",
        side=OrderSide.BUY,
        quantity=100,
        price_vnd=90_000,
        gross_amount_vnd=9_000_000,
        fee_vnd=13_500,
        tax_vnd=0,
        net_amount_vnd=-9_013_500,
        price_source="realtime",
        price_time=now,
        traded_at=now,
    )
    db.add(trade1)
    await db.flush()
    await db.refresh(trade1)

    # Trade 2 — another buy
    trade2 = VirtualTrade(
        order_id=order1.id,
        account_id=acct.id,
        symbol="HPG",
        side=OrderSide.BUY,
        quantity=200,
        price_vnd=25_000,
        gross_amount_vnd=5_000_000,
        fee_vnd=7_500,
        tax_vnd=0,
        net_amount_vnd=-5_007_500,
        price_source="realtime",
        price_time=now,
        traded_at=now,
    )
    db.add(trade2)
    await db.flush()
    await db.refresh(trade2)

    # Position
    pos = VirtualPosition(
        account_id=acct.id,
        symbol="VCB",
        quantity_total=100,
        quantity_sellable=100,
        quantity_pending=0,
        quantity_reserved=0,
        avg_cost_vnd=90_000,
    )
    db.add(pos)
    await db.flush()

    # Ledger entry
    ledger = VirtualCashLedger(
        account_id=acct.id,
        amount_vnd=-9_013_500,
        balance_after_vnd=990_986_500,
        kind="buy",
        reference_type="trade",
        reference_id=trade1.id,
        created_at=now,
    )
    db.add(ledger)
    await db.flush()

    # Settlement
    settlement = VirtualSettlement(
        account_id=acct.id,
        trade_id=trade1.id,
        kind=SettlementKind.BUY_QTY_RELEASE,
        amount=100,
        symbol="VCB",
        due_date=today + timedelta(days=2),
        status=SettlementStatus.PENDING,
    )
    db.add(settlement)
    await db.flush()

    await db.commit()
    await db.refresh(acct)
    return user, acct


# ── T28.1: GET /accounts/{id} returns account ───────────────────────────────


async def test_get_account(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    _, acct = await _seed_full_account(db_session)
    headers = await _admin_headers(client)

    resp = await client.get(f"/api/v1/admin/vt/accounts/{acct.id}", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["id"] == str(acct.id)
    assert data["status"] == "active"
    assert "cash_available_vnd" in data


# ── T28.2: GET /accounts/{id} not found → 404 ───────────────────────────────


async def test_get_account_not_found(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    headers = await _admin_headers(client)
    fake_id = uuid.uuid4()
    resp = await client.get(f"/api/v1/admin/vt/accounts/{fake_id}", headers=headers)
    assert resp.status_code == 404


# ── T28.3: GET /accounts/{id}/positions ─────────────────────────────────────


async def test_list_positions(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    _, acct = await _seed_full_account(db_session)
    headers = await _admin_headers(client)

    resp = await client.get(
        f"/api/v1/admin/vt/accounts/{acct.id}/positions", headers=headers
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["symbol"] == "VCB"
    assert data[0]["quantity_total"] == 100


# ── T28.4: GET /accounts/{id}/orders (paginated + filtered) ─────────────────


async def test_list_orders_paginated(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    _, acct = await _seed_full_account(db_session)
    headers = await _admin_headers(client)

    resp = await client.get(
        f"/api/v1/admin/vt/accounts/{acct.id}/orders?page=1&page_size=10",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    assert data["page"] == 1

    # Filter by status
    resp2 = await client.get(
        f"/api/v1/admin/vt/accounts/{acct.id}/orders?status=filled",
        headers=headers,
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["total"] == 1
    assert data2["items"][0]["status"] == "filled"


# ── T28.5: GET /accounts/{id}/trades ────────────────────────────────────────


async def test_list_trades(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    _, acct = await _seed_full_account(db_session)
    headers = await _admin_headers(client)

    resp = await client.get(
        f"/api/v1/admin/vt/accounts/{acct.id}/trades?page=1&page_size=10",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2

    # Filter by symbol
    resp2 = await client.get(
        f"/api/v1/admin/vt/accounts/{acct.id}/trades?symbol=VCB",
        headers=headers,
    )
    assert resp2.status_code == 200
    assert resp2.json()["total"] == 1


# ── T28.6: GET /accounts/{id}/ledger ────────────────────────────────────────


async def test_list_ledger(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    _, acct = await _seed_full_account(db_session)
    headers = await _admin_headers(client)

    resp = await client.get(
        f"/api/v1/admin/vt/accounts/{acct.id}/ledger", headers=headers
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["kind"] == "buy"
    assert data["items"][0]["amount_vnd"] == -9_013_500


# ── T28.7: GET /accounts/{id}/settlements ───────────────────────────────────


async def test_list_settlements(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    _, acct = await _seed_full_account(db_session)
    headers = await _admin_headers(client)

    resp = await client.get(
        f"/api/v1/admin/vt/accounts/{acct.id}/settlements", headers=headers
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "pending"
    assert data["items"][0]["kind"] == "buy_qty_release"


# ── T28.8: GET /accounts/{id}/stats ─────────────────────────────────────────


async def test_get_stats(
    client: AsyncClient, db_session: AsyncSession, admin_user: User
):
    _, acct = await _seed_full_account(db_session)
    headers = await _admin_headers(client)

    resp = await client.get(
        f"/api/v1/admin/vt/accounts/{acct.id}/stats", headers=headers
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["account_id"] == str(acct.id)
    assert data["total_orders"] == 2
    assert data["total_trades"] == 2
    # Both trades are BUY — gross_buy should be positive
    assert data["gross_buy_vnd"] > 0
    assert data["gross_sell_vnd"] == 0
    # realized_pnl = gross_sell - gross_buy = 0 - gross_buy = negative
    assert data["realized_pnl_vnd"] < 0
    assert "win_rate" in data  # May be null


# ── T28.9: Non-admin → 403 ───────────────────────────────────────────────────


async def test_non_admin_cannot_access_360(
    client: AsyncClient, db_session: AsyncSession, test_user: User
):
    _, acct = await _seed_full_account(db_session)

    resp_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "Test@1234"},
    )
    headers = {"Authorization": f"Bearer {resp_login.json()['access_token']}"}

    for path in [
        f"/api/v1/admin/vt/accounts/{acct.id}",
        f"/api/v1/admin/vt/accounts/{acct.id}/positions",
        f"/api/v1/admin/vt/accounts/{acct.id}/orders",
        f"/api/v1/admin/vt/accounts/{acct.id}/stats",
    ]:
        resp = await client.get(path, headers=headers)
        assert resp.status_code == 403, f"Expected 403 for {path}, got {resp.status_code}"
