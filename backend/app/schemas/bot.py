"""Read-only API contracts for IQX Bot v1."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class BotReadModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BotIssueOut(BotReadModel):
    code: str
    symbol: str | None = None
    detail: str | None = None


class BotRunStatusOut(BotReadModel):
    status: Literal["idle", "running", "succeeded", "failed"]
    latest_run_id: uuid.UUID | None
    last_updated_at: datetime | None
    processed_unseen_sessions: int = Field(ge=0)
    issues: list[BotIssueOut]


class BotConfigOut(BotReadModel):
    strategy_id: Literal["iqx_standard"]
    strategy_version: Literal[1]
    execution_model: Literal["same_session_close"]
    initial_cash_vnd: str
    activated_at: datetime


class BotAccountSummaryOut(BotReadModel):
    cash_vnd: str
    market_value_vnd: str | None
    nav_vnd: str | None
    pnl_total_net_vnd: str | None
    return_total: str | None
    valuation_complete: bool
    as_of_session: date | None


class BotOverviewOut(BotReadModel):
    eligible: bool
    current_level: int = Field(ge=0, le=6)
    cap6_graduated_at: datetime | None
    disclosure: str
    bot: BotConfigOut | None
    account: BotAccountSummaryOut | None
    bot_run: BotRunStatusOut


class BotPositionOut(BotReadModel):
    id: uuid.UUID
    symbol: str
    qty: int = Field(gt=0)
    entry_price_vnd: str
    current_close_vnd: str | None
    market_value_vnd: str | None
    weight_pct: str | None
    amplitude_at_entry_vnd: str
    amplitude_source_ref: str
    stop_loss_vnd: str
    take_profit_vnd: str
    unrealized_pnl_net_vnd: str | None
    filter_ids: list[str]
    opened_session: date
    opened_at: datetime
    sector: str | None
    source_refs: dict[str, Any]


class BotPositionsOut(BotReadModel):
    items: list[BotPositionOut]
    valuation_complete: bool
    as_of_session: date | None


class BotExecutionOut(BotReadModel):
    id: uuid.UUID
    side: Literal["buy", "sell"]
    qty: int
    price_vnd: str
    gross_value_vnd: str
    fee_vnd: str
    tax_vnd: str
    net_cash_delta_vnd: str


class BotJournalItemOut(BotReadModel):
    id: uuid.UUID
    run_id: uuid.UUID
    trading_date: date
    action: Literal["buy", "sell", "hold", "skip"]
    reason_code: str
    reason: str
    execution: BotExecutionOut | None
    symbol: str | None
    filter_ids: list[str]
    supporting_count: int | None
    threshold_vnd: str | None
    source_refs: dict[str, Any]
    created_at: datetime


class BotJournalOut(BotReadModel):
    items: list[BotJournalItemOut]
    next_cursor: uuid.UUID | None
    issues: list[BotIssueOut]


class BotPerformanceBaseOut(BotReadModel):
    trading_date: date
    bot_nav_vnd: str
    vnindex_value: str | None


class BotPerformancePointOut(BotReadModel):
    trading_date: date
    cash_vnd: str
    market_value_vnd: str | None
    nav_vnd: str | None
    valuation_complete: bool
    bot_return_since_base: str | None
    vnindex_value: str | None
    vnindex_return_since_base: str | None


class BotPerformanceOut(BotReadModel):
    base: BotPerformanceBaseOut | None
    series: list[BotPerformancePointOut]
    comparison_available: bool
