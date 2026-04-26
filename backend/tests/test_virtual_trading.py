"""Comprehensive tests for Virtual Trading feature — all 7 correctness fixes."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from app.services.virtual_trading.price_resolver import (
    PriceResult,
    PriceUnavailableError,
    SymbolValidationError,
    _to_int_vnd,
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

# ══════════════════════════════════════════════════════
# Fix 1: Price normalization
# ══════════════════════════════════════════════════════

class TestPriceNormalization:
    """_to_int_vnd must always return integer VND."""

    def test_vci_intraday_already_vnd(self):
        """VCI intraday: 60600 → 60600"""
        assert _to_int_vnd(60600) == 60600

    def test_vnd_ohlcv_kvnd(self):
        """VND OHLCV: 60.6 * 1000 → 60600"""
        assert _to_int_vnd(60.6, multiplier=1000) == 60600

    def test_vci_close_already_vnd(self):
        """VCI close: 60600 with multiplier=1 → 60600"""
        assert _to_int_vnd(60600, multiplier=1) == 60600

    def test_vci_penny_stock_stays_low(self):
        """VCI penny stock 700 VND must NOT auto-multiply to 700000."""
        assert _to_int_vnd(700, multiplier=1) == 700

    def test_vci_sub_1000_valid(self):
        """VCI sub-1000 like X77=300 stays 300."""
        assert _to_int_vnd(300, multiplier=1) == 300

    def test_vnd_ohlcv_sub_1000_with_multiplier(self):
        """VND OHLCV 0.7 kVND * 1000 = 700 VND."""
        assert _to_int_vnd(0.7, multiplier=1000) == 700

    def test_zero_returns_none(self):
        assert _to_int_vnd(0) is None

    def test_negative_returns_none(self):
        assert _to_int_vnd(-100) is None

    def test_string_numeric(self):
        assert _to_int_vnd("60600") == 60600

    def test_non_numeric_returns_none(self):
        assert _to_int_vnd("abc") is None

    def test_none_returns_none(self):
        assert _to_int_vnd(None) is None


# ══════════════════════════════════════════════════════
# Calendar + trading session
# ══════════════════════════════════════════════════════

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

class TestTradingSession:
    def test_morning_session(self):
        assert is_trading_session(now=datetime(2025, 1, 6, 10, 0, tzinfo=_VN_TZ)) is True
    def test_afternoon_session(self):
        assert is_trading_session(now=datetime(2025, 1, 6, 14, 0, tzinfo=_VN_TZ)) is True
    def test_lunch_break(self):
        assert is_trading_session(now=datetime(2025, 1, 6, 12, 0, tzinfo=_VN_TZ)) is False
    def test_after_close(self):
        assert is_trading_session(now=datetime(2025, 1, 6, 15, 0, tzinfo=_VN_TZ)) is False
    def test_weekend(self):
        assert is_trading_session(now=datetime(2025, 1, 4, 10, 0, tzinfo=_VN_TZ)) is False
    def test_holiday(self):
        assert is_trading_session(now=datetime(2025, 1, 6, 10, 0, tzinfo=_VN_TZ), holidays={"2025-01-06"}) is False

class TestFeeMath:
    def test_round_bps(self):
        from app.services.virtual_trading.service import _round_bps
        assert _round_bps(10_000_000, 15) == 15_000
    def test_round_bps_zero(self):
        from app.services.virtual_trading.service import _round_bps
        assert _round_bps(1_000_000, 0) == 0

# ══════════════════════════════════════════════════════
# Account activation
# ══════════════════════════════════════════════════════

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

# ══════════════════════════════════════════════════════
# Market + limit orders (basics)
# ══════════════════════════════════════════════════════

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
    assert d["fee_vnd"] == 15_000

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
    assert resp.status_code == 201 and resp.json()["tax_vnd"] == 10_000

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_insufficient_cash(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 10_100,
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
    assert resp.status_code == 400

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

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp_unavail)
async def test_market_order_rejected_no_price(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    assert resp.status_code == 201 and resp.json()["status"] == "rejected"

# ══════════════════════════════════════════════════════
# Fix 3: Reserve fields cleared on terminal orders
# ══════════════════════════════════════════════════════

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_filled_order_reserves_cleared(client, premium_user):
    """Filled market order must have reserved_cash_vnd=0 and reserved_quantity=0."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    d = resp.json()
    assert d["status"] == "filled"
    assert d["reserved_cash_vnd"] == 0
    assert d["reserved_quantity"] == 0

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_cancelled_order_reserves_cleared(client, premium_user):
    """Cancelled limit order must have reserved_cash_vnd=0."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "limit", "quantity": 100, "limit_price_vnd": 90_000,
    })
    oid = resp.json()["id"]
    resp = await client.post(f"/api/v1/virtual-trading/orders/{oid}/cancel", headers=premium_user)
    assert resp.json()["reserved_cash_vnd"] == 0

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_expired_order_reserves_cleared(client, premium_user, db_session):
    """Expired GFD order must have reserved_cash_vnd=0."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "limit", "quantity": 100, "limit_price_vnd": 90_000,
    })
    oid = resp.json()["id"]
    import uuid as _uuid

    from sqlalchemy import update

    from app.models.virtual_trading import VirtualOrder
    await db_session.execute(
        update(VirtualOrder).where(VirtualOrder.id == _uuid.UUID(oid)).values(trading_date=date(2020, 1, 1))
    )
    await db_session.commit()
    await client.post("/api/v1/virtual-trading/refresh", headers=premium_user)
    orders = (await client.get("/api/v1/virtual-trading/orders?status=expired", headers=premium_user)).json()
    assert orders["total"] >= 1
    assert orders["orders"][0]["reserved_cash_vnd"] == 0

# ══════════════════════════════════════════════════════
# Fix 4: Non-premium mutation path
# ══════════════════════════════════════════════════════

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_portfolio_readonly_no_refresh(client, premium_user, db_session, test_user):
    """GET /portfolio must NOT trigger refresh (expired premium can still view)."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    # Expire premium
    from sqlalchemy import update

    from app.models.premium import PremiumSubscription, SubscriptionStatus
    await db_session.execute(
        update(PremiumSubscription).where(PremiumSubscription.user_id == test_user.id).values(
            status=SubscriptionStatus.EXPIRED, current_period_end=datetime.now(UTC) - timedelta(days=1),
        )
    )
    await db_session.commit()
    # Portfolio should still work (read-only)
    resp = await client.get("/api/v1/virtual-trading/portfolio", headers=premium_user)
    assert resp.status_code == 200

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_refresh_requires_premium(client, premium_user, db_session, test_user):
    """POST /refresh requires active premium."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    # Expire premium
    from sqlalchemy import update

    from app.models.premium import PremiumSubscription, SubscriptionStatus
    await db_session.execute(
        update(PremiumSubscription).where(PremiumSubscription.user_id == test_user.id).values(
            status=SubscriptionStatus.EXPIRED, current_period_end=datetime.now(UTC) - timedelta(days=1),
        )
    )
    await db_session.commit()
    resp = await client.post("/api/v1/virtual-trading/refresh", headers=premium_user)
    assert resp.status_code == 403

# ══════════════════════════════════════════════════════
# Fix 5: Leaderboard safety
# ══════════════════════════════════════════════════════

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_leaderboard(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.get("/api/v1/virtual-trading/leaderboard")
    assert resp.status_code == 200 and resp.json()["total"] >= 1

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_leaderboard_pagination_does_not_over_resolve(client, premium_user):
    """Pagination: page=2 with only 1 account returns empty entries, not error."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.get("/api/v1/virtual-trading/leaderboard?page=2&page_size=20")
    assert resp.status_code == 200
    assert resp.json()["entries"] == []
    assert resp.json()["total"] >= 1  # total is still correct

# ══════════════════════════════════════════════════════
# Fix 6: Query filter validation
# ══════════════════════════════════════════════════════

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_invalid_status_filter_returns_400(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.get("/api/v1/virtual-trading/orders?status=INVALID", headers=premium_user)
    assert resp.status_code == 400
    assert "không hợp lệ" in resp.json()["detail"]

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_invalid_side_filter_returns_400(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.get("/api/v1/virtual-trading/orders?side=INVALID", headers=premium_user)
    assert resp.status_code == 400
    assert "không hợp lệ" in resp.json()["detail"]

# ══════════════════════════════════════════════════════
# Fix 7: Financial input bounds
# ══════════════════════════════════════════════════════

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_quantity_exceeds_max_rejected(client, premium_user):
    """Quantity > 1M must be rejected by schema (422)."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 2_000_000,
    })
    assert resp.status_code == 422

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_limit_price_exceeds_max_rejected(client, premium_user):
    """Limit price > 10M VND must be rejected by schema (422)."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "limit", "quantity": 100,
        "limit_price_vnd": 20_000_000,
    })
    assert resp.status_code == 422

# ══════════════════════════════════════════════════════
# Symbol validation
# ══════════════════════════════════════════════════════

@pytest.mark.asyncio
@patch(_VS, new=_vs_bad)
async def test_invalid_symbol_rejected(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "FAKE", "side": "buy", "order_type": "market", "quantity": 100,
    })
    assert resp.status_code == 422

@pytest.mark.asyncio
@patch(_VS, new=_vs_error)
async def test_symbol_source_error_503(client, premium_user):
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 100,
    })
    assert resp.status_code == 503

# ══════════════════════════════════════════════════════
# Orders/trades list + config snapshot
# ══════════════════════════════════════════════════════

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

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_config_snapshot_drift(client, premium_user, admin_headers):
    """Admin changes fee after pending order → fill uses snapshot rates."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "limit", "quantity": 100, "limit_price_vnd": 110_000,
    })
    assert resp.json()["status"] == "pending"
    await client.get("/api/v1/virtual-trading/admin/config", headers=admin_headers)
    await client.patch("/api/v1/virtual-trading/admin/config", headers=admin_headers, json={"buy_fee_rate_bps": 30})
    r = await client.post("/api/v1/virtual-trading/refresh", headers=premium_user)
    assert r.json()["orders_filled"] == 1
    orders = (await client.get("/api/v1/virtual-trading/orders?status=filled", headers=premium_user)).json()
    filled = orders["orders"][0]
    from app.services.virtual_trading.service import _round_bps
    assert filled["fee_vnd"] == _round_bps(filled["gross_amount_vnd"], 15)  # snapshot, not 30

# ══════════════════════════════════════════════════════
# Admin
# ══════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_admin_get_config(client, admin_headers):
    resp = await client.get("/api/v1/virtual-trading/admin/config", headers=admin_headers)
    assert resp.status_code == 200

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
    resp = await client.post(f"/api/v1/virtual-trading/admin/users/{test_user.id}/reset", headers=admin_headers)
    assert resp.status_code == 200
    acct = (await client.get("/api/v1/virtual-trading/account", headers=premium_user)).json()
    assert acct["cash_available_vnd"] == 1_000_000_000

@pytest.mark.asyncio
async def test_non_admin_cannot_access_admin(client, premium_user):
    resp = await client.get("/api/v1/virtual-trading/admin/config", headers=premium_user)
    assert resp.status_code == 403

# ══════════════════════════════════════════════════════
# Max gross enforcement
# ══════════════════════════════════════════════════════

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_limit_order_exceeds_max_gross(client, premium_user):
    """limit_price * quantity > 100B must be rejected 422."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "limit",
        "quantity": 1_000_000, "limit_price_vnd": 200_000,
    })
    assert resp.status_code == 422
    assert "Gross" in resp.json()["detail"]

async def _mp_expensive(symbol, **kw):
    return PriceResult(price_vnd=200_000, source="realtime", timestamp=datetime.now(UTC))

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp_expensive)
async def test_market_order_exceeds_max_gross(client, premium_user):
    """market order gross > 100B after price resolve must be rejected 422."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.post("/api/v1/virtual-trading/orders", headers=premium_user, json={
        "symbol": "VCB", "side": "buy", "order_type": "market", "quantity": 1_000_000,
    })
    assert resp.status_code == 422
    assert "Gross" in resp.json()["detail"]

# ══════════════════════════════════════════════════════
# Leaderboard transparency
# ══════════════════════════════════════════════════════

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_leaderboard_has_transparency_fields(client, premium_user):
    """Leaderboard response must include evaluated_count + total_eligible."""
    await client.post("/api/v1/virtual-trading/account/activate", headers=premium_user)
    resp = await client.get("/api/v1/virtual-trading/leaderboard")
    assert resp.status_code == 200
    d = resp.json()
    assert "evaluated_count" in d
    assert "total_eligible" in d
    assert d["evaluated_count"] >= 1
    assert d["total_eligible"] >= d["evaluated_count"]
    assert d["total"] == d["evaluated_count"]

@pytest.mark.asyncio
@patch(_VS, new=_vs_ok)
@patch(_PR, new=_mp)
async def test_leaderboard_resolve_per_unique_symbol(client, premium_user):
    """resolve_price must be called once per unique symbol, not per position.

    Buys VCB twice (same symbol) → leaderboard should resolve VCB only once.
    """
    await client.post(
        "/api/v1/virtual-trading/account/activate", headers=premium_user,
    )
    await client.post(
        "/api/v1/virtual-trading/orders", headers=premium_user,
        json={
            "symbol": "VCB", "side": "buy",
            "order_type": "market", "quantity": 100,
        },
    )
    await client.post(
        "/api/v1/virtual-trading/orders", headers=premium_user,
        json={
            "symbol": "VCB", "side": "buy",
            "order_type": "market", "quantity": 200,
        },
    )

    resolve_mock = AsyncMock(return_value=PriceResult(
        price_vnd=100_000, source="mock", timestamp=datetime.now(UTC),
    ))
    with patch(_PR, new=resolve_mock):
        resp = await client.get("/api/v1/virtual-trading/leaderboard")
        assert resp.status_code == 200
        # VCB appears in 1 position (merged), so resolve called exactly once
        symbols_resolved = [
            call.args[0] for call in resolve_mock.call_args_list
        ]
        assert symbols_resolved.count("VCB") == 1
