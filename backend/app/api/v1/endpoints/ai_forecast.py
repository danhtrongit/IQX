"""AI forecast model endpoints (MODEL_AI sheet).

Powers the "Mô hình dự báo" right-sidebar panel: a leaderboard of stocks
ranked by expected return for a given horizon (T+3 / T+5 / T+10), plus
the per-symbol forecast across all three horizons.

Endpoints
---------

``GET /api/v1/ai/forecast/ranking?horizon=5&limit=20``
    Top stocks for the given horizon ordered by expected return desc.

``GET /api/v1/ai/forecast/symbols/{symbol}``
    Forecast for a single symbol across all three horizons.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query

from app.services.ai.forecast_service import (
    get_forecast_for_symbol,
    get_forecast_ranking,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/forecast", tags=["AI Mô hình dự báo"])


@router.get("/ranking")
async def get_ranking(
    horizon: Literal["3", "5", "10"] = Query("5", description="Khung thời gian: 3, 5 hoặc 10"),
    limit: int = Query(20, ge=1, le=100, description="Số mã trả về (mặc định 20)"),
) -> dict[str, Any]:
    """Bảng xếp hạng mã theo Return kỳ vọng cho 1 khung dự báo."""
    try:
        return await get_forecast_ranking(horizon, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to load forecast ranking %s: %s", horizon, exc, exc_info=True)
        raise HTTPException(status_code=502, detail="Không thể đọc dữ liệu mô hình AI") from exc


@router.get("/symbols/{symbol}")
async def get_symbol_forecast(symbol: str) -> dict[str, Any]:
    """Dự báo của 1 mã cho cả 3 khung T+3 / T+5 / T+10."""
    try:
        return await get_forecast_for_symbol(symbol)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to load forecast for %s: %s", symbol, exc, exc_info=True)
        raise HTTPException(status_code=502, detail="Không thể đọc dữ liệu mô hình AI") from exc
