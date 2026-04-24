"""IQX Backend — FastAPI application entry point.

Run with:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from app.api.v1.endpoints import health
from app.api.v1.router import router as v1_router
from app.core.config import get_settings

settings = get_settings()

# Disable built-in ReDoc (its CDN tag "@next" is broken) and serve
# a custom route that pins a known-good version instead.
REDOC_CDN_URL = "https://cdn.jsdelivr.net/npm/redoc@2.2.0/bundles/redoc.standalone.js"

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=settings.app_description,
    docs_url="/docs",
    redoc_url=None,  # we mount our own below
)


@app.get("/redoc", include_in_schema=False)
async def custom_redoc_html() -> HTMLResponse:
    """Serve ReDoc with a pinned CDN version."""
    return HTMLResponse(
        f"""
<!DOCTYPE html>
<html>
<head>
    <title>{settings.app_name} - ReDoc</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700"
          rel="stylesheet">
    <style>body {{ margin: 0; padding: 0; }}</style>
</head>
<body>
    <redoc spec-url="/openapi.json"></redoc>
    <script src="{REDOC_CDN_URL}"></script>
</body>
</html>
"""
    )


# ── Health check (root-level, outside API versioning) ────────────
app.include_router(health.router)

# ── API v1 ───────────────────────────────────────────────────────
app.include_router(v1_router, prefix="/api/v1")
