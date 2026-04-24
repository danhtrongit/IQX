"""Refresh token model for database-backed token rotation and revocation."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDMixin


class RefreshToken(UUIDMixin, Base):
    """Stores issued refresh tokens for rotation and revocation.

    Every refresh token has a unique `jti` (JWT ID). When a token is used
    to obtain a new pair, the old token is marked as `revoked` and a new
    row is created. If a revoked token is replayed, the entire family
    (all tokens for that user) can be invalidated.
    """

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    token_family: Mapped[str] = mapped_column(
        String(64),
        index=True,
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
