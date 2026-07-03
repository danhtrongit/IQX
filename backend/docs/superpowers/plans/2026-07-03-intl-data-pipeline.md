# International Data Pipeline (SP-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Yahoo-Finance-backed pipeline that snapshots ~45 international symbols (US/Asia indices, futures, FX, commodities, bonds, crypto, ETFs) into a new `market_data_snapshot` table every trading morning (3 waves), exposed via `GET /api/v1/market-data/global/snapshot` — feeding the pre-market brief (Plan B) and fixing the broken MSN world-index gap.

**Architecture:** A new `yahoo.py` source (v8/finance/chart parser, semaphore-5 + jitter) + a symbol-universe config + a snapshot model with `UPSERT(snapshot_date, symbol)` and stale-copy fallback + three advisory-locked cron waves (06:00 / 07:05 / 08:30 ICT) behind `INTL_DATA_ENABLED` + one read endpoint. Crypto short-circuits through the existing Binance source; everything follows the existing `orchestrator/registry/http` patterns.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2.0, Alembic, APScheduler, httpx (via the existing sources' HTTP helper), pytest+sqlite.

## Global Constraints

- **Yahoo-only v1** ($0): no Finnhub/AlphaVantage keys; per-symbol failure → previous day's row copied with `stale=true`; no previous row → symbol absent (consumers degrade). **Never fabricate.**
- Iron ore + TOCOM rubber + ETF NAV/premium: **OMITTED v1** (no Yahoo ticker/field).
- `previous_close` aliasing: `chartPreviousClose ?? previousClose` (both exist in Yahoo meta and can differ).
- `change_percent` stored as raw percent (e.g. `0.4048` = +0.4048%), NUMERIC(10,4).
- Snapshot upsert key: **`UNIQUE(snapshot_date, symbol)`** — later waves UPDATE the day's row (documented deviation from the source spec's `+source`).
- Fetch etiquette: max 5 concurrent Yahoo requests, 100–200 ms jitter, UA via `get_headers("YAHOO")` (add the entry if `http.py` lacks it, mirroring existing source headers).
- Cron waves gated by `INTL_DATA_ENABLED: bool = False`; advisory lock key `826_101_733` (distinct from 826_101_730/731/732); `is_trading_day` gate; timezone `Asia/Ho_Chi_Minh`.
- Wave symbol sets: Wave 1 = ALL; Wave 2 = `^N225 ^KS11 ^AXJO` + fx + commodity; Wave 3 = `^HSI 000001.SS 399001.SZ VNM`.
- Failure alerting v1 = `logger.error` when >20% of a wave fails or any critical symbol fails (`^GSPC ^N225 DX-Y.NYB BZ=F GC=F VNM`).
- Backend: `uv run pytest` from `backend/`. EOD/midday behavior untouched.
- Reference: design spec `backend/docs/superpowers/specs/2026-07-03-intl-data-premarket-design.md` (Part A); existing patterns in `app/services/market_data/{orchestrator,registry,fallback,http}.py` and `app/services/jobs/market_analysis_job.py`.

## File Structure

- Create: `app/services/market_data/sources/yahoo.py` — chart fetcher + parser + `fetch_many`.
- Create: `app/services/market_data/intl_symbols.py` — the 8-category universe + wave sets + critical list.
- Create: `app/models/market_data_snapshot.py` + Alembic migration — the snapshot table.
- Create: `app/services/market_data/intl_snapshot.py` — upsert/stale service (`persist_snapshot_rows`, `load_latest_snapshot`).
- Create: `app/services/jobs/intl_snapshot_job.py` — `run_intl_snapshot_job(wave)`; Modify: `app/services/jobs/__init__.py` (3 crons), `app/core/config.py` (flag).
- Modify: `app/api/v1/endpoints/market_global.py` — `GET /market-data/global/snapshot`.
- Tests under `backend/tests/`.

---

### Task A1: Yahoo source — parser + `fetch_many`

**Files:**
- Create: `backend/app/services/market_data/sources/yahoo.py`
- Create: `backend/app/services/market_data/intl_symbols.py`
- Test: `backend/tests/test_yahoo_source.py`

**Interfaces:**
- Produces:
  - `async def fetch_chart(symbol: str) -> tuple[dict, str]` — returns `(parsed, url)`; `parsed` = `{symbol, name, last_price, previous_close, change_value, change_percent, day_high, day_low, volume, currency, market_state, market_time}` (market_time ISO-8601 str; name from meta `shortName`/`longName` fallback symbol).
  - `def parse_chart_meta(meta: dict, symbol: str) -> dict` — pure parser (testable without network).
  - `async def fetch_many(symbols: list[str]) -> dict[str, dict]` — semaphore(5)+jitter; failed symbols omitted.
  - `intl_symbols.py`: `INTL_SYMBOLS: dict[str, list[dict]]` (8 categories, each item `{symbol, name}`), `ALL_SYMBOLS: list[str]`, `WAVE2_SYMBOLS`, `WAVE3_SYMBOLS`, `CRITICAL_SYMBOLS`, `CATEGORY_BY_SYMBOL: dict[str, str]`.
- Consumes: the HTTP helper other sources use (READ `sources/msn.py`/`vietcap.py` for the shared client/`get_headers` pattern and mirror it; add a `"YAHOO"` header entry to `http.py` if needed).

- [ ] **Step 1: Write the failing parser test** (fixture = a trimmed real v8 chart response):

```python
# backend/tests/test_yahoo_source.py
from app.services.market_data.sources.yahoo import parse_chart_meta

META = {
    "currency": "USD", "symbol": "^GSPC", "shortName": "S&P 500",
    "regularMarketPrice": 6124.85, "chartPreviousClose": 6100.2, "previousClose": 6101.0,
    "regularMarketDayHigh": 6130.1, "regularMarketDayLow": 6090.5,
    "regularMarketVolume": 2500000000, "marketState": "CLOSED",
    "regularMarketTime": 1782950400,
}

def test_parse_chart_meta_fields_and_aliasing():
    p = parse_chart_meta(META, "^GSPC")
    assert p["last_price"] == 6124.85
    assert p["previous_close"] == 6100.2          # chartPreviousClose wins over previousClose
    assert round(p["change_value"], 2) == 24.65
    assert round(p["change_percent"], 4) == round(24.65 / 6100.2 * 100, 4)  # raw percent
    assert p["market_state"] == "CLOSED" and p["currency"] == "USD"
    assert p["name"] == "S&P 500" and p["market_time"].startswith("20")

def test_parse_chart_meta_fallbacks():
    meta = {"regularMarketPrice": 10.0, "previousClose": 8.0}  # no chartPreviousClose, no name
    p = parse_chart_meta(meta, "XX=F")
    assert p["previous_close"] == 8.0 and p["name"] == "XX=F"
    assert p["change_percent"] == 25.0

def test_symbol_universe_counts():
    from app.services.market_data.intl_symbols import INTL_SYMBOLS, ALL_SYMBOLS, CATEGORY_BY_SYMBOL, CRITICAL_SYMBOLS
    assert set(INTL_SYMBOLS) == {"us_index", "us_futures", "asia_index", "fx", "commodity", "bond", "crypto", "etf"}
    assert 40 <= len(ALL_SYMBOLS) <= 50 and len(set(ALL_SYMBOLS)) == len(ALL_SYMBOLS)
    assert CATEGORY_BY_SYMBOL["^GSPC"] == "us_index" and CATEGORY_BY_SYMBOL["VNM"] == "etf"
    assert set(CRITICAL_SYMBOLS) <= set(ALL_SYMBOLS)
```

- [ ] **Step 2: Run it (red)** — `cd backend && uv run pytest tests/test_yahoo_source.py -q` → FAIL (module missing).
- [ ] **Step 3: Implement** `yahoo.py` (`parse_chart_meta` pure; `fetch_chart` GETs `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d`, takes `data["chart"]["result"][0]["meta"]`; `fetch_many` = `asyncio.Semaphore(5)` + `await asyncio.sleep(random.uniform(0.1, 0.2))` before each call + gather, drop failures with a `logger.warning`) and `intl_symbols.py` with the exact universe from the design spec §A2 (us_index: ^DJI ^GSPC ^IXIC ^RUT ^VIX · us_futures: ES=F NQ=F YM=F · asia_index: ^N225 ^KS11 ^HSI 000001.SS 399001.SZ ^TWII ^STI ^AXJO · fx: DX-Y.NYB VND=X CNY=X JPY=X KRW=X EURUSD=X · commodity: BZ=F CL=F GC=F SI=F HG=F NG=F SB=F KC=F ZC=F ZS=F ZW=F · bond: ^TNX ^IRX ^TYX · crypto: BTC-USD ETH-USD · etf: VNM EEM FM SPY AAXJ), `WAVE2_SYMBOLS = ["^N225","^KS11","^AXJO"] + fx + commodity`, `WAVE3_SYMBOLS = ["^HSI","000001.SS","399001.SZ","VNM"]`, `CRITICAL_SYMBOLS = ["^GSPC","^N225","DX-Y.NYB","BZ=F","GC=F","VNM"]`.
- [ ] **Step 4: Run it (green)** → PASS (4 tests).
- [ ] **Step 5: Commit** — `git add backend/app/services/market_data/sources/yahoo.py backend/app/services/market_data/intl_symbols.py backend/tests/test_yahoo_source.py && git commit -m "feat(intl): yahoo v8/chart source (previous_close aliasing, semaphore+jitter) + 45-symbol universe"`

---

### Task A2: Snapshot model + migration

**Files:**
- Create: `backend/app/models/market_data_snapshot.py`
- Create: `backend/alembic/versions/<rev>_add_market_data_snapshot.py`
- Test: `backend/tests/test_market_data_snapshot_model.py`

**Interfaces:**
- Produces: model `MarketDataSnapshot` (`__tablename__ = "market_data_snapshot"`) with columns per the design spec §A3: `snapshot_date Date (index)`, `asset_category String(32) (index)`, `symbol String(32)`, `name String(128)`, `last_price/previous_close/change_value Numeric(18,6)`, `change_percent Numeric(10,4)`, `day_high/day_low Numeric(18,6)`, `volume BigInteger nullable`, `currency String(8) nullable`, `market_state String(16) nullable`, `market_time DateTime(timezone=True) nullable`, `source String(32) default "yahoo"`, `stale Boolean default False`, `fetched_at DateTime(timezone=True) server_default now()`; `__table_args__ = (UniqueConstraint("snapshot_date","symbol", name="uq_snapshot_date_symbol"),)`. Match the project's `Mapped`/`mapped_column` + Base/mixin style (READ `app/models/market_analysis.py` first and mirror it; register the model in the models `__init__`/metadata the same way others are).

- [ ] **Step 1: Failing test**

```python
# backend/tests/test_market_data_snapshot_model.py
import datetime as dt
import pytest
from sqlalchemy import select
from app.models.market_data_snapshot import MarketDataSnapshot

@pytest.mark.asyncio
async def test_unique_per_date_symbol(db_session):
    d = dt.date(2026, 7, 3)
    db_session.add(MarketDataSnapshot(snapshot_date=d, asset_category="us_index", symbol="^GSPC",
                                      name="S&P 500", last_price=6124.85, previous_close=6100.2,
                                      change_value=24.65, change_percent=0.4041))
    await db_session.commit()
    rows = (await db_session.execute(select(MarketDataSnapshot))).scalars().all()
    assert len(rows) == 1 and rows[0].stale is False and rows[0].source == "yahoo"
```

- [ ] **Step 2: red** → FAIL. **Step 3:** implement model + author the Alembic migration (create_table + the unique constraint + indexes on snapshot_date/asset_category; downgrade drops the table). **Step 4: green.** 
- [ ] **Step 5: Commit** — `git commit -m "feat(intl): market_data_snapshot model + migration (UNIQUE snapshot_date+symbol)"`

---

### Task A3: Upsert/stale service

**Files:**
- Create: `backend/app/services/market_data/intl_snapshot.py`
- Test: `backend/tests/test_intl_snapshot_service.py`

**Interfaces:**
- Produces:
  - `async def persist_snapshot_rows(db, day: date, parsed: dict[str, dict]) -> dict` — upserts each parsed symbol (category from `CATEGORY_BY_SYMBOL`); for symbols in a REQUESTED set that are ABSENT from `parsed`, copies yesterday's row with `stale=True` (if none exists, skips). Signature: `persist_snapshot_rows(db, day, parsed, requested: list[str]) -> {"upserted": int, "stale_copied": int, "missing": list[str]}`.
  - `async def load_latest_snapshot(db, category: str | None = None) -> list[MarketDataSnapshot]` — rows of the max snapshot_date (optionally filtered).
- Consumes: `MarketDataSnapshot` (A2), `CATEGORY_BY_SYMBOL` (A1).

- [ ] **Step 1: Failing tests**

```python
# backend/tests/test_intl_snapshot_service.py
import datetime as dt
import pytest
from app.services.market_data.intl_snapshot import persist_snapshot_rows, load_latest_snapshot

P = {"^GSPC": {"symbol": "^GSPC", "name": "S&P 500", "last_price": 6124.85, "previous_close": 6100.2,
               "change_value": 24.65, "change_percent": 0.4041, "day_high": 6130.1, "day_low": 6090.5,
               "volume": 1, "currency": "USD", "market_state": "CLOSED", "market_time": "2026-07-02T20:00:00+00:00"}}

@pytest.mark.asyncio
async def test_upsert_updates_same_day_row(db_session):
    d = dt.date(2026, 7, 3)
    await persist_snapshot_rows(db_session, d, P, requested=["^GSPC"])
    p2 = {"^GSPC": {**P["^GSPC"], "last_price": 6200.0}}
    res = await persist_snapshot_rows(db_session, d, p2, requested=["^GSPC"])
    rows = await load_latest_snapshot(db_session)
    assert len(rows) == 1 and float(rows[0].last_price) == 6200.0 and res["upserted"] == 1

@pytest.mark.asyncio
async def test_stale_copy_from_previous_day(db_session):
    y, t = dt.date(2026, 7, 2), dt.date(2026, 7, 3)
    await persist_snapshot_rows(db_session, y, P, requested=["^GSPC"])
    res = await persist_snapshot_rows(db_session, t, {}, requested=["^GSPC"])  # today's fetch failed
    rows = await load_latest_snapshot(db_session)
    assert res["stale_copied"] == 1 and rows[0].stale is True and rows[0].snapshot_date == t

@pytest.mark.asyncio
async def test_missing_when_no_history(db_session):
    res = await persist_snapshot_rows(db_session, dt.date(2026, 7, 3), {}, requested=["ES=F"])
    assert res["missing"] == ["ES=F"] and res["stale_copied"] == 0
```

- [ ] **Step 2: red** → FAIL. **Step 3:** implement (select-then-update-or-insert per symbol keyed `(day, symbol)`; stale copy pulls the newest row `< day` for the symbol; fresh upsert sets `stale=False`). **Step 4: green** (3 tests). 
- [ ] **Step 5: Commit** — `git commit -m "feat(intl): snapshot upsert service (same-day update, stale copy, missing report)"`

---

### Task A4: Wave job + crons + flag

**Files:**
- Create: `backend/app/services/jobs/intl_snapshot_job.py`
- Modify: `backend/app/services/jobs/__init__.py`, `backend/app/core/config.py`
- Test: `backend/tests/test_intl_snapshot_job.py`

**Interfaces:**
- Produces: `async def run_intl_snapshot_job(wave: int = 1, session=None) -> dict` — `is_trading_day` gate (`{"skipped":"not_trading_day"}`), advisory lock `_INTL_LOCK_KEY = 826_101_733` (scheduled path), wave→symbol-set mapping (1=ALL_SYMBOLS, 2=WAVE2_SYMBOLS, 3=WAVE3_SYMBOLS), fetch via `fetch_many` **except crypto** (`BTC-USD`,`ETH-USD` mapped from the existing `binance.fetch_ticker("BTCUSDT"/"ETHUSDT")` into the parsed shape), persist via `persist_snapshot_rows`, then the alert rule: `logger.error` if `len(missing∪stale) > 0.2*len(requested)` or any `CRITICAL_SYMBOLS` member missing/stale. Config: `INTL_DATA_ENABLED: bool = False`. Three crons in `__init__.py` behind the flag: ids `intl_snapshot_wave1|2|3` at 06:00 / 07:05 / 08:30 ICT mon-fri (wave passed via a lambda/partial or three thin wrappers — follow APScheduler's no-args job convention: define `run_wave1/2/3` wrappers).
- Consumes: A1 (`fetch_many`, symbol sets), A3 (`persist_snapshot_rows`), the daily job's lock pattern (READ `market_analysis_job.py` and mirror).

- [ ] **Step 1: Failing tests** (gate + wave mapping + alert rule; mock fetch/persist):

```python
# backend/tests/test_intl_snapshot_job.py
from unittest.mock import AsyncMock, patch
import pytest
from app.services.jobs import intl_snapshot_job as J

@pytest.mark.asyncio
async def test_skips_non_trading_day():
    with patch.object(J, "is_trading_day", return_value=False):
        res = await J.run_intl_snapshot_job(wave=1, session=object())
    assert res["skipped"] == "not_trading_day"

@pytest.mark.asyncio
async def test_wave2_fetches_wave2_symbols_and_persists(db_session):
    with patch.object(J, "is_trading_day", return_value=True), \
         patch.object(J, "fetch_many", new=AsyncMock(return_value={})) as fm, \
         patch.object(J, "persist_snapshot_rows", new=AsyncMock(return_value={"upserted": 0, "stale_copied": 0, "missing": []})) as pr:
        await J.run_intl_snapshot_job(wave=2, session=db_session)
    from app.services.market_data.intl_symbols import WAVE2_SYMBOLS
    requested = fm.call_args.args[0]
    assert set(requested) == set(s for s in WAVE2_SYMBOLS if s not in ("BTC-USD", "ETH-USD"))
    assert pr.await_count == 1

@pytest.mark.asyncio
async def test_alert_logged_when_critical_missing(db_session, caplog):
    with patch.object(J, "is_trading_day", return_value=True), \
         patch.object(J, "fetch_many", new=AsyncMock(return_value={})), \
         patch.object(J, "persist_snapshot_rows", new=AsyncMock(return_value={"upserted": 0, "stale_copied": 0, "missing": ["^GSPC"]})):
        with caplog.at_level("ERROR"):
            await J.run_intl_snapshot_job(wave=1, session=db_session)
    assert any("critical" in r.message.lower() or "^GSPC" in r.message for r in caplog.records)
```

- [ ] **Step 2: red.** **Step 3:** implement job + `run_wave1/2/3` wrappers + config flag + the three cron registrations (mirror the midday registration block; distinct ids). **Step 4: green** (3 tests) + regression `uv run pytest tests/ -k "job or intl" -q`. 
- [ ] **Step 5: Commit** — `git commit -m "feat(intl): 3-wave snapshot cron (06:00/07:05/08:30 ICT, lock 826_101_733, INTL_DATA_ENABLED)"`

---

### Task A5: Read endpoint + live smoke

**Files:**
- Modify: `backend/app/api/v1/endpoints/market_global.py`
- Test: `backend/tests/test_intl_snapshot_endpoint.py`

**Interfaces:**
- Produces: `GET /api/v1/market-data/global/snapshot?category={category?}` → `{"data": [rows...], "meta": {"snapshot_date": ..., "stale_count": n}}` using `load_latest_snapshot` (serialize Numerics as float, market_time ISO). Mirror the file's existing response conventions.

- [ ] **Step 1: Failing test** — seed 2 rows (one stale), assert filter + shape:

```python
# backend/tests/test_intl_snapshot_endpoint.py
import datetime as dt
import pytest
from app.models.market_data_snapshot import MarketDataSnapshot

@pytest.mark.asyncio
async def test_snapshot_endpoint_filters_category(client, db_session):
    d = dt.date(2026, 7, 3)
    db_session.add(MarketDataSnapshot(snapshot_date=d, asset_category="us_index", symbol="^GSPC", name="S&P 500",
                                      last_price=6124.85, previous_close=6100.2, change_value=24.65, change_percent=0.4041))
    db_session.add(MarketDataSnapshot(snapshot_date=d, asset_category="fx", symbol="VND=X", name="USD/VND",
                                      last_price=26150, previous_close=26120, change_value=30, change_percent=0.1148, stale=True))
    await db_session.commit()
    r = await client.get("/api/v1/market-data/global/snapshot?category=fx")
    body = r.json()
    assert r.status_code == 200 and len(body["data"]) == 1 and body["data"][0]["symbol"] == "VND=X"
    assert body["data"][0]["stale"] is True and body["meta"]["stale_count"] == 1
```

- [ ] **Step 2: red.** **Step 3:** implement. **Step 4: green.** 
- [ ] **Step 5: LIVE smoke (verification, no commit gate):** `uv run python -c "import asyncio; from app.services.market_data.sources.yahoo import fetch_chart; print(asyncio.run(fetch_chart('^GSPC'))[0])"` from the dev machine — confirms the real Yahoo response parses (record the output in the task report; if Yahoo blocks the dev IP, note it — the prod VPS is Singapore and the wave job's first prod run is the real check).
- [ ] **Step 6: Commit** — `git commit -m "feat(intl): GET /market-data/global/snapshot endpoint (category filter, stale meta)"`

---

### Task A6: Plan-A verification

- [ ] `uv run pytest tests/ -k "yahoo or intl or snapshot" -q` → all green; `uv run pytest -q` (full suite) → no regression.
- [ ] Confirm the daily/midday jobs + endpoints untouched (`git diff --stat` scope check).

## Out of scope (Plan A)
Finnhub/AlphaVantage fallbacks; iron-ore/rubber; ETF NAV; 15-min realtime loop; MSN deprecation; Slack/Telegram alerting (logger.error only); yield-curve derived field (computed at read-time by Plan B if needed — not stored).
