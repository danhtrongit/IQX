"""Admin billing endpoints: subscriptions and payment orders."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.dependencies.auth import get_current_admin
from app.models.user import User
from app.schemas.billing import (
    PaymentOrderListResponse,
    PaymentOrderResponse,
    SubscriptionListResponse,
    SubscriptionResponse,
)
from app.schemas.error import ErrorResponse
from app.services import billing as billing_service
from app.services.subscription import get_subscription_by_id, list_subscriptions

router = APIRouter(prefix="/admin", tags=["Admin Billing"])


@router.get(
    "/subscriptions",
    response_model=SubscriptionListResponse,
    summary="List all subscriptions (admin)",
    description="Return paginated list of all subscriptions. **Requires admin.**",
    operation_id="adminListSubscriptions",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
async def admin_list_subscriptions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin list subscriptions."""
    subs, total = await list_subscriptions(session, skip=skip, limit=limit)
    return {"items": subs, "total": total}


@router.get(
    "/subscriptions/{subscription_id}",
    response_model=SubscriptionResponse,
    summary="Get subscription (admin)",
    description="Get subscription details by UUID. **Requires admin.**",
    operation_id="adminGetSubscription",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
async def admin_get_subscription(
    subscription_id: uuid.UUID,
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin get subscription."""
    sub = await get_subscription_by_id(session, subscription_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return sub


@router.get(
    "/payment-orders",
    response_model=PaymentOrderListResponse,
    summary="List all payment orders (admin)",
    description="Return paginated list of all payment orders. **Requires admin.**",
    operation_id="adminListPaymentOrders",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
async def admin_list_payment_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin list payment orders."""
    orders, total = await billing_service.list_all_orders(
        session, skip=skip, limit=limit
    )
    return {"items": orders, "total": total}


@router.get(
    "/payment-orders/{order_id}",
    response_model=PaymentOrderResponse,
    summary="Get payment order (admin)",
    description="Get payment order details by UUID. **Requires admin.**",
    operation_id="adminGetPaymentOrder",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
async def admin_get_payment_order(
    order_id: uuid.UUID,
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin get payment order."""
    order = await billing_service.get_order_by_id(session, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Payment order not found")
    return order
