"""User database model."""

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class User(UUIDMixin, TimestampMixin, Base):
    """User account for the IQX platform."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    username: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    # Status flags
    is_active: Mapped[bool] = mapped_column(default=True)
    is_verified: Mapped[bool] = mapped_column(default=False)
    is_superuser: Mapped[bool] = mapped_column(default=False)

    # Role: admin | analyst | member
    role: Mapped[str] = mapped_column(String(20), default="member")

    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Subscription relationship (one active at a time)
    subscription = relationship(
        "Subscription",
        back_populates="user",
        uselist=False,
        lazy="selectin",
        primaryjoin=(
            "and_(User.id == Subscription.user_id, Subscription.status == 'active')"
        ),
        viewonly=True,
    )
