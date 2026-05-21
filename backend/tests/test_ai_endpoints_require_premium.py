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


async def test_patterns_candles_requires_premium(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    _user, headers = await _make_non_premium_user(db_session, "no-prem-candles")
    resp = await client.get(
        "/api/v1/ai/patterns/candles?symbol=VCB",
        headers=headers,
    )
    assert resp.status_code == 403


async def test_patterns_charts_requires_premium(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    _user, headers = await _make_non_premium_user(db_session, "no-prem-charts")
    resp = await client.get(
        "/api/v1/ai/patterns/charts?symbol=VCB",
        headers=headers,
    )
    assert resp.status_code == 403


async def test_patterns_unauthenticated_returns_401(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/ai/patterns/candles?symbol=VCB")
    assert resp.status_code == 401


async def test_patterns_symbols_requires_premium(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    _user, headers = await _make_non_premium_user(db_session, "no-prem-symbols")
    resp = await client.get(
        "/api/v1/ai/patterns/candles/symbols",
        headers=headers,
    )
    assert resp.status_code == 403


async def test_forecast_ranking_requires_premium(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    _user, headers = await _make_non_premium_user(db_session, "no-prem-rank")
    resp = await client.get(
        "/api/v1/ai/forecast/ranking?horizon=5",
        headers=headers,
    )
    assert resp.status_code == 403


async def test_forecast_symbol_requires_premium(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    _user, headers = await _make_non_premium_user(db_session, "no-prem-fcsymbol")
    resp = await client.get(
        "/api/v1/ai/forecast/symbols/VCB",
        headers=headers,
    )
    assert resp.status_code == 403


async def test_forecast_unauthenticated_returns_401(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/ai/forecast/ranking?horizon=5")
    assert resp.status_code == 401


async def test_forecast_with_premium_user_passes_auth(
    client: AsyncClient, premium_user
) -> None:
    """User có active sub → endpoint không trả 403 (có thể 200 hoặc 502 upstream)."""
    _user, headers = premium_user
    resp = await client.get(
        "/api/v1/ai/forecast/ranking?horizon=5",
        headers=headers,
    )
    # Premium gate passed; upstream Google Sheets có thể fail trong test env → 502 ok
    assert resp.status_code in (200, 502)


async def test_virtual_trading_account_requires_premium(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    _user, headers = await _make_non_premium_user(db_session, "no-prem-vt-acct")
    resp = await client.get(
        "/api/v1/virtual-trading/account",
        headers=headers,
    )
    assert resp.status_code == 403


async def test_virtual_trading_portfolio_requires_premium(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    _user, headers = await _make_non_premium_user(db_session, "no-prem-vt-port")
    resp = await client.get(
        "/api/v1/virtual-trading/portfolio",
        headers=headers,
    )
    assert resp.status_code == 403


async def test_virtual_trading_orders_list_requires_premium(
    db_session: AsyncSession, client: AsyncClient
) -> None:
    _user, headers = await _make_non_premium_user(db_session, "no-prem-vt-orders")
    resp = await client.get(
        "/api/v1/virtual-trading/orders",
        headers=headers,
    )
    assert resp.status_code == 403
