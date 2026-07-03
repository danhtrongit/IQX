"""Tests for premarket market-analysis endpoints.

Verifies:
- GET /api/v1/market-analysis/premarket/latest returns the premarket row
- GET /api/v1/market-analysis/premarket/{session_date} returns by date
- daily/latest does NOT return a premarket row (report_type isolation)
- midday/latest does NOT return a premarket row (report_type isolation)
- premarket/latest does NOT return a daily or midday row (report_type isolation)
- Admin POST /api/v1/market-analysis/premarket/run triggers run_premarket_analysis
"""

from __future__ import annotations

import datetime as dt
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.market_analysis import AnalysisHistory
from app.models.user import User, UserRole, UserStatus

pytestmark = pytest.mark.asyncio


# ── helpers ──────────────────────────────────────────────────────────────────


def _make_row(
    *,
    public_id: str,
    session_date: dt.date,
    report_type: str,
    headline: str,
    is_published: bool = True,
    meta: dict | None = None,
) -> AnalysisHistory:
    return AnalysisHistory(
        public_id=public_id,
        session_date=session_date,
        session_type="low_volatility",
        report_type=report_type,
        headline=headline,
        tagline={"text": "calm"},
        paragraphs={"world_paragraph": "test paragraph"},
        scenarios=[],
        watchlist=[],
        meta={"charts": {}} if meta is None else meta,
        is_published=is_published,
    )


async def _admin_headers(db: AsyncSession) -> dict[str, str]:
    user = User(
        email=f"adm-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Adm@1234"),
        full_name="Admin User".strip(),
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    return {"Authorization": f"Bearer {token}"}


# ── premarket/latest ──────────────────────────────────────────────────────────


async def test_premarket_latest_returns_only_premarket(client: AsyncClient, db_session: AsyncSession):
    """Seed a premarket row; premarket/latest returns it."""
    d = dt.date(2026, 7, 3)
    db_session.add(_make_row(public_id="pm1", session_date=d, report_type="premarket", headline="Premarket brief"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/premarket/latest")
    assert r.status_code == 200
    assert r.json()["headline"] == "Premarket brief"


async def test_premarket_latest_404_when_empty(client: AsyncClient, db_session: AsyncSession):
    """No premarket rows → 404."""
    r = await client.get("/api/v1/market-analysis/premarket/latest")
    assert r.status_code == 404


async def test_premarket_latest_ignores_daily_rows(client: AsyncClient, db_session: AsyncSession):
    """Only a daily row exists — premarket/latest must return 404, not the daily row."""
    d = dt.date(2026, 7, 3)
    db_session.add(_make_row(public_id="d1-pm", session_date=d, report_type="daily", headline="EOD brief"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/premarket/latest")
    assert r.status_code == 404


async def test_premarket_latest_ignores_midday_rows(client: AsyncClient, db_session: AsyncSession):
    """Only a midday row exists — premarket/latest must return 404, not the midday row."""
    d = dt.date(2026, 7, 3)
    db_session.add(_make_row(public_id="m1-pm", session_date=d, report_type="midday", headline="Midday brief"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/premarket/latest")
    assert r.status_code == 404


async def test_daily_latest_ignores_premarket_rows(client: AsyncClient, db_session: AsyncSession):
    """Only a premarket row exists — daily/latest must return 404, not the premarket row."""
    d = dt.date(2026, 7, 3)
    db_session.add(_make_row(public_id="pm2", session_date=d, report_type="premarket", headline="Premarket brief"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/daily/latest")
    assert r.status_code == 404


async def test_midday_latest_ignores_premarket_rows(client: AsyncClient, db_session: AsyncSession):
    """Only a premarket row exists — midday/latest must return 404, not the premarket row."""
    d = dt.date(2026, 7, 3)
    db_session.add(_make_row(public_id="pm3", session_date=d, report_type="premarket", headline="Premarket brief"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/midday/latest")
    assert r.status_code == 404


async def test_premarket_latest_returns_newest_when_multiple(client: AsyncClient, db_session: AsyncSession):
    """Multiple premarket rows — latest returns the most recent."""
    db_session.add(_make_row(public_id="old-pm", session_date=dt.date(2026, 7, 1), report_type="premarket", headline="Old premarket"))
    db_session.add(_make_row(public_id="new-pm", session_date=dt.date(2026, 7, 3), report_type="premarket", headline="New premarket"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/premarket/latest")
    assert r.status_code == 200
    assert r.json()["headline"] == "New premarket"


async def test_premarket_latest_all_three_exist(client: AsyncClient, db_session: AsyncSession):
    """Same date has all three report types — each endpoint returns only its own."""
    d = dt.date(2026, 7, 3)
    db_session.add(_make_row(public_id="d-all", session_date=d, report_type="daily", headline="EOD"))
    db_session.add(_make_row(public_id="m-all", session_date=d, report_type="midday", headline="Midday"))
    db_session.add(_make_row(public_id="pm-all", session_date=d, report_type="premarket", headline="Premarket"))
    await db_session.commit()

    r_daily = await client.get("/api/v1/market-analysis/daily/latest")
    r_midday = await client.get("/api/v1/market-analysis/midday/latest")
    r_pm = await client.get("/api/v1/market-analysis/premarket/latest")

    assert r_daily.json()["headline"] == "EOD"
    assert r_midday.json()["headline"] == "Midday"
    assert r_pm.json()["headline"] == "Premarket"


# ── premarket/{session_date} ──────────────────────────────────────────────────


async def test_premarket_by_date_returns_correct_row(client: AsyncClient, db_session: AsyncSession):
    """premarket/{session_date} returns the premarket row for that date."""
    d = dt.date(2026, 7, 3)
    db_session.add(_make_row(public_id="pm4", session_date=d, report_type="premarket", headline="Premarket 2026-07-03"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/premarket/2026-07-03")
    assert r.status_code == 200
    assert r.json()["headline"] == "Premarket 2026-07-03"


async def test_premarket_by_date_404_for_missing_date(client: AsyncClient, db_session: AsyncSession):
    """premarket/{session_date} → 404 when no premarket row exists for that date."""
    r = await client.get("/api/v1/market-analysis/premarket/2026-07-03")
    assert r.status_code == 404


async def test_premarket_by_date_ignores_daily_row(client: AsyncClient, db_session: AsyncSession):
    """Daily row on same date must NOT appear in premarket/{session_date}."""
    d = dt.date(2026, 7, 3)
    db_session.add(_make_row(public_id="d2-pm", session_date=d, report_type="daily", headline="EOD brief"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/premarket/2026-07-03")
    assert r.status_code == 404


# ── response shape ────────────────────────────────────────────────────────────


async def test_premarket_latest_response_shape(client: AsyncClient, db_session: AsyncSession):
    """AnalysisOut shape is correct for premarket rows."""
    d = dt.date(2026, 7, 3)
    db_session.add(_make_row(public_id="pm5", session_date=d, report_type="premarket", headline="Shape test"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/premarket/latest")
    assert r.status_code == 200
    body = r.json()
    for key in ("id", "session_date", "session_type", "generated_at", "headline", "tagline", "paragraphs", "scenarios"):
        assert key in body, f"missing key: {key}"


# ── admin premarket/run ───────────────────────────────────────────────────────


async def test_premarket_run_requires_admin(client: AsyncClient, db_session: AsyncSession):
    """POST premarket/run without auth → 401 or 403."""
    r = await client.post("/api/v1/market-analysis/premarket/run")
    assert r.status_code in (401, 403)


async def test_premarket_run_admin_triggers_generator(client: AsyncClient, db_session: AsyncSession):
    """POST premarket/run as admin → 200, calls run_premarket_analysis."""
    headers = await _admin_headers(db_session)

    fake_result = {
        "session_date": "2026-07-03",
        "session_type": "low_volatility",
        "valid": True,
        "persisted": True,
        "memory_loaded": False,
        "attempts": 1,
        "errors": [],
        "model": "test-model",
        "generation_time_ms": 123,
    }

    with patch(
        "app.services.ai.market_analysis.generator.run_premarket_analysis",
        new=AsyncMock(return_value=fake_result),
    ):
        r = await client.post("/api/v1/market-analysis/premarket/run", headers=headers)

    assert r.status_code == 200
    body = r.json()
    assert body["session_type"] == "low_volatility"
    assert body["valid"] is True
