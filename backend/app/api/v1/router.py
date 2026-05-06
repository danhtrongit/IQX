"""API v1 router — aggregates all v1 endpoint routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import ai_analysis, auth, health, market_data, premium, users, virtual_trading, watchlist

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(health.router)
api_v1_router.include_router(auth.router)
api_v1_router.include_router(users.router)
api_v1_router.include_router(premium.router)
api_v1_router.include_router(market_data.router)
api_v1_router.include_router(virtual_trading.router)
api_v1_router.include_router(ai_analysis.router)
api_v1_router.include_router(watchlist.router)

