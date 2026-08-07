"""Request/response schemas for the Cấp 0 onboarding API (spec v3.0)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Cap0ProgressOut(BaseModel):
    """Cấp 0 progress state for the current user — 5 nhiệm vụ, 1 cổng hành vi."""

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
    task1_star_clicked: bool
    task5_debrief_done: bool
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


class PlacementRequest(BaseModel):
    has_traded_before: bool


class PlacementResponse(BaseModel):
    placed_level: int


class TaskRequest(BaseModel):
    #: Cấp 0 has exactly 5 nhiệm vụ (spec v3.0 §4) — 6 is out of range.
    task_no: int = Field(ge=1, le=5)
    #: ``sl_typed`` is gone with cắt lỗ; ``debrief`` is the single graduation gate.
    gate: Literal["star", "debrief"] | None = None


class Cap0KehoachRequest(BaseModel):
    """Record the khối "Kế hoạch" chip for a Cấp 0 BUY order."""

    order_id: uuid.UUID
    #: Either the slug (``thu_cho_biet``) or the verbatim §4 label (``Thử cho biết``).
    ly_do_doi_thuong: str


class Cap0KehoachOut(BaseModel):
    """Persisted chip + everything the Kết sổ derives from the order itself."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    symbol: str
    mode: str
    ly_do_doi_thuong: str
    #: Verbatim spec §4 chip label — render as-is on the Kết sổ's `Lý do mua` row.
    ly_do_label: str
    mua_luc: datetime
    ngay_mua: date
    gia_vao: int | None = None
    #: `Thời gian giữ`, in trading sessions, measured buy → matching SELL.
    #: 0 = mua/bán trong cùng phiên (the common Cấp 0 case). ``null`` = vị thế
    #: chưa đóng, so the round trip has no length yet — the Kết sổ prints "—".
    so_phien_giu: int | None = None
