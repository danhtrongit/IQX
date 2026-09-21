"""Durable alert state for Cấp 2 «Kỷ luật».

These tables are deliberately separate from ``cap2_progress``.  Progress owns
the learning gate; alert events own the intervention lifecycle and its audit
trail.  A stable trigger key makes retries idempotent, while the per-session
row serialises the strict two-impression budget.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin

ALERT_TYPES = ("nhoi_lenh", "cham_cat_lo")
ALERT_STATUSES = ("pending", "shown", "suppressed", "acted")
ALERT_ESCALATIONS = ("normal", "delay_5s", "type_phrase")
ALERT_ACTIONS = ("cancel_buy", "proceed_buy", "sell_ato", "hold", "position_closed")


class Cap2AlertEvent(UUIDMixin, TimestampMixin, Base):
    """One idempotent alert trigger, including impression and action evidence."""

    __tablename__ = "cap2_alert_events"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "alert_type",
            "trigger_key",
            name="uq_cap2_alert_events_user_type_trigger",
        ),
        CheckConstraint(
            f"alert_type IN {ALERT_TYPES!r}", name="cap2_alert_event_type"
        ),
        CheckConstraint(
            f"status IN {ALERT_STATUSES!r}", name="cap2_alert_event_status"
        ),
        CheckConstraint(
            "escalation IS NULL OR escalation IN " + repr(ALERT_ESCALATIONS),
            name="cap2_alert_event_escalation",
        ),
        CheckConstraint(
            "action IS NULL OR action IN " + repr(ALERT_ACTIONS),
            name="cap2_alert_event_action",
        ),
        CheckConstraint("impression_count >= 0", name="cap2_alert_event_impressions_nonnegative"),
        CheckConstraint("breach_session_no >= 1", name="cap2_alert_event_breach_session_positive"),
        CheckConstraint(
            "(intended_quantity IS NULL AND intended_order_type IS NULL "
            "AND intended_limit_price_vnd IS NULL) OR "
            "(intended_quantity IS NOT NULL AND intended_quantity > 0 "
            "AND intended_order_type IS NOT NULL AND "
            "((intended_order_type = 'market' AND intended_limit_price_vnd IS NULL) OR "
            "(intended_order_type = 'limit' AND intended_limit_price_vnd IS NOT NULL "
            "AND intended_limit_price_vnd > 0)))",
            name="cap2_alert_event_draft_shape",
        ),
        Index("ix_cap2_alert_events_user_session_status", "user_id", "session_date", "status"),
        Index("ix_cap2_alert_events_user_type_acted", "user_id", "alert_type", "acted_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alert_type: Mapped[str] = mapped_column(String(20), nullable=False)
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    # Session in which the alert is eligible to be displayed.
    session_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    trigger_key: Mapped[str] = mapped_column(String(180), nullable=False)

    source_order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("virtual_orders.id", ondelete="SET NULL"), nullable=True
    )
    source_plan_order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("virtual_orders.id", ondelete="SET NULL"), nullable=True
    )

    observed_price_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    threshold_price_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    loss_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    position_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position_avg_cost_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    plan_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    intended_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    intended_order_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    intended_limit_price_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    violation_confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Stop alerts only.  This is the date/time of the verified official close,
    # distinct from ``session_date`` (the following session when the banner is shown).
    official_close_session_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    official_close_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    official_close_source: Mapped[str | None] = mapped_column(String(80), nullable=True)
    breach_session_no: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default="pending"
    )
    suppression_reason: Mapped[str | None] = mapped_column(String(40), nullable=True)
    escalation: Mapped[str | None] = mapped_column(String(20), nullable=True)
    impression_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    first_shown_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_shown_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    action: Mapped[str | None] = mapped_column(String(20), nullable=True)
    acted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def priority(self) -> str:
        return "immediate" if self.alert_type == "nhoi_lenh" else "next_session"


class Cap2AlertTypeState(UUIDMixin, TimestampMixin, Base):
    """Consecutive ignored-alert state for one user and one alert type."""

    __tablename__ = "cap2_alert_type_state"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "alert_type", name="uq_cap2_alert_type_state_user_type"
        ),
        CheckConstraint(
            f"alert_type IN {ALERT_TYPES!r}", name="cap2_alert_type_state_type"
        ),
        CheckConstraint("ignored_streak >= 0", name="cap2_alert_type_state_streak_nonnegative"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alert_type: Mapped[str] = mapped_column(String(20), nullable=False)
    ignored_streak: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    last_ignored_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_respected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Cap2AlertSessionState(UUIDMixin, TimestampMixin, Base):
    """Strict per-user/per-session budget for important alert impressions."""

    __tablename__ = "cap2_alert_session_state"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "session_date", name="uq_cap2_alert_session_state_user_date"
        ),
        CheckConstraint(
            "important_shown_count >= 0 AND important_shown_count <= 2",
            name="cap2_alert_session_state_count_range",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    important_shown_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )


class Cap2AlertImpression(UUIDMixin, TimestampMixin, Base):
    """One actual presentation of an alert in a trading session.

    Stop banners can survive across sessions.  Keeping impressions as rows lets
    the same open event be shown once on each later session without either
    double-counting HTTP retries or losing the strict daily quota.
    """

    __tablename__ = "cap2_alert_impressions"
    __table_args__ = (
        UniqueConstraint(
            "event_id", "session_date", name="uq_cap2_alert_impressions_event_date"
        ),
        CheckConstraint(
            f"escalation IN {ALERT_ESCALATIONS!r}",
            name="cap2_alert_impression_escalation",
        ),
        Index("ix_cap2_alert_impressions_user_session", "user_id", "session_date"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cap2_alert_events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    escalation: Mapped[str] = mapped_column(String(20), nullable=False)
    shown_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
