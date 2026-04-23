"""Billing service: checkout, IPN processing, reconciliation, cancel/void."""

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment_ipn_log import PaymentIPNLog
from app.models.payment_order import PaymentOrder
from app.models.plan import Plan
from app.schemas.billing import SePayIPNPayload
from app.services.sepay import (
    build_checkout_data,
    cancel_order_on_sepay,
    fetch_order_detail,
    void_transaction_on_sepay,
)
from app.services.subscription import activate_subscription

logger = logging.getLogger(__name__)


def _generate_invoice_number() -> str:
    """Generate a unique invoice number: IQX-YYYYMMDD-XXXX."""
    now = datetime.now(UTC)
    short_id = uuid.uuid4().hex[:8].upper()
    return f"IQX-{now.strftime('%Y%m%d')}-{short_id}"


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------


async def create_checkout_order(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    plan: Plan,
    payment_method: str | None = None,
) -> tuple[PaymentOrder, dict]:
    """Create a payment order with billing snapshot and build SePay checkout data."""
    invoice_number = _generate_invoice_number()

    order = PaymentOrder(
        user_id=user_id,
        plan_id=plan.id,
        provider="sepay",
        invoice_number=invoice_number,
        amount_vnd=plan.price_vnd,
        currency="VND",
        status="pending",
        # Billing snapshot — frozen at purchase time
        plan_snapshot_code=plan.code,
        plan_snapshot_name=plan.name,
        plan_snapshot_price=plan.price_vnd,
        plan_snapshot_duration=plan.duration_months,
        plan_snapshot_features=plan.features,
    )
    session.add(order)
    await session.flush()
    await session.refresh(order)

    checkout_data = build_checkout_data(
        amount_vnd=plan.price_vnd,
        invoice_number=invoice_number,
        description=f"IQX Premium - {plan.name}",
        customer_id=str(user_id),
        payment_method=payment_method,
        order_id=str(order.id),
    )

    # Save checkout payload for debugging
    order.checkout_payload = checkout_data
    await session.flush()

    return order, checkout_data


# ---------------------------------------------------------------------------
# IPN processing
# ---------------------------------------------------------------------------


async def _log_ipn(
    session: AsyncSession,
    payload: SePayIPNPayload,
    *,
    order_id: uuid.UUID | None,
    status: str,
    error_message: str | None = None,
) -> PaymentIPNLog:
    """Write an immutable IPN audit log entry."""
    log = PaymentIPNLog(
        payment_order_id=order_id,
        notification_type=payload.notification_type,
        invoice_number=(payload.order.order_invoice_number if payload.order else None),
        raw_payload=payload.model_dump(),
        status=status,
        error_message=error_message,
        received_at=datetime.now(UTC),
    )
    session.add(log)
    await session.flush()
    return log


async def process_ipn(
    session: AsyncSession, payload: SePayIPNPayload
) -> PaymentOrder | None:
    """Process a SePay IPN callback. Idempotent. Uses SELECT FOR UPDATE.

    Handles:
    - ORDER_PAID: activate subscription
    - TRANSACTION_VOID: mark order as voided
    """
    invoice = None
    if payload.order:
        invoice = payload.order.order_invoice_number

    if not invoice:
        await _log_ipn(
            session,
            payload,
            order_id=None,
            status="ignored",
            error_message="No invoice number in payload",
        )
        return None

    # SELECT FOR UPDATE to prevent race conditions with concurrent IPNs
    result = await session.execute(
        select(PaymentOrder)
        .where(PaymentOrder.invoice_number == invoice)
        .with_for_update()
    )
    order = result.scalar_one_or_none()

    if order is None:
        await _log_ipn(
            session,
            payload,
            order_id=None,
            status="ignored",
            error_message=f"Order not found: {invoice}",
        )
        return None

    # --- ORDER_PAID ---
    if payload.notification_type == "ORDER_PAID":
        if order.status == "paid":
            # Idempotent: already processed
            await _log_ipn(
                session,
                payload,
                order_id=order.id,
                status="ignored",
                error_message="Already paid (idempotent skip)",
            )
            return order

        if order.status != "pending":
            await _log_ipn(
                session,
                payload,
                order_id=order.id,
                status="ignored",
                error_message=f"Unexpected status: {order.status}",
            )
            return order

        now = datetime.now(UTC)
        order.status = "paid"
        order.paid_at = now
        order.provider_order_id = payload.order.order_id if payload.order else None
        order.payment_method = (
            payload.transaction.payment_method if payload.transaction else None
        )
        order.provider_transaction_id = (
            payload.transaction.transaction_id if payload.transaction else None
        )
        order.provider_response = payload.model_dump()

        await activate_subscription(
            session,
            user_id=order.user_id,
            plan_id=order.plan_id,
            payment_order_id=order.id,
        )

        await _log_ipn(session, payload, order_id=order.id, status="processed")
        await session.flush()
        return order

    # --- TRANSACTION_VOID ---
    if payload.notification_type == "TRANSACTION_VOID":
        if order.status in ("voided", "cancelled"):
            await _log_ipn(
                session,
                payload,
                order_id=order.id,
                status="ignored",
                error_message="Already voided/cancelled",
            )
            return order

        order.status = "voided"
        order.provider_response = payload.model_dump()
        await _log_ipn(session, payload, order_id=order.id, status="processed")
        await session.flush()
        return order

    # Unknown notification type — log and ignore
    await _log_ipn(
        session,
        payload,
        order_id=order.id,
        status="ignored",
        error_message=f"Unknown type: {payload.notification_type}",
    )
    return None


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------


async def refresh_order_status(
    session: AsyncSession, order: PaymentOrder
) -> PaymentOrder:
    """Refresh a pending order's status from SePay REST API.

    Calls GET /v1/order/detail/{order_id} and syncs local status.
    Safe to call repeatedly (idempotent).
    """
    if order.status not in ("pending",):
        return order

    if not order.provider_order_id:
        # No SePay order ID yet — try fetching by invoice from checkout
        return order

    detail = await fetch_order_detail(order.provider_order_id)
    if detail is None:
        return order

    data = detail.get("data", {})
    sepay_status = data.get("order_status", "")

    if sepay_status == "CAPTURED" and order.status == "pending":
        # Payment was captured but IPN was missed
        now = datetime.now(UTC)
        order.status = "paid"
        order.paid_at = now
        order.provider_response = detail

        # Extract payment method from transactions
        txns = data.get("transactions", [])
        if txns:
            order.payment_method = txns[0].get("payment_method")
            order.provider_transaction_id = txns[0].get("id")

        await activate_subscription(
            session,
            user_id=order.user_id,
            plan_id=order.plan_id,
            payment_order_id=order.id,
        )
        await session.flush()

    elif sepay_status == "CANCELLED" and order.status == "pending":
        order.status = "cancelled"
        order.provider_response = detail
        await session.flush()

    return order


# ---------------------------------------------------------------------------
# Cancel / Void
# ---------------------------------------------------------------------------


async def cancel_order(session: AsyncSession, order: PaymentOrder) -> PaymentOrder:
    """Cancel an unpaid order on SePay.

    Per SePay docs: only for BANK_TRANSFER or NAPAS_BANK_TRANSFER,
    only when order_status != CAPTURED and != CANCELED.
    """
    if order.status != "pending":
        msg = f"Cannot cancel order with status '{order.status}'"
        raise ValueError(msg)

    # If we have a provider_order_id, try cancelling on SePay
    if order.provider_order_id or order.invoice_number:
        result = await cancel_order_on_sepay(order.invoice_number)
        if result:
            order.provider_response = result

    order.status = "cancelled"
    await session.flush()
    await session.refresh(order)
    return order


async def void_order(session: AsyncSession, order: PaymentOrder) -> PaymentOrder:
    """Void a CARD payment on SePay (before settlement).

    Per SePay docs: only for payment_method=CARD,
    only when order_status=CAPTURED (paid).
    """
    if order.status != "paid":
        msg = f"Cannot void order with status '{order.status}'"
        raise ValueError(msg)

    if order.payment_method != "CARD":
        msg = f"Void only available for CARD payments, got '{order.payment_method}'"
        raise ValueError(msg)

    result = await void_transaction_on_sepay(order.invoice_number)
    if result:
        order.status = "voided"
        order.provider_response = result
        await session.flush()
        await session.refresh(order)
    else:
        msg = "SePay void request failed — may have passed settlement cutoff"
        raise ValueError(msg)

    return order


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------


async def get_order_by_id(
    session: AsyncSession, order_id: uuid.UUID
) -> PaymentOrder | None:
    """Fetch a payment order by ID."""
    return await session.get(PaymentOrder, order_id)


async def get_user_orders(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    skip: int = 0,
    limit: int = 20,
) -> tuple[list[PaymentOrder], int]:
    """Return paginated payment orders for a specific user."""
    total = (
        await session.execute(
            select(func.count(PaymentOrder.id)).where(PaymentOrder.user_id == user_id)
        )
    ).scalar_one()
    result = await session.execute(
        select(PaymentOrder)
        .where(PaymentOrder.user_id == user_id)
        .order_by(PaymentOrder.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all()), total


async def list_all_orders(
    session: AsyncSession, *, skip: int = 0, limit: int = 50
) -> tuple[list[PaymentOrder], int]:
    """Admin: paginated list of all payment orders."""
    total = (await session.execute(select(func.count(PaymentOrder.id)))).scalar_one()
    result = await session.execute(
        select(PaymentOrder)
        .order_by(PaymentOrder.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all()), total


async def get_pending_order_for_user(
    session: AsyncSession, user_id: uuid.UUID
) -> PaymentOrder | None:
    """Check if user has a pending (unpaid) payment order."""
    result = await session.execute(
        select(PaymentOrder).where(
            PaymentOrder.user_id == user_id,
            PaymentOrder.status == "pending",
        )
    )
    return result.scalars().first()
