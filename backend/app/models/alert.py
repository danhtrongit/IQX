"""Alert models — global signal presets, per-user rules, and fired events."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class AlertSide(enum.StrEnum):
    BUY = "buy"
    SELL = "sell"


class AlertSignal(UUIDMixin, TimestampMixin, Base):
    """A global, admin-curated signal preset (one of the 10 fixed signals).

    ``combination`` is a ``{logic, conditions[]}`` object over the 38 indicators.
    """

    __tablename__ = "alert_signals"

    key: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    side: Mapped[AlertSide] = mapped_column(
        Enum(AlertSide, name="alert_side", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    ta_name: Mapped[str] = mapped_column(String(60), nullable=False)
    message_title: Mapped[str] = mapped_column(String(200), nullable=False)
    combination: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)


class UserAlertRule(UUIDMixin, TimestampMixin, Base):
    """A user's alert subscription — copied from a preset, then editable.

    Scope is the user's watchlist (no per-rule symbol list in v1).
    """

    __tablename__ = "user_alert_rules"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    side: Mapped[AlertSide] = mapped_column(
        Enum(AlertSide, name="alert_side", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    base_signal_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    combination: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)


class AlertEvent(UUIDMixin, TimestampMixin, Base):
    """A fired alert (one per user/rule/symbol/session_date — dedup + history)."""

    __tablename__ = "alert_events"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "rule_id",
            "symbol",
            "session_date",
            name="uq_alert_events_user_rule_symbol_date",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rule_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_alert_rules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    signal_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    fired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    price: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    delivered: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    delivery_error: Mapped[str | None] = mapped_column(String(300), nullable=True)
