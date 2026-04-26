"""Virtual Trading — admin-specific schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class AdminAccountResponse(BaseModel):
    """Admin view of a virtual trading account."""

    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str | None = None
    user_name: str | None = None
    status: str
    initial_cash_vnd: int
    cash_available_vnd: int
    cash_reserved_vnd: int
    cash_pending_vnd: int
    activated_at: datetime
    reset_at: datetime | None = None

    model_config = {"from_attributes": True}


class ResetResponse(BaseModel):
    """Result of account reset."""

    accounts_reset: int
    message: str
