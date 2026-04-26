"""Virtual Trading — account schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class AccountResponse(BaseModel):
    """Virtual trading account summary."""

    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    initial_cash_vnd: int
    cash_available_vnd: int
    cash_reserved_vnd: int
    cash_pending_vnd: int
    total_cash_vnd: int = 0  # computed: available + reserved + pending
    activated_at: datetime
    reset_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
