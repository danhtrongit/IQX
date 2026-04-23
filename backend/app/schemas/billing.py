"""Billing & payment schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.plan import PlanResponse

_SUB_STATUS_DESC = "Subscription status: `pending`, `active`, `expired`, `cancelled`."
_PAY_STATUS_DESC = "Payment order status: `pending`, `paid`, `failed`, `cancelled`, `expired`, `voided`."


# ---------------------------------------------------------------------------
# Subscription
# ---------------------------------------------------------------------------


class SubscriptionResponse(BaseModel):
    """User subscription representation."""

    id: uuid.UUID
    user_id: uuid.UUID
    plan_id: uuid.UUID
    plan: PlanResponse | None = Field(None, description="Resolved plan details.")
    status: str = Field(..., description=_SUB_STATUS_DESC, examples=["active"])
    started_at: datetime | None = None
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False
    ended_at: datetime | None = None
    last_payment_order_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubscriptionListResponse(BaseModel):
    """Paginated subscription list (admin)."""

    items: list[SubscriptionResponse]
    total: int


# ---------------------------------------------------------------------------
# Payment order
# ---------------------------------------------------------------------------


class PaymentOrderResponse(BaseModel):
    """Payment order representation."""

    id: uuid.UUID
    user_id: uuid.UUID
    plan_id: uuid.UUID
    plan: PlanResponse | None = None
    provider: str = Field(..., examples=["sepay"])
    invoice_number: str = Field(..., examples=["IQX-20260423-ABC123"])
    provider_order_id: str | None = None
    provider_transaction_id: str | None = None
    amount_vnd: int = Field(..., examples=[299000])
    currency: str = Field(..., examples=["VND"])
    status: str = Field(..., description=_PAY_STATUS_DESC, examples=["pending"])
    payment_method: str | None = Field(
        None,
        description=(
            "Payment method used. Values: `BANK_TRANSFER`, "
            "`NAPAS_BANK_TRANSFER`, `CARD`."
        ),
        examples=["BANK_TRANSFER"],
    )

    # Billing snapshot (frozen at purchase time)
    plan_snapshot_code: str | None = Field(
        None, description="Plan code at time of purchase."
    )
    plan_snapshot_name: str | None = Field(
        None, description="Plan name at time of purchase."
    )
    plan_snapshot_price: int | None = Field(
        None, description="Price in VND at time of purchase."
    )
    plan_snapshot_duration: int | None = Field(
        None, description="Duration in months at time of purchase."
    )
    plan_snapshot_features: dict | None = Field(
        None, description="Feature flags at time of purchase."
    )

    paid_at: datetime | None = None
    expired_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaymentOrderListResponse(BaseModel):
    """Paginated payment order list."""

    items: list[PaymentOrderResponse]
    total: int


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------


class CheckoutRequest(BaseModel):
    """Request body to create a checkout payment order."""

    plan_id: uuid.UUID = Field(
        ...,
        description="UUID of the plan to purchase/renew.",
        examples=["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
    )
    payment_method: str | None = Field(
        None,
        description=(
            "Payment method: `BANK_TRANSFER`, `NAPAS_BANK_TRANSFER`, `CARD`. "
            "If omitted, user chooses on SePay page."
        ),
        examples=["BANK_TRANSFER"],
    )


class CheckoutFormField(BaseModel):
    """A single hidden form field for SePay checkout."""

    name: str = Field(..., description="HTML input name attribute.")
    value: str = Field(..., description="HTML input value attribute.")


class CheckoutData(BaseModel):
    """SePay checkout form data returned inside CheckoutResponse."""

    action_url: str = Field(
        ..., description="URL to POST the form to (SePay checkout init endpoint)."
    )
    method: str = Field("POST", description="HTTP method — always POST.")
    form_fields: list[CheckoutFormField] = Field(
        ...,
        description=(
            "Ordered list of hidden form fields. Frontend must render them "
            "in this exact order and auto-submit the form."
        ),
    )


class CheckoutResponse(BaseModel):
    """Response from POST /billing/checkout.

    Contains everything frontend needs to build and submit the SePay form.
    """

    payment_order_id: uuid.UUID
    invoice_number: str
    status: str = Field(..., examples=["pending"])
    amount_vnd: int
    checkout: CheckoutData


# ---------------------------------------------------------------------------
# Entitlements
# ---------------------------------------------------------------------------


class EntitlementResponse(BaseModel):
    """Current user's premium entitlements derived from their active subscription."""

    is_premium: bool = Field(
        ..., description="Whether the user has an active premium subscription."
    )
    plan_code: str | None = Field(
        None, description="Active plan code, if any.", examples=["premium_pro"]
    )
    plan_name: str | None = Field(None, description="Active plan display name.")
    subscription_status: str | None = Field(None, description=_SUB_STATUS_DESC)
    subscription_expires_at: datetime | None = Field(
        None, description="End of current billing period."
    )
    features: dict | None = Field(
        None, description="Feature flags from the active plan."
    )


# ---------------------------------------------------------------------------
# SePay IPN (incoming webhook payload)
# ---------------------------------------------------------------------------


class SePayIPNOrderData(BaseModel):
    """Order section of SePay IPN payload."""

    id: str | None = None
    order_id: str | None = None
    order_status: str | None = None
    order_currency: str | None = None
    order_amount: str | None = None
    order_invoice_number: str | None = None
    order_description: str | None = None
    custom_data: list | None = None

    model_config = {"extra": "allow"}


class SePayIPNTransactionData(BaseModel):
    """Transaction section of SePay IPN payload."""

    id: str | None = None
    payment_method: str | None = None
    transaction_id: str | None = None
    transaction_type: str | None = None
    transaction_date: str | None = None
    transaction_status: str | None = None
    transaction_amount: str | None = None
    transaction_currency: str | None = None

    model_config = {"extra": "allow"}


class SePayIPNPayload(BaseModel):
    """Full SePay IPN webhook payload."""

    timestamp: int | None = None
    notification_type: str = Field(
        ..., description="Event type: `ORDER_PAID`, `TRANSACTION_VOID`."
    )
    order: SePayIPNOrderData | None = None
    transaction: SePayIPNTransactionData | None = None
    customer: dict | None = None
    agreement: dict | None = None

    model_config = {"extra": "allow"}
