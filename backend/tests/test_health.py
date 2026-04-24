"""Tests for the health check endpoint."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check_returns_ok(client: AsyncClient):
    """Health endpoint should return 200 with app metadata."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert data["app_name"] == "IQX"
    assert "version" in data
    assert "timestamp" in data
    assert "database" in data
    assert "environment" in data
