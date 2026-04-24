"""Shared / reusable schema components."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated list wrapper."""

    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str
    detail: str | None = None


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    app_name: str
    version: str
    environment: str
    database: str
    timestamp: str
