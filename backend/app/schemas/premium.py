"""Premium subscription Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

# ── Plan schemas ─────────────────────────────────────


class PlanCreate(BaseModel):
    """Admin creates a new premium plan."""

    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    price_vnd: int = Field(..., gt=0)
    duration_days: int = Field(..., gt=0)
    is_active: bool = True
    sort_order: int = 0


class PlanUpdate(BaseModel):
    """Admin updates a plan (all fields optional)."""

    name: str | None = None
    description: str | None = None
    price_vnd: int | None = Field(None, gt=0)
    duration_days: int | None = Field(None, gt=0)
    is_active: bool | None = None
    sort_order: int | None = None


class PlanResponse(BaseModel):
    """Plan data returned to clients."""

    id: uuid.UUID
    code: str
    name: str
    description: str | None
    price_vnd: int
    duration_days: int
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Subscription schemas ─────────────────────────────


class SubscriptionResponse(BaseModel):
    """User's current premium subscription status."""

    is_premium: bool
    status: str | None
    current_plan: PlanResponse | None = None
    current_period_start: datetime | None
    current_period_end: datetime | None

    model_config = {"from_attributes": True}


# ── Checkout schemas ─────────────────────────────────


class CheckoutRequest(BaseModel):
    """User requests a checkout form for a plan."""

    plan_id: uuid.UUID


class CheckoutFormField(BaseModel):
    """A single hidden form field."""

    name: str
    value: str


class CheckoutResponse(BaseModel):
    """Checkout form data for frontend to submit to SePay."""

    action: str
    method: str = "POST"
    fields: list[CheckoutFormField]
    invoice_number: str
    order_id: uuid.UUID


# ── IPN schemas ──────────────────────────────────────


class IPNOrderData(BaseModel):
    """Order section of SePay IPN payload."""

    id: str | None = None
    order_id: str | None = None
    order_status: str | None = None
    order_currency: str | None = None
    order_amount: str | None = None
    order_invoice_number: str | None = None
    order_description: str | None = None
    custom_data: list[str] | None = None
    user_agent: str | None = None
    ip_address: str | None = None


class IPNTransactionData(BaseModel):
    """Transaction section of SePay IPN payload."""

    id: str | None = None
    payment_method: str | None = None
    transaction_id: str | None = None
    transaction_type: str | None = None
    transaction_date: str | None = None
    transaction_status: str | None = None
    transaction_amount: str | None = None
    transaction_currency: str | None = None
    authentication_status: str | None = None
    card_number: str | None = None
    card_holder_name: str | None = None
    card_expiry: str | None = None
    card_funding_method: str | None = None
    card_brand: str | None = None


class IPNCustomerData(BaseModel):
    """Customer section of SePay IPN payload."""

    id: str | None = None
    customer_id: str | None = None


class IPNPayload(BaseModel):
    """Full SePay IPN request body."""

    timestamp: int | None = None
    notification_type: str | None = None
    order: IPNOrderData | None = None
    transaction: IPNTransactionData | None = None
    customer: IPNCustomerData | None = None


# ── Admin grant ──────────────────────────────────────


class AdminGrantRequest(BaseModel):
    """Admin manually grants premium to a user."""

    plan_id: uuid.UUID
    note: str | None = None


# ── Payment order response ───────────────────────────


class PaymentOrderResponse(BaseModel):
    """Payment order data."""

    id: uuid.UUID
    invoice_number: str
    amount_vnd: int
    currency: str
    status: str
    paid_at: datetime | None
    grant_type: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
