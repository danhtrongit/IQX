"""Watchlist API endpoints.

Single favorites list per user — no multi-list support.
All endpoints require authentication.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.repositories.watchlist import WatchlistRepository
from app.schemas.watchlist import (
    WatchlistAddRequest,
    WatchlistItemResponse,
    WatchlistReorderRequest,
    WatchlistResponse,
)

router = APIRouter(prefix="/watchlist", tags=["Danh mục theo dõi"])

_MAX_ITEMS = 50  # Maximum symbols in a watchlist


@router.get("", response_model=WatchlistResponse)
async def get_watchlist(user: CurrentUser, db: DBSession) -> WatchlistResponse:
    """Lấy danh sách cổ phiếu yêu thích."""
    repo = WatchlistRepository(db)
    items = await repo.list_items(user.id)
    return WatchlistResponse(
        items=[WatchlistItemResponse.model_validate(item) for item in items],
        count=len(items),
    )


@router.post("", response_model=WatchlistItemResponse, status_code=201)
async def add_to_watchlist(
    body: WatchlistAddRequest, user: CurrentUser, db: DBSession,
) -> WatchlistItemResponse:
    """Thêm cổ phiếu vào danh sách yêu thích."""
    repo = WatchlistRepository(db)

    # Check max limit
    count = await repo.count(user.id)
    if count >= _MAX_ITEMS:
        raise BadRequestError(f"Danh sách yêu thích tối đa {_MAX_ITEMS} mã")

    # Check duplicate
    existing = await repo.get_item(user.id, body.symbol)
    if existing:
        raise ConflictError(f"Mã {body.symbol.upper()} đã có trong danh sách")

    item = await repo.add_item(user.id, body.symbol)
    return WatchlistItemResponse.model_validate(item)


@router.delete("/{symbol}", status_code=204)
async def remove_from_watchlist(
    symbol: str, user: CurrentUser, db: DBSession,
) -> None:
    """Xóa cổ phiếu khỏi danh sách yêu thích."""
    repo = WatchlistRepository(db)
    deleted = await repo.remove_item(user.id, symbol)
    if not deleted:
        raise NotFoundError(f"Mã {symbol.upper()} không có trong danh sách")


@router.put("/reorder", response_model=WatchlistResponse)
async def reorder_watchlist(
    body: WatchlistReorderRequest, user: CurrentUser, db: DBSession,
) -> WatchlistResponse:
    """Sắp xếp lại thứ tự danh sách yêu thích."""
    repo = WatchlistRepository(db)
    await repo.reorder(user.id, body.symbols)
    items = await repo.list_items(user.id)
    return WatchlistResponse(
        items=[WatchlistItemResponse.model_validate(item) for item in items],
        count=len(items),
    )


@router.get("/check/{symbol}")
async def check_symbol(
    symbol: str, user: CurrentUser, db: DBSession,
) -> dict:
    """Kiểm tra xem mã có trong danh sách yêu thích không."""
    repo = WatchlistRepository(db)
    item = await repo.get_item(user.id, symbol)
    return {"symbol": symbol.upper(), "is_watched": item is not None}
