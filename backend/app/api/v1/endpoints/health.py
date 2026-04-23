"""Health check endpoint."""

from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.health import HealthResponse

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health check",
    description=(
        "Returns the current health status of the backend service. "
        "Use this endpoint for Kubernetes liveness/readiness probes, "
        "load balancer health checks, or monitoring dashboards.\n\n"
        "No authentication required."
    ),
    operation_id="healthCheck",
    responses={
        200: {
            "description": "Service is healthy and responding.",
            "content": {
                "application/json": {
                    "example": {
                        "status": "ok",
                        "service": "backend",
                        "version": "0.1.0",
                    }
                }
            },
        }
    },
)
async def health_check() -> HealthResponse:
    """Return current service health status."""
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service="backend",
        version=settings.app_version,
    )
