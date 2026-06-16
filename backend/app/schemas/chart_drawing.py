"""Chart drawing schemas — request/response models."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ChartDrawingUpsert(BaseModel):
    """Save the current TradingView line-tool state for a symbol."""

    state: dict[str, Any] = Field(..., description="Serialized LineToolsAndGroupsState")


class ChartDrawingResponse(BaseModel):
    """Saved drawing for a (user, symbol). `state` is null when none exists."""

    symbol: str
    state: dict[str, Any] | None = None
    updated_at: datetime | None = None
