"""Response schemas for the portfolio-manager API."""

from __future__ import annotations

from pydantic import BaseModel


class AnalyzeResponse(BaseModel):
    analysis: dict
    narrative: dict | None = None
    meta: dict
