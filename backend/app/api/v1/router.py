"""API v1 router — aggregates all v1 endpoint routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin_alerts,
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
    alerts,
    auth,
    backtest,
    cap0,
    cap1,
    cap2,
    cap3,
    cap4,
    cap5,
    cap6,
    cap7,
    cap8,
    chart_drawings,
    health,
    lessons,
    market_analysis,
    market_data,
    market_global,
    portfolio_manager,
    premium,
    realtime_ws,
    telegram,
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
api_v1_router.include_router(market_analysis.router)
api_v1_router.include_router(realtime_ws.router)
api_v1_router.include_router(virtual_trading.router)
api_v1_router.include_router(ai_analysis.router)
api_v1_router.include_router(ai_patterns.router)
api_v1_router.include_router(ai_forecast.router)
api_v1_router.include_router(watchlist.router)
api_v1_router.include_router(chart_drawings.router)
api_v1_router.include_router(backtest.router)
api_v1_router.include_router(alerts.router)
api_v1_router.include_router(admin_alerts.router)
api_v1_router.include_router(telegram.router)
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
api_v1_router.include_router(portfolio_manager.router)
api_v1_router.include_router(cap0.router)
api_v1_router.include_router(cap1.router)
api_v1_router.include_router(cap2.router)
api_v1_router.include_router(cap3.router)
api_v1_router.include_router(cap4.router)
api_v1_router.include_router(cap5.router)
api_v1_router.include_router(cap6.router)
api_v1_router.include_router(cap7.router)
api_v1_router.include_router(cap8.router)

