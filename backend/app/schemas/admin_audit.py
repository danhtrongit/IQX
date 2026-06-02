"""Admin audit log schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class AdminAuditLogResponse(BaseModel):
    id: uuid.UUID
    admin_user_id: uuid.UUID | None
    admin_email: str | None
    action: str
    target_entity: str | None
    target_id: str | None
    payload_before: dict | None
    payload_after: dict | None
    note: str | None
    ip: str | None
    user_agent: str | None
    request_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListParams(BaseModel):
    page: int = 1
    page_size: int = 50
    admin_user_id: uuid.UUID | None = None
    action_prefix: str | None = None
    target_entity: str | None = None
    target_id: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
