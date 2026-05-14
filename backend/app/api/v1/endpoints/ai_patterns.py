"""AI pattern recognition endpoints.

Backed by the project's published Google Spreadsheet (sheets ``CANDLE`` and
``CHART``). The same spreadsheet that powers the macro market data sources
also stores the daily pattern recognition outputs.

Endpoints
---------

``GET /api/v1/ai/patterns/candles?symbol=...``
    Return candlestick patterns recognised for a single symbol (Doji,
    Hammer, Engulfing, ...). Maps each row to a public SVG illustration
    served from ``/patterns/candles/{name}.svg``.

``GET /api/v1/ai/patterns/charts?symbol=...``
    Same as above for classical chart patterns (Ascending Triangle, Cup
    and Handle, Head & Shoulders, ...). Illustrations are under
    ``/patterns/charts/{name}.svg``.

``GET /api/v1/ai/patterns/{kind}/symbols``
    List of symbols that currently have at least one row in the given
    sheet — useful for the frontend to enable/disable the panel.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query

from app.services.ai.patterns_service import (
    get_candle_patterns,
    get_chart_patterns,
    list_pattern_symbols,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/patterns", tags=["AI Mẫu hình"])


@router.get("/candles")
async def get_candles(
    symbol: str = Query(..., min_length=1, max_length=10, description="Mã cổ phiếu, ví dụ VCB"),
) -> dict[str, Any]:
    """Mẫu hình nến TA-Lib cho mã cổ phiếu."""
    try:
        return await get_candle_patterns(symbol)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to load candle patterns for %s: %s", symbol, exc, exc_info=True)
        raise HTTPException(status_code=502, detail="Không thể đọc dữ liệu mẫu nến") from exc


@router.get("/charts")
async def get_charts(
    symbol: str = Query(..., min_length=1, max_length=10, description="Mã cổ phiếu, ví dụ VCB"),
) -> dict[str, Any]:
    """Mẫu hình giá kinh điển cho mã cổ phiếu."""
    try:
        return await get_chart_patterns(symbol)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to load chart patterns for %s: %s", symbol, exc, exc_info=True)
        raise HTTPException(status_code=502, detail="Không thể đọc dữ liệu mẫu giá") from exc


@router.get("/{kind}/symbols")
async def list_symbols(kind: Literal["candles", "charts"]) -> dict[str, Any]:
    """Danh sách mã có sẵn pattern recognition trong sheet."""
    try:
        return await list_pattern_symbols(kind)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to list pattern symbols for %s: %s", kind, exc, exc_info=True)
        raise HTTPException(status_code=502, detail="Không thể đọc danh sách mã") from exc
