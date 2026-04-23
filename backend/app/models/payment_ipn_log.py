"""Payment IPN log model — immutable audit trail for all incoming webhooks."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDMixin


class PaymentIPNLog(UUIDMixin, Base):
    """Immutable audit log of every IPN/webhook received from SePay.

    One row per incoming IPN call regardless of outcome. Never updated or deleted.
    Used for debugging, compliance, and reconciliation.
    """

    __tablename__ = "payment_ipn_logs"

    # Link to payment order if found (nullable — IPN may arrive for unknown invoice)
    payment_order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payment_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    notification_type: Mapped[str] = mapped_column(String(50), nullable=False)
    invoice_number: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )

    # Full raw payload as received
    raw_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Processing result
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="received"
    )  # received | processed | ignored | error
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
