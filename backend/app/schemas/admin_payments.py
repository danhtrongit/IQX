"""Admin payment order schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class PaymentOrderListParams(BaseModel):
    page: int = 1
    page_size: int = 20
    status: str | None = None
    grant_type: str | None = None
    user_id: uuid.UUID | None = None
    plan_id: uuid.UUID | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    search: str | None = None  # matches invoice_number or user email prefix


class AdminPaymentOrderBrief(BaseModel):
    id: uuid.UUID
    invoice_number: str
    amount_vnd: int
    currency: str
    status: str
    grant_type: str | None
    paid_at: datetime | None
    created_at: datetime
    # Joined fields
    plan_id: uuid.UUID
    plan_name: str | None
    plan_code: str | None
    user_id: uuid.UUID
    user_email: str | None
    ipn_log_count: int

    model_config = {"from_attributes": True}


class AdminPaymentOrderDetail(BaseModel):
    id: uuid.UUID
    invoice_number: str
    amount_vnd: int
    currency: str
    status: str
    grant_type: str | None
    grant_note: str | None
    paid_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # Plan
    plan_id: uuid.UUID
    plan_name: str | None
    plan_code: str | None
    plan_price_vnd: int | None
    # User
    user_id: uuid.UUID
    user_email: str | None
    # Linked subscription
    subscription_id: uuid.UUID | None
    subscription_status: str | None
    subscription_period_end: datetime | None
    # IPN logs
    ipn_logs: list[dict]

    model_config = {"from_attributes": True}


class RefundRequest(BaseModel):
    reason: str


class ReconcileRequest(BaseModel):
    note: str | None = None
