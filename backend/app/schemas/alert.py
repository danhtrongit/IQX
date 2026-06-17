"""Pydantic schemas for the alert system."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ConditionSchema(BaseModel):
    indicator: str
    op: str
    value: float | str | None = None
    join: Literal["AND", "OR"] | None = None


class CombinationSchema(BaseModel):
    logic: Literal["AND", "OR"] = "AND"
    conditions: list[ConditionSchema] = Field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"logic": self.logic, "conditions": [c.model_dump() for c in self.conditions]}


class AlertSignalResponse(BaseModel):
    key: str
    side: str
    ta_name: str
    message_title: str
    combination: dict[str, Any]
    is_enabled: bool
    sort_order: int

    model_config = {"from_attributes": True}


class AlertSignalAdminUpsert(BaseModel):
    side: Literal["buy", "sell"]
    ta_name: str = Field(min_length=1, max_length=60)
    message_title: str = Field(min_length=1, max_length=200)
    combination: CombinationSchema
    is_enabled: bool = True
    sort_order: int = 0


class AlertSignalAdminCreate(AlertSignalAdminUpsert):
    key: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9_]+$")


class UserAlertRuleCreate(BaseModel):
    """Subscribe to a preset (``signal_key``) or define a custom rule."""

    signal_key: str | None = None
    name: str | None = Field(default=None, max_length=120)
    side: Literal["buy", "sell"] | None = None
    combination: CombinationSchema | None = None
    is_enabled: bool = True


class UserAlertRuleUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    combination: CombinationSchema | None = None
    is_enabled: bool | None = None


class UserAlertRuleResponse(BaseModel):
    id: uuid.UUID
    name: str
    side: str
    base_signal_key: str | None
    combination: dict[str, Any]
    is_enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlertEventResponse(BaseModel):
    id: uuid.UUID
    symbol: str
    signal_key: str | None
    session_date: date
    fired_at: datetime
    price: float | None
    delivered: bool

    model_config = {"from_attributes": True}


class TelegramLinkResponse(BaseModel):
    deep_link: str
    token: str


class TelegramStatusResponse(BaseModel):
    linked: bool
    linked_at: datetime | None = None
    bot_username: str | None = None
