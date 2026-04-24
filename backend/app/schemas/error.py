"""Standardized error response schema."""

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    """Unified error response returned by all API endpoints on failure."""

    detail: str = Field(
        ...,
        description="Human-readable error message describing what went wrong.",
        examples=["Email already registered"],
    )
