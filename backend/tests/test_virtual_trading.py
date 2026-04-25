"""Comprehensive tests for Virtual Trading feature."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone
from unittest.mock import patch

import pytest
import pytest_asyncio

from app.services.virtual_trading.price_resolver import (
    PriceResult,
    PriceUnavailableError,
    SymbolValidationError,
    is_trading_session,
)
from app.services.virtual_trading.settlement import add_trading_days, is_trading_day, next_trading_day

_VN_TZ = timezone(timedelta(hours=7))
_PR = "app.services.virtual_trading.service.resolve_price"
_VS = "app.services.virtual_trading.service.validate_symbol"

async def _mp(symbol, **kw):
    return PriceResult(price_vnd=100_000, source="realtime", timestamp=datetime.now(UTC))

async def _mp_unavail(symbol, **kw):
    raise PriceUnavailableError(symbol)

async def _vs_ok(symbol):
    return True

async def _vs_bad(symbol):
    return False

async def _vs_error(symbol):
    raise SymbolValidationError(symbol, "upstream down")

@pytest_asyncio.fixture
async def premium_user(client, test_user, db_session):
    from app.models.premium import PremiumSubscription, SubscriptionStatus
    sub = PremiumSubscription(
        user_id=test_user.id, current_period_start=datetime.now(UTC),
        current_period_end=datetime.now(UTC) + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    )
    db_session.add(sub)
    await db_session.commit()
    resp = await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "Test@1234"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

@pytest_asyncio.fixture
async def admin_headers(client, admin_user):
    resp = await client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "Admin@1234"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

@pytest_asyncio.fixture
async def non_premium_headers(client, test_user):
    resp = await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "Test@1234"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ── Calendar ──
class TestTradingCalendar:
    def test_weekday_is_trading_day(self):
        assert is_trading_day(date(2025, 1, 6), set()) is True
    def test_weekend_not_trading_day(self):
        assert is_trading_day(date(2025, 1, 4), set()) is False
    def test_holiday_not_trading_day(self):
        assert is_trading_day(date(2025, 1, 6), {"2025-01-06"}) is False
    def test_next_trading_day_skips_weekend(self):
        assert next_trading_day(date(2025, 1, 3), set()) == date(2025, 1, 6)
    def test_add_trading_days_t2(self):
        assert add_trading_days(date(2025, 1, 6), 2, set()) == date(2025, 1, 8)
    def test_add_trading_days_over_weekend(self):
        assert add_trading_days(date(2025, 1, 2), 2, set()) == date(2025, 1, 6)


# ── Trading session ──
class TestTradingSession:
    def test_morning_session(self):
        t = datetime(2025, 1, 6, 10, 0, tzinfo=_VN_TZ)
        assert is_trading_session(now=t) is True
    def test_afternoon_session(self):
        t = datetime(2025, 1, 6, 14, 0, tzinfo=_VN_TZ)
        assert is_trading_session(now=t) is True
    def test_lunch_break(self):
        t = datetime(2025, 1, 6, 12, 0, tzinfo=_VN_TZ)
        assert is_trading_session(now=t) is False
    def test_after_close(self):
        t = datetime(2025, 1, 6, 15, 0, tzinfo=_VN_TZ)
        assert is_trading_session(now=t) is False
    def test_before_open(self):
        t = datetime(2025, 1, 6, 8, 30, tzinfo=_VN_TZ)
        assert is_trading_session(now=t) is False
    def test_weekend(self):
        t = datetime(2025, 1, 4, 10, 0, tzinfo=_VN_TZ)
        assert is_trading_session(now=t) is False
    def test_holiday(self):
        t = datetime(2025, 1, 6, 10, 0, tzinfo=_VN_TZ)
        assert is_trading_session(now=t, holidays={"2025-01-06"}) is False


# ── Fee math ──
class TestFeeMath:
    def test_round_bps(self):
        from app.services.virtual_trading.service import _round_bps
        assert _round_bps(10_000_000, 15) == 15_000
    def test_round_bps_zero(self):
        from app.services.virtual_trading.service import _round_bps
        assert _round_bps(1_000_000, 0) == 0
    def test_buy_fee(self):
        from app.services.virtual_trading.service import _round_bps
        gross = 100_000 * 100
        fee = _round_bps(gross, 15)
        assert fee == 15_000
        assert gross + fee == 10_015_000
    def test_sell_fee_tax(self):
        from app.services.virtual_trading.service import _round_bps
        gross = 10_000_000
        fee = _round_bps(gross, 15)
        tax = _round_bps(gross, 10)
        assert fee == 15_000 and tax == 10_000
        assert gross - fee - tax == 9_975_000


# ── Account activation ──
@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
async def test_activate_account(client, premium_user):
    resp = await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    assert resp.status_code == 201
    assert resp.json()["cash_available_vnd"] == 1_000_000_000

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
async def test_cannot_activate_twice(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    r2 = await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    assert r2.status_code == 409

@pytest.mark.asyncio
async def test_non_premium_cannot_activate(client, test_user):
    resp = await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "Test@1234"})
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    resp = await client.post("/api/v1/virtual-trading/account/activate", headers=headers)
    assert resp.status_code == 403


# ── Market orders ──
@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_market_buy_t0(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    assert resp.status_code == 201
    d = resp.json()
    assert d["status"] == "filled" and d["filled_price_vnd"] == 100_000
    assert d["gross_amount_vnd"] == 10_000_000 and d["fee_vnd"] == 15_000
    acct = (await client.get("/api/v1/virtual-trading/account", headers=premium_user)).json()
    assert acct["cash_available_vnd"] == 1_000_000_000 - 10_015_000

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_market_sell_t0(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "sell", "order_type": "market", "quantity": 100,
    })
    assert resp.status_code == 201
    assert resp.json()["status"] == "filled" and resp.json()["tax_vnd"] == 10_000

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_insufficient_cash(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 10_100,
    })
    assert resp.status_code == 400 and "Insufficient cash" in resp.json()["detail"]

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_insufficient_shares_sell(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "sell", "order_type": "market", "quantity": 100,
    })
    assert resp.status_code == 400

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_invalid_lot_size(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 50,
    })
    assert resp.status_code == 400 and "multiple" in resp.json()["detail"].lower()


# ── Symbol validation ──
@pytest.mark.asyncio
@patch(_VS, new=_vs_bad)
async def test_invalid_symbol_rejected(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "FAKE", "side": "buy", "order_type": "market", "quantity": 100,
    })
    assert resp.status_code == 422
    assert "not listed" in resp.json()["detail"].lower()

@pytest.mark.asyncio
@patch(_VS, new=_vs_error)
async def test_symbol_source_error_503(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    assert resp.status_code == 503

@pytest.mark.asyncio
@patch(_VS, new=_vs_bad)
async def test_invalid_symbol_limit_rejected(client, premium_user):
    """Limit orders must also be blocked for invalid symbols."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "FAKE", "side": "buy", "order_type": "limit", "quantity": 100,
        "limit_price_vnd": 90_000,
    })
    assert resp.status_code == 422


# ── Limit orders ──
@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_limit_buy_pending(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "limit", "quantity": 100, "limit_price_vnd": 90_000,
    })
    assert resp.status_code == 201 and resp.json()["status"] == "pending"
    assert resp.json()["reserved_cash_vnd"] > 0
    acct = (await client.get("/api/v1/virtual-trading/account", headers=premium_user)).json()
    assert acct["cash_reserved_vnd"] > 0

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_cancel_pending_releases_cash(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "limit", "quantity": 100, "limit_price_vnd": 90_000,
    })
    oid = resp.json()["id"]
    resp = await client.post(f"/api/v1/virtual-trading/orders/{oid}/cancel", headers=premium_user)
    assert resp.status_code == 200 and resp.json()["status"] == "cancelled"
    acct = (await client.get("/api/v1/virtual-trading/account", headers=premium_user)).json()
    assert acct["cash_reserved_vnd"] == 0 and acct["cash_available_vnd"] == 1_000_000_000


# ── Price unavailable ──
@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp_unavail)
async def test_market_order_rejected_no_price(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    assert resp.status_code == 201 and resp.json()["status"] == "rejected"


# ── Config snapshot drift ──
@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_config_snapshot_drift(client, premium_user, admin_headers):
    """Admin changes fee after pending order → fill uses snapshot rates."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    # Place pending limit buy at price below market (90k < 100k)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "limit", "quantity": 100, "limit_price_vnd": 110_000,
    })
    assert resp.status_code == 201 and resp.json()["status"] == "pending"
    order_snapshot_fee = 15  # default buy_fee_rate_bps=15

    # Admin doubles the fee
    await client.get("/api/v1/virtual-trading/admin/config", headers=admin_headers)
    await client.patch("/api/v1/virtual-trading/admin/config", headers=admin_headers, json={
        "buy_fee_rate_bps": 30,
    })

    # Refresh triggers fill — should use snapshot fee=15, not new fee=30
    r = await client.post("/api/v1/virtual-trading/refresh", headers=premium_user)
    assert r.status_code == 200 and r.json()["orders_filled"] == 1

    # Check the filled order's fee matches snapshot rate
    orders = (await client.get("/api/v1/virtual-trading/orders?status=filled", headers=premium_user)).json()
    filled = orders["orders"][0]
    from app.services.virtual_trading.service import _round_bps
    expected_fee = _round_bps(filled["gross_amount_vnd"], order_snapshot_fee)
    assert filled["fee_vnd"] == expected_fee


# ── T2 settlement ──
@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_t2_buy_pending_then_settled(client, premium_user, admin_headers):
    """T2 buy: quantity goes to pending, not immediately sellable."""
    # Set config to T2
    await client.get("/api/v1/virtual-trading/admin/config", headers=admin_headers)
    await client.patch("/api/v1/virtual-trading/admin/config", headers=admin_headers, json={
        "settlement_mode": "T2",
    })
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    assert resp.status_code == 201 and resp.json()["status"] == "filled"
    # Cannot sell immediately — shares are pending
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "sell", "order_type": "market", "quantity": 100,
    })
    assert resp.status_code == 400  # insufficient sellable

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_t2_sell_cash_pending(client, premium_user, admin_headers):
    """T2 sell: proceeds go to cash_pending, not immediately available."""
    # T0 first to buy, then switch to T2 for sell
    await client.get("/api/v1/virtual-trading/admin/config", headers=admin_headers)
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    # Switch to T2
    await client.patch("/api/v1/virtual-trading/admin/config", headers=admin_headers, json={
        "settlement_mode": "T2",
    })
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "sell", "order_type": "market", "quantity": 100,
    })
    assert resp.status_code == 201
    acct = (await client.get("/api/v1/virtual-trading/account", headers=premium_user)).json()
    assert acct["cash_pending_vnd"] > 0


# ── GFD expiry ──
@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_gfd_expiry_releases_cash(client, premium_user, db_session):
    """GFD: pending limit order from a past trading_date should expire on refresh."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "limit", "quantity": 100, "limit_price_vnd": 90_000,
    })
    oid = resp.json()["id"]
    # Manually backdate the order's trading_date to force expiry
    import uuid as _uuid

    from sqlalchemy import update

    from app.models.virtual_trading import VirtualOrder
    await db_session.execute(
        update(VirtualOrder).where(VirtualOrder.id == _uuid.UUID(oid)).values(
            trading_date=date(2020, 1, 1),
        )
    )
    await db_session.commit()
    r = await client.post("/api/v1/virtual-trading/refresh", headers=premium_user)
    assert r.status_code == 200 and r.json()["orders_expired"] >= 1
    acct = (await client.get("/api/v1/virtual-trading/account", headers=premium_user)).json()
    assert acct["cash_reserved_vnd"] == 0 and acct["cash_available_vnd"] == 1_000_000_000


# ── Limit order fill on refresh ──
@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_limit_order_fills_on_refresh(client, premium_user):
    """Limit buy at price >= market should fill on refresh."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "limit", "quantity": 100, "limit_price_vnd": 110_000,
    })
    assert resp.json()["status"] == "pending"
    r = await client.post("/api/v1/virtual-trading/refresh", headers=premium_user)
    assert r.status_code == 200 and r.json()["orders_filled"] == 1


# ── Orders + trades list ──
@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_list_orders_and_trades(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    r = await client.get("/api/v1/virtual-trading/orders", headers=premium_user)
    assert r.status_code == 200 and r.json()["total"] >= 1
    r = await client.get("/api/v1/virtual-trading/trades", headers=premium_user)
    assert r.status_code == 200 and r.json()["total"] >= 1


# ── Leaderboard ──
@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_leaderboard(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.get("/api/v1/virtual-trading/leaderboard")
    assert resp.status_code == 200 and resp.json()["total"] >= 1


# ── Premium expired: read-only access ──
@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_premium_expired_readonly(client, premium_user, db_session, test_user):
    """After premium expires: can read account/orders/trades but not place/cancel."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    # Expire the subscription
    from sqlalchemy import update

    from app.models.premium import PremiumSubscription, SubscriptionStatus
    await db_session.execute(
        update(PremiumSubscription).where(PremiumSubscription.user_id == test_user.id).values(
            status=SubscriptionStatus.EXPIRED,
            current_period_end=datetime.now(UTC) - timedelta(days=1),
        )
    )
    await db_session.commit()
    # Read endpoints should still work (CurrentUser, not PremiumUser)
    assert (await client.get("/api/v1/virtual-trading/account", headers=premium_user)).status_code == 200
    assert (await client.get("/api/v1/virtual-trading/orders", headers=premium_user)).status_code == 200
    assert (await client.get("/api/v1/virtual-trading/trades", headers=premium_user)).status_code == 200
    # Write endpoints should fail (PremiumUser required)
    r = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    assert r.status_code == 403


# ── Admin ──
@pytest.mark.asyncio
async def test_admin_get_config(client, admin_headers):
    resp = await client.get("/api/v1/virtual-trading/admin/config", headers=admin_headers)
    assert resp.status_code == 200 and resp.json()["initial_cash_vnd"] == 1_000_000_000

@pytest.mark.asyncio
async def test_admin_update_config(client, admin_headers):
    await client.get("/api/v1/virtual-trading/admin/config", headers=admin_headers)
    resp = await client.patch("/api/v1/virtual-trading/admin/config", headers=admin_headers, json={
        "initial_cash_vnd": 2_000_000_000, "settlement_mode": "T2",
    })
    assert resp.status_code == 200 and resp.json()["initial_cash_vnd"] == 2_000_000_000

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_admin_reset_user(client, premium_user, admin_headers, test_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    resp = await client.post(
        f"/api/v1/virtual-trading/admin/users/{test_user.id}/reset", headers=admin_headers,
    )
    assert resp.status_code == 200
    acct = (await client.get("/api/v1/virtual-trading/account", headers=premium_user)).json()
    assert acct["cash_available_vnd"] == 1_000_000_000 and acct["cash_reserved_vnd"] == 0

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_admin_reset_all(client, premium_user, admin_headers):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/admin/reset-all", headers=admin_headers)
    assert resp.status_code == 200 and resp.json()["accounts_reset"] >= 1

@pytest.mark.asyncio
async def test_non_admin_cannot_access_admin(client, premium_user):
    resp = await client.get("/api/v1/virtual-trading/admin/config", headers=premium_user)
    assert resp.status_code == 403
