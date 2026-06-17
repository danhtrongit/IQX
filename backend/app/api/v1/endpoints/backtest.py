"""Backtester API — factor catalog, run, and saved-strategy CRUD (Premium)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from app.api.deps import DBSession, PremiumUser
from app.repositories.backtest_strategy import BacktestStrategyRepository
from app.schemas.backtest import (
    BacktestRunRequest,
    BacktestStrategyCreate,
    BacktestStrategyResponse,
    BacktestStrategyUpdate,
)
from app.services.backtest.service import catalog_payload, run_backtest_request
from app.services.ta.conditions import CombinationError

router = APIRouter(prefix="/backtest", tags=["Backtest"])


@router.get("/catalog")
async def get_catalog(user: PremiumUser) -> dict:
    """Factor library, risk presets, and built-in templates for the UI."""
    return catalog_payload()


@router.post("/run")
async def run(req: BacktestRunRequest, user: PremiumUser) -> dict:
    """Run a backtest and return KPIs + equity curve + trades."""
    try:
        return await run_backtest_request(req)
    except (CombinationError, KeyError) as exc:
        detail = str(exc.args[0]) if exc.args else str(exc)
        raise HTTPException(status_code=400, detail=detail) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── Saved strategies ─────────────────────────────────────────────────────────


@router.get("/strategies", response_model=list[BacktestStrategyResponse])
async def list_strategies(user: PremiumUser, db: DBSession) -> list[BacktestStrategyResponse]:
    repo = BacktestStrategyRepository(db)
    items = await repo.list_for_user(user.id)
    return [BacktestStrategyResponse.model_validate(i) for i in items]


@router.post("/strategies", response_model=BacktestStrategyResponse, status_code=201)
async def create_strategy(body: BacktestStrategyCreate, user: PremiumUser, db: DBSession) -> BacktestStrategyResponse:
    repo = BacktestStrategyRepository(db)
    if await repo.get_by_name(user.id, body.name):
        raise HTTPException(status_code=409, detail="Đã tồn tại chiến lược cùng tên")
    symbol = body.symbol.upper() if body.symbol else None
    item = await repo.create(user.id, body.name, symbol, body.config)
    return BacktestStrategyResponse.model_validate(item)


@router.put("/strategies/{strategy_id}", response_model=BacktestStrategyResponse)
async def update_strategy(
    strategy_id: uuid.UUID, body: BacktestStrategyUpdate, user: PremiumUser, db: DBSession
) -> BacktestStrategyResponse:
    repo = BacktestStrategyRepository(db)
    item = await repo.get(user.id, strategy_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy chiến lược")
    symbol = body.symbol.upper() if body.symbol else body.symbol
    item = await repo.update(item, name=body.name, symbol=symbol, config=body.config)
    return BacktestStrategyResponse.model_validate(item)


@router.delete("/strategies/{strategy_id}", status_code=204)
async def delete_strategy(strategy_id: uuid.UUID, user: PremiumUser, db: DBSession) -> None:
    repo = BacktestStrategyRepository(db)
    await repo.delete(user.id, strategy_id)
