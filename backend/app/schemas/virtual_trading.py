"""Virtual Trading API schemas — request/response models."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

# ══════════════════════════════════════════════════════
# Config schemas
# ══════════════════════════════════════════════════════


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


# ══════════════════════════════════════════════════════
# Account schemas
# ══════════════════════════════════════════════════════


class AccountResponse(BaseModel):
    """Virtual trading account summary."""

    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    initial_cash_vnd: int
    cash_available_vnd: int
    cash_reserved_vnd: int
    cash_pending_vnd: int
    total_cash_vnd: int = 0  # computed: available + reserved + pending
    activated_at: datetime
    reset_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════
# Position schemas
# ══════════════════════════════════════════════════════


class PositionResponse(BaseModel):
    """A single portfolio position."""

    symbol: str
    quantity_total: int
    quantity_sellable: int
    quantity_pending: int
    quantity_reserved: int
    avg_cost_vnd: int
    current_price_vnd: int | None = None
    market_value_vnd: int | None = None
    unrealized_pnl_vnd: int | None = None

    model_config = {"from_attributes": True}


class PortfolioResponse(BaseModel):
    """Full portfolio with account summary and positions."""

    account: AccountResponse
    positions: list[PositionResponse]
    total_market_value_vnd: int
    nav_vnd: int  # cash + market value
    total_unrealized_pnl_vnd: int
    return_pct: float  # (nav - initial) / initial * 100
    refresh_warnings: list[str] = []


# ══════════════════════════════════════════════════════
# Order schemas
# ══════════════════════════════════════════════════════


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


# ══════════════════════════════════════════════════════
# Trade schemas
# ══════════════════════════════════════════════════════


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


# ══════════════════════════════════════════════════════
# Refresh schemas
# ══════════════════════════════════════════════════════


class RefreshResponse(BaseModel):
    """Result of processing pending orders and settlements."""

    orders_filled: int
    orders_expired: int
    settlements_settled: int
    warnings: list[str] = []


# ══════════════════════════════════════════════════════
# Leaderboard schemas
# ══════════════════════════════════════════════════════


class LeaderboardEntry(BaseModel):
    """Single leaderboard row."""

    rank: int
    user_id: uuid.UUID
    display_name: str
    nav_vnd: int
    profit_vnd: int
    return_pct: float
    initial_cash_vnd: int


class LeaderboardResponse(BaseModel):
    """Paginated leaderboard."""

    entries: list[LeaderboardEntry]
    total: int  # evaluated count (may be < total_eligible if capped)
    total_eligible: int  # total active accounts
    evaluated_count: int  # how many accounts were actually scored
    page: int
    page_size: int
    sort_by: str


# ══════════════════════════════════════════════════════
# Admin schemas
# ══════════════════════════════════════════════════════


class AdminAccountResponse(BaseModel):
    """Admin view of a virtual trading account."""

    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str | None = None
    user_name: str | None = None
    status: str
    initial_cash_vnd: int
    cash_available_vnd: int
    cash_reserved_vnd: int
    cash_pending_vnd: int
    activated_at: datetime
    reset_at: datetime | None = None

    model_config = {"from_attributes": True}


class ResetResponse(BaseModel):
    """Result of account reset."""

    accounts_reset: int
    message: str
