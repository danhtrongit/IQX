"""Admin subscription schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SubscriptionListParams(BaseModel):
    page: int = 1
    page_size: int = 20
    status: str | None = None
    plan_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    expiring_within_days: int | None = None


class AdminSubscriptionBrief(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str | None
    current_plan_id: uuid.UUID | None
    plan_name: str | None
    plan_code: str | None
    current_period_start: datetime
    current_period_end: datetime
    status: str
    cancelled_at: datetime | None
    cancel_reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminSubscriptionDetail(AdminSubscriptionBrief):
    updated_at: datetime
    cancelled_by_user_id: uuid.UUID | None


class CancelSubscriptionRequest(BaseModel):
    reason: str


class ExtendSubscriptionRequest(BaseModel):
    days: int = Field(..., gt=0)
    reason: str | None = None
