"""Virtual Trading — position / portfolio schemas."""

from __future__ import annotations

from pydantic import BaseModel

from app.schemas.virtual_trading.account import AccountResponse


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
