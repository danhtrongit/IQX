"""Tests for API documentation endpoints (Swagger, ReDoc, OpenAPI JSON)."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_swagger_docs(client: AsyncClient) -> None:
    """GET /docs returns Swagger UI HTML."""
    resp = await client.get("/docs")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_redoc(client: AsyncClient) -> None:
    """GET /redoc returns ReDoc HTML."""
    resp = await client.get("/redoc")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_openapi_json(client: AsyncClient) -> None:
    """GET /openapi.json returns valid OpenAPI schema."""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    data = resp.json()
    assert "paths" in data
    assert "/api/v1/auth/login" in data["paths"]
    assert "/api/v1/users" in data["paths"]
