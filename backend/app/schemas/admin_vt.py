"""Pydantic schemas for admin Virtual Trading endpoints."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class FreezeAccountRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1000)


class UnfreezeAccountRequest(BaseModel):
    reason: str | None = Field(None, max_length=1000)


class CashAdjustRequest(BaseModel):
    amount_vnd: int = Field(..., description="Có thể âm hoặc dương, khác 0")
    reason: str = Field(..., min_length=1, max_length=1000)


class VTAccountAdminResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    initial_cash_vnd: int
    cash_available_vnd: int
    cash_reserved_vnd: int
    cash_pending_vnd: int
    activated_at: datetime | None
    frozen_at: datetime | None
    frozen_by_user_id: uuid.UUID | None
    freeze_reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CashAdjustResponse(BaseModel):
    account: VTAccountAdminResponse
    ledger_id: uuid.UUID
    new_cash_available_vnd: int


# ── Account 360 schemas ──────────────────────────────────────────────────────


class VTPositionResponse(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    symbol: str
    quantity_total: int
    quantity_sellable: int
    quantity_pending: int
    quantity_reserved: int
    avg_cost_vnd: int
    created_at: datetime

    model_config = {"from_attributes": True}


class VTOrderResponse(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    user_id: uuid.UUID
    symbol: str
    side: str
    order_type: str
    status: str
    quantity: int
    limit_price_vnd: int | None
    filled_price_vnd: int | None
    gross_amount_vnd: int | None
    fee_vnd: int | None
    tax_vnd: int | None
    net_amount_vnd: int | None
    trading_date: date
    rejection_reason: str | None
    cancel_reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class VTTradeResponse(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    account_id: uuid.UUID
    symbol: str
    side: str
    quantity: int
    price_vnd: int
    gross_amount_vnd: int
    fee_vnd: int
    tax_vnd: int
    net_amount_vnd: int
    price_source: str
    traded_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class VTLedgerResponse(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    amount_vnd: int
    balance_after_vnd: int
    kind: str
    reference_type: str | None
    reference_id: uuid.UUID | None
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class VTSettlementResponse(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    trade_id: uuid.UUID
    kind: str
    amount: int
    symbol: str | None
    due_date: date
    status: str
    settled_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class VTAccountStatsResponse(BaseModel):
    account_id: uuid.UUID
    total_orders: int
    total_trades: int
    gross_buy_vnd: int
    gross_sell_vnd: int
    realized_pnl_vnd: int
    turnover_vnd: int
    # win_rate is stubbed as null — requires per-symbol cost tracking
    win_rate: float | None = None
