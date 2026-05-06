"""IQX Backend — FastAPI application entry point."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.exceptions import AppException
from app.core.logging import setup_logging
from app.core.rate_limit import limiter

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application startup and shutdown lifecycle."""
    setup_logging()
    settings = get_settings()
    logger.info(
        "🚀 Starting %s v%s (%s)",
        settings.APP_NAME,
        settings.APP_VERSION,
        settings.APP_ENV,
    )

    # Start shared HTTP client for market data
    from app.services.market_data.http import shutdown as http_shutdown
    from app.services.market_data.http import startup as http_startup

    await http_startup()

    # Start Redis cache
    from app.services.cache.redis_cache import shutdown as redis_shutdown
    from app.services.cache.redis_cache import startup as redis_startup

    await redis_startup()

    yield

    # Shutdown
    await redis_shutdown()
    await http_shutdown()
    logger.info("👋 Shutting down %s", settings.APP_NAME)


def create_app() -> FastAPI:
    """Application factory."""
    settings = get_settings()

    # Docs gating: disabled in production by default
    docs_url = "/docs" if settings.api_docs_enabled else None
    redoc_url = "/redoc" if settings.api_docs_enabled else None
    openapi_url = "/openapi.json" if settings.api_docs_enabled else None

    app = FastAPI(
        title=f"{settings.APP_NAME} API",
        version=settings.APP_VERSION,
        description="IQX Backend API — Ứng dụng FastAPI sẵn sàng cho môi trường sản xuất",
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
        lifespan=lifespan,
    )

    # ── CORS ─────────────────────────────────────────
    origins = settings.cors_origins_list
    allow_credentials = True

    # Safety: do not allow credentials with wildcard origins
    if "*" in origins and allow_credentials:
        logger.warning(
            "CORS: allow_credentials=True with wildcard origins is insecure, disabling credentials"
        )
        allow_credentials = False

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=allow_credentials,
        allow_methods=settings.cors_methods_list,
        allow_headers=settings.cors_headers_list,
    )

    # ── Exception handlers ───────────────────────────
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "code": exc.code,
            },
        )

    # ── Rate limiting ────────────────────────────────
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
    app.add_middleware(SlowAPIMiddleware)

    # ── Routers ──────────────────────────────────────
    app.include_router(api_v1_router)

    return app


app = create_app()
