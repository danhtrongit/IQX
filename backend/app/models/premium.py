"""Premium subscription and payment database models."""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class Plan(UUIDMixin, TimestampMixin, Base):
    """Premium subscription plan definition."""

    __tablename__ = "plans"

    code: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    features: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class Subscription(UUIDMixin, TimestampMixin, Base):
    """User premium subscription record."""

    __tablename__ = "subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plans.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # active | expired | cancelled
    status: Mapped[str] = mapped_column(String(20), default="active")
    current_period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    current_period_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # sepay | admin
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    last_payment_order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payment_orders.id", ondelete="SET NULL"),
        nullable=True,
    )


class PaymentOrder(UUIDMixin, TimestampMixin, Base):
    """Payment order tracking for SePay transactions."""

    __tablename__ = "payment_orders"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plans.id", ondelete="RESTRICT"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(20), default="sepay")
    invoice_number: Mapped[str] = mapped_column(
        String(100), unique=True, index=True, nullable=False
    )
    amount_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="VND")
    # pending | paid | failed | cancelled | expired
    status: Mapped[str] = mapped_column(String(20), default="pending")
    checkout_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    provider_order_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    provider_transaction_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    raw_provider_payload: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )


class SubscriptionEvent(UUIDMixin, Base):
    """Audit log for subscription changes (IPN callbacks, admin grants)."""

    __tablename__ = "subscription_events"

    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    # ipn_payment | admin_grant | admin_extend | status_change
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # processed | error | skipped
    status: Mapped[str] = mapped_column(String(20), default="processed")
    previous_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    new_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
