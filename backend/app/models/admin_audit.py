"""Admin audit log model — records every admin mutation."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AdminAuditLog(Base):
    """One row per admin mutation. Append-only (no UPDATE/DELETE in app code)."""

    __tablename__ = "admin_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )

    # Admin who performed the action. NULL for system actions (e.g. expiry sweep).
    admin_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Action namespace: "user.update", "premium.plan.create",
    # "premium.subscription.cancel", "vt.account.freeze", "system.expiry_sweep", ...
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)

    # Optional: the kind of entity touched ("user", "subscription", "plan",
    # "payment_order", "vt_account", ...). NULL for system-wide actions.
    target_entity: Mapped[str | None] = mapped_column(String(60), nullable=True)

    # Optional: the entity's primary key (stringified — supports UUIDs, ints, codes).
    target_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Pre/post snapshots. Only the keys that changed.
    # Use sa.JSON here so tests (SQLite) work; migration uses JSONB on Postgres.
    payload_before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    payload_after: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Operator-supplied free-text reason (mandatory for some destructive ops).
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # Request-derived context.
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(40), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    __table_args__ = (
        Index("ix_admin_audit_log_admin_created", "admin_user_id", "created_at"),
        Index("ix_admin_audit_log_entity_target", "target_entity", "target_id"),
        Index("ix_admin_audit_log_action_created", "action", "created_at"),
    )
