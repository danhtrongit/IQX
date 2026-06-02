"""Admin IPN log schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class SePayIPNLogResponse(BaseModel):
    id: uuid.UUID
    received_at: datetime
    secret_key_valid: bool
    result_status: str | None
    matched_order_id: uuid.UUID | None
    sepay_transaction_id: str | None
    error_message: str | None
    raw_body: dict | None = None
    raw_headers: dict | None = None

    model_config = {"from_attributes": True}


class IPNRetryResponse(BaseModel):
    status: str
    log_id: uuid.UUID
    message: str
