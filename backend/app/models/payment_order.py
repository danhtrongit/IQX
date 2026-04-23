"""Payment order model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class PaymentOrder(UUIDMixin, TimestampMixin, Base):
    """A single payment transaction record linked to a subscription plan."""

    __tablename__ = "payment_orders"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False
    )

    provider: Mapped[str] = mapped_column(String(20), nullable=False, default="sepay")
    invoice_number: Mapped[str] = mapped_column(
        String(100), unique=True, index=True, nullable=False
    )

    # SePay identifiers (populated after checkout / IPN)
    provider_order_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    provider_transaction_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )

    amount_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="VND")

    # pending | paid | failed | cancelled | expired | voided
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # ---- Billing snapshot: frozen at time of purchase ----
    # Prevents plan edits from corrupting payment history
    plan_snapshot_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    plan_snapshot_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    plan_snapshot_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    plan_snapshot_duration: Mapped[int | None] = mapped_column(Integer, nullable=True)
    plan_snapshot_features: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Raw data for debugging
    checkout_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    provider_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user = relationship("User", lazy="selectin")
    plan = relationship("Plan", lazy="selectin")
