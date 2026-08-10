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


# ── mark-paid (manual confirmation, no IPN evidence) ──────────────────────────


async def test_mark_paid_activates_subscription(db_session, client):
    """A PENDING order confirmed by hand becomes PAID and grants Premium."""
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/mark-paid",
        json={"note": "CK 09/08 ref FT2508123456, đã đối chiếu sao kê VCB"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "paid"
    assert data["paid_at"] is not None
    assert data["grant_note"] == "CK 09/08 ref FT2508123456, đã đối chiếu sao kê VCB"

    # Subscription created and active
    sub = (
        await db_session.execute(
            select(PremiumSubscription).where(PremiumSubscription.user_id == user.id)
        )
    ).scalar_one()
    assert sub.status == SubscriptionStatus.ACTIVE
    end = sub.current_period_end
    if end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    assert end > datetime.now(UTC) + timedelta(days=29)

    # User promoted to PREMIUM
    await db_session.refresh(user)
    assert user.role == UserRole.PREMIUM


async def test_mark_paid_extends_existing_subscription(db_session, client):
    """Extension stacks on top of the remaining period, like an IPN would."""
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session, UserRole.PREMIUM)
    sub = await _seed_sub(db_session, user, plan, days_ahead=10)
    before_end = sub.current_period_end
    if before_end.tzinfo is None:
        before_end = before_end.replace(tzinfo=UTC)
    order = await _seed_order(db_session, user, plan)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/mark-paid",
        json={"note": "Chuyển khoản tay, ảnh chụp bill #221"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    await db_session.refresh(sub)
    after_end = sub.current_period_end
    if after_end.tzinfo is None:
        after_end = after_end.replace(tzinfo=UTC)
    assert after_end - before_end == timedelta(days=plan.duration_days)


async def test_mark_paid_is_distinguishable_from_webhook_confirmation(db_session, client):
    """An admin assertion must never look like SePay evidence."""
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/mark-paid",
        json={"note": "Đã nhận tiền, ref 123"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["grant_type"] == "admin_confirmed"

    await db_session.refresh(order)
    assert order.grant_type == "admin_confirmed"
    assert order.grant_type != "payment"
    # No fabricated SePay evidence
    assert order.sepay_transaction_id is None
    assert order.raw_ipn is None
    # Attributable to the acting admin
    assert order.granted_by_user_id is not None
    assert order.grant_note == "Đã nhận tiền, ref 123"


async def test_mark_paid_writes_audit_row(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/mark-paid",
        json={"note": "Sao kê ACB 09/08 20:14"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    rows = (
        await db_session.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "premium.order.mark_paid")
        )
    ).scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.target_entity == "payment_order"
    assert row.target_id == str(order.id)
    assert row.note == "Sao kê ACB 09/08 20:14"
    assert row.admin_user_id is not None
    assert row.payload_before == {"status": "pending"}
    assert row.payload_after["status"] == "paid"
    assert row.payload_after["grant_type"] == "admin_confirmed"


async def test_mark_paid_rejects_paid_order(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan, PaymentOrderStatus.PAID, datetime.now(UTC))

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/mark-paid",
        json={"note": "nhầm đơn"},
        headers=headers,
    )
    assert resp.status_code == 400
    assert "pending" in resp.json()["detail"].lower()


async def test_mark_paid_rejects_refunded_order(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan, PaymentOrderStatus.REFUNDED)

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/mark-paid",
        json={"note": "thử lại"},
        headers=headers,
    )
    assert resp.status_code == 400


async def test_mark_paid_requires_note(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan)

    headers = await _admin_headers(db_session)

    missing = await client.post(
        f"/api/v1/admin/payments/{order.id}/mark-paid", json={}, headers=headers
    )
    assert missing.status_code == 422

    blank = await client.post(
        f"/api/v1/admin/payments/{order.id}/mark-paid",
        json={"note": "   "},
        headers=headers,
    )
    assert blank.status_code == 422

    # Order untouched by the rejected attempts
    await db_session.refresh(order)
    assert order.status == PaymentOrderStatus.PENDING


async def test_mark_paid_double_submit_is_safe(db_session, client):
    """Second submit is refused and must not extend the period twice."""
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan)

    headers = await _admin_headers(db_session)
    first = await client.post(
        f"/api/v1/admin/payments/{order.id}/mark-paid",
        json={"note": "ref A1"},
        headers=headers,
    )
    assert first.status_code == 200, first.text

    sub = (
        await db_session.execute(
            select(PremiumSubscription).where(PremiumSubscription.user_id == user.id)
        )
    ).scalar_one()
    end_after_first = sub.current_period_end

    second = await client.post(
        f"/api/v1/admin/payments/{order.id}/mark-paid",
        json={"note": "ref A1"},
        headers=headers,
    )
    assert second.status_code == 400

    await db_session.refresh(sub)
    assert sub.current_period_end == end_after_first

    audit_rows = (
        await db_session.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "premium.order.mark_paid")
        )
    ).scalars().all()
    assert len(audit_rows) == 1


async def test_mark_paid_order_not_found(db_session, client):
    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{uuid.uuid4()}/mark-paid",
        json={"note": "x"},
        headers=headers,
    )
    assert resp.status_code == 404


async def test_mark_paid_requires_admin(db_session, client):
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan)

    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/mark-paid",
        json={"note": "tôi tự duyệt"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403

    await db_session.refresh(order)
    assert order.status == PaymentOrderStatus.PENDING


async def test_mark_paid_filterable_by_grant_type(db_session, client):
    """`admin_confirmed` orders are greppable via the existing grant_type filter."""
    plan = await _seed_plan(db_session)
    user = await _seed_user(db_session)
    order = await _seed_order(db_session, user, plan)
    await _seed_order(db_session, user, plan, PaymentOrderStatus.PAID, datetime.now(UTC))

    headers = await _admin_headers(db_session)
    resp = await client.post(
        f"/api/v1/admin/payments/{order.id}/mark-paid",
        json={"note": "ref B2"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    listed = await client.get(
        "/api/v1/admin/payments?grant_type=admin_confirmed", headers=headers
    )
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert [i["id"] for i in items] == [str(order.id)]
