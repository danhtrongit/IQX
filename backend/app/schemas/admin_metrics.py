"""Pydantic schemas for admin metrics endpoints."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class PlanDistributionPoint(BaseModel):
    plan_code: str
    plan_name: str
    active_subscriptions: int
    price_vnd: int


class DailyRevenuePoint(BaseModel):
    date: date
    paid_orders: int
    revenue_vnd: int  # sum of amount_vnd for PAID orders that day, excluding admin_grant


class MetricsOverview(BaseModel):
    # Users
    total_users: int
    active_users: int
    new_users_today: int
    new_users_last_7d: int
    new_users_last_30d: int

    # Premium
    active_subscribers: int       # users with sub.status='active' AND period_end > now()
    active_trial_count: int       # subscribers on TRIAL_7D plan with period still valid
    active_paid_count: int        # active_subscribers - active_trial_count
    plan_distribution: list[PlanDistributionPoint]  # NON-trial plans only

    # Revenue
    mrr_vnd: int                  # active PAID subs: sum(price_vnd / duration_days) * 30
    revenue_today_vnd: int
    revenue_last_7d_vnd: int
    revenue_last_30d_vnd: int

    # Virtual trading
    vt_active_accounts: int        # status='active'
    vt_orders_today: int

    # System
    generated_at: datetime
