"""Chart drawings API — per-user TradingView line-tool persistence.

All endpoints require authentication; drawings are scoped to the current user
and a symbol so they survive a page refresh and sync across the user's devices.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.repositories.chart_drawing import ChartDrawingRepository
from app.schemas.chart_drawing import ChartDrawingResponse, ChartDrawingUpsert

router = APIRouter(prefix="/chart-drawings", tags=["Bản vẽ biểu đồ"])


@router.get("/{symbol}", response_model=ChartDrawingResponse)
async def get_chart_drawing(
    symbol: str, user: CurrentUser, db: DBSession,
) -> ChartDrawingResponse:
    """Lấy bản vẽ đã lưu của một mã (rỗng nếu chưa có)."""
    repo = ChartDrawingRepository(db)
    item = await repo.get(user.id, symbol)
    if item is None:
        return ChartDrawingResponse(symbol=symbol.upper(), state=None, updated_at=None)
    return ChartDrawingResponse(
        symbol=item.symbol, state=item.state, updated_at=item.updated_at
    )


@router.put("/{symbol}", response_model=ChartDrawingResponse)
async def save_chart_drawing(
    symbol: str, body: ChartDrawingUpsert, user: CurrentUser, db: DBSession,
) -> ChartDrawingResponse:
    """Lưu (ghi đè) bản vẽ hiện tại của một mã."""
    repo = ChartDrawingRepository(db)
    item = await repo.upsert(user.id, symbol, body.state)
    return ChartDrawingResponse(
        symbol=item.symbol, state=item.state, updated_at=item.updated_at
    )


@router.delete("/{symbol}", status_code=204)
async def delete_chart_drawing(
    symbol: str, user: CurrentUser, db: DBSession,
) -> None:
    """Xóa bản vẽ đã lưu của một mã."""
    repo = ChartDrawingRepository(db)
    await repo.delete(user.id, symbol)
