"""Premium & payment request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Plan schemas
# ---------------------------------------------------------------------------


class PlanCreate(BaseModel):
    """Admin payload to create a premium plan."""

    code: str = Field(
        ..., min_length=1, max_length=50,
        description="Unique plan code (e.g. 'monthly', 'yearly').",
    )
    name: str = Field(
        ..., min_length=1, max_length=255,
        description="Display name for the plan.",
    )
    description: str | None = Field(default=None, description="Plan description.")
    price_vnd: int = Field(..., gt=0, description="Price in VND.")
    duration_days: int = Field(..., gt=0, description="Subscription duration in days.")
    is_active: bool = Field(default=True, description="Whether the plan is available for purchase.")
    sort_order: int = Field(default=0, description="Display order (lower = first).")
    features: dict | None = Field(default=None, description="Feature flags or metadata as JSON.")


class PlanUpdate(BaseModel):
    """Admin payload to update a premium plan (PATCH semantics)."""

    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None)
    price_vnd: int | None = Field(default=None, gt=0)
    duration_days: int | None = Field(default=None, gt=0)
    is_active: bool | None = Field(default=None)
    sort_order: int | None = Field(default=None)
    features: dict | None = Field(default=None)


class PlanResponse(BaseModel):
    """Public plan representation."""

    id: uuid.UUID
    code: str
    name: str
    description: str | None = None
    price_vnd: int
    duration_days: int
    is_active: bool
    sort_order: int
    features: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Subscription schemas
# ---------------------------------------------------------------------------


class SubscriptionResponse(BaseModel):
    """User subscription details."""

    id: uuid.UUID
    user_id: uuid.UUID
    plan_id: uuid.UUID
    status: str
    current_period_start: datetime
    current_period_end: datetime
    source: str
    last_payment_order_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    # Populated from join
    plan: PlanResponse | None = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Payment order schemas
# ---------------------------------------------------------------------------


class PaymentOrderResponse(BaseModel):
    """Payment order summary."""

    id: uuid.UUID
    invoice_number: str
    amount_vnd: int
    currency: str
    status: str
    provider: str
    paid_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Checkout schemas
# ---------------------------------------------------------------------------


class CheckoutRequest(BaseModel):
    """User request to initiate a SePay checkout."""

    plan_id: uuid.UUID = Field(..., description="ID of the plan to purchase.")
    payment_method: str = Field(
        default="BANK_TRANSFER",
        description="Payment method: BANK_TRANSFER, CARD, NAPAS_BANK_TRANSFER.",
    )


class CheckoutFormField(BaseModel):
    """A single hidden input field for the checkout form."""

    name: str
    value: str


class CheckoutResponse(BaseModel):
    """Response containing form data for auto-submit to SePay."""

    form_action: str = Field(..., description="SePay checkout URL to POST to.")
    method: str = Field(default="POST")
    fields: list[CheckoutFormField]
    order_id: uuid.UUID
    invoice_number: str


# ---------------------------------------------------------------------------
# IPN schema
# ---------------------------------------------------------------------------


class SepayIpnPayload(BaseModel):
    """Inbound IPN payload from SePay (flexible, extra fields ignored)."""

    notification_type: str | None = None
    order: dict | None = None
    transaction: dict | None = None

    model_config = {"extra": "allow"}


# ---------------------------------------------------------------------------
# Admin grant schemas
# ---------------------------------------------------------------------------


class AdminGrantRequest(BaseModel):
    """Admin payload to manually grant/extend premium for a user."""

    plan_id: uuid.UUID | None = Field(default=None, description="Plan to grant. Use this OR plan_code.")
    plan_code: str | None = Field(default=None, description="Plan code to grant. Use this OR plan_id.")
    duration_days_override: int | None = Field(
        default=None, gt=0,
        description="Override plan duration. If omitted, uses plan's default.",
    )
    note: str | None = Field(default=None, description="Admin note for audit trail.")


class AdminGrantResponse(BaseModel):
    """Response after admin grant/extend."""

    subscription: SubscriptionResponse
    event_type: str
    previous_period_end: datetime | None = None
    new_period_end: datetime


# ---------------------------------------------------------------------------
# Premium status (for /auth/me enrichment)
# ---------------------------------------------------------------------------


class PremiumStatus(BaseModel):
    """Premium status fields added to /auth/me."""

    is_premium: bool = False
    current_plan: PlanResponse | None = None
    subscription_status: str | None = None
    subscription_expires_at: datetime | None = None
    entitlements: dict | None = None


# ---------------------------------------------------------------------------
# My premium response
# ---------------------------------------------------------------------------


class MyPremiumResponse(BaseModel):
    """Response for GET /premium/me."""

    subscription: SubscriptionResponse | None = None
    is_premium: bool = False
    pending_order: PaymentOrderResponse | None = None
