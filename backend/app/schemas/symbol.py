"""Pydantic schemas for the Symbol domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SymbolRead(BaseModel):
    """Full symbol read representation."""

    id: uuid.UUID
    symbol: str
    name: str | None = None
    short_name: str | None = None
    exchange: str | None = None
    asset_type: str | None = None
    is_index: bool = False
    current_price_vnd: int | None = None
    target_price_vnd: int | None = None
    upside_pct: float | None = None
    logo_url: str | None = None
    logo_source: str | None = None
    icb_lv1: str | None = None
    icb_lv2: str | None = None
    source: str | None = None
    source_url: str | None = None
    last_synced_at: datetime | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SymbolSearchItem(BaseModel):
    """Lightweight symbol item for search results."""

    symbol: str
    name: str | None = None
    short_name: str | None = None
    exchange: str | None = None
    asset_type: str | None = None
    is_index: bool = False
    logo_url: str | None = None
    current_price_vnd: int | None = None
    target_price_vnd: int | None = None
    upside_pct: float | None = None
    icb_lv1: str | None = None
    icb_lv2: str | None = None

    model_config = {"from_attributes": True}


class SymbolSearchParams(BaseModel):
    """Query parameters for symbol search."""

    q: str | None = Field(None, description="Từ khóa tìm kiếm (symbol, tên)")
    exchange: str | None = Field(None, description="Lọc theo sàn: HOSE, HNX, UPCOM")
    asset_type: str | None = Field(None, description="Lọc theo loại: stock, etf")
    include_indices: bool = Field(False, description="Bao gồm cả chỉ số")
    page: int = Field(1, ge=1, description="Trang")
    page_size: int = Field(20, ge=1, le=100, description="Số kết quả mỗi trang")


class SymbolSeedSummary(BaseModel):
    """Summary returned after running the seed process."""

    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    deactivated: int = 0
    logo_simplize_count: int = 0
    logo_fallback_count: int = 0
    errors: list[str] = Field(default_factory=list)
    dry_run: bool = False
