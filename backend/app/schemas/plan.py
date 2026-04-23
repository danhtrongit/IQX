"""Subscription plan schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

_FEATURES_DESC = (
    "Feature flags and limits for this plan as a JSON object. "
    "Example keys: `max_watchlists`, `max_portfolio_symbols`, `premium_reports`, "
    "`advanced_alerts`, `analyst_content`."
)

_FEATURES_EXAMPLE = {
    "max_watchlists": 5,
    "max_portfolio_symbols": 50,
    "premium_reports": True,
    "advanced_alerts": True,
    "analyst_content": True,
}


# ---------------------------------------------------------------------------
# Response
# ---------------------------------------------------------------------------


class PlanResponse(BaseModel):
    """Public plan representation."""

    id: uuid.UUID = Field(
        ..., description="Plan UUID.", examples=["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]
    )
    code: str = Field(..., description="Unique plan code.", examples=["premium_pro"])
    name: str = Field(..., description="Display name.", examples=["Premium Pro"])
    description: str | None = Field(None, description="Plan description.")
    price_vnd: int = Field(..., description="Monthly price in VND.", examples=[299000])
    billing_cycle: str = Field(..., description="Billing cycle.", examples=["monthly"])
    duration_months: int = Field(
        ..., description="Duration per billing cycle in months.", examples=[1]
    )
    is_active: bool = Field(..., description="Whether the plan is currently available.")
    is_public: bool = Field(..., description="Whether the plan is visible to users.")
    sort_order: int = Field(
        ..., description="Display order (lower = first).", examples=[1]
    )
    features: dict | None = Field(
        None, description=_FEATURES_DESC, examples=[_FEATURES_EXAMPLE]
    )
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlanListResponse(BaseModel):
    """List of plans."""

    items: list[PlanResponse]
    total: int


# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------


class PlanCreate(BaseModel):
    """Admin: create a new plan."""

    code: str = Field(
        ...,
        min_length=2,
        max_length=50,
        description="Unique plan code.",
        examples=["premium_pro"],
    )
    name: str = Field(
        ..., max_length=100, description="Display name.", examples=["Premium Pro"]
    )
    description: str | None = Field(None, description="Plan description.")
    price_vnd: int = Field(
        ..., gt=0, description="Monthly price in VND.", examples=[299000]
    )
    billing_cycle: str = Field(
        "monthly", description="Billing cycle.", examples=["monthly"]
    )
    duration_months: int = Field(
        1, ge=1, description="Duration in months.", examples=[1]
    )
    is_active: bool = Field(True)
    is_public: bool = Field(True)
    sort_order: int = Field(0, description="Display order.", examples=[1])
    features: dict | None = Field(
        None, description=_FEATURES_DESC, examples=[_FEATURES_EXAMPLE]
    )


class PlanUpdate(BaseModel):
    """Admin: update a plan (PATCH semantics)."""

    name: str | None = Field(None, max_length=100)
    description: str | None = None
    price_vnd: int | None = Field(None, gt=0)
    is_active: bool | None = None
    is_public: bool | None = None
    sort_order: int | None = None
    features: dict | None = None
