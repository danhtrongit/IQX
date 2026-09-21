"""Wire contracts for the Cấp 2 discipline-alert state machine."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AlertType = Literal["nhoi_lenh", "cham_cat_lo"]
AlertStatus = Literal["pending", "shown", "suppressed", "acted"]
AlertEscalation = Literal["normal", "delay_5s", "type_phrase"]
UserAlertAction = Literal["cancel_buy", "proceed_buy", "sell_ato", "hold"]
StoredAlertAction = Literal[
    "cancel_buy", "proceed_buy", "sell_ato", "hold", "position_closed"
]
DataStatus = Literal["available", "unavailable"]


class Cap2PreBuyAlertRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=10, pattern=r"^[A-Za-z0-9]{1,10}$")
    idempotency_key: str = Field(min_length=8, max_length=120)
    quantity: int = Field(gt=0, le=1_000_000)
    order_type: Literal["market", "limit"]
    limit_price_vnd: int | None = Field(default=None, gt=0, le=10_000_000)

    @field_validator("symbol")
    @classmethod
    def normalise_symbol(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def validate_limit_price(self) -> Cap2PreBuyAlertRequest:
        if self.order_type == "limit" and self.limit_price_vnd is None:
            raise ValueError("Lệnh limit cần limit_price_vnd")
        if self.order_type == "market" and self.limit_price_vnd is not None:
            raise ValueError("Lệnh market không nhận limit_price_vnd")
        return self


class Cap2AlertActionRequest(BaseModel):
    action: UserAlertAction
    # Required by the service only at the strongest escalation.  Keeping it
    # optional on the schema lets the service return the domain-specific error.
    confirmation_phrase: str | None = Field(default=None, max_length=40)


class Cap2AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    alert_type: AlertType
    symbol: str
    session_date: date
    observed_price_vnd: int
    threshold_price_vnd: int | None = None
    loss_pct: float | None = None
    position_quantity: int | None = None
    position_avg_cost_vnd: int | None = None
    plan_started_at: datetime | None = None
    intended_quantity: int | None = None
    intended_order_type: Literal["market", "limit"] | None = None
    intended_limit_price_vnd: int | None = None
    violation_confirmed_at: datetime | None = None
    priority: Literal["immediate", "next_session"]
    official_close_session_date: date | None = None
    breach_session_no: int
    status: AlertStatus
    suppression_reason: str | None = None
    escalation: AlertEscalation | None = None
    impression_count: int
    first_shown_at: datetime | None = None
    last_shown_at: datetime | None = None
    action: StoredAlertAction | None = None
    acted_at: datetime | None = None


class Cap2PreBuyAlertOut(BaseModel):
    data_status: DataStatus
    triggered: bool
    reason: str
    alert: Cap2AlertOut | None = None


class Cap2ActiveAlertsOut(BaseModel):
    session_date: date
    alerts: list[Cap2AlertOut]


class Cap2AlertActionOut(BaseModel):
    alert: Cap2AlertOut
    # ``sell_ato`` only records the choice.  The order engine remains the owner
    # of the final confirmation and execution.
    next_step: Literal["none", "confirm_ato_sell"] = "none"


class Cap2StopScanOut(BaseModel):
    official_session_date: date
    display_session_date: date
    positions_checked: int
    alerts_pending: int
    unavailable_symbols: list[str]
