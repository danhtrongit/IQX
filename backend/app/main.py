"""FastAPI application entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from app.api.v1.router import router as v1_router
from app.core.config import get_settings

# ---------------------------------------------------------------------------
# Tag metadata (displayed in Swagger UI sidebar)
# ---------------------------------------------------------------------------

TAGS_METADATA = [
    {
        "name": "Health",
        "description": "Service availability probes for load balancers and monitoring.",
    },
    {
        "name": "Auth",
        "description": (
            "Authentication lifecycle: registration, login, token refresh, "
            "and password management. All tokens are stateless JWTs. "
            "Use the **Authorize** button above to set your Bearer token."
        ),
    },
    {
        "name": "Users",
        "description": (
            "User profile and admin user management.\n\n"
            "- **Self-service** (`/users/me`): Any authenticated user can update their own profile.\n"
            "- **Admin** (`/users`, `/users/{id}`): Requires `admin` role or superuser flag."
        ),
    },
    {
        "name": "Plans",
        "description": "Subscription plan catalog. Public endpoints — no auth required.",
    },
    {
        "name": "Billing",
        "description": (
            "Premium subscription checkout, payment orders, and SePay integration.\n\n"
            "**Payment flow:**\n"
            "1. `POST /billing/checkout` → creates order, returns SePay form data\n"
            "2. Frontend submits form to SePay → user pays\n"
            "3. SePay sends IPN to `POST /billing/sepay/ipn` → subscription activated\n\n"
            "⚠️ Callback URLs (`/success`, `/error`, `/cancel`) are **UX only**. "
            "IPN is the **source of truth** for payment confirmation."
        ),
    },
    {
        "name": "Admin Plans",
        "description": "Plan management. **Requires `admin` role.**",
    },
    {
        "name": "Admin Billing",
        "description": "View subscriptions and payment orders. **Requires `admin` role.**",
    },
]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: startup and shutdown hooks."""
    import app.models  # noqa: F401

    yield
    from app.core.database import dispose_engine

    await dispose_engine()


def custom_openapi(app: FastAPI) -> dict:
    """Generate a customized OpenAPI schema with extended metadata."""
    if app.openapi_schema:
        return app.openapi_schema

    settings = get_settings()
    schema = get_openapi(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "**IQX Backend API** - RESTful API for the IQX stock market platform.\n\n"
            "## Authentication\n"
            "Most endpoints require a **Bearer JWT** token. Obtain one via "
            "`POST /api/v1/auth/login`, then click **Authorize** and enter:\n"
            "```\nBearer <your_access_token>\n```\n\n"
            "## Roles\n"
            "| Role | Access |\n"
            "|------|--------|\n"
            "| `member` | Default. Self-service profile, future: watchlists, alerts |\n"
            "| `analyst` | Market analysis content (future) |\n"
            "| `admin` | Full user management, system configuration |\n\n"
            "## Error Format\n"
            'All errors return `{"detail": "Human-readable message"}`.\n'
        ),
        routes=app.routes,
        tags=TAGS_METADATA,
        servers=[
            {"url": "http://localhost:8000", "description": "Local development"},
        ],
        contact={
            "name": "IQX Engineering",
            "email": "dev@iqx.vn",
        },
        license_info={
            "name": "Proprietary",
        },
    )
    app.openapi_schema = schema
    return schema


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    settings = get_settings()

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=settings.debug,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
        openapi_tags=TAGS_METADATA,
    )

    # Custom OpenAPI schema with extended metadata
    application.openapi = lambda: custom_openapi(application)

    # Mount versioned API routers
    application.include_router(v1_router)

    # Top-level health (convenience alias)
    from app.api.v1.endpoints.health import health_check

    application.get(
        "/health",
        tags=["Health"],
        summary="Root health check",
        description="Alias for `/api/v1/health`. Use for simple uptime probes.",
        response_model_exclude_none=True,
    )(health_check)

    return application


app = create_app()
