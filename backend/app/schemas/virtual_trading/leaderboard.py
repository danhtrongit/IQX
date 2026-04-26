"""Virtual Trading — leaderboard schemas."""

from __future__ import annotations

import uuid

from pydantic import BaseModel


class LeaderboardEntry(BaseModel):
    """Single leaderboard row."""

    rank: int
    user_id: uuid.UUID
    display_name: str
    nav_vnd: int
    profit_vnd: int
    return_pct: float
    initial_cash_vnd: int


class LeaderboardResponse(BaseModel):
    """Paginated leaderboard."""

    entries: list[LeaderboardEntry]
    total: int  # evaluated count (may be < total_eligible if capped)
    total_eligible: int  # total active accounts
    evaluated_count: int  # how many accounts were actually scored
    page: int
    page_size: int
    sort_by: str
