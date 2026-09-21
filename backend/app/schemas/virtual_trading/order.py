"""Virtual Trading — order schemas."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class JourneyPlanRequest(BaseModel):
    """Cumulative buy-time learning plan for Cấp 0–6.

    Cấp 5 facts are deliberately absent: hunt and consensus provenance are
    captured from server-owned state when the BUY is accepted.
    """

    ly_do_doi_thuong: str | None = None
    lyDo: Literal["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"] | None = None  # noqa: N815
    trangThai_luc_dat: Literal["ung_ho", "trung_tinh", "can_chu_y", "nguoc_chieu"] | None = None  # noqa: N815
    vung_mua: int | None = Field(default=None, gt=0)
    co_bam_doc_chi_tiet: bool = False
    snapshot: dict[str, Any] | None = None
    phuong_phap_sl_tp: Literal["ho_tro_khang_cu", "bien_do_dao_dong"] | None = None
    cat_lo: int | None = Field(default=None, gt=0)
    chot_loi: int | None = Field(default=None, gt=0)
    nhoi_lenh_alert_id: uuid.UUID | None = None
    khau_vi: Literal["than_trong", "can_bang", "tan_cong"] | None = None
    muc_tu_tin: Literal[1, 2, 3] | None = None
    cach_khoi_luong: Literal[
        "khau_vi_tu_tin", "chia_deu", "linh_hoat", "ky_luat"
    ] | None = None
    doc_5_lop: dict[
        Literal["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"],
        Literal["ok", "neu", "bad"],
    ] | None = None
    conflict_level: Literal["nhe", "ngai", "nghiem", "chua_ro"] | None = None


class OrderCreateRequest(BaseModel):
    """Request body for placing a virtual order."""

    symbol: str = Field(..., min_length=1, max_length=10, pattern=r"^[A-Z0-9]{1,10}$")
    side: str = Field(..., pattern=r"^(buy|sell)$")
    order_type: str = Field(..., pattern=r"^(market|limit)$")
    quantity: int = Field(..., gt=0, le=1_000_000)
    limit_price_vnd: int | None = Field(None, gt=0, le=10_000_000)
    journey_plan: JourneyPlanRequest | None = None


class OrderResponse(BaseModel):
    """Virtual order details."""

    id: uuid.UUID
    account_id: uuid.UUID
    symbol: str
    mode: str
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
    exit_matched_buy_order_id: uuid.UUID | None = None
    exit_snapshot_at: datetime | None = None
    exit_avg_cost_vnd: int | None = None
    journey_plan_saved_levels: list[int] = Field(default_factory=list)
    nhoi_lenh_alert_linked: bool = False
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def created_at_utc(cls, value: datetime) -> datetime:
        # TimestampMixin stores UTC in a timestamp without timezone column.
        # Include the offset on the wire so browsers do not treat it as local time.
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value

    model_config = {"from_attributes": True}


class OrderListResponse(BaseModel):
    """Paginated order list."""

    orders: list[OrderResponse]
    total: int
    page: int
    page_size: int
