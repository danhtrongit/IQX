"""Bounded telemetry payloads; never accept user identity or progress assertions."""

import math
from typing import Annotated

from pydantic import UUID4, BaseModel, ConfigDict, Field, field_validator


class JourneyEventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Keep client-generated IDs out of the deterministic UUIDv5 namespace
    # used by authoritative domain events in their business transactions.
    event_id: UUID4
    name: Annotated[
        str,
        Field(
            min_length=3,
            max_length=80,
            pattern=r"^(cap[0-6]|tour|mascot|journey_egg|identity|journey_model)_[a-z0-9_]+$",
        ),
    ]
    fields: dict[str, str | int | float | bool | None] = Field(default_factory=dict, max_length=20)

    @field_validator("fields")
    @classmethod
    def bounded_fields(cls, values: dict) -> dict:
        forbidden = {
            "user_id",
            "email",
            "password",
            "token",
            "access_token",
            "refresh_token",
            "note",
            "notes",
            "ghi_chu",
            "answers",
        }
        for key, value in values.items():
            if key in forbidden or len(key) > 48 or not key.replace("_", "").isalnum():
                raise ValueError("Trường sự kiện không hợp lệ")
            if isinstance(value, str) and len(value) > 160:
                raise ValueError("Giá trị sự kiện quá dài")
            if isinstance(value, float) and not math.isfinite(value):
                raise ValueError("Giá trị sự kiện phải hữu hạn")
        return values
