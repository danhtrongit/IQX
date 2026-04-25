"""Pydantic schemas for market data API responses."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class MarketDataMeta(BaseModel):
    """Metadata attached to every market data response."""

    source: str = Field(description="Data source that served this response (e.g. VCI, VND)")
    source_priority: int = Field(
        default=1, description="Priority of source used (1=primary, 2+=fallback)"
    )
    fallback_used: bool = Field(default=False, description="Whether a fallback source was used")
    as_of: datetime = Field(
        default_factory=lambda: datetime.now(),
        description="Timestamp when data was fetched",
    )
    raw_endpoint: str = Field(default="", description="Upstream URL that was called")


class MarketDataResponse(BaseModel):
    """Standard envelope for all market data endpoints."""

    data: Any
    meta: MarketDataMeta


class SymbolInfo(BaseModel):
    """Normalized symbol listing record."""

    symbol: str
    name: str | None = None
    exchange: str | None = None
    asset_type: str | None = None


class IndustryInfo(BaseModel):
    """Normalized ICB industry record."""

    icb_code: str
    icb_name: str
    en_icb_name: str | None = None
    level: int | None = None


class OHLCVRecord(BaseModel):
    """Normalized OHLCV candle."""

    time: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class IntradayRecord(BaseModel):
    """Normalized intraday tick."""

    time: str
    price: float
    volume: int
    side: str | None = None
    accumulated_volume: int | None = None
    accumulated_value: float | None = None


class PriceDepthRecord(BaseModel):
    """Normalized price depth step."""

    price: float
    volume: int
    buy_volume: int | None = None
    sell_volume: int | None = None
    undefined_volume: int | None = None


class PriceBoardRecord(BaseModel):
    """Normalized price board row."""

    symbol: str
    exchange: str | None = None
    ceiling_price: float | None = None
    floor_price: float | None = None
    reference_price: float | None = None
    open_price: float | None = None
    high_price: float | None = None
    low_price: float | None = None
    close_price: float | None = None
    average_price: float | None = None
    total_volume: int | None = None
    total_value: float | None = None
    price_change: float | None = None
    percent_change: float | None = None


class InsightsRankingRecord(BaseModel):
    """Normalized ranking record from VND insights."""

    symbol: str
    last_price: float | None = None
    price_change_1d: float | None = None
    price_change_pct_1d: float | None = None
    accumulated_value: float | None = None
