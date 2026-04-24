"""Health check endpoint.

Mounted at the application root (outside /api/v1) for infrastructure
monitoring tools that need a simple liveness probe.
"""

from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    summary="Health Check",
    description="Returns the current health status of the service.",
)
async def health_check() -> dict[str, str]:
    """Return service health status with a UTC timestamp."""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
