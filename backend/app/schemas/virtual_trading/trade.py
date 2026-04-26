"""Virtual Trading — trade & refresh schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class TradeResponse(BaseModel):
    """Executed trade details."""

    id: uuid.UUID
    order_id: uuid.UUID
    symbol: str
    side: str
    quantity: int
    price_vnd: int
    gross_amount_vnd: int
    fee_vnd: int
    tax_vnd: int
    net_amount_vnd: int
    price_source: str
    price_time: datetime
    traded_at: datetime

    model_config = {"from_attributes": True}


class TradeListResponse(BaseModel):
    """Paginated trade list."""

    trades: list[TradeResponse]
    total: int
    page: int
    page_size: int


class RefreshResponse(BaseModel):
    """Result of processing pending orders and settlements."""

    orders_filled: int
    orders_expired: int
    settlements_settled: int
    warnings: list[str] = []
