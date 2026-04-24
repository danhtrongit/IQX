"""Premium subscription & SePay payment endpoints.

All premium-related routes are consolidated under ``/premium``.
"""

import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session
from app.dependencies.auth import get_current_admin, get_current_user
from app.models.user import User
from app.schemas.error import ErrorResponse
from app.schemas.premium import (
    AdminGrantRequest,
    AdminGrantResponse,
    CheckoutRequest,
    CheckoutResponse,
    CheckoutFormField,
    MyPremiumResponse,
    PaymentOrderResponse,
    PlanCreate,
    PlanResponse,
    PlanUpdate,
    SepayIpnPayload,
    SubscriptionResponse,
)
from app.services import premium as premium_service

router = APIRouter(prefix="/premium", tags=["Premium"])


# ═══════════════════════════════════════════════════════════════════
# Plans — public
# ═══════════════════════════════════════════════════════════════════


@router.get(
    "/plans",
    response_model=list[PlanResponse],
    summary="List available premium plans",
)
async def list_plans(
    session: AsyncSession = Depends(get_session),
) -> list:
    """Return all active plans for end-users."""
    return await premium_service.list_active_plans(session)


# ═══════════════════════════════════════════════════════════════════
# Plans — admin
# ═══════════════════════════════════════════════════════════════════


@router.post(
    "/plans",
    response_model=PlanResponse,
    status_code=201,
    summary="Create a premium plan (admin)",
    responses={
        403: {"model": ErrorResponse, "description": "Not an admin."},
        409: {"model": ErrorResponse, "description": "Plan code already exists."},
    },
)
async def create_plan(
    body: PlanCreate,
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin: create a new premium plan."""
    existing = await premium_service.get_plan_by_code(session, body.code)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Plan code '{body.code}' already exists",
        )
    return await premium_service.create_plan(session, body.model_dump())


@router.patch(
    "/plans/{plan_id}",
    response_model=PlanResponse,
    summary="Update a premium plan (admin)",
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
async def update_plan(
    plan_id: uuid.UUID,
    body: PlanUpdate,
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin: update plan fields (PATCH semantics)."""
    plan = await premium_service.get_plan_by_id(session, plan_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
        )
    return await premium_service.update_plan(
        session, plan, body.model_dump(exclude_unset=True)
    )


# ═══════════════════════════════════════════════════════════════════
# My premium status
# ═══════════════════════════════════════════════════════════════════


@router.get(
    "/me",
    response_model=MyPremiumResponse,
    summary="Get my subscription & pending order",
    responses={401: {"model": ErrorResponse}},
)
async def get_my_premium(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return the current user's subscription and latest pending order."""
    from datetime import UTC, datetime

    sub = await premium_service.get_active_subscription(session, current_user.id)
    pending = await premium_service.get_latest_pending_order(session, current_user.id)
    now = datetime.now(UTC)

    is_premium = bool(sub and sub.current_period_end > now)

    # Eagerly load plan for subscription response
    plan_obj = None
    if sub:
        plan_obj = await premium_service.get_plan_by_id(session, sub.plan_id)

    sub_resp = None
    if sub:
        sub_dict = {
            "id": sub.id,
            "user_id": sub.user_id,
            "plan_id": sub.plan_id,
            "status": sub.status,
            "current_period_start": sub.current_period_start,
            "current_period_end": sub.current_period_end,
            "source": sub.source,
            "last_payment_order_id": sub.last_payment_order_id,
            "created_at": sub.created_at,
            "updated_at": sub.updated_at,
            "plan": plan_obj,
        }
        sub_resp = SubscriptionResponse.model_validate(sub_dict)

    return {
        "subscription": sub_resp,
        "is_premium": is_premium,
        "pending_order": pending,
    }


# ═══════════════════════════════════════════════════════════════════
# Checkout
# ═══════════════════════════════════════════════════════════════════


@router.post(
    "/checkout",
    response_model=CheckoutResponse,
    summary="Create a SePay checkout order",
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse, "description": "Plan not found or inactive."},
    },
)
async def checkout(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a pending payment order and return SePay form fields."""
    plan = await premium_service.get_plan_by_id(session, body.plan_id)
    if plan is None or not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found or inactive",
        )

    order, form_action, fields = await premium_service.create_checkout(
        session,
        user_id=current_user.id,
        plan=plan,
        payment_method=body.payment_method,
    )

    return CheckoutResponse(
        form_action=form_action,
        method="POST",
        fields=[CheckoutFormField(**f) for f in fields],
        order_id=order.id,
        invoice_number=order.invoice_number,
    )


# ═══════════════════════════════════════════════════════════════════
# SePay IPN webhook
# ═══════════════════════════════════════════════════════════════════


@router.post(
    "/sepay/ipn",
    summary="SePay IPN callback (public)",
    responses={
        200: {"description": "Notification acknowledged."},
        401: {"description": "Invalid IPN secret key."},
    },
)
async def sepay_ipn(
    payload: SepayIpnPayload,
    x_secret_key: str | None = Header(default=None, alias="X-Secret-Key"),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Receive and process SePay IPN notifications.

    Authentication via ``X-Secret-Key`` header.
    """
    settings = get_settings()
    if not x_secret_key or x_secret_key != settings.sepay_ipn_secret_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid IPN secret key",
        )

    raw = payload.model_dump()

    notification_type = raw.get("notification_type", "")

    if notification_type == "ORDER_PAID":
        message, _ = await premium_service.process_ipn_order_paid(session, raw)
        return {"status": "ok", "message": message}

    # Log unsupported notification types but still return 200
    from app.models.premium import SubscriptionEvent

    event = SubscriptionEvent(
        user_id=uuid.UUID(int=0),
        event_type="ipn_unknown",
        status="skipped",
        note=f"Unsupported notification_type: {notification_type}",
        raw_payload=raw,
    )
    session.add(event)
    return {"status": "ok", "message": f"Ignored notification_type={notification_type}"}


# ═══════════════════════════════════════════════════════════════════
# Admin: manual grant / extend
# ═══════════════════════════════════════════════════════════════════


@router.post(
    "/admin/users/{user_id}/grant",
    response_model=AdminGrantResponse,
    summary="Admin grant/extend premium for a user",
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
async def admin_grant_premium(
    user_id: uuid.UUID,
    body: AdminGrantRequest,
    admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin: manually grant or extend a user's premium subscription."""
    from app.services.user import get_user_by_id

    target_user = await get_user_by_id(session, user_id)
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Resolve plan
    plan = None
    if body.plan_id:
        plan = await premium_service.get_plan_by_id(session, body.plan_id)
    elif body.plan_code:
        plan = await premium_service.get_plan_by_code(session, body.plan_code)

    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
        )

    sub, event = await premium_service.extend_subscription(
        session,
        user_id=user_id,
        plan=plan,
        source="admin",
        duration_days_override=body.duration_days_override,
        actor_user_id=admin.id,
        note=body.note,
    )

    sub_resp = SubscriptionResponse.model_validate(sub, from_attributes=True)

    return AdminGrantResponse(
        subscription=sub_resp,
        event_type=event.event_type,
        previous_period_end=event.previous_period_end,
        new_period_end=event.new_period_end,
    )
