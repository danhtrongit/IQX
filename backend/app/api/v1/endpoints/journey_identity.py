"""Authenticated evidence and mascot presentation APIs; no trading writes."""

import uuid
from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import CurrentUser, DBSession
from app.core.exceptions import BadRequestError
from app.services.journey_identity.classification import RULES_VERSION
from app.services.journey_identity.service import JourneyIdentityService

router = APIRouter(tags=["Linh thú"])


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DatasetRequest(StrictRequest):
    symbol: str = Field(pattern=r"^[A-Za-z0-9]{1,10}$")


class AssessmentRequest(StrictRequest):
    dataset_id: uuid.UUID
    answers: dict[str, Literal["ok", "neu", "bad"]]


class UIEventRequest(StrictRequest):
    event: Literal["level_seen", "hatch_seen", "reveal_seen", "greet_seen", "bot_run_updated_seen"]
    mascot_rules_version: int = RULES_VERSION
    level: int | None = Field(default=None, ge=0, le=6)
    run_id: uuid.UUID | None = None
    local_date: date | None = None


class MatchCountsResponse(BaseModel):
    ky_thuat: int = Field(ge=0)
    dong_tien: int = Field(ge=0)
    noi_bo: int = Field(ge=0)
    tin_tuc: int = Field(ge=0)
    dinh_gia: int = Field(ge=0)


class MascotResponse(BaseModel):
    id: Literal["bach_ho", "thanh_long", "loc_huou", "phung_hoang", "kim_quy"]
    name: str
    dominant_layer: Literal["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]
    assignment_basis: Literal["ai_match_count", "stable_tie_break", "zero_match_tie_break", "legacy_order_snapshot"]
    valid_pair_count: int = Field(ge=1)
    match_counts: MatchCountsResponse
    tied_layers: list[Literal["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]]
    window_start: datetime
    window_end: datetime
    assigned_at: datetime


class UIStateResponse(BaseModel):
    last_seen_egg_level: int | None = Field(default=None, ge=0, le=6)
    egg_hatch_seen_at: datetime | None
    reveal_seen_at: datetime | None
    greeted_local_date: date | None
    last_animated_bot_run_id: uuid.UUID | None


class BotRunResponse(BaseModel):
    status: Literal["idle", "running", "succeeded", "failed"]
    latest_run_id: uuid.UUID | None
    last_updated_at: datetime | None
    processed_unseen_sessions: int = Field(ge=0)
    issues: list[Any]
    connected: bool


class IdentityStateResponse(BaseModel):
    lifecycle: Literal["egg", "reveal_pending", "mascot", "pending_data_repair"]
    current_level: int = Field(ge=0, le=6)
    cap6_graduated_at: datetime | None
    mascot_rules_version: int = Field(ge=1)
    mascot: MascotResponse | None
    today_local: date
    timezone: str
    ui_state: UIStateResponse
    bot_run: BotRunResponse


class DatasetResponse(BaseModel):
    id: uuid.UUID
    symbol: str
    trading_date: date
    readings: dict[str, Any]
    price: float | None


class AssessmentResponse(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID


class RevealResponse(AssessmentResponse):
    ai_answers: dict[str, Literal["ok", "neu", "bad"]]
    readings: dict[str, Any]
    first_answers: dict[str, Literal["ok", "neu", "bad"]]


@router.get("/bot/mascot", response_model=IdentityStateResponse)
async def get_mascot(user: CurrentUser, db: DBSession):
    return await JourneyIdentityService(db).get(user.id)


@router.post("/bot/mascot/ui-events", response_model=IdentityStateResponse)
async def ui_event(body: UIEventRequest, user: CurrentUser, db: DBSession):
    if body.mascot_rules_version != RULES_VERSION:
        raise BadRequestError("Phiên bản Linh thú không hợp lệ")
    return await JourneyIdentityService(db).ui_event(
        user.id, body.event, level=body.level, run_id=body.run_id, local_date=body.local_date
    )


@router.post("/journey/reading-datasets", response_model=DatasetResponse)
async def create_dataset(body: DatasetRequest, user: CurrentUser, db: DBSession):
    return await JourneyIdentityService(db).create_dataset(user.id, body.symbol.upper())


@router.post("/journey/assessments", response_model=AssessmentResponse)
async def submit(body: AssessmentRequest, user: CurrentUser, db: DBSession):
    return await JourneyIdentityService(db).submit(user.id, body.dataset_id, body.answers)


@router.post("/journey/assessments/{assessment_id}/reveal", response_model=RevealResponse)
async def reveal(assessment_id: uuid.UUID, user: CurrentUser, db: DBSession):
    return await JourneyIdentityService(db).reveal(user.id, assessment_id)
