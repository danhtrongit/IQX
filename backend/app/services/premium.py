"""Premium subscription business logic.

Handles plan CRUD, checkout creation, IPN processing,
admin grant/extend, and subscription queries.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.premium import (
    PaymentOrder,
    Plan,
    Subscription,
    SubscriptionEvent,
)
from app.services.sepay import build_checkout_fields, generate_invoice_number


# ═══════════════════════════════════════════════════════════════════
# Plan helpers
# ═══════════════════════════════════════════════════════════════════


async def list_active_plans(session: AsyncSession) -> list[Plan]:
    """Return all active plans ordered by sort_order."""
    result = await session.execute(
        select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.sort_order)
    )
    return list(result.scalars().all())


async def list_all_plans(session: AsyncSession) -> list[Plan]:
    """Return all plans (admin view) ordered by sort_order."""
    result = await session.execute(select(Plan).order_by(Plan.sort_order))
    return list(result.scalars().all())


async def get_plan_by_id(session: AsyncSession, plan_id: uuid.UUID) -> Plan | None:
    return await session.get(Plan, plan_id)


async def get_plan_by_code(session: AsyncSession, code: str) -> Plan | None:
    result = await session.execute(select(Plan).where(Plan.code == code))
    return result.scalar_one_or_none()


async def create_plan(session: AsyncSession, data: dict) -> Plan:
    plan = Plan(**data)
    session.add(plan)
    await session.flush()
    await session.refresh(plan)
    return plan


async def update_plan(session: AsyncSession, plan: Plan, data: dict) -> Plan:
    for field, value in data.items():
        setattr(plan, field, value)
    await session.flush()
    await session.refresh(plan)
    return plan


# ═══════════════════════════════════════════════════════════════════
# Subscription helpers
# ═══════════════════════════════════════════════════════════════════


async def get_active_subscription(
    session: AsyncSession, user_id: uuid.UUID
) -> Subscription | None:
    """Return the user's active subscription (if any)."""
    result = await session.execute(
        select(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.status == "active",
        )
        .order_by(Subscription.current_period_end.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_latest_pending_order(
    session: AsyncSession, user_id: uuid.UUID
) -> PaymentOrder | None:
    """Return the most recent pending payment order for a user."""
    result = await session.execute(
        select(PaymentOrder)
        .where(
            PaymentOrder.user_id == user_id,
            PaymentOrder.status == "pending",
        )
        .order_by(PaymentOrder.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_order_by_invoice(
    session: AsyncSession, invoice_number: str
) -> PaymentOrder | None:
    result = await session.execute(
        select(PaymentOrder).where(PaymentOrder.invoice_number == invoice_number)
    )
    return result.scalar_one_or_none()


# ═══════════════════════════════════════════════════════════════════
# extend_subscription — core helper
# ═══════════════════════════════════════════════════════════════════


async def extend_subscription(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    plan: Plan,
    source: str,
    duration_days_override: int | None = None,
    order_id: uuid.UUID | None = None,
    actor_user_id: uuid.UUID | None = None,
    note: str | None = None,
) -> tuple[Subscription, SubscriptionEvent]:
    """Create or extend a user's premium subscription.

    If the user has an active subscription that hasn't expired,
    the new period starts from ``current_period_end``.
    Otherwise it starts from now.
    """
    now = datetime.now(UTC)
    duration = duration_days_override or plan.duration_days

    existing = await get_active_subscription(session, user_id)
    previous_end: datetime | None = None

    if existing and existing.current_period_end > now:
        # Still active → extend from current end
        previous_end = existing.current_period_end
        new_start = existing.current_period_end
        new_end = new_start + timedelta(days=duration)
        existing.current_period_end = new_end
        existing.plan_id = plan.id
        existing.source = source
        if order_id:
            existing.last_payment_order_id = order_id
        await session.flush()
        await session.refresh(existing)
        sub = existing
        event_type = "admin_extend" if source == "admin" else "ipn_payment"
    else:
        # No active sub or expired → create new
        if existing:
            previous_end = existing.current_period_end
            existing.status = "expired"

        new_start = now
        new_end = now + timedelta(days=duration)
        sub = Subscription(
            user_id=user_id,
            plan_id=plan.id,
            status="active",
            current_period_start=new_start,
            current_period_end=new_end,
            source=source,
            last_payment_order_id=order_id,
        )
        session.add(sub)
        await session.flush()
        await session.refresh(sub)
        event_type = "admin_grant" if source == "admin" else "ipn_payment"

    # Audit event
    event = SubscriptionEvent(
        subscription_id=sub.id,
        user_id=user_id,
        event_type=event_type,
        status="processed",
        previous_period_end=previous_end,
        new_period_end=new_end,
        actor_user_id=actor_user_id,
        note=note,
    )
    session.add(event)
    await session.flush()
    await session.refresh(event)

    return sub, event


# ═══════════════════════════════════════════════════════════════════
# Checkout
# ═══════════════════════════════════════════════════════════════════


async def create_checkout(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    plan: Plan,
    payment_method: str = "BANK_TRANSFER",
) -> tuple[PaymentOrder, str, list[dict[str, str]]]:
    """Create a PaymentOrder and return SePay checkout form data.

    Returns ``(order, form_action, fields)``.
    """
    invoice = generate_invoice_number()
    description = f"IQX Premium - {plan.name}"

    form_action, fields = build_checkout_fields(
        amount=plan.price_vnd,
        invoice_number=invoice,
        description=description,
        customer_id=str(user_id),
        payment_method=payment_method,
    )

    checkout_payload = {f["name"]: f["value"] for f in fields}

    order = PaymentOrder(
        user_id=user_id,
        plan_id=plan.id,
        provider="sepay",
        invoice_number=invoice,
        amount_vnd=plan.price_vnd,
        currency="VND",
        status="pending",
        checkout_payload=checkout_payload,
    )
    session.add(order)
    await session.flush()
    await session.refresh(order)

    return order, form_action, fields


# ═══════════════════════════════════════════════════════════════════
# IPN processing
# ═══════════════════════════════════════════════════════════════════


async def process_ipn_order_paid(
    session: AsyncSession,
    payload: dict,
) -> tuple[str, int]:
    """Process an ORDER_PAID IPN notification.

    Returns ``(message, http_status_code)``.
    """
    order_data = payload.get("order", {})
    tx_data = payload.get("transaction", {})

    invoice = order_data.get("order_invoice_number", "")
    order_status = order_data.get("order_status", "")
    tx_status = tx_data.get("transaction_status", "")
    tx_id = tx_data.get("transaction_id", "")
    currency = order_data.get("currency", "")
    amount_raw = order_data.get("order_amount")

    # Find matching pending order
    db_order = await get_order_by_invoice(session, invoice)
    if db_order is None:
        # Log but return 200 (don't make SePay retry for unknown invoices)
        event = SubscriptionEvent(
            user_id=uuid.UUID(int=0),  # placeholder
            event_type="ipn_payment",
            status="error",
            note=f"Unknown invoice: {invoice}",
            raw_payload=payload,
        )
        session.add(event)
        return "Unknown invoice", 200

    # Idempotency: already paid → skip
    if db_order.status == "paid":
        return "Already processed", 200

    # Store raw payload regardless
    db_order.raw_provider_payload = payload
    db_order.provider_transaction_id = str(tx_id) if tx_id else None
    provider_order_id = order_data.get("order_id")
    if provider_order_id:
        db_order.provider_order_id = str(provider_order_id)

    # Validate conditions
    if order_status != "CAPTURED":
        db_order.status = "failed"
        event = SubscriptionEvent(
            user_id=db_order.user_id,
            event_type="ipn_payment",
            status="error",
            note=f"order_status={order_status}, expected CAPTURED",
            raw_payload=payload,
        )
        session.add(event)
        return "Order not captured", 200

    if tx_status != "APPROVED":
        db_order.status = "failed"
        event = SubscriptionEvent(
            user_id=db_order.user_id,
            event_type="ipn_payment",
            status="error",
            note=f"tx_status={tx_status}, expected APPROVED",
            raw_payload=payload,
        )
        session.add(event)
        return "Transaction not approved", 200

    if currency != "VND":
        db_order.status = "failed"
        event = SubscriptionEvent(
            user_id=db_order.user_id,
            event_type="ipn_payment",
            status="error",
            note=f"currency={currency}, expected VND",
            raw_payload=payload,
        )
        session.add(event)
        return "Currency mismatch", 200

    try:
        amount = int(amount_raw)
    except (TypeError, ValueError):
        amount = -1

    if amount != db_order.amount_vnd:
        db_order.status = "failed"
        event = SubscriptionEvent(
            user_id=db_order.user_id,
            event_type="ipn_payment",
            status="error",
            note=f"amount={amount}, expected {db_order.amount_vnd}",
            raw_payload=payload,
        )
        session.add(event)
        return "Amount mismatch", 200

    # All checks passed — mark paid and extend subscription
    db_order.status = "paid"
    db_order.paid_at = datetime.now(UTC)

    plan = await get_plan_by_id(session, db_order.plan_id)
    if plan is None:
        return "Plan not found", 200

    await extend_subscription(
        session,
        user_id=db_order.user_id,
        plan=plan,
        source="sepay",
        order_id=db_order.id,
    )

    return "OK", 200


# ═══════════════════════════════════════════════════════════════════
# Premium status for /auth/me
# ═══════════════════════════════════════════════════════════════════


async def get_premium_status(
    session: AsyncSession, user_id: uuid.UUID
) -> dict:
    """Return premium status dict for a user."""
    now = datetime.now(UTC)
    sub = await get_active_subscription(session, user_id)

    if sub and sub.current_period_end > now:
        plan = await get_plan_by_id(session, sub.plan_id)
        return {
            "is_premium": True,
            "current_plan": plan,
            "subscription_status": sub.status,
            "subscription_expires_at": sub.current_period_end,
            "entitlements": plan.features if plan else None,
        }

    return {
        "is_premium": False,
        "current_plan": None,
        "subscription_status": sub.status if sub else None,
        "subscription_expires_at": sub.current_period_end if sub else None,
        "entitlements": None,
    }
