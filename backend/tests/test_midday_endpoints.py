"""Tests for midday market-analysis endpoints.

Verifies:
- GET /api/v1/market-analysis/midday/latest returns the midday row
- GET /api/v1/market-analysis/midday/{session_date} returns by date
- daily/latest does NOT return a midday row (report_type filter)
- midday/latest does NOT return a daily row (report_type filter)
- Admin POST /api/v1/market-analysis/midday/run triggers run_midday_analysis
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
        tagline={"direction": "neutral", "marker": "—", "text": "calm"},
        paragraphs={"structure": "s", "smart_money": "m", "market_health": "h"},
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


# ── midday/latest ─────────────────────────────────────────────────────────────

async def test_midday_latest_returns_only_midday(client: AsyncClient, db_session: AsyncSession):
    """Seed a midday row; midday/latest returns it."""
    d = dt.date(2026, 7, 1)
    db_session.add(_make_row(public_id="m1", session_date=d, report_type="midday", headline="Midday brief"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/midday/latest")
    assert r.status_code == 200
    assert r.json()["headline"] == "Midday brief"


async def test_midday_latest_404_when_empty(client: AsyncClient, db_session: AsyncSession):
    """No midday rows → 404."""
    r = await client.get("/api/v1/market-analysis/midday/latest")
    assert r.status_code == 404


async def test_midday_latest_ignores_daily_rows(client: AsyncClient, db_session: AsyncSession):
    """Only a daily row exists — midday/latest must return 404, not the daily row."""
    d = dt.date(2026, 7, 1)
    db_session.add(_make_row(public_id="d1", session_date=d, report_type="daily", headline="EOD brief"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/midday/latest")
    assert r.status_code == 404


async def test_daily_latest_ignores_midday_rows(client: AsyncClient, db_session: AsyncSession):
    """Only a midday row exists — daily/latest must return 404, not the midday row."""
    d = dt.date(2026, 7, 1)
    db_session.add(_make_row(public_id="m2", session_date=d, report_type="midday", headline="Midday brief"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/daily/latest")
    assert r.status_code == 404


async def test_daily_latest_returns_daily_when_both_exist(client: AsyncClient, db_session: AsyncSession):
    """Same date has both report types — daily/latest returns only the daily row."""
    d = dt.date(2026, 7, 1)
    db_session.add(_make_row(public_id="d2", session_date=d, report_type="daily", headline="EOD brief"))
    db_session.add(_make_row(public_id="m3", session_date=d, report_type="midday", headline="Midday brief"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/daily/latest")
    assert r.status_code == 200
    assert r.json()["headline"] == "EOD brief"


async def test_midday_latest_returns_midday_when_both_exist(client: AsyncClient, db_session: AsyncSession):
    """Same date has both report types — midday/latest returns only the midday row."""
    d = dt.date(2026, 7, 1)
    db_session.add(_make_row(public_id="d3", session_date=d, report_type="daily", headline="EOD brief"))
    db_session.add(_make_row(public_id="m4", session_date=d, report_type="midday", headline="Midday brief"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/midday/latest")
    assert r.status_code == 200
    assert r.json()["headline"] == "Midday brief"


async def test_midday_latest_returns_newest_when_multiple(client: AsyncClient, db_session: AsyncSession):
    """Multiple midday rows — latest returns the most recent."""
    db_session.add(_make_row(public_id="old-m", session_date=dt.date(2026, 6, 30), report_type="midday", headline="Old midday"))
    db_session.add(_make_row(public_id="new-m", session_date=dt.date(2026, 7, 1), report_type="midday", headline="New midday"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/midday/latest")
    assert r.status_code == 200
    assert r.json()["headline"] == "New midday"


# ── midday/{session_date} ─────────────────────────────────────────────────────

async def test_midday_by_date_returns_correct_row(client: AsyncClient, db_session: AsyncSession):
    """midday/{session_date} returns the midday row for that date."""
    d = dt.date(2026, 7, 1)
    db_session.add(_make_row(public_id="m5", session_date=d, report_type="midday", headline="Midday 2026-07-01"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/midday/2026-07-01")
    assert r.status_code == 200
    assert r.json()["headline"] == "Midday 2026-07-01"


async def test_midday_by_date_404_for_missing_date(client: AsyncClient, db_session: AsyncSession):
    """midday/{session_date} → 404 when no midday row exists for that date."""
    r = await client.get("/api/v1/market-analysis/midday/2026-07-01")
    assert r.status_code == 404


async def test_midday_by_date_ignores_daily_row(client: AsyncClient, db_session: AsyncSession):
    """Daily row on same date must NOT appear in midday/{session_date}."""
    d = dt.date(2026, 7, 1)
    db_session.add(_make_row(public_id="d4", session_date=d, report_type="daily", headline="EOD brief"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/midday/2026-07-01")
    assert r.status_code == 404


# ── response shape ────────────────────────────────────────────────────────────

async def test_midday_latest_response_shape(client: AsyncClient, db_session: AsyncSession):
    """AnalysisOut shape is correct — including charts from meta."""
    d = dt.date(2026, 7, 1)
    db_session.add(_make_row(public_id="m6", session_date=d, report_type="midday", headline="Shape test"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/midday/latest")
    assert r.status_code == 200
    body = r.json()
    for key in ("id", "session_date", "session_type", "generated_at", "headline", "tagline", "paragraphs", "scenarios"):
        assert key in body, f"missing key: {key}"
    assert body["charts"] == {}  # extracted from meta["charts"]


# ── pulse round-trip (C3) ─────────────────────────────────────────────────────

async def test_midday_latest_returns_pulse_from_meta(client: AsyncClient, db_session: AsyncSession):
    """CROSS-BOUNDARY GUARD (C3): a midday row whose meta carries a pulse block
    must surface through /midday/latest as AnalysisOut.pulse. Without wiring
    pulse through persist → AnalysisOut, MidDayView's `{data.pulse && ...}` is
    always false and the Pulse Bar never renders."""
    d = dt.date(2026, 7, 2)
    pulse = {
        "vn_index": {"value": 1842.3, "change": 2.14, "change_pct": 0.12, "sparkline": [1840.0, 1842.3]},
        "breadth": {"up": 198, "down": 185},
        "foreign_net_billion": 12.4,
        "liquidity": {"am_value_billion": 7850.0, "ma20_billion": 20658.0, "vs_ma20_pct": 38.0},
    }
    db_session.add(_make_row(
        public_id="m-pulse", session_date=d, report_type="midday", headline="Pulse round-trip",
        meta={"charts": {}, "pulse": pulse},
    ))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/midday/latest")
    assert r.status_code == 200
    body = r.json()
    assert body["pulse"] == pulse
    assert body["pulse"]["breadth"]["up"] == 198


async def test_daily_latest_pulse_defaults_null(client: AsyncClient, db_session: AsyncSession):
    """Daily rows have no pulse — AnalysisOut.pulse must default to null and the
    daily endpoint must not break (pulse is midday-only)."""
    d = dt.date(2026, 7, 2)
    db_session.add(_make_row(public_id="d-nopulse", session_date=d, report_type="daily", headline="EOD no pulse"))
    await db_session.commit()

    r = await client.get("/api/v1/market-analysis/daily/latest")
    assert r.status_code == 200
    assert r.json()["pulse"] is None


# ── admin midday/run ──────────────────────────────────────────────────────────

async def test_midday_run_requires_admin(client: AsyncClient, db_session: AsyncSession):
    """POST midday/run without auth → 401 or 403."""
    r = await client.post("/api/v1/market-analysis/midday/run")
    assert r.status_code in (401, 403)


async def test_midday_run_admin_triggers_generator(client: AsyncClient, db_session: AsyncSession):
    """POST midday/run as admin → 200, calls run_midday_analysis."""
    headers = await _admin_headers(db_session)

    fake_result = {
        "session_date": "2026-07-01",
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
        "app.services.ai.market_analysis.generator.run_midday_analysis",
        new=AsyncMock(return_value=fake_result),
    ):
        r = await client.post("/api/v1/market-analysis/midday/run", headers=headers)

    assert r.status_code == 200
    body = r.json()
    assert body["session_type"] == "low_volatility"
    assert body["valid"] is True
