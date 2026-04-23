"""Standardized error response schema for consistent API error reporting."""

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    """Unified error response returned by all API endpoints on failure.

    Every non-2xx response follows this shape so frontend clients can rely
    on a single error-handling contract.
    """

    detail: str = Field(
        ...,
        description="Human-readable error message describing what went wrong.",
        examples=["Email already registered"],
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"detail": "Incorrect email or password"},
                {"detail": "Could not validate credentials"},
                {"detail": "Admin privileges required"},
                {"detail": "User not found"},
            ]
        }
    }
