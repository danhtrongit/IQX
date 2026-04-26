"""Virtual Trading — configuration schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ConfigResponse(BaseModel):
    """Active virtual trading configuration."""

    id: uuid.UUID
    initial_cash_vnd: int
    buy_fee_rate_bps: int
    sell_fee_rate_bps: int
    sell_tax_rate_bps: int
    settlement_mode: str
    board_lot_size: int
    trading_enabled: bool
    holidays: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConfigUpdate(BaseModel):
    """Partial update for virtual trading config."""

    initial_cash_vnd: int | None = Field(None, gt=0)
    buy_fee_rate_bps: int | None = Field(None, ge=0, le=1000)
    sell_fee_rate_bps: int | None = Field(None, ge=0, le=1000)
    sell_tax_rate_bps: int | None = Field(None, ge=0, le=1000)
    settlement_mode: str | None = Field(None, pattern=r"^(T0|T2)$")
    board_lot_size: int | None = Field(None, gt=0)
    trading_enabled: bool | None = None
    holidays: list[str] | None = None
