"""Virtual Trading — order schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class OrderCreateRequest(BaseModel):
    """Request body for placing a virtual order."""

    symbol: str = Field(..., min_length=1, max_length=10, pattern=r"^[A-Z0-9]{1,10}$")
    side: str = Field(..., pattern=r"^(buy|sell)$")
    order_type: str = Field(..., pattern=r"^(market|limit)$")
    quantity: int = Field(..., gt=0, le=1_000_000)
    limit_price_vnd: int | None = Field(None, gt=0, le=10_000_000)


class OrderResponse(BaseModel):
    """Virtual order details."""

    id: uuid.UUID
    account_id: uuid.UUID
    symbol: str
    side: str
    order_type: str
    status: str
    quantity: int
    limit_price_vnd: int | None = None
    reserved_cash_vnd: int = 0
    reserved_quantity: int = 0
    filled_price_vnd: int | None = None
    gross_amount_vnd: int | None = None
    fee_vnd: int | None = None
    tax_vnd: int | None = None
    net_amount_vnd: int | None = None
    trading_date: date
    rejection_reason: str | None = None
    cancel_reason: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderListResponse(BaseModel):
    """Paginated order list."""

    orders: list[OrderResponse]
    total: int
    page: int
    page_size: int
