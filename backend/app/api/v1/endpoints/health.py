"""Health check endpoint."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.deps import DBSession
from app.core.config import get_settings
from app.schemas.common import HealthResponse

router = APIRouter(tags=["Sức khỏe hệ thống"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Kiểm tra sức khỏe",
    description="Trả về trạng thái ứng dụng, khả năng kết nối database, phiên bản và dấu thời gian.",
)
async def health_check(db: DBSession) -> JSONResponse:
    settings = get_settings()

    # Test database connectivity
    db_status = "healthy"
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_status = "unhealthy"

    is_healthy = db_status == "healthy"
    status_code = 200 if is_healthy else 503

    body = HealthResponse(
        status="ok" if is_healthy else "degraded",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
        database=db_status,
        timestamp=datetime.now(UTC).isoformat(),
    )

    return JSONResponse(status_code=status_code, content=body.model_dump())
