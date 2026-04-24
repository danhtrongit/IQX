"""Premium subscription models — plans, subscriptions, and payment orders."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin

# ── Enums ────────────────────────────────────────────


class SubscriptionStatus(enum.StrEnum):
    """Premium subscription status."""

    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class PaymentOrderStatus(enum.StrEnum):
    """Payment order lifecycle status."""

    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ── Models ───────────────────────────────────────────


class PremiumPlan(UUIDMixin, TimestampMixin, Base):
    """A purchasable premium plan with duration and pricing."""

    __tablename__ = "premium_plans"

    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)


class PremiumSubscription(UUIDMixin, TimestampMixin, Base):
    """Tracks a user's current premium subscription period."""

    __tablename__ = "premium_subscriptions"
    __table_args__ = (UniqueConstraint("user_id", name="uq_premium_subscriptions_user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    current_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("premium_plans.id", ondelete="SET NULL"),
        nullable=True,
    )
    current_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(
            SubscriptionStatus,
            name="subscription_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        default=SubscriptionStatus.ACTIVE,
        server_default=SubscriptionStatus.ACTIVE.value,
        nullable=False,
    )


class PremiumPaymentOrder(UUIDMixin, TimestampMixin, Base):
    """Records each payment attempt/order for a premium plan purchase."""

    __tablename__ = "premium_payment_orders"

    invoice_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("premium_plans.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="VND", server_default="VND", nullable=False)
    status: Mapped[PaymentOrderStatus] = mapped_column(
        Enum(
            PaymentOrderStatus,
            name="payment_order_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        default=PaymentOrderStatus.PENDING,
        server_default=PaymentOrderStatus.PENDING.value,
        nullable=False,
    )
    sepay_transaction_id: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    raw_ipn: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Grant audit: who or what activated this order
    grant_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "payment" or "admin_grant"
    granted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    grant_note: Mapped[str | None] = mapped_column(Text, nullable=True)
