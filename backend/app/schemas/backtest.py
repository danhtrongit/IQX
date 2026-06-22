"""Pydantic schemas for the backtester API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class FactorSelection(BaseModel):
    id: str
    value: float | None = None


class StrategySide(BaseModel):
    logic: Literal["AND", "OR"] = "AND"
    factors: list[FactorSelection] = Field(default_factory=list)


class RiskInput(BaseModel):
    stop_loss: Literal["none", "atr", "fixed"] = "atr"
    stop_atr_mult: float = 2.0
    stop_fixed_pct: float = 0.05
    take_profit_pct: float | None = None
    max_holding: int | None = 60
    position_size: Literal["all", "half", "quarter", "tenth", "fixed"] = "all"
    position_fixed_amount: float = 10_000_000.0
    fee: Literal["standard", "low", "none"] = "standard"


class BacktestRunRequest(BaseModel):
    symbol: str
    start: str
    end: str
    capital: float = 100_000_000.0
    buy: StrategySide
    sell: StrategySide = Field(default_factory=StrategySide)
    risk: RiskInput = Field(default_factory=RiskInput)

    @field_validator("symbol")
    @classmethod
    def _upper(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError("Thiếu mã cổ phiếu")
        return v

    @field_validator("start", "end")
    @classmethod
    def _iso_date(cls, v: str) -> str:
        from datetime import date

        date.fromisoformat(v[:10])  # raises if invalid
        return v[:10]

    @field_validator("capital")
    @classmethod
    def _positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Vốn ban đầu phải > 0")
        return v


class BacktestStrategyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    symbol: str | None = None
    config: dict[str, Any]


class BacktestStrategyUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    symbol: str | None = None
    config: dict[str, Any] | None = None


class BacktestStrategyResponse(BaseModel):
    id: uuid.UUID
    name: str
    symbol: str | None
    config: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
