"""Pydantic schemas for admin Virtual Trading endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class FreezeAccountRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1000)


class UnfreezeAccountRequest(BaseModel):
    reason: str | None = Field(None, max_length=1000)


class CashAdjustRequest(BaseModel):
    amount_vnd: int = Field(..., description="Có thể âm hoặc dương, khác 0")
    reason: str = Field(..., min_length=1, max_length=1000)


class VTAccountAdminResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    initial_cash_vnd: int
    cash_available_vnd: int
    cash_reserved_vnd: int
    cash_pending_vnd: int
    activated_at: datetime | None
    frozen_at: datetime | None
    frozen_by_user_id: uuid.UUID | None
    freeze_reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CashAdjustResponse(BaseModel):
    account: VTAccountAdminResponse
    ledger_id: uuid.UUID
    new_cash_available_vnd: int
