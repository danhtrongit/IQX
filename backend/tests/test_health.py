"""Tests for the health check endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_root(client: AsyncClient) -> None:
    """GET /health should return 200 with expected JSON body."""
    response = await client.get("/health")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "backend"
    assert data["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_health_v1(client: AsyncClient) -> None:
    """GET /api/v1/health should return the same health payload."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "backend"
    assert data["version"] == "0.1.0"
