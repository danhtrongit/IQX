"""Tests: AI endpoints require active Premium subscription."""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole, UserStatus


pytestmark = pytest.mark.asyncio


async def _make_non_premium_user(db: AsyncSession, email_prefix: str) -> tuple[User, dict[str, str]]:
    user = User(
        email=f"{email_prefix}-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("StrongPass123!"),
        first_name="T",
        last_name="U",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    return user, {"Authorization": f"Bearer {token}"}


async def test_dashboard_analyze_requires_premium(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    _user, headers = await _make_non_premium_user(db_session, "no-prem-dashboard")
    resp = await client.post(
        "/api/v1/ai/dashboard/analyze",
        json={"language": "vi"},
        headers=headers,
    )
    assert resp.status_code == 403


async def test_industry_analyze_requires_premium(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    _user, headers = await _make_non_premium_user(db_session, "no-prem-industry")
    resp = await client.post(
        "/api/v1/ai/industry/analyze",
        json={"icb_code": 8300, "language": "vi"},
        headers=headers,
    )
    assert resp.status_code == 403


async def test_industry_batch_analyze_requires_premium(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    _user, headers = await _make_non_premium_user(db_session, "no-prem-batch")
    resp = await client.post(
        "/api/v1/ai/industry/analyze-batch",
        json={"icb_codes": [8300], "language": "vi"},
        headers=headers,
    )
    assert resp.status_code == 403


async def test_insight_analyze_requires_premium(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    _user, headers = await _make_non_premium_user(db_session, "no-prem-insight")
    resp = await client.post(
        "/api/v1/ai/insight/analyze",
        json={"symbol": "VCB", "language": "vi"},
        headers=headers,
    )
    assert resp.status_code == 403


async def test_unauthenticated_ai_endpoints_return_401(client: AsyncClient) -> None:
    """Không có token → 401."""
    resp = await client.post("/api/v1/ai/dashboard/analyze", json={"language": "vi"})
    assert resp.status_code == 401
