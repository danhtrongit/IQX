"""Admin audit logging service.

Endpoints construct `AuditContext` via the `AuditCtx` dep (deps_audit) and pass
it (along with the DB session) into `record()` calls AFTER a mutation has been
applied to the session but BEFORE the request commits. The outer transaction
in `get_db` owns the commit, so either the audit row + the mutation both land,
or neither does.

Do NOT swallow exceptions inside record(). If recording fails we want the whole
request to fail loudly.
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime
from typing import Any, Mapping

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps_audit import AuditContext
from app.models.admin_audit import AdminAuditLog


# ── Diff helper ────────────────────────────────────────────────────────────


def diff_dict(
    before: Mapping[str, Any] | None,
    after: Mapping[str, Any] | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Return (before_subset, after_subset) containing only keys that changed.

    Returns (None, None) if either side is empty or nothing changed.
    """
    if not before and not after:
        return None, None
    before = dict(before or {})
    after = dict(after or {})
    all_keys = set(before) | set(after)
    b_out: dict[str, Any] = {}
    a_out: dict[str, Any] = {}
    for k in all_keys:
        if before.get(k) != after.get(k):
            b_out[k] = before.get(k)
            a_out[k] = after.get(k)
    if not b_out and not a_out:
        return None, None
    return b_out, a_out


# ── Paginated result dataclass ─────────────────────────────────────────────


class AuditLogPage:
    """Simple paginated container for raw AdminAuditLog ORM instances.

    Intentionally not a Pydantic model — the endpoint layer (Task 10) will
    convert items to response schemas before serialisation.
    """

    __slots__ = ("items", "total", "page", "page_size", "total_pages")

    def __init__(
        self,
        *,
        items: list[AdminAuditLog],
        total: int,
        page: int,
        page_size: int,
        total_pages: int,
    ) -> None:
        self.items = items
        self.total = total
        self.page = page
        self.page_size = page_size
        self.total_pages = total_pages


# ── Service ────────────────────────────────────────────────────────────────


class AdminAuditService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record(
        self,
        ctx: AuditContext | None,
        *,
        action: str,
        target_entity: str | None = None,
        target_id: str | None = None,
        before: Mapping[str, Any] | None = None,
        after: Mapping[str, Any] | None = None,
        note: str | None = None,
    ) -> AdminAuditLog:
        """Insert an audit row. No commit — caller's request transaction owns it.

        ctx may be None for system actions (e.g. expiry sweep) — those rows have
        admin_user_id NULL.
        """
        row = AdminAuditLog(
            admin_user_id=ctx.admin_id if ctx else None,
            action=action,
            target_entity=target_entity,
            target_id=target_id,
            payload_before=dict(before) if before else None,
            payload_after=dict(after) if after else None,
            note=note,
            ip=ctx.ip if ctx else None,
            user_agent=ctx.user_agent if ctx else None,
            request_id=ctx.request_id if ctx else None,
        )
        self._session.add(row)
        await self._session.flush()  # populate row.id, but no commit
        await self._session.refresh(row)
        return row

    # ── List with filters ─────────────────────────────────────────────────

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        admin_user_id: uuid.UUID | None = None,
        action_prefix: str | None = None,
        target_entity: str | None = None,
        target_id: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> AuditLogPage:
        conditions = []
        if admin_user_id is not None:
            conditions.append(AdminAuditLog.admin_user_id == admin_user_id)
        if action_prefix:
            conditions.append(AdminAuditLog.action.like(f"{action_prefix}%"))
        if target_entity is not None:
            conditions.append(AdminAuditLog.target_entity == target_entity)
        if target_id is not None:
            conditions.append(AdminAuditLog.target_id == target_id)
        if date_from is not None:
            conditions.append(AdminAuditLog.created_at >= date_from)
        if date_to is not None:
            conditions.append(AdminAuditLog.created_at < date_to)

        where = and_(*conditions) if conditions else None

        from sqlalchemy import func as _func

        count_stmt = select(_func.count()).select_from(AdminAuditLog)
        if where is not None:
            count_stmt = count_stmt.where(where)
        total = (await self._session.execute(count_stmt)).scalar_one()

        items_stmt = (
            select(AdminAuditLog)
            .order_by(AdminAuditLog.created_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        if where is not None:
            items_stmt = items_stmt.where(where)
        items = list((await self._session.execute(items_stmt)).scalars().all())

        total_pages = math.ceil(total / page_size) if total > 0 else 0
        return AuditLogPage(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
