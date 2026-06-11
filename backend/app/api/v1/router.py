"""API v1 router — aggregates all v1 endpoint routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin_audit,
    admin_ipn,
    admin_lessons,
    admin_metrics,
    admin_payments,
    admin_subscriptions,
    admin_system,
    admin_users,
    admin_vt,
    ai_analysis,
    ai_forecast,
    ai_patterns,
    auth,
    health,
    lessons,
    market_data,
    market_global,
    premium,
    realtime_ws,
    users,
    virtual_trading,
    watchlist,
)

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(health.router)
api_v1_router.include_router(auth.router)
api_v1_router.include_router(users.router)
api_v1_router.include_router(premium.router)
api_v1_router.include_router(market_data.router)
api_v1_router.include_router(market_global.router)
api_v1_router.include_router(realtime_ws.router)
api_v1_router.include_router(virtual_trading.router)
api_v1_router.include_router(ai_analysis.router)
api_v1_router.include_router(ai_patterns.router)
api_v1_router.include_router(ai_forecast.router)
api_v1_router.include_router(watchlist.router)
api_v1_router.include_router(lessons.router)
api_v1_router.include_router(admin_lessons.router)
api_v1_router.include_router(admin_metrics.router)
api_v1_router.include_router(admin_payments.router)
api_v1_router.include_router(admin_subscriptions.router)
api_v1_router.include_router(admin_audit.router)
api_v1_router.include_router(admin_users.router)
api_v1_router.include_router(admin_vt.router)
api_v1_router.include_router(admin_ipn.router)
api_v1_router.include_router(admin_system.router)

