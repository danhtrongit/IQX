"""Audit context dependency — captures admin identity + request metadata.

Use:
    @router.post("/admin/...")
    async def my_handler(admin: AdminUser, audit: AuditCtx, db: DBSession): ...
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from app.api.deps import AdminUser
from app.models.user import User


@dataclass
class AuditContext:
    """Per-request audit metadata. Passed into service methods that record audits."""

    admin_id: uuid.UUID
    ip: str | None
    user_agent: str | None
    request_id: str


async def get_audit_context(
    request: Request,
    admin: AdminUser,
) -> AuditContext:
    """Build an AuditContext from the current request + the authenticated admin."""
    return AuditContext(
        admin_id=admin.id,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        request_id=request.headers.get("x-request-id") or str(uuid.uuid4()),
    )


AuditCtx = Annotated[AuditContext, Depends(get_audit_context)]
