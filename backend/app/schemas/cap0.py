"""Request/response schemas for the Cấp 0 onboarding API (spec v3.0)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Cap0ProgressOut(BaseModel):
    """Cấp 0 progress state for the current user — 4 nhiệm vụ, 1 cổng hành vi."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    virtual_balance_init: int
    #: ① đặt lệnh mua đầu tiên · ② xem tab Nắm giữ · ③ xem tab Theo dõi ·
    #: ④ bán một lệnh — kết sổ đầu tiên.
    task_1_done_at: datetime | None = None
    task_2_done_at: datetime | None = None
    task_3_done_at: datetime | None = None
    task_4_done_at: datetime | None = None
    #: The single behaviour gate. ``task1_star_clicked`` is gone: the ★ is no
    #: longer any task's requirement, so nothing may read it back.
    task4_debrief_done: bool
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


class PlacementRequest(BaseModel):
    has_traded_before: bool


class PlacementResponse(BaseModel):
    placed_level: int


class TaskRequest(BaseModel):
    #: Cấp 0 has exactly 4 nhiệm vụ — 5 is out of range (the three tours that
    #: used to sit at ②③④ are no longer part of the level).
    task_no: int = Field(ge=1, le=4)
    #: ``debrief`` is the ONLY gate: ``sl_typed`` went with cắt lỗ and ``star``
    #: went with the tours — ③ is now earned by opening the Theo dõi tab.
    gate: Literal["debrief"] | None = None


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
