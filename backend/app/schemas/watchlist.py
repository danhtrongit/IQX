"""Watchlist schemas — request/response models."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WatchlistItemResponse(BaseModel):
    """Single watchlist item."""

    id: UUID
    symbol: str
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class WatchlistResponse(BaseModel):
    """Full watchlist for a user."""

    items: list[WatchlistItemResponse]
    count: int


class WatchlistAddRequest(BaseModel):
    """Add a symbol to the watchlist."""

    symbol: str = Field(..., min_length=1, max_length=20, description="Mã chứng khoán")


class WatchlistReorderRequest(BaseModel):
    """Reorder watchlist items."""

    symbols: list[str] = Field(..., description="Danh sách mã theo thứ tự mới")
