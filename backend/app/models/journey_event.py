"""Product telemetry, deliberately separate from authoritative learning evidence."""

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class JourneyEvent(Base):
    __tablename__ = "journey_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80), index=True)
    source: Mapped[str] = mapped_column(String(8))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    fields: Mapped[dict] = mapped_column(JSON)
