"""SePay IPN raw log model — append-only audit trail of every IPN callback."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SePayIPNLog(Base):
    """Raw SePay IPN callback record. Insert-once at /sepay/ipn endpoint."""

    __tablename__ = "sepay_ipn_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # X-Secret-Key header validation result.
    secret_key_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, index=True)

    # Raw body + headers (headers redacted: X-Secret-Key replaced with "***").
    raw_body: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    raw_headers: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Result of processing (e.g. "processed", "ignored", "already_processed",
    # "order_not_found", "amount_mismatch", "secret_invalid").
    result_status: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)

    # If the IPN matched a local order, store its id.
    matched_order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("premium_payment_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # SePay's own transaction_id, if present in payload.
    sepay_transaction_id: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)

    # Free-text error message when processing failed.
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_sepay_ipn_logs_received_status", "received_at", "result_status"),
    )
