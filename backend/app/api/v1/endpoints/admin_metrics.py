"""Admin metrics endpoints — KPI dashboard data."""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, DBSession
from app.schemas.admin_metrics import (
    DailyRevenuePoint,
    MetricsOverview,
    PlanDistributionPoint,
)
from app.services.admin_metrics import AdminMetricsService


router = APIRouter(prefix="/admin/metrics", tags=["Quản trị: Số liệu"])


@router.get("/overview", response_model=MetricsOverview)
async def get_overview(admin: AdminUser, db: DBSession) -> MetricsOverview:
    """Snapshot of platform KPIs."""
    svc = AdminMetricsService(db)
    return await svc.overview()


@router.get("/revenue", response_model=list[DailyRevenuePoint])
async def get_daily_revenue(
    admin: AdminUser,
    db: DBSession,
    days: int = Query(30, ge=1, le=365, description="Số ngày tính từ hôm nay"),
) -> list[DailyRevenuePoint]:
    """Daily revenue time series, oldest to newest."""
    svc = AdminMetricsService(db)
    return await svc.daily_revenue(days=days)


@router.get("/plan-distribution", response_model=list[PlanDistributionPoint])
async def get_plan_distribution(admin: AdminUser, db: DBSession) -> list[PlanDistributionPoint]:
    """All active plans with their current active subscription counts."""
    svc = AdminMetricsService(db)
    return await svc.plan_distribution()
