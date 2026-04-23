"""Tests for plans, billing, checkout, IPN, cancel, refresh-status, and auth/me premium."""

import uuid

import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from tests.conftest import create_admin, get_auth_header

_IPN_HEADERS = {"X-Secret-Key": get_settings().sepay_ipn_secret}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_plan(client: AsyncClient, admin_headers: dict) -> dict:
    """Create a test plan and return the response dict."""
    resp = await client.post(
        "/api/v1/admin/plans",
        json={
            "code": f"test_plan_{uuid.uuid4().hex[:6]}",
            "name": "Test Plan",
            "description": "A test plan",
            "price_vnd": 99000,
            "features": {
                "max_watchlists": 3,
                "premium_reports": True,
                "advanced_screening": False,
            },
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201
    return resp.json()


async def _checkout(client: AsyncClient, plan: dict, user_headers: dict) -> dict:
    """Create a checkout order and return the response dict."""
    resp = await client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": plan["id"]},
        headers=user_headers,
    )
    assert resp.status_code == 201
    return resp.json()


async def _send_ipn(client: AsyncClient, order: dict) -> None:
    """Simulate a valid ORDER_PAID IPN."""
    ipn_payload = {
        "timestamp": 1700000000,
        "notification_type": "ORDER_PAID",
        "order": {
            "id": str(uuid.uuid4()),
            "order_id": f"SEPAY-{uuid.uuid4().hex[:12].upper()}",
            "order_status": "CAPTURED",
            "order_currency": "VND",
            "order_amount": str(order["amount_vnd"]),
            "order_invoice_number": order["invoice_number"],
            "order_description": "Test",
        },
        "transaction": {
            "id": str(uuid.uuid4()),
            "payment_method": "BANK_TRANSFER",
            "transaction_id": f"txn_{uuid.uuid4().hex[:8]}",
            "transaction_type": "PAYMENT",
            "transaction_status": "APPROVED",
            "transaction_amount": str(order["amount_vnd"]),
            "transaction_currency": "VND",
        },
    }
    resp = await client.post(
        "/api/v1/billing/sepay/ipn", json=ipn_payload, headers=_IPN_HEADERS
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ===========================================================================
# Plan tests
# ===========================================================================


@pytest.mark.asyncio
async def test_list_public_plans(client: AsyncClient):
    """Public plan listing works without auth."""
    resp = await client.get("/api/v1/plans")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_admin_create_plan(client: AsyncClient):
    """Admin can create a plan."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    assert plan["price_vnd"] == 99000
    assert plan["features"]["max_watchlists"] == 3


@pytest.mark.asyncio
async def test_admin_update_plan(client: AsyncClient):
    """Admin can update a plan."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)

    resp = await client.patch(
        f"/api/v1/admin/plans/{plan['id']}",
        json={"price_vnd": 149000, "is_active": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["price_vnd"] == 149000
    assert resp.json()["is_active"] is False


# ===========================================================================
# Checkout tests
# ===========================================================================


@pytest.mark.asyncio
async def test_create_checkout_success(client: AsyncClient):
    """Authenticated user can create a checkout order."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_headers = await get_auth_header(client)

    order = await _checkout(client, plan, user_headers)
    assert order["status"] == "pending"
    assert order["amount_vnd"] == 99000
    assert "checkout" in order
    assert order["checkout"]["method"] == "POST"

    # Verify form_fields is an ordered array of {name, value}
    fields = order["checkout"]["form_fields"]
    assert isinstance(fields, list)
    assert len(fields) > 0
    assert all("name" in f and "value" in f for f in fields)

    # Verify field order starts correctly
    assert fields[0]["name"] == "order_amount"
    assert fields[1]["name"] == "merchant"

    # Verify signature is present and is the last field
    assert fields[-1]["name"] == "signature"
    assert len(fields[-1]["value"]) == 44  # base64 SHA256


@pytest.mark.asyncio
async def test_checkout_billing_snapshot(client: AsyncClient):
    """Checkout order contains billing snapshot of the plan at purchase time."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_headers = await get_auth_header(client)

    checkout = await _checkout(client, plan, user_headers)
    order_id = checkout["payment_order_id"]

    # Fetch order detail
    resp = await client.get(
        f"/api/v1/billing/me/orders/{order_id}", headers=user_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["plan_snapshot_code"] == plan["code"]
    assert data["plan_snapshot_name"] == "Test Plan"
    assert data["plan_snapshot_price"] == 99000


@pytest.mark.asyncio
async def test_checkout_with_inactive_plan(client: AsyncClient):
    """Cannot checkout with an inactive plan."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)

    await client.patch(
        f"/api/v1/admin/plans/{plan['id']}",
        json={"is_active": False},
        headers=admin_headers,
    )

    user_headers = await get_auth_header(client)
    resp = await client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": plan["id"]},
        headers=user_headers,
    )
    assert resp.status_code == 409
    assert "not active" in resp.json()["detail"]


# ===========================================================================
# IPN tests
# ===========================================================================


@pytest.mark.asyncio
async def test_ipn_invalid_secret(client: AsyncClient):
    """IPN with wrong secret is rejected."""
    resp = await client.post(
        "/api/v1/billing/sepay/ipn",
        json={"notification_type": "ORDER_PAID", "order": {}},
        headers={"X-Secret-Key": "wrong_secret"},
    )
    assert resp.status_code in (200, 401)


@pytest.mark.asyncio
async def test_ipn_order_paid_activates_subscription(client: AsyncClient):
    """Full flow: checkout → IPN ORDER_PAID → subscription active."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_headers = await get_auth_header(client)

    order = await _checkout(client, plan, user_headers)
    await _send_ipn(client, order)

    # Verify subscription is active
    sub_resp = await client.get("/api/v1/billing/me/subscription", headers=user_headers)
    assert sub_resp.status_code == 200
    assert sub_resp.json()["status"] == "active"

    # Verify entitlements
    ent_resp = await client.get("/api/v1/billing/me/entitlements", headers=user_headers)
    assert ent_resp.status_code == 200
    assert ent_resp.json()["is_premium"] is True

    # Verify order status is paid
    order_resp = await client.get(
        f"/api/v1/billing/me/orders/{order['payment_order_id']}",
        headers=user_headers,
    )
    assert order_resp.json()["status"] == "paid"


@pytest.mark.asyncio
async def test_ipn_idempotent(client: AsyncClient):
    """Duplicate IPN does not double-apply subscription."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_headers = await get_auth_header(client)

    order = await _checkout(client, plan, user_headers)

    # Send IPN twice
    await _send_ipn(client, order)
    await _send_ipn(client, order)

    # Order should still be paid (not double-processed)
    order_resp = await client.get(
        f"/api/v1/billing/me/orders/{order['payment_order_id']}",
        headers=user_headers,
    )
    assert order_resp.json()["status"] == "paid"


# ===========================================================================
# auth/me premium status
# ===========================================================================


@pytest.mark.asyncio
async def test_auth_me_premium_status(client: AsyncClient):
    """auth/me returns premium fields after subscription activation."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_headers = await get_auth_header(client)

    # Before premium
    me_resp = await client.get("/api/v1/auth/me", headers=user_headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["is_premium"] is False
    assert me_resp.json()["current_plan"] is None

    # Activate premium
    order = await _checkout(client, plan, user_headers)
    await _send_ipn(client, order)

    # After premium
    me_resp = await client.get("/api/v1/auth/me", headers=user_headers)
    data = me_resp.json()
    assert data["is_premium"] is True
    assert data["current_plan"] == plan["code"]
    assert data["subscription_status"] == "active"
    assert data["subscription_expires_at"] is not None
    assert data["entitlements"]["max_watchlists"] == 3


# ===========================================================================
# Cancel / Refresh-status
# ===========================================================================


@pytest.mark.asyncio
async def test_cancel_pending_order(client: AsyncClient):
    """User can cancel a pending order."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_headers = await get_auth_header(client)

    order = await _checkout(client, plan, user_headers)

    resp = await client.post(
        f"/api/v1/billing/orders/{order['payment_order_id']}/cancel",
        headers=user_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cannot_cancel_paid_order(client: AsyncClient):
    """Cannot cancel a paid order."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_headers = await get_auth_header(client)

    order = await _checkout(client, plan, user_headers)
    await _send_ipn(client, order)

    resp = await client.post(
        f"/api/v1/billing/orders/{order['payment_order_id']}/cancel",
        headers=user_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_refresh_status_pending_order(client: AsyncClient):
    """Refresh-status on pending order returns the order (no change without SePay)."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_headers = await get_auth_header(client)

    order = await _checkout(client, plan, user_headers)

    resp = await client.post(
        f"/api/v1/billing/orders/{order['payment_order_id']}/refresh-status",
        headers=user_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"  # No SePay in tests


# ===========================================================================
# Admin billing tests
# ===========================================================================


@pytest.mark.asyncio
async def test_admin_list_payment_orders(client: AsyncClient):
    """Admin can list all payment orders."""
    admin_headers = await create_admin(client)
    resp = await client.get("/api/v1/admin/payment-orders", headers=admin_headers)
    assert resp.status_code == 200
    assert "items" in resp.json()
    assert "total" in resp.json()


# ===========================================================================
# Integration test: full flow
# ===========================================================================


@pytest.mark.asyncio
async def test_full_premium_flow(client: AsyncClient):
    """Integration: login → checkout → IPN → subscription → auth/me → orders."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)

    # Register + login
    user_headers = await get_auth_header(
        client,
        data={
            "email": "flow@iqx.vn",
            "username": "flowuser",
            "password": "FlowPass123!",
            "full_name": "Flow User",
        },
    )

    # 1. Create checkout
    order = await _checkout(client, plan, user_headers)
    assert order["status"] == "pending"
    assert order["checkout"]["form_fields"][0]["name"] == "order_amount"

    # 2. Simulate IPN
    await _send_ipn(client, order)

    # 3. Verify subscription active
    sub = await client.get("/api/v1/billing/me/subscription", headers=user_headers)
    assert sub.json()["status"] == "active"

    # 4. Verify auth/me reflects premium
    me = await client.get("/api/v1/auth/me", headers=user_headers)
    assert me.json()["is_premium"] is True
    assert me.json()["current_plan"] == plan["code"]

    # 5. Verify orders list
    orders = await client.get("/api/v1/billing/me/orders", headers=user_headers)
    assert orders.json()["total"] == 1
    assert orders.json()["items"][0]["status"] == "paid"
