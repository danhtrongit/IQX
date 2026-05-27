"""Tests for admin payment order endpoints (T7)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.admin_audit import AdminAuditLog
from app.models.ipn_log import SePayIPNLog
from app.models.premium import (
    PaymentOrderStatus,
    PremiumPaymentOrder,
    PremiumPlan,
    PremiumSubscription,
    SubscriptionStatus,
)
from app.models.user import User, UserRole, UserStatus

pytestmark = pytest.mark.asyncio


# ── helpers ──────────────────────────────────────────────────────────────────


async def _admin_headers(db: AsyncSession) -> dict[str, str]:
    user = User(
        email=f"adm-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Adm@1234"),
        full_name="Adm In".strip(),
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    return {"Authorization": f"Bearer {token}"}


async def _seed_plan(db: AsyncSession, code: str = "MONTHLY") -> PremiumPlan:
    plan = PremiumPlan(
        code=code,
        name=code,
        price_vnd=50_000,
        duration_days=30,
        is_active=True,
        sort_order=0,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def _seed_user(db: AsyncSession, role: UserRole = UserRole.USER) -> User:
    u = User(
        email=f"u-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="$2b$12$x",
        full_name="T U".strip(),
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


async def _seed_order(
    db: AsyncSession,
    user: User,
    plan: PremiumPlan,
    status: PaymentOrderStatus = PaymentOrderStatus.PENDING,
    paid_at: datetime | None = None,
) -> PremiumPaymentOrder:
    order = PremiumPaymentOrder(
        invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
        user_id=user.id,
        plan_id=plan.id,
        amount_vnd=plan.price_vnd,
        currency="VND",
        status=status,
        paid_at=paid_at,
        grant_type="payment" if status == PaymentOrderStatus.PAID else None,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


async def _seed_sub(
    db: AsyncSession,
    user: User,
    plan: PremiumPlan,
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
    days_ahead: int = 30,
) -> PremiumSubscription:
    now = datetime.now(UTC)
    sub = PremiumSubscription(
        user_id=user.id,
        current_plan_id=plan.id,
        current_period_start=now,
        current_period_end=now + timedelta(days=days_ahead),
        status=status,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


# ── tests ─────────────────────────────────────────────────────────────────────


async def test_list_payments_empty(db_session, client):
    headers = await _admin_headers(db_session)
    resp = await client.get("/api/v1/admin/payments", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


async def test_list_payments_returns_items(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    await _seed_order(db_session, user, plan, PaymentOrderStatus.PAID, datetime.now(UTC))

    headers = await _admin_headers(db_session)
    resp = await client.get("/api/v1/admin/payments", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    item = data["items"][0]
    assert item["plan_code"] == "MONTHLY"
    assert item["user_email"] == user.email


async def test_list_payments_filter_by_status(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    await _seed_order(db_session, user, plan, PaymentOrderStatus.PAID, datetime.now(UTC))
    await _seed_order(db_session, user, plan, PaymentOrderStatus.PENDING)

    headers = await _admin_headers(db_session)
    resp = await client.get("/api/v1/admin/payments?status=paid", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert all(i["status"] == "paid" for i in data["items"])


async def test_list_payments_search_by_invoice(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan)

    headers = await _admin_headers(db_session)
    resp = await client.get(
        f"/api/v1/admin/payments?search={order.invoice_number[:8]}", headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


async def test_list_payments_search_by_email(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    await _seed_order(db_session, user, plan)

    headers = await _admin_headers(db_session)
    # search by partial email
    email_prefix = user.email.split("@")[0]
    resp = await client.get(
        f"/api/v1/admin/payments?search={email_prefix}", headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


async def test_get_payment_detail(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan, PaymentOrderStatus.PAID, datetime.now(UTC))

    headers = await _admin_headers(db_session)
    resp = await client.get(f"/api/v1/admin/payments/{order.id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(order.id)
    assert data["plan_name"] == plan.name
    assert data["user_email"] == user.email
    assert data["ipn_logs"] == []


async def test_get_payment_not_found(db_session, client):
    headers = await _admin_headers(db_session)
    resp = await client.get(f"/api/v1/admin/payments/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


async def test_refund_paid_order(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session, UserRole.PREMIUM)
    order = await _seed_order(db_session, user, plan, PaymentOrderStatus.PAID, datetime.now(UTC))
    sub = await _seed_sub(db_session, user, plan)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/refund",
        json={"reason": "Customer requested refund"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "refunded"

    # Verify audit row
    result = await db_session.execute(
        select(AdminAuditLog).where(AdminAuditLog.action == "premium.order.refund")
    )
    audit_rows = result.scalars().all()
    assert len(audit_rows) >= 1

    # Verify subscription cancelled
    await db_session.refresh(sub)
    assert sub.status == SubscriptionStatus.CANCELLED

    # Verify user role downgraded
    await db_session.refresh(user)
    assert user.role == UserRole.USER


async def test_refund_paid_order_no_active_sub(db_session, client):
    """Refund a PAID order that has no active subscription — just marks as refunded."""
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan, PaymentOrderStatus.PAID, datetime.now(UTC))

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/refund",
        json={"reason": "Refund no sub"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "refunded"


async def test_refund_pending_order_rejected(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan, PaymentOrderStatus.PENDING)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/refund",
        json={"reason": "bad refund"},
        headers=headers,
    )
    assert resp.status_code == 400


async def test_reconcile_too_young(db_session, client):
    """Reconcile a brand-new PENDING order → 400 (not old enough)."""
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/reconcile",
        json={},
        headers=headers,
    )
    assert resp.status_code == 400


async def test_reconcile_no_ipn_match(db_session, client):
    """Reconcile an old PENDING order with no IPN logs → no_match."""
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    # Create order with created_at explicitly in the past (>30 min)
    old_ts = datetime.now(UTC) - timedelta(hours=2)
    order = PremiumPaymentOrder(
        invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
        user_id=user.id,
        plan_id=plan.id,
        amount_vnd=plan.price_vnd,
        currency="VND",
        status=PaymentOrderStatus.PENDING,
        created_at=old_ts,
        updated_at=old_ts,
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/reconcile",
        json={"note": "manual check"},
        headers=headers,
    )
    assert resp.status_code == 200
    result = resp.json()
    assert result["status"] == "no_match"

    # Should still have an audit row
    audit = (
        await db_session.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "premium.order.reconcile")
        )
    ).scalars().all()
    assert len(audit) >= 1


async def test_reconcile_with_matching_ipn(db_session, client):
    """Reconcile an old PENDING order with a matching valid IPN → reconciled."""
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    # Old order
    old_ts = datetime.now(UTC) - timedelta(hours=2)
    order = PremiumPaymentOrder(
        invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
        user_id=user.id,
        plan_id=plan.id,
        amount_vnd=plan.price_vnd,
        currency="VND",
        status=PaymentOrderStatus.PENDING,
        created_at=old_ts,
        updated_at=old_ts,
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)

    # Seed a valid IPN log for this order
    ipn = SePayIPNLog(
        secret_key_valid=True,
        matched_order_id=order.id,
        result_status="processed",
        sepay_transaction_id=f"TXN-{uuid.uuid4().hex[:8]}",
    )
    db_session.add(ipn)
    await db_session.commit()

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/reconcile",
        json={"note": "manual reconcile"},
        headers=headers,
    )
    assert resp.status_code == 200
    result = resp.json()
    assert result["status"] == "reconciled"


async def test_non_admin_blocked(db_session, client):
    user = await _seed_user(db_session)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get("/api/v1/admin/payments", headers=headers)
    assert resp.status_code == 403
