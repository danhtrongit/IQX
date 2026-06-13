"""Admin user management schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator


# ── 360 view ──────────────────────────────────────────────────────────────


class PlanBrief(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    price_vnd: int
    duration_days: int


class SubscriptionBrief(BaseModel):
    id: uuid.UUID
    status: str
    plan: PlanBrief | None
    current_period_start: datetime
    current_period_end: datetime
    is_trial: bool
    cancelled_at: datetime | None = None
    cancelled_by_user_id: uuid.UUID | None = None
    cancel_reason: str | None = None

    model_config = {"from_attributes": True}


class PaymentOrderBrief(BaseModel):
    id: uuid.UUID
    invoice_number: str
    amount_vnd: int
    status: str
    grant_type: str | None
    plan_code: str | None
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class VTAccountBrief(BaseModel):
    id: uuid.UUID
    status: str
    initial_cash_vnd: int
    cash_available_vnd: int
    cash_reserved_vnd: int
    cash_pending_vnd: int
    activated_at: datetime | None
    frozen_at: datetime | None = None
    freeze_reason: str | None = None

    model_config = {"from_attributes": True}


class VTOrderBrief(BaseModel):
    id: uuid.UUID
    symbol: str
    side: str
    status: str
    quantity: int
    price_vnd: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginHistoryRow(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    email: str
    success: bool
    failure_reason: str | None
    ip: str | None
    user_agent: str | None
    login_at: datetime

    model_config = {"from_attributes": True}


class UserBriefForAdmin(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    phone_number: str | None
    role: str
    status: str
    is_email_verified: bool
    last_login_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class User360Response(BaseModel):
    user: UserBriefForAdmin
    subscription: SubscriptionBrief | None
    subscription_history: list[SubscriptionBrief]
    payment_history: list[PaymentOrderBrief]
    trial_used: bool
    vt_account: VTAccountBrief | None
    vt_recent_orders: list[VTOrderBrief]
    login_history: list[LoginHistoryRow]


# ── Bulk ──────────────────────────────────────────────────────────────────


class BulkOp(StrEnum):
    SET_ROLE = "set_role"
    SET_STATUS = "set_status"
    SOFT_DELETE = "soft_delete"


class BulkUpdateRequest(BaseModel):
    user_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=500)
    op: BulkOp
    value: str | None = None

    @field_validator("value")
    @classmethod
    def _validate_value(cls, v, info):  # type: ignore[no-untyped-def]
        op = info.data.get("op")
        if op == BulkOp.SOFT_DELETE:
            return None  # ignore
        if not v:
            raise ValueError("`value` is required for set_role / set_status")
        return v


class BulkUpdateError(BaseModel):
    user_id: uuid.UUID
    message: str


class BulkUpdateResponse(BaseModel):
    affected: int
    skipped: list[uuid.UUID]
    errors: list[BulkUpdateError]


# ── Reset / verify ────────────────────────────────────────────────────────


class ResetPasswordResponse(BaseModel):
    temporary_password: str
    warning: str = (
        "Đã gửi liên kết đặt lại mật khẩu tới email người dùng. "
        "Mật khẩu tạm thời ở trên là phương án dự phòng — hãy chia sẻ an toàn."
    )


class ResendVerificationResponse(BaseModel):
    message: str = "Đã gửi lại email xác thực."


# ── Export ────────────────────────────────────────────────────────────────


class UserExportParams(BaseModel):
    role: str | None = None
    status: str | None = None
    search: str | None = None
    last_login_from: datetime | None = None
    last_login_to: datetime | None = None
