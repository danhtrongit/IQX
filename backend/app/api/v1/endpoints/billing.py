"""Billing endpoints: checkout, orders, subscription, entitlements, SePay callbacks/IPN."""

import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.billing import (
    CheckoutData,
    CheckoutFormField,
    CheckoutRequest,
    CheckoutResponse,
    EntitlementResponse,
    PaymentOrderListResponse,
    PaymentOrderResponse,
    SePayIPNPayload,
    SubscriptionResponse,
)
from app.schemas.error import ErrorResponse
from app.services import billing as billing_service
from app.services import plan as plan_service
from app.services.subscription import get_active_subscription

router = APIRouter(prefix="/billing", tags=["Billing"])


# ---------------------------------------------------------------------------
# User-facing
# ---------------------------------------------------------------------------


@router.get(
    "/me/subscription",
    response_model=SubscriptionResponse | None,
    summary="Get my subscription",
    description=(
        "Return the current user's active subscription, or `null` if none.\n\n"
        "Requires a valid **access token**."
    ),
    operation_id="getMySubscription",
    responses={401: {"model": ErrorResponse}},
)
async def get_my_subscription(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return user's active subscription."""
    return await get_active_subscription(session, current_user.id)


@router.get(
    "/me/entitlements",
    response_model=EntitlementResponse,
    summary="Get my premium entitlements",
    description=(
        "Return the current user's premium status and feature flags.\n\n"
        "Use this to gate premium content on the frontend."
    ),
    operation_id="getMyEntitlements",
    responses={401: {"model": ErrorResponse}},
)
async def get_my_entitlements(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return user's entitlements derived from active subscription."""
    sub = await get_active_subscription(session, current_user.id)
    if sub is None or sub.plan is None:
        return EntitlementResponse(is_premium=False)
    return EntitlementResponse(
        is_premium=True,
        plan_code=sub.plan.code,
        plan_name=sub.plan.name,
        subscription_status=sub.status,
        subscription_expires_at=sub.current_period_end,
        features=sub.plan.features,
    )


@router.get(
    "/me/orders",
    response_model=PaymentOrderListResponse,
    summary="List my payment orders",
    description="Return paginated list of the current user's payment orders.",
    operation_id="getMyOrders",
    responses={401: {"model": ErrorResponse}},
)
async def get_my_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List user's payment orders."""
    orders, total = await billing_service.get_user_orders(
        session, current_user.id, skip=skip, limit=limit
    )
    return {"items": orders, "total": total}


@router.get(
    "/me/orders/{order_id}",
    response_model=PaymentOrderResponse,
    summary="Get my payment order",
    description="Return details of a specific payment order owned by the current user.",
    operation_id="getMyOrder",
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse, "description": "Order not found."},
    },
)
async def get_my_order(
    order_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a specific order owned by user."""
    order = await billing_service.get_order_by_id(session, order_id)
    if order is None or order.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------


@router.post(
    "/checkout",
    response_model=CheckoutResponse,
    status_code=201,
    summary="Create checkout order",
    description=(
        "Create a payment order and return SePay checkout form data.\n\n"
        "Frontend should use the returned `checkout.form_fields` (ordered array) "
        "to build a hidden HTML form and auto-submit via POST to `checkout.action_url`.\n\n"
        "**Flow:**\n"
        "1. Frontend calls this endpoint\n"
        "2. Backend creates a `pending` payment order with billing snapshot\n"
        "3. Backend generates SePay HMAC-SHA256 signature\n"
        "4. Frontend renders hidden form fields **in the exact returned order**\n"
        "5. User pays on SePay page\n"
        "6. SePay redirects to callback URLs (UX only)\n"
        "7. SePay sends IPN to backend → subscription activated\n\n"
        "⚠️ Callback URLs are UX only. IPN is the **source of truth**."
    ),
    operation_id="createCheckout",
    responses={
        201: {"description": "Checkout order created."},
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse, "description": "Plan not found."},
        409: {
            "model": ErrorResponse,
            "description": "Plan inactive or user has pending order.",
        },
    },
)
async def create_checkout(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a payment order and return checkout form data."""
    plan = await plan_service.get_plan_by_id(session, body.plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not plan.is_active:
        raise HTTPException(status_code=409, detail="Plan is not active")

    pending = await billing_service.get_pending_order_for_user(session, current_user.id)
    if pending is not None:
        raise HTTPException(
            status_code=409,
            detail="You have a pending payment order. Complete or wait for it to expire.",
        )

    order, checkout_data = await billing_service.create_checkout_order(
        session,
        user_id=current_user.id,
        plan=plan,
        payment_method=body.payment_method,
    )

    # Build typed response
    form_fields = [
        CheckoutFormField(name=f["name"], value=f["value"])
        for f in checkout_data["form_fields"]
    ]

    return CheckoutResponse(
        payment_order_id=order.id,
        invoice_number=order.invoice_number,
        status=order.status,
        amount_vnd=order.amount_vnd,
        checkout=CheckoutData(
            action_url=checkout_data["action_url"],
            method=checkout_data["method"],
            form_fields=form_fields,
        ),
    )


# ---------------------------------------------------------------------------
# Cancel / Void / Refresh-status
# ---------------------------------------------------------------------------


@router.post(
    "/orders/{order_id}/cancel",
    response_model=PaymentOrderResponse,
    summary="Cancel a pending order",
    description=(
        "Cancel an unpaid payment order.\n\n"
        "For `BANK_TRANSFER`/`NAPAS_BANK_TRANSFER` orders: also cancels on SePay.\n"
        "Only works when order status is `pending`."
    ),
    operation_id="cancelOrder",
    responses={
        200: {"description": "Order cancelled."},
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse, "description": "Order cannot be cancelled."},
    },
)
async def cancel_order(
    order_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Cancel a pending payment order."""
    order = await billing_service.get_order_by_id(session, order_id)
    if order is None or order.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Order not found")

    try:
        return await billing_service.cancel_order(session, order)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@router.post(
    "/orders/{order_id}/refresh-status",
    response_model=PaymentOrderResponse,
    summary="Refresh order status from SePay",
    description=(
        "Sync a pending order's status with SePay REST API.\n\n"
        "Useful when IPN was missed or delayed. Calls SePay's order detail API "
        "and updates local status if payment was captured.\n\n"
        "Safe to call repeatedly (idempotent)."
    ),
    operation_id="refreshOrderStatus",
    responses={
        200: {"description": "Order status refreshed."},
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
async def refresh_order_status(
    order_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Refresh order status by querying SePay."""
    order = await billing_service.get_order_by_id(session, order_id)
    if order is None or order.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    return await billing_service.refresh_order_status(session, order)


# ---------------------------------------------------------------------------
# SePay Callbacks (UX redirect targets)
# ---------------------------------------------------------------------------


@router.get(
    "/sepay/callback/success",
    summary="SePay success callback",
    description=(
        "Redirect target after successful payment on SePay.\n\n"
        "**This is NOT a payment confirmation.** IPN is the source of truth. "
        "Frontend should show a 'payment processing' message and poll subscription status."
    ),
    operation_id="sepayCallbackSuccess",
)
async def sepay_callback_success(order: str | None = None):
    """SePay success redirect."""
    return {
        "status": "success",
        "message": "Payment received, processing...",
        "order": order,
    }


@router.get(
    "/sepay/callback/error",
    summary="SePay error callback",
    description="Redirect target when payment fails on SePay.",
    operation_id="sepayCallbackError",
)
async def sepay_callback_error(order: str | None = None):
    """SePay error redirect."""
    return {
        "status": "error",
        "message": "Payment failed. Please try again.",
        "order": order,
    }


@router.get(
    "/sepay/callback/cancel",
    summary="SePay cancel callback",
    description="Redirect target when user cancels payment on SePay.",
    operation_id="sepayCallbackCancel",
)
async def sepay_callback_cancel(order: str | None = None):
    """SePay cancel redirect."""
    return {"status": "cancelled", "message": "Payment cancelled.", "order": order}


# ---------------------------------------------------------------------------
# SePay IPN (Webhook)
# ---------------------------------------------------------------------------


@router.post(
    "/sepay/ipn",
    summary="SePay IPN webhook",
    description=(
        "Receives payment notifications from SePay.\n\n"
        "**Not for frontend use.** SePay calls this endpoint automatically.\n\n"
        "- Verifies `X-Secret-Key` header\n"
        "- Processes `ORDER_PAID` and `TRANSACTION_VOID` events\n"
        "- Uses `SELECT FOR UPDATE` to prevent race conditions\n"
        "- Logs every IPN to `payment_ipn_logs` for audit\n"
        "- Idempotent: duplicate IPNs are safely ignored\n"
        "- Always returns HTTP 200 to acknowledge receipt"
    ),
    operation_id="sepayIPN",
    responses={
        200: {"description": "IPN acknowledged."},
        401: {"description": "Invalid IPN secret."},
    },
)
async def sepay_ipn(
    request: Request,
    session: AsyncSession = Depends(get_session),
    x_secret_key: str | None = Header(None),
):
    """Process SePay IPN webhook."""
    settings = get_settings()

    if settings.sepay_ipn_secret and x_secret_key != settings.sepay_ipn_secret:
        raise HTTPException(status_code=401, detail="Invalid IPN secret")

    body = await request.json()
    payload = SePayIPNPayload(**body)

    await billing_service.process_ipn(session, payload)

    return {"success": True}
