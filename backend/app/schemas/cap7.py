"""Schemas for Cấp 7's live portfolio-balance journey."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.cap7 import Cap7Progress

from app.services.portfolio_balance import (
    MAX_SECTOR_WEIGHT_PCT,
    MAX_SYMBOL_WEIGHT_PCT,
    MIN_HELD_SYMBOLS,
    MIN_KNOWN_SECTORS,
    PortfolioBalanceSnapshot,
)


class Cap7ProgressOut(BaseModel):
    """Live Cấp 7 gate. Values are recomputed from the same allocation snapshot."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    entered_at: datetime
    can_doi_ok: bool
    so_ma_dang_giu: int
    so_nganh_dang_giu: int
    ma_ty_trong_cao_nhat: str | None = None
    ty_trong_ma_cao_nhat_pct: float | None = None
    nganh_ty_trong_cao_nhat: str | None = None
    ty_trong_nganh_cao_nhat_pct: float | None = None
    ma_chua_co_gia: list[str]
    ma_chua_ro_nganh: list[str]
    du_lieu_day_du: bool
    nguong_ty_trong_ma_pct: float = MAX_SYMBOL_WEIGHT_PCT
    nguong_ty_trong_nganh_pct: float = MAX_SECTOR_WEIGHT_PCT
    toi_thieu_ma: int = MIN_HELD_SYMBOLS
    toi_thieu_nganh: int = MIN_KNOWN_SECTORS
    graduated_at: datetime | None = None
    time_to_graduate_hours: float | None = None


def cap7_progress_out(progress: Cap7Progress, snapshot: PortfolioBalanceSnapshot) -> Cap7ProgressOut:
    """Map persisted progression metadata and one live neutral snapshot to the wire."""

    return Cap7ProgressOut(
        id=progress.id,
        user_id=progress.user_id,
        entered_at=progress.entered_at,
        can_doi_ok=snapshot.can_doi_ok,
        so_ma_dang_giu=snapshot.held_symbol_count,
        so_nganh_dang_giu=snapshot.known_sector_count,
        ma_ty_trong_cao_nhat=snapshot.max_symbol,
        ty_trong_ma_cao_nhat_pct=snapshot.max_symbol_weight_pct,
        nganh_ty_trong_cao_nhat=snapshot.max_sector,
        ty_trong_nganh_cao_nhat_pct=snapshot.max_sector_weight_pct,
        ma_chua_co_gia=list(snapshot.unpriced_symbols),
        ma_chua_ro_nganh=list(snapshot.unknown_sector_symbols),
        du_lieu_day_du=snapshot.data_complete,
        graduated_at=progress.graduated_at,
        time_to_graduate_hours=progress.time_to_graduate_hours,
    )
