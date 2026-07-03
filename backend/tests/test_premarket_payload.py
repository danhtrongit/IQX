"""Tests for the pre-market payload builder (Task B2)."""

import datetime as dt
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from app.services.ai.market_analysis import premarket_payload as PP


def _snap(symbol, price, pct, stale=False, snapshot_date=None):
    class R:  # minimal stand-in for MarketDataSnapshot row
        pass

    r = R()
    r.symbol = symbol
    r.last_price = price
    r.change_percent = pct
    r.stale = stale
    r.asset_category = "fx" if symbol == "VND=X" else "us_index"
    r.name = symbol
    r.snapshot_date = snapshot_date
    return r


@pytest.mark.asyncio
async def test_payload_cells_and_usdvnd_inversion(db_session):
    rows = [_snap("^GSPC", 6124.85, 0.40), _snap("VND=X", 26100, -0.15)]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    assert cells["^GSPC"]["sentiment"] == "up"
    assert cells["VND=X"]["sentiment"] == "up"          # USD weakening (−0.15%) → positive
    assert cells["^N225"]["value"] is None               # absent symbol degrades, cell still present
    assert "global_markets" in p["meta"]["missing_fields"] or cells["^N225"]["stale"]
    assert p["meta"]["report_type"] == "premarket" and p["news_pool"] == [] and p["events_pool"] == []


@pytest.mark.asyncio
async def test_all_six_cells_always_emitted(db_session):
    """All 6 grid cells must be present even when snapshot is completely empty.

    VCB fallback is also mocked to fail so that VND=X also degrades to None.
    """
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=[])), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))), \
         patch.object(PP, "fetch_fx", new=AsyncMock(side_effect=Exception("vcb down"))):
        p = await PP.build_premarket_payload(db_session)

    expected_ids = {"^GSPC", "^IXIC", "^N225", "BZ=F", "GC=F", "VND=X"}
    cell_ids = {c["id"] for c in p["global_markets"]["cells"]}
    assert cell_ids == expected_ids
    for cell in p["global_markets"]["cells"]:
        assert cell["value"] is None
        assert cell["stale"] is True
    assert "global_markets" in p["meta"]["missing_fields"]


@pytest.mark.asyncio
async def test_usdvnd_positive_change_is_down(db_session):
    """USD/VND: change_pct > 0 (USD strengthening) → 'down' sentiment."""
    rows = [_snap("VND=X", 26200, 0.50)]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    assert cells["VND=X"]["sentiment"] == "down"


@pytest.mark.asyncio
async def test_usdvnd_zero_change_is_flat(db_session):
    """USD/VND: change_pct == 0 → 'flat' sentiment."""
    rows = [_snap("VND=X", 26100, 0.0)]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    assert cells["VND=X"]["sentiment"] == "flat"


@pytest.mark.asyncio
async def test_news_fetch_failure_degrades_gracefully(db_session):
    """News fetch failure → empty pool + 'news_pool' in missing_fields."""
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=[])), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(side_effect=Exception("network err"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)
    assert p["news_pool"] == []
    assert "news_pool" in p["meta"]["missing_fields"]


@pytest.mark.asyncio
async def test_events_fetch_failure_degrades_gracefully(db_session):
    """Events fetch failure → empty pool + 'events_pool' in missing_fields."""
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=[])), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(side_effect=Exception("timeout"))):
        p = await PP.build_premarket_payload(db_session)
    assert p["events_pool"] == []
    assert "events_pool" in p["meta"]["missing_fields"]


@pytest.mark.asyncio
async def test_vcb_fallback_for_missing_vndx(db_session):
    """VND=X absent from snapshot → VCB FX fallback used for value."""
    rows = [_snap("^GSPC", 6124.85, 0.40)]
    vcb_rows = [
        {"currency_code": "USD", "sell": 26150.0, "date": "2026-07-03"},
        {"currency_code": "EUR", "sell": 28000.0, "date": "2026-07-03"},
    ]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))), \
         patch.object(PP, "fetch_fx", new=AsyncMock(return_value=(vcb_rows, "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    vnd_cell = cells["VND=X"]
    assert vnd_cell["value"] == 26150.0
    assert vnd_cell["change_pct"] is None
    assert vnd_cell.get("source") == "vcb"
    # stale could be False since we got a real value from VCB
    assert vnd_cell["sentiment"] == "flat"  # None change_pct → flat


@pytest.mark.asyncio
async def test_meta_structure(db_session):
    """meta block has required keys with correct report_type."""
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=[])), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)

    meta = p["meta"]
    assert meta["report_type"] == "premarket"
    assert "generated_for_date" in meta
    assert "missing_fields" in meta
    assert "weekday_vi" in meta
    assert "is_post_weekend" in meta
    assert "is_post_holiday" in meta
    assert isinstance(meta["missing_fields"], list)


@pytest.mark.asyncio
async def test_config_mirrors_meta_flags(db_session):
    """config block must duplicate meta flags consumed by prompt."""
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=[])), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)

    cfg = p["config"]
    assert cfg["is_post_weekend"] == p["meta"]["is_post_weekend"]
    assert cfg["is_post_holiday"] == p["meta"]["is_post_holiday"]
    assert "generated_for_date" in cfg


@pytest.mark.asyncio
async def test_cells_fixed_order(db_session):
    """The 6 cells must be emitted in fixed order regardless of snapshot order."""
    rows = [
        _snap("GC=F", 3350.0, 0.2),
        _snap("^GSPC", 6124.85, 0.40),
        _snap("BZ=F", 78.5, -0.3),
    ]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)

    expected_order = ["^GSPC", "^IXIC", "^N225", "BZ=F", "GC=F", "VND=X"]
    actual_order = [c["id"] for c in p["global_markets"]["cells"]]
    assert actual_order == expected_order


@pytest.mark.asyncio
async def test_stale_cell_in_missing_fields(db_session):
    """Stale snapshot row → cell stale=True and symbol in missing_fields (or stale noted)."""
    rows = [_snap("^GSPC", 6000.0, 0.1, stale=True)]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    assert cells["^GSPC"]["stale"] is True


@pytest.mark.asyncio
async def test_stale_vndx_uses_vcb_fallback(db_session):
    """VND=X row present but stale=True + VCB available → cell uses VCB value, source vcb."""
    # Provide all 6 grid symbols so no other symbol is absent (only VND=X is stale)
    rows = [
        _snap("^GSPC", 6124.85, 0.40),
        _snap("^IXIC", 19800.0, 0.30),
        _snap("^N225", 39500.0, -0.20),
        _snap("BZ=F", 78.5, -0.30),
        _snap("GC=F", 3350.0, 0.20),
        _snap("VND=X", 25900.0, -0.10, stale=True),
    ]
    vcb_rows = [
        {"currency_code": "USD", "sell": 26200.0, "date": "2026-07-03"},
    ]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))), \
         patch.object(PP, "fetch_fx", new=AsyncMock(return_value=(vcb_rows, "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    vnd_cell = cells["VND=X"]
    assert vnd_cell["value"] == 26200.0
    assert vnd_cell["change_pct"] is None
    assert vnd_cell.get("source") == "vcb"
    assert vnd_cell["stale"] is False
    assert vnd_cell["sentiment"] == "flat"
    # VND=X resolved via VCB — must NOT contribute to missing_fields
    assert "global_markets" not in p["meta"]["missing_fields"]


@pytest.mark.asyncio
async def test_stale_vndx_vcb_also_fails_uses_stale_row(db_session):
    """VND=X row stale=True + VCB fails → falls back to stale row, NOT in missing_fields."""
    # Provide all 6 grid symbols so VND=X stale is the only issue
    rows = [
        _snap("^GSPC", 6124.85, 0.40),
        _snap("^IXIC", 19800.0, 0.30),
        _snap("^N225", 39500.0, -0.20),
        _snap("BZ=F", 78.5, -0.30),
        _snap("GC=F", 3350.0, 0.20),
        _snap("VND=X", 25900.0, -0.10, stale=True),
    ]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))), \
         patch.object(PP, "fetch_fx", new=AsyncMock(side_effect=Exception("vcb down"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    vnd_cell = cells["VND=X"]
    assert vnd_cell["value"] == 25900.0
    assert vnd_cell["stale"] is True
    assert vnd_cell["value"] is not None
    # A stale price beats None — stale row is not absent, must NOT degrade global_markets
    assert "global_markets" not in p["meta"]["missing_fields"]


def _seed_daily_row():
    from app.models.market_analysis import AnalysisHistory

    return AnalysisHistory(
        public_id="vnindex-2026-07-02",
        session_date=dt.date(2026, 7, 2),
        session_type="normal",
        report_type="daily",
        headline="VN-Index giữ vững 1.300 — dòng tiền lan tỏa",
        tagline={"text": "TÍCH CỰC"},
        paragraphs={},
        scenarios=[{"condition": "nếu giữ 1.295", "outcome": "hồi phục"}],
        watchlist=[{"key": "VN-Index", "reason": "ngưỡng 1.295"}],
        is_published=True,
    )


class _StrictConcurrencySession:
    """Real-session proxy mimicking the production driver contract.

    asyncpg/Postgres (unlike test aiosqlite, which queues cursor ops through a
    worker thread) forbids concurrent operations on one AsyncSession — that is
    exactly what SQLAlchemy raises in production. Queries are still executed
    for real against the wrapped session; overlapping `execute` calls raise.
    """

    def __init__(self, inner):
        self._inner = inner
        self._in_flight = False

    def __getattr__(self, name):
        return getattr(self._inner, name)

    async def execute(self, *args, **kwargs):
        import asyncio as _asyncio

        if self._in_flight:
            raise RuntimeError(
                "concurrent operations are not permitted on one AsyncSession"
            )
        self._in_flight = True
        try:
            await _asyncio.sleep(0)  # deterministic interleave point (real drivers yield on IO)
            return await self._inner.execute(*args, **kwargs)
        finally:
            self._in_flight = False


@pytest.mark.asyncio
async def test_eod_previous_summary_loads_with_shared_session(db_session):
    """eod_previous_summary must be populated from a REAL session.

    Regression: `_load_previous_eod(db)` used to run inside asyncio.gather
    together with `load_latest_snapshot(db)` on the SAME AsyncSession —
    forbidden by SQLAlchemy, the query raised on every production run and the
    try/except silently returned None. Both DB queries are intentionally NOT
    mocked here; only the external HTTP fetches are.
    """
    db_session.add(_seed_daily_row())
    await db_session.commit()

    with patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))), \
         patch.object(PP, "fetch_fx", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)

    eod = p["eod_previous_summary"]
    assert eod is not None
    assert eod["headline"] == "VN-Index giữ vững 1.300 — dòng tiền lan tỏa"
    assert eod["session_date"] == "2026-07-02"
    assert eod["scenarios"] == [{"condition": "nếu giữ 1.295", "outcome": "hồi phục"}]


@pytest.mark.asyncio
async def test_db_queries_are_sequential_under_strict_session(db_session):
    """The two DB queries (snapshot + previous EOD) must never overlap.

    Uses the strict proxy above to enforce the production driver contract; on
    the old gather-based code the previous-EOD query overlapped the snapshot
    query, raised, and eod_previous_summary silently degraded to None.
    """
    db_session.add(_seed_daily_row())
    await db_session.commit()

    strict_db = _StrictConcurrencySession(db_session)

    with patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))), \
         patch.object(PP, "fetch_fx", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(strict_db)

    eod = p["eod_previous_summary"]
    assert eod is not None
    assert eod["headline"] == "VN-Index giữ vững 1.300 — dòng tiền lan tỏa"


@pytest.mark.asyncio
async def test_decimal_prices_converted_to_float(db_session):
    """Decimal values from the ORM must be converted to float in cells."""
    rows = [_snap("^GSPC", Decimal("6124.85"), Decimal("0.40"))]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)
    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    assert isinstance(cells["^GSPC"]["value"], float)
    assert isinstance(cells["^GSPC"]["change_pct"], float)


# ── Outdated-snapshot freshness guard (Finding 2 regression) ──────────────────


@pytest.mark.asyncio
async def test_outdated_snapshot_forces_all_cells_stale(db_session):
    """If no wave ran today, load_latest_snapshot returns YESTERDAY's rows.

    Those prices must NOT render as fresh overnight moves: every cell must be
    forced stale, and the stale-VND=X path must fall back to the VCB rate.
    """
    yesterday = dt.datetime.now(PP.ICT).date() - dt.timedelta(days=1)
    rows = [
        _snap("^GSPC", 6124.85, 0.40, snapshot_date=yesterday),
        _snap("^IXIC", 20100.0, 0.25, snapshot_date=yesterday),
        _snap("^N225", 38950.0, 0.55, snapshot_date=yesterday),
        _snap("BZ=F", 84.2, -0.40, snapshot_date=yesterday),
        _snap("GC=F", 2338.0, 0.10, snapshot_date=yesterday),
        _snap("VND=X", 26100.0, -0.15, snapshot_date=yesterday),
    ]
    vcb_rows = [{"currency_code": "USD", "buy": 26000.0, "sell": 26150.0}]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))), \
         patch.object(PP, "fetch_fx", new=AsyncMock(return_value=(vcb_rows, "u"))):
        p = await PP.build_premarket_payload(db_session)

    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    for sym in ("^GSPC", "^IXIC", "^N225", "BZ=F", "GC=F"):
        assert cells[sym]["stale"] is True, f"{sym} must be stale when snapshot pre-dates today"
    # Stale VND=X must take the (fresh) VCB fallback instead of yesterday's Yahoo rate
    assert cells["VND=X"]["source"] == "vcb"
    assert cells["VND=X"]["value"] == 26150.0
    assert cells["VND=X"]["stale"] is False


@pytest.mark.asyncio
async def test_outdated_snapshot_must_not_dirty_orm_rows(db_session):
    """Forcing staleness is a payload-level effect only — the loaded rows
    themselves must not be mutated (an ORM row flipped to stale=True would be
    flushed back to the DB by the pipeline's later commits)."""
    yesterday = dt.datetime.now(PP.ICT).date() - dt.timedelta(days=1)
    rows = [_snap("^GSPC", 6124.85, 0.40, snapshot_date=yesterday)]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)

    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    assert cells["^GSPC"]["stale"] is True
    assert rows[0].stale is False, "loaded snapshot row must not be mutated"


@pytest.mark.asyncio
async def test_today_snapshot_keeps_fresh_cells(db_session):
    """Rows dated TODAY (ICT) keep the existing behavior: fresh rows stay fresh,
    per-row stale flags pass through untouched."""
    today = dt.datetime.now(PP.ICT).date()
    rows = [
        _snap("^GSPC", 6124.85, 0.40, snapshot_date=today),
        _snap("GC=F", 2338.0, 0.10, stale=True, snapshot_date=today),
    ]
    with patch.object(PP, "load_latest_snapshot", new=AsyncMock(return_value=rows)), \
         patch.object(PP, "fetch_news_list", new=AsyncMock(return_value=([], 0, "u"))), \
         patch.object(PP, "fetch_events_calendar", new=AsyncMock(return_value=([], "u"))):
        p = await PP.build_premarket_payload(db_session)

    cells = {c["id"]: c for c in p["global_markets"]["cells"]}
    assert cells["^GSPC"]["stale"] is False
    assert cells["^GSPC"]["value"] == 6124.85
    assert cells["GC=F"]["stale"] is True  # per-row stale flag passes through
