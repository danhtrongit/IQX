"""Seed sample subscription plans.

Usage: python -m app.scripts.seed_plans

Idempotent: skips plans that already exist (by code).
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models.plan import Plan

PLANS = [
    {
        "code": "premium_basic",
        "name": "Premium Basic",
        "description": "Gói cơ bản cho nhà đầu tư cá nhân. Mở rộng watchlist và portfolio, xem báo cáo premium.",
        "price_vnd": 99000,
        "billing_cycle": "monthly",
        "duration_months": 1,
        "sort_order": 1,
        "features": {
            "max_watchlists": 3,
            "max_portfolio_symbols": 20,
            "premium_reports": True,
            "advanced_alerts": False,
            "analyst_content": False,
        },
    },
    {
        "code": "premium_pro",
        "name": "Premium Pro",
        "description": "Gói nâng cao với alert thông minh và báo cáo chuyên sâu. Phù hợp trader chủ động.",
        "price_vnd": 299000,
        "billing_cycle": "monthly",
        "duration_months": 1,
        "sort_order": 2,
        "features": {
            "max_watchlists": 10,
            "max_portfolio_symbols": 50,
            "premium_reports": True,
            "advanced_alerts": True,
            "analyst_content": False,
        },
    },
    {
        "code": "premium_elite",
        "name": "Premium Elite",
        "description": "Gói cao cấp nhất. Toàn quyền truy cập khu vực analyst, nội dung premium và alert nâng cao.",
        "price_vnd": 599000,
        "billing_cycle": "monthly",
        "duration_months": 1,
        "sort_order": 3,
        "features": {
            "max_watchlists": -1,  # unlimited
            "max_portfolio_symbols": -1,
            "premium_reports": True,
            "advanced_alerts": True,
            "analyst_content": True,
        },
    },
]


async def seed():
    """Insert sample plans if they don't already exist."""
    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as session:
        for plan_data in PLANS:
            result = await session.execute(
                select(Plan).where(Plan.code == plan_data["code"])
            )
            if result.scalar_one_or_none() is not None:
                print(f"  ⏭  Plan '{plan_data['code']}' already exists, skipping.")
                continue

            plan = Plan(**plan_data)
            session.add(plan)
            print(
                f"  ✅ Created plan '{plan_data['code']}' ({plan_data['price_vnd']:,}đ)"
            )

        await session.commit()

    await engine.dispose()
    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(seed())
