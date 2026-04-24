"""Premium feature tests — plans, checkout, IPN, grants, subscription stacking."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.premium import (
    PaymentOrderStatus,
    PremiumPaymentOrder,
    PremiumPlan,
    PremiumSubscription,
    SubscriptionStatus,
)
from app.models.user import User
from tests.conftest import get_auth_headers

# ── Helpers ──────────────────────────────────────────


async def _create_plan(
    db: AsyncSession,
    code: str = "monthly",
    name: str = "Monthly Premium",
    price_vnd: int = 99000,
    duration_days: int = 30,
    is_active: bool = True,
) -> PremiumPlan:
    plan = PremiumPlan(
        code=code,
        name=name,
        price_vnd=price_vnd,
        duration_days=duration_days,
        is_active=is_active,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


def _user_token(user: User) -> str:
    return create_access_token(subject=user.id, extra_claims={"role": user.role.value})


# ══════════════════════════════════════════════════════
# Plan management (admin)
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_admin_create_plan(client: AsyncClient, admin_user: User):
    token = _user_token(admin_user)
    resp = await client.post(
        "/api/v1/premium/admin/plans",
        json={
            "code": "weekly",
            "name": "Weekly Premium",
            "price_vnd": 29000,
            "duration_days": 7,
        },
        headers=get_auth_headers(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["code"] == "weekly"
    assert data["price_vnd"] == 29000
    assert data["duration_days"] == 7
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_admin_list_plans(client: AsyncClient, admin_user: User, db_session: AsyncSession):
    await _create_plan(db_session, code="p1", name="Plan 1")
    await _create_plan(db_session, code="p2", name="Plan 2", is_active=False)

    token = _user_token(admin_user)
    resp = await client.get("/api/v1/premium/admin/plans", headers=get_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2  # Admin sees all, including inactive


@pytest.mark.asyncio
async def test_admin_update_plan(client: AsyncClient, admin_user: User, db_session: AsyncSession):
    plan = await _create_plan(db_session)
    token = _user_token(admin_user)
    resp = await client.patch(
        f"/api/v1/premium/admin/plans/{plan.id}",
        json={"name": "Updated Plan", "is_active": False},
        headers=get_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Updated Plan"
    assert data["is_active"] is False


@pytest.mark.asyncio
async def test_admin_deactivate_plan(client: AsyncClient, admin_user: User, db_session: AsyncSession):
    plan = await _create_plan(db_session)
    token = _user_token(admin_user)
    resp = await client.patch(
        f"/api/v1/premium/admin/plans/{plan.id}",
        json={"is_active": False},
        headers=get_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_non_admin_cannot_manage_plans(client: AsyncClient, test_user: User):
    token = _user_token(test_user)
    resp = await client.post(
        "/api/v1/premium/admin/plans",
        json={"code": "x", "name": "X", "price_vnd": 1000, "duration_days": 7},
        headers=get_auth_headers(token),
    )
    assert resp.status_code == 403


# ══════════════════════════════════════════════════════
# User plan listing
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_user_list_active_plans(client: AsyncClient, db_session: AsyncSession):
    await _create_plan(db_session, code="active1")
    await _create_plan(db_session, code="inactive1", is_active=False)

    resp = await client.get("/api/v1/premium/plans")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["code"] == "active1"


# ══════════════════════════════════════════════════════
# Checkout
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_checkout_returns_form_fields(client: AsyncClient, test_user: User, db_session: AsyncSession):
    plan = await _create_plan(db_session, price_vnd=99000)
    token = _user_token(test_user)

    resp = await client.post(
        "/api/v1/premium/checkout",
        json={"plan_id": str(plan.id)},
        headers=get_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["action"] == "https://pay-sandbox.sepay.vn/v1/checkout/init"
    assert data["method"] == "POST"

    field_names = [f["name"] for f in data["fields"]]
    assert "order_amount" in field_names
    assert "merchant" in field_names
    assert "signature" in field_names
    assert "order_invoice_number" in field_names

    # Verify amount
    amount_field = next(f for f in data["fields"] if f["name"] == "order_amount")
    assert amount_field["value"] == "99000"


@pytest.mark.asyncio
async def test_checkout_signature_deterministic(client: AsyncClient, test_user: User, db_session: AsyncSession):
    """Signature is present and non-empty."""
    plan = await _create_plan(db_session)
    token = _user_token(test_user)

    resp = await client.post(
        "/api/v1/premium/checkout",
        json={"plan_id": str(plan.id)},
        headers=get_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    sig_field = next(f for f in data["fields"] if f["name"] == "signature")
    assert len(sig_field["value"]) > 10  # base64 encoded HMAC should be long


# ══════════════════════════════════════════════════════
# IPN
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_ipn_missing_secret_key_rejected(client: AsyncClient):
    resp = await client.post("/api/v1/premium/sepay/ipn", json={})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ipn_wrong_secret_key_rejected(client: AsyncClient):
    resp = await client.post(
        "/api/v1/premium/sepay/ipn",
        json={},
        headers={"X-Secret-Key": "wrong-key"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ipn_valid_payment_activates_premium(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    plan = await _create_plan(db_session, duration_days=30)

    # Create a pending order
    order = PremiumPaymentOrder(
        invoice_number="IQX_TEST001",
        user_id=test_user.id,
        plan_id=plan.id,
        amount_vnd=99000,
        currency="VND",
        status=PaymentOrderStatus.PENDING,
    )
    db_session.add(order)
    await db_session.commit()

    # Send valid IPN
    ipn_body = {
        "timestamp": 1700000000,
        "notification_type": "ORDER_PAID",
        "order": {
            "order_status": "CAPTURED",
            "order_currency": "VND",
            "order_amount": "99000.00",
            "order_invoice_number": "IQX_TEST001",
        },
        "transaction": {
            "transaction_id": "txn_123456",
            "transaction_status": "APPROVED",
        },
    }

    resp = await client.post(
        "/api/v1/premium/sepay/ipn",
        json=ipn_body,
        headers={"X-Secret-Key": "test-sepay-secret-key"},
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "processed"

    # Verify subscription created
    token = _user_token(test_user)
    sub_resp = await client.get("/api/v1/premium/me", headers=get_auth_headers(token))
    assert sub_resp.status_code == 200
    assert sub_resp.json()["is_premium"] is True


@pytest.mark.asyncio
async def test_ipn_duplicate_does_not_stack(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    plan = await _create_plan(db_session, duration_days=30)

    order = PremiumPaymentOrder(
        invoice_number="IQX_DUP001",
        user_id=test_user.id,
        plan_id=plan.id,
        amount_vnd=99000,
        currency="VND",
        status=PaymentOrderStatus.PENDING,
    )
    db_session.add(order)
    await db_session.commit()

    ipn_body = {
        "timestamp": 1700000000,
        "notification_type": "ORDER_PAID",
        "order": {
            "order_status": "CAPTURED",
            "order_currency": "VND",
            "order_amount": "99000.00",
            "order_invoice_number": "IQX_DUP001",
        },
        "transaction": {
            "transaction_id": "txn_dup_001",
            "transaction_status": "APPROVED",
        },
    }
    headers = {"X-Secret-Key": "test-sepay-secret-key"}

    # First call
    resp1 = await client.post("/api/v1/premium/sepay/ipn", json=ipn_body, headers=headers)
    assert resp1.json()["message"] == "processed"

    # Get subscription end time after first IPN
    token = _user_token(test_user)
    sub1 = await client.get("/api/v1/premium/me", headers=get_auth_headers(token))
    end1 = sub1.json()["current_period_end"]

    # Second call (duplicate)
    resp2 = await client.post("/api/v1/premium/sepay/ipn", json=ipn_body, headers=headers)
    assert resp2.json()["message"] == "already_processed"

    # Verify end time hasn't changed
    sub2 = await client.get("/api/v1/premium/me", headers=get_auth_headers(token))
    end2 = sub2.json()["current_period_end"]
    assert end1 == end2


@pytest.mark.asyncio
async def test_ipn_amount_mismatch_rejects(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    plan = await _create_plan(db_session)

    order = PremiumPaymentOrder(
        invoice_number="IQX_MISMATCH",
        user_id=test_user.id,
        plan_id=plan.id,
        amount_vnd=99000,
        currency="VND",
        status=PaymentOrderStatus.PENDING,
    )
    db_session.add(order)
    await db_session.commit()

    ipn_body = {
        "notification_type": "ORDER_PAID",
        "order": {
            "order_status": "CAPTURED",
            "order_currency": "VND",
            "order_amount": "50000.00",  # Wrong amount
            "order_invoice_number": "IQX_MISMATCH",
        },
        "transaction": {
            "transaction_id": "txn_mismatch",
            "transaction_status": "APPROVED",
        },
    }

    resp = await client.post(
        "/api/v1/premium/sepay/ipn",
        json=ipn_body,
        headers={"X-Secret-Key": "test-sepay-secret-key"},
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "amount_mismatch"


@pytest.mark.asyncio
async def test_ipn_wrong_currency_rejects(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    plan = await _create_plan(db_session)

    order = PremiumPaymentOrder(
        invoice_number="IQX_CURRENCY",
        user_id=test_user.id,
        plan_id=plan.id,
        amount_vnd=99000,
        currency="VND",
        status=PaymentOrderStatus.PENDING,
    )
    db_session.add(order)
    await db_session.commit()

    ipn_body = {
        "notification_type": "ORDER_PAID",
        "order": {
            "order_status": "CAPTURED",
            "order_currency": "USD",  # Wrong currency
            "order_amount": "99000.00",
            "order_invoice_number": "IQX_CURRENCY",
        },
        "transaction": {
            "transaction_id": "txn_cur",
            "transaction_status": "APPROVED",
        },
    }

    resp = await client.post(
        "/api/v1/premium/sepay/ipn",
        json=ipn_body,
        headers={"X-Secret-Key": "test-sepay-secret-key"},
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "ignored"


# ══════════════════════════════════════════════════════
# Subscription stacking
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_active_premium_stacks_time(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    """If user already has active premium, new purchase adds to current_period_end."""
    plan = await _create_plan(db_session, duration_days=30)

    # Give user existing premium (30 days from now)
    now = datetime.now(UTC)
    sub = PremiumSubscription(
        user_id=test_user.id,
        current_plan_id=plan.id,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    )
    db_session.add(sub)
    await db_session.commit()

    original_end = sub.current_period_end
    if original_end.tzinfo is None:
        original_end = original_end.replace(tzinfo=UTC)

    # Create another order and process IPN
    order = PremiumPaymentOrder(
        invoice_number="IQX_STACK001",
        user_id=test_user.id,
        plan_id=plan.id,
        amount_vnd=99000,
        currency="VND",
        status=PaymentOrderStatus.PENDING,
    )
    db_session.add(order)
    await db_session.commit()

    ipn_body = {
        "notification_type": "ORDER_PAID",
        "order": {
            "order_status": "CAPTURED",
            "order_currency": "VND",
            "order_amount": "99000.00",
            "order_invoice_number": "IQX_STACK001",
        },
        "transaction": {
            "transaction_id": "txn_stack001",
            "transaction_status": "APPROVED",
        },
    }

    resp = await client.post(
        "/api/v1/premium/sepay/ipn",
        json=ipn_body,
        headers={"X-Secret-Key": "test-sepay-secret-key"},
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "processed"

    # Verify stacking: new end should be ~60 days from now (original 30 + new 30)
    token = _user_token(test_user)
    sub_resp = await client.get("/api/v1/premium/me", headers=get_auth_headers(token))
    new_end_str = sub_resp.json()["current_period_end"]
    new_end = datetime.fromisoformat(new_end_str)
    if new_end.tzinfo is None:
        new_end = new_end.replace(tzinfo=UTC)

    # Should be approximately original_end + 30 days
    expected_end = original_end + timedelta(days=30)
    if expected_end.tzinfo is None:
        expected_end = expected_end.replace(tzinfo=UTC)
    assert abs((new_end - expected_end).total_seconds()) < 5


# ══════════════════════════════════════════════════════
# Admin manual grant
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_admin_grant_premium(
    client: AsyncClient, admin_user: User, test_user: User, db_session: AsyncSession
):
    plan = await _create_plan(db_session, duration_days=90)
    token = _user_token(admin_user)

    resp = await client.post(
        f"/api/v1/premium/admin/users/{test_user.id}/grant",
        json={"plan_id": str(plan.id), "note": "Promotional grant"},
        headers=get_auth_headers(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["grant_type"] == "admin_grant"

    # Verify user has premium
    user_token = _user_token(test_user)
    sub_resp = await client.get("/api/v1/premium/me", headers=get_auth_headers(user_token))
    assert sub_resp.json()["is_premium"] is True


@pytest.mark.asyncio
async def test_admin_grant_stacks_time(
    client: AsyncClient, admin_user: User, test_user: User, db_session: AsyncSession
):
    plan = await _create_plan(db_session, duration_days=30)

    # Give user existing 30-day premium
    now = datetime.now(UTC)
    sub = PremiumSubscription(
        user_id=test_user.id,
        current_plan_id=plan.id,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    )
    db_session.add(sub)
    await db_session.commit()

    original_end = sub.current_period_end
    if original_end.tzinfo is None:
        original_end = original_end.replace(tzinfo=UTC)

    # Admin grants another 30 days
    token = _user_token(admin_user)
    resp = await client.post(
        f"/api/v1/premium/admin/users/{test_user.id}/grant",
        json={"plan_id": str(plan.id)},
        headers=get_auth_headers(token),
    )
    assert resp.status_code == 201

    # Verify stacking
    user_token = _user_token(test_user)
    sub_resp = await client.get("/api/v1/premium/me", headers=get_auth_headers(user_token))
    new_end = datetime.fromisoformat(sub_resp.json()["current_period_end"])
    if new_end.tzinfo is None:
        new_end = new_end.replace(tzinfo=UTC)
    expected_end = original_end + timedelta(days=30)
    if expected_end.tzinfo is None:
        expected_end = expected_end.replace(tzinfo=UTC)
    assert abs((new_end - expected_end).total_seconds()) < 5


@pytest.mark.asyncio
async def test_user_without_premium(client: AsyncClient, test_user: User):
    token = _user_token(test_user)
    resp = await client.get("/api/v1/premium/me", headers=get_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["is_premium"] is False
