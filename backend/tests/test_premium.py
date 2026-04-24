"""Tests for premium subscription & SePay payment endpoints."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from tests.conftest import (
    TEST_USER,
    create_admin,
    get_auth_header,
    register_user,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PLAN_DATA = {
    "code": "monthly",
    "name": "Monthly Premium",
    "description": "30 days of premium access",
    "price_vnd": 99000,
    "duration_days": 30,
    "is_active": True,
    "sort_order": 1,
    "features": {"unlimited_analysis": True, "priority_support": True},
}


async def _create_plan(client: AsyncClient, admin_headers: dict, data: dict | None = None) -> dict:
    """Helper to create a plan via the admin API."""
    resp = await client.post(
        "/api/v1/premium/plans",
        json=data or PLAN_DATA,
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# SePay signature
# ---------------------------------------------------------------------------


class TestSepaySignature:
    """Test SePay HMAC-SHA256 signature generation."""

    def test_signature_deterministic_field_order(self) -> None:
        """Signature must use the canonical field order and be deterministic."""
        from app.services.sepay import compute_signature

        fields = {
            "order_amount": "99000",
            "merchant": "TEST_MERCHANT",
            "currency": "VND",
            "operation": "PURCHASE",
            "order_description": "Test order",
            "order_invoice_number": "IQX-20260101120000-ABCD1234",
            "customer_id": "user-123",
            "payment_method": "BANK_TRANSFER",
            "success_url": "http://localhost:3000/payment/success",
            "error_url": "http://localhost:3000/payment/error",
            "cancel_url": "http://localhost:3000/payment/cancel",
        }
        secret = "my-secret-key"

        sig1 = compute_signature(fields, secret)
        sig2 = compute_signature(fields, secret)
        assert sig1 == sig2, "Signature should be deterministic"
        assert len(sig1) > 0

    def test_signature_only_includes_present_fields(self) -> None:
        """Fields not in the dict should be excluded from signing."""
        from app.services.sepay import compute_signature

        fields_full = {
            "order_amount": "99000",
            "merchant": "M",
            "currency": "VND",
            "operation": "PURCHASE",
            "order_description": "desc",
            "order_invoice_number": "INV-1",
            "customer_id": "cust",
            "payment_method": "BANK_TRANSFER",
            "success_url": "http://ok",
            "error_url": "http://err",
            "cancel_url": "http://cancel",
        }
        fields_partial = {
            "order_amount": "99000",
            "merchant": "M",
            "currency": "VND",
            "operation": "PURCHASE",
            "order_description": "desc",
            "order_invoice_number": "INV-1",
        }
        secret = "key"
        sig_full = compute_signature(fields_full, secret)
        sig_partial = compute_signature(fields_partial, secret)
        assert sig_full != sig_partial


# ---------------------------------------------------------------------------
# Plan management (admin)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_create_plan(client: AsyncClient) -> None:
    """Admin can create a premium plan."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    assert plan["code"] == "monthly"
    assert plan["price_vnd"] == 99000
    assert plan["is_active"] is True


@pytest.mark.asyncio
async def test_regular_user_cannot_create_plan(client: AsyncClient) -> None:
    """Non-admin gets 403 trying to create a plan."""
    headers = await get_auth_header(client)
    resp = await client.post(
        "/api/v1/premium/plans", json=PLAN_DATA, headers=headers
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_update_plan(client: AsyncClient) -> None:
    """Admin can update a plan."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)

    resp = await client.patch(
        f"/api/v1/premium/plans/{plan['id']}",
        json={"name": "Updated Monthly", "is_active": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Updated Monthly"
    assert data["is_active"] is False


@pytest.mark.asyncio
async def test_list_plans_only_active(client: AsyncClient) -> None:
    """GET /premium/plans returns only active plans for regular users."""
    admin_headers = await create_admin(client)
    await _create_plan(client, admin_headers)
    # Create an inactive plan
    inactive = {**PLAN_DATA, "code": "hidden", "is_active": False}
    await _create_plan(client, admin_headers, inactive)

    resp = await client.get("/api/v1/premium/plans")
    assert resp.status_code == 200
    plans = resp.json()
    assert len(plans) == 1
    assert plans[0]["code"] == "monthly"


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_checkout_creates_pending_order(client: AsyncClient) -> None:
    """POST /premium/checkout creates a pending order and returns form fields."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)

    user_headers = await get_auth_header(client)
    resp = await client.post(
        "/api/v1/premium/checkout",
        json={"plan_id": plan["id"]},
        headers=user_headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["method"] == "POST"
    assert "form_action" in data
    assert data["invoice_number"].startswith("IQX-")
    assert data["order_id"] is not None

    # Check fields contain signature
    field_names = [f["name"] for f in data["fields"]]
    assert "signature" in field_names
    assert "order_amount" in field_names
    assert "merchant" in field_names


@pytest.mark.asyncio
async def test_checkout_inactive_plan_404(client: AsyncClient) -> None:
    """Checkout for an inactive plan returns 404."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    # Deactivate
    await client.patch(
        f"/api/v1/premium/plans/{plan['id']}",
        json={"is_active": False},
        headers=admin_headers,
    )

    user_headers = await get_auth_header(client)
    resp = await client.post(
        "/api/v1/premium/checkout",
        json={"plan_id": plan["id"]},
        headers=user_headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# IPN
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ipn_wrong_secret_returns_401(client: AsyncClient) -> None:
    """IPN with wrong X-Secret-Key returns 401."""
    resp = await client.post(
        "/api/v1/premium/sepay/ipn",
        json={"notification_type": "ORDER_PAID"},
        headers={"X-Secret-Key": "wrong-secret"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ipn_missing_secret_returns_401(client: AsyncClient) -> None:
    """IPN without X-Secret-Key header returns 401."""
    resp = await client.post(
        "/api/v1/premium/sepay/ipn",
        json={"notification_type": "ORDER_PAID"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ipn_order_paid_activates_subscription(client: AsyncClient) -> None:
    """Valid ORDER_PAID IPN marks order as paid and creates subscription."""
    # Setup
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_headers = await get_auth_header(client)

    # Create checkout
    checkout_resp = await client.post(
        "/api/v1/premium/checkout",
        json={"plan_id": plan["id"]},
        headers=user_headers,
    )
    checkout = checkout_resp.json()
    invoice = checkout["invoice_number"]

    # Simulate IPN from SePay
    from app.core.config import get_settings
    settings = get_settings()

    ipn_payload = {
        "notification_type": "ORDER_PAID",
        "order": {
            "order_invoice_number": invoice,
            "order_status": "CAPTURED",
            "order_amount": plan["price_vnd"],
            "currency": "VND",
            "order_id": "sepay-order-123",
        },
        "transaction": {
            "transaction_status": "APPROVED",
            "transaction_id": "sepay-tx-456",
        },
    }

    resp = await client.post(
        "/api/v1/premium/sepay/ipn",
        json=ipn_payload,
        headers={"X-Secret-Key": settings.sepay_ipn_secret_key},
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "OK"

    # Verify user is now premium
    me_resp = await client.get("/api/v1/auth/me", headers=user_headers)
    me_data = me_resp.json()
    assert me_data["is_premium"] is True
    assert me_data["subscription_status"] == "active"
    assert me_data["subscription_expires_at"] is not None


@pytest.mark.asyncio
async def test_ipn_duplicate_does_not_extend(client: AsyncClient) -> None:
    """Duplicate IPN for the same invoice must NOT extend the subscription again."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_headers = await get_auth_header(client)

    # Checkout
    checkout_resp = await client.post(
        "/api/v1/premium/checkout",
        json={"plan_id": plan["id"]},
        headers=user_headers,
    )
    invoice = checkout_resp.json()["invoice_number"]

    from app.core.config import get_settings
    settings = get_settings()

    ipn_payload = {
        "notification_type": "ORDER_PAID",
        "order": {
            "order_invoice_number": invoice,
            "order_status": "CAPTURED",
            "order_amount": plan["price_vnd"],
            "currency": "VND",
        },
        "transaction": {
            "transaction_status": "APPROVED",
            "transaction_id": "tx-dup-test",
        },
    }

    # First call
    resp1 = await client.post(
        "/api/v1/premium/sepay/ipn",
        json=ipn_payload,
        headers={"X-Secret-Key": settings.sepay_ipn_secret_key},
    )
    assert resp1.status_code == 200

    # Get subscription end after first payment
    me1 = await client.get("/api/v1/auth/me", headers=user_headers)
    expires1 = me1.json()["subscription_expires_at"]

    # Second call (duplicate)
    resp2 = await client.post(
        "/api/v1/premium/sepay/ipn",
        json=ipn_payload,
        headers={"X-Secret-Key": settings.sepay_ipn_secret_key},
    )
    assert resp2.status_code == 200
    assert resp2.json()["message"] == "Already processed"

    # Subscription end should NOT change
    me2 = await client.get("/api/v1/auth/me", headers=user_headers)
    expires2 = me2.json()["subscription_expires_at"]
    assert expires1 == expires2


# ---------------------------------------------------------------------------
# Active user extends premium (period stacking)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_premium_user_extend_stacks_time(client: AsyncClient) -> None:
    """When a premium user buys again, end date is extended from current_period_end."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_headers = await get_auth_header(client)

    from app.core.config import get_settings
    settings = get_settings()

    # First purchase
    checkout1 = await client.post(
        "/api/v1/premium/checkout",
        json={"plan_id": plan["id"]},
        headers=user_headers,
    )
    inv1 = checkout1.json()["invoice_number"]
    await client.post(
        "/api/v1/premium/sepay/ipn",
        json={
            "notification_type": "ORDER_PAID",
            "order": {
                "order_invoice_number": inv1,
                "order_status": "CAPTURED",
                "order_amount": plan["price_vnd"],
                "currency": "VND",
            },
            "transaction": {"transaction_status": "APPROVED", "transaction_id": "tx1"},
        },
        headers={"X-Secret-Key": settings.sepay_ipn_secret_key},
    )

    me1 = await client.get("/api/v1/auth/me", headers=user_headers)
    expires1 = datetime.fromisoformat(me1.json()["subscription_expires_at"])

    # Second purchase (while still premium)
    checkout2 = await client.post(
        "/api/v1/premium/checkout",
        json={"plan_id": plan["id"]},
        headers=user_headers,
    )
    inv2 = checkout2.json()["invoice_number"]
    await client.post(
        "/api/v1/premium/sepay/ipn",
        json={
            "notification_type": "ORDER_PAID",
            "order": {
                "order_invoice_number": inv2,
                "order_status": "CAPTURED",
                "order_amount": plan["price_vnd"],
                "currency": "VND",
            },
            "transaction": {"transaction_status": "APPROVED", "transaction_id": "tx2"},
        },
        headers={"X-Secret-Key": settings.sepay_ipn_secret_key},
    )

    me2 = await client.get("/api/v1/auth/me", headers=user_headers)
    expires2 = datetime.fromisoformat(me2.json()["subscription_expires_at"])

    # The new end date should be ~30 days after the first end date
    expected_min = expires1 + timedelta(days=29)
    assert expires2 >= expected_min, (
        f"Expected stacked end date >= {expected_min}, got {expires2}"
    )


# ---------------------------------------------------------------------------
# Admin grant / extend
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_grant_premium(client: AsyncClient) -> None:
    """Admin can manually grant premium to a user."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_data = await register_user(client, TEST_USER)

    resp = await client.post(
        f"/api/v1/premium/admin/users/{user_data['id']}/grant",
        json={
            "plan_id": plan["id"],
            "note": "VIP customer grant",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["event_type"] in ("admin_grant", "admin_extend")
    assert data["new_period_end"] is not None
    assert data["subscription"]["status"] == "active"


@pytest.mark.asyncio
async def test_admin_extend_existing_premium(client: AsyncClient) -> None:
    """Admin can extend an already-premium user's subscription."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_data = await register_user(client, TEST_USER)

    # First grant
    await client.post(
        f"/api/v1/premium/admin/users/{user_data['id']}/grant",
        json={"plan_id": plan["id"]},
        headers=admin_headers,
    )

    # Extend
    resp = await client.post(
        f"/api/v1/premium/admin/users/{user_data['id']}/grant",
        json={"plan_id": plan["id"], "duration_days_override": 60},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["event_type"] == "admin_extend"
    assert data["previous_period_end"] is not None
    # Verify time was stacked
    prev = datetime.fromisoformat(data["previous_period_end"])
    new = datetime.fromisoformat(data["new_period_end"])
    delta = (new - prev).days
    assert delta >= 59, f"Expected ~60 day extension, got {delta} days"


@pytest.mark.asyncio
async def test_admin_grant_by_plan_code(client: AsyncClient) -> None:
    """Admin can grant using plan_code instead of plan_id."""
    admin_headers = await create_admin(client)
    await _create_plan(client, admin_headers)
    user_data = await register_user(client, TEST_USER)

    resp = await client.post(
        f"/api/v1/premium/admin/users/{user_data['id']}/grant",
        json={"plan_code": "monthly"},
        headers=admin_headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_regular_user_cannot_grant(client: AsyncClient) -> None:
    """Regular user gets 403 on admin grant endpoint."""
    user_headers = await get_auth_header(client)
    resp = await client.post(
        f"/api/v1/premium/admin/users/{uuid.uuid4()}/grant",
        json={"plan_code": "monthly"},
        headers=user_headers,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# /auth/me premium fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auth_me_returns_premium_fields(client: AsyncClient) -> None:
    """/auth/me must include premium status fields."""
    headers = await get_auth_header(client)
    resp = await client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    # Premium fields should be present even for non-premium users
    assert "is_premium" in data
    assert data["is_premium"] is False
    assert "subscription_status" in data
    assert "subscription_expires_at" in data
    assert "entitlements" in data


@pytest.mark.asyncio
async def test_auth_me_premium_user(client: AsyncClient) -> None:
    """/auth/me for a premium user should show correct status."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)
    user_data = await register_user(client, TEST_USER)

    # Grant premium
    await client.post(
        f"/api/v1/premium/admin/users/{user_data['id']}/grant",
        json={"plan_id": plan["id"]},
        headers=admin_headers,
    )

    # Login as user
    from tests.conftest import login_user
    tokens = await login_user(client, TEST_USER["email"], TEST_USER["password"])
    user_headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    resp = await client.get("/api/v1/auth/me", headers=user_headers)
    data = resp.json()
    assert data["is_premium"] is True
    assert data["subscription_status"] == "active"
    assert data["current_plan"] is not None
    assert data["current_plan"]["code"] == "monthly"
    assert data["entitlements"] is not None
    assert data["entitlements"]["unlimited_analysis"] is True


# ---------------------------------------------------------------------------
# My premium endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_my_premium_no_subscription(client: AsyncClient) -> None:
    """GET /premium/me for a user without subscription."""
    headers = await get_auth_header(client)
    resp = await client.get("/api/v1/premium/me", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_premium"] is False
    assert data["subscription"] is None


@pytest.mark.asyncio
async def test_get_my_premium_with_subscription(client: AsyncClient) -> None:
    """GET /premium/me for a premium user."""
    admin_headers = await create_admin(client)
    plan = await _create_plan(client, admin_headers)

    user_headers = await get_auth_header(client)

    # Checkout + IPN
    checkout = await client.post(
        "/api/v1/premium/checkout",
        json={"plan_id": plan["id"]},
        headers=user_headers,
    )
    invoice = checkout.json()["invoice_number"]

    from app.core.config import get_settings
    settings = get_settings()

    await client.post(
        "/api/v1/premium/sepay/ipn",
        json={
            "notification_type": "ORDER_PAID",
            "order": {
                "order_invoice_number": invoice,
                "order_status": "CAPTURED",
                "order_amount": plan["price_vnd"],
                "currency": "VND",
            },
            "transaction": {"transaction_status": "APPROVED", "transaction_id": "tx-me"},
        },
        headers={"X-Secret-Key": settings.sepay_ipn_secret_key},
    )

    resp = await client.get("/api/v1/premium/me", headers=user_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_premium"] is True
    assert data["subscription"]["status"] == "active"
