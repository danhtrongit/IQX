"""Request/response schemas for the Cấp 0 onboarding API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class Cap0ProgressOut(BaseModel):
    """Cấp 0 progress state for the current user."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    virtual_balance_init: int
    task_1_done_at: datetime | None = None
    task_2_done_at: datetime | None = None
    task_3_done_at: datetime | None = None
    task_4_done_at: datetime | None = None
    task_5_done_at: datetime | None = None
    task_6_done_at: datetime | None = None
    task1_star_clicked: bool
    task5_sl_typed: bool
    task6_debrief_done: bool
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


class PlacementRequest(BaseModel):
    has_traded_before: bool


class PlacementResponse(BaseModel):
    placed_level: int


class TaskRequest(BaseModel):
    task_no: int
    gate: Literal["star", "sl_typed", "debrief"] | None = None
