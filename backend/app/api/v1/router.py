"""API v1 router aggregator."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin_billing,
    admin_plans,
    auth,
    billing,
    health,
    plans,
    users,
)

router = APIRouter(prefix="/api/v1")
router.include_router(health.router)
router.include_router(auth.router)
router.include_router(users.router)
router.include_router(plans.router)
router.include_router(billing.router)
router.include_router(admin_plans.router)
router.include_router(admin_billing.router)
