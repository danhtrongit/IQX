"""Request and response schemas for server-derived Cấp 8 exit evidence."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Cap8ProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    entered_at: datetime
    so_lenh_thoat_dung_ke_hoach: int
    muc_tieu_thoat_dung_ke_hoach: int = 5
    graduated_at: datetime | None
    time_to_graduate_hours: float | None


class SyncPlanRequest(BaseModel):
    buy_order_id: UUID


class DynamicStopRequest(BaseModel):
    dynamic_stop_vnd: int = Field(gt=0)


class ExitRecordRequest(BaseModel):
    sell_order_id: UUID


class ExitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    symbol: str
    matched_buy_order_id: UUID | None
    sell_order_id: UUID
    exited_at: datetime
    quantity: int
    filled_price_vnd: int
    remaining_position_pct: float
    exit_method: str
    original_stop_vnd: int | None
    original_take_profit_vnd: int | None
    effective_stop_vnd: int | None
    dung_ke_hoach: bool
    ban_cam_xuc: bool
    classification_reason: str


class ExitContextOut(BaseModel):
    symbol: str
    quantity_total: int
    quantity_sellable: int
    avg_cost_vnd: int
    current_price_vnd: int | None
    source_buy_order_id: UUID | None
    original_stop_vnd: int | None
    original_take_profit_vnd: int | None
    dynamic_stop_vnd: int | None
    dynamic_stop_set_at: datetime | None
    can_update_dynamic_stop: bool
    board_lot_size: int
    proposed_sale_quantity: int
    sector_impact: dict


class SyncPlanOut(BaseModel):
    symbol: str
    source_buy_order_id: UUID
    original_stop_vnd: int
    original_take_profit_vnd: int
    dynamic_stop_vnd: None = None
    dynamic_stop_set_at: None = None


class DynamicStopOut(BaseModel):
    symbol: str
    dynamic_stop_vnd: int
    dynamic_stop_set_at: datetime
