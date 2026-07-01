# Mid-day Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a second daily AI market brief — "Cập nhật phiên sáng" (mid-day, ~11:45 ICT, morning session 09:00–11:30) — as a new wall-clock display-mode of the home page, reusing the existing daily market-analysis pipeline + terminal via a shared, `report_type`-parameterized "session engine".

**Architecture:** (A) a small foundation — add a `report_type` discriminator + composite-unique storage and generalize `generator.py` into `run_session_analysis(config, db)` keyed by report_type (EOD stays byte-equivalent); (B) a mid-day backend pipeline — an AM-session payload collector (reusing the existing vietcap data-source functions, degrading gracefully where intraday isn't exposed) + mid-day prompt/validator + an 11:30 cron; (C) frontend — a `getDisplayMode()` machine on the home page + a mid-day variant (orange) of the daily terminal components with frozen/pending states.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2.0, Alembic, APScheduler, DeepSeek via `proxy_client.chat_completion`; pytest+sqlite. React 19, Arco Design, Tailwind v4, react-router v7, TanStack Query, Ky; Vitest+RTL.

## Global Constraints

- **LLM = DeepSeek** via the existing `app/services/ai/proxy_client.chat_completion` (model from `AI_PROXY_MODEL`). Do NOT add Claude/OpenAI/Gemini. Reuse the existing retry/validate scaffold.
- **Surface = home-page display-modes** (not a new `/thi-truong` route). The intraday briefs are wall-clock states of the existing home page (`MarketDailyPage` inside `HomeWorkspace`).
- **`report_type`** discriminator values: exactly `'daily' | 'midday' | 'premarket'`. `session_type` keeps its existing meaning (the market *classifier*: `narrow_rally`/`broad_selloff`/…) — do NOT overload it.
- **EOD behavior must not change.** The `daily` path stays byte-equivalent; the daily endpoint `/api/v1/market-analysis/daily/latest` and the 16:30 cron are untouched in behavior.
- **Mid-day output contract (exact):** 2 published paragraphs (`session_structure`, `money_flow`) + 1 `market_health` paragraph with `status:'pending'` (NOT generated); exactly 3 scenarios (up, down, and a `down` bull-trap scoped `afternoon_session`); exactly 5 watchlist items where **item index 1 `key` === `'Giao dịch chiều'`** (alert level); headline 60–90 chars incl. VN-Index %; tagline `{text,color}` neutral when AM KLGD < 30% of MA20; negatives use U+2212 `−` (not ASCII `-`); paragraph numbers wrapped `<span class='num'>` (up/down variants), scenario numbers wrapped `<strong>`.
- **No fabrication.** Any missing AM data → the card shows "Đang xử lý"/"số cuối ngày" and the LLM is told which blocks are absent and writes around them.
- **Cosmetic validator rules stay SOFT** (never black out the publish) — mirror the daily `SOFT_ERROR_PREFIXES` / `hard_errors` split.
- **Mid-day v1 auto-publishes** (no editor portal). Editor portal + push + share-snapshot are OUT OF SCOPE (later cycles / stretch — see §"Out of scope").
- Backend: `uv run pytest` from `backend/`. Frontend: `npx vitest run`; verify build with `npm run build` (`tsc -b`, noUnusedLocals) — not just `tsc --noEmit`; no `import React` in source files (test files may).
- Reference docs (read for exact signatures): the design spec `backend/docs/superpowers/specs/2026-07-01-midday-session-design.md`; the existing daily pipeline lives in `backend/app/services/ai/market_analysis/` and the daily frontend in `dashboard/src/features/market-overview/daily/`.

## File Structure

**Backend** (`backend/`):
- Modify: `app/models/market_analysis.py` — add `report_type` column + composite unique.
- Create: `alembic/versions/<rev>_add_report_type.py` — migration + backfill.
- Modify: `app/services/ai/market_analysis/generator.py` — introduce `SessionConfig` + `run_session_analysis`; `generate_analysis`/`run_daily_analysis` become the `daily` config; add `run_midday_analysis`.
- Modify: `app/services/ai/market_analysis/memory.py` — `persist_analysis(..., report_type=...)`.
- Create: `app/services/ai/market_analysis/midday_payload.py` — `build_midday_payload()` + `_build_midday_charts(...)`.
- Create: `app/services/ai/market_analysis/midday_prompts.py` — `MIDDAY_SYSTEM_PROMPT` + `build_midday_user_prompt(...)` (+ midday few-shot).
- Create: `app/services/ai/market_analysis/midday_validator.py` — `validate_midday(out, payload)` + reuse `hard_errors`.
- Modify: `app/api/v1/endpoints/market_analysis.py` — add `midday/latest`, `midday/{date}`, admin `midday/run`.
- Modify: `app/services/jobs/__init__.py` + `app/services/jobs/market_analysis_job.py` — register the 11:30 midday cron + advisory-lock job.
- Modify: `app/core/config.py` — `MIDDAY_ANALYSIS_ENABLED` + `MIDDAY_ANALYSIS_CRON_HOUR/MINUTE`.
- Tests under `backend/tests/`.

**Frontend** (`dashboard/`), under `src/features/market-overview/`:
- Create: `midday/types.ts` — `MidDayAnalysis` type.
- Create: `midday/useMidDayMarketAnalysis.ts` — the fetch hook.
- Create: `midday/getDisplayMode.ts` — the wall-clock display-mode machine.
- Create: `midday/MidDayView.tsx` — composes the mid-day variant.
- Create: `midday/MidDayArticle.tsx`, `midday/MidDayPulseBar.tsx`, `midday/MidDayTakeaway.tsx`.
- Modify: `daily/charts/HealthLineChart.tsx`, `daily/charts/RotationChart.tsx`, `daily/charts/ChartCard.tsx` — add an optional `frozen`/`dataTag` variant (additive; daily unaffected).
- Create: `midday/midday.css` — orange `--mm-*` token overrides.
- Modify: `src/features/home-workspace/HomeWorkspace.tsx` — render a display-mode-aware `HomeMarketView` in the left column instead of `<MarketDailyPage/>` directly.
- Create: `src/features/market-overview/HomeMarketView.tsx` — picks EOD vs mid-day by `getDisplayMode()`.
- Tests colocated `*.test.ts(x)`.

---

### Task 1: Storage — `report_type` column + composite-unique migration

**Files:**
- Modify: `backend/app/models/market_analysis.py`
- Create: `backend/alembic/versions/<rev>_add_report_type_to_analysis_history.py`
- Test: `backend/tests/test_analysis_report_type.py`

**Interfaces:**
- Produces: `AnalysisHistory.report_type: str` (default `'daily'`); table constraint `UNIQUE(session_date, report_type)` replacing the `session_date`-only unique. All other columns unchanged.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_analysis_report_type.py
import datetime as dt
import pytest
from sqlalchemy import select
from app.models.market_analysis import AnalysisHistory

@pytest.mark.asyncio
async def test_two_report_types_same_date_coexist(db_session):
    d = dt.date(2026, 7, 1)
    db_session.add(AnalysisHistory(public_id="vnindex-2026-07-01-daily", session_date=d,
                                   session_type="low_volatility", report_type="daily",
                                   headline="EOD", tagline={}, paragraphs={}, scenarios=[]))
    db_session.add(AnalysisHistory(public_id="vnindex-2026-07-01-midday", session_date=d,
                                   session_type="low_volatility", report_type="midday",
                                   headline="Midday", tagline={}, paragraphs={}, scenarios=[]))
    await db_session.commit()
    rows = (await db_session.execute(select(AnalysisHistory).where(AnalysisHistory.session_date == d))).scalars().all()
    assert {r.report_type for r in rows} == {"daily", "midday"}

@pytest.mark.asyncio
async def test_default_report_type_is_daily(db_session):
    d = dt.date(2026, 7, 2)
    row = AnalysisHistory(public_id="vnindex-2026-07-02", session_date=d, session_type="low_volatility",
                          headline="x", tagline={}, paragraphs={}, scenarios=[])
    db_session.add(row); await db_session.commit()
    assert row.report_type == "daily"
```

- [ ] **Step 2: Run it (red)** — `cd backend && uv run pytest tests/test_analysis_report_type.py -q` → FAIL (`report_type` attribute/column missing; or unique violation on session_date).

- [ ] **Step 3: Implement the model change** — in `app/models/market_analysis.py`, on `AnalysisHistory`:
  1. Remove `unique=True` from the `session_date` column definition (keep `index=True`).
  2. Add a column: `report_type: Mapped[str] = mapped_column(String(16), nullable=False, server_default="daily", index=True)` (match the file's existing `Mapped`/`mapped_column` style + String import).
  3. Add to `__table_args__` a composite unique: `UniqueConstraint("session_date", "report_type", name="uq_analysis_session_date_report_type")` (create `__table_args__` if absent; import `UniqueConstraint` from sqlalchemy).

- [ ] **Step 4: Create the Alembic migration** — generate a revision (`cd backend && uv run alembic revision -m "add report_type to analysis_history"`) and author `upgrade()`:
```python
def upgrade() -> None:
    op.add_column("analysis_history", sa.Column("report_type", sa.String(16), nullable=False, server_default="daily"))
    op.create_index("ix_analysis_history_report_type", "analysis_history", ["report_type"])
    # swap the session_date unique for a composite unique
    op.drop_constraint("analysis_history_session_date_key", "analysis_history", type_="unique")  # adjust name to the real one (check \d analysis_history)
    op.create_unique_constraint("uq_analysis_session_date_report_type", "analysis_history", ["session_date", "report_type"])

def downgrade() -> None:
    op.drop_constraint("uq_analysis_session_date_report_type", "analysis_history", type_="unique")
    op.create_unique_constraint("analysis_history_session_date_key", "analysis_history", ["session_date"])
    op.drop_index("ix_analysis_history_report_type", table_name="analysis_history")
    op.drop_column("analysis_history", "report_type")
```
(The existing `session_date` unique index/constraint name may differ — inspect the DB / prior migration and use the actual constraint name. Existing rows backfill to `'daily'` via `server_default`.)

- [ ] **Step 5: Run it (green)** — `uv run pytest tests/test_analysis_report_type.py -q` → PASS (sqlite test DB is created from models; the migration is for prod Postgres).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/market_analysis.py backend/alembic/versions/*report_type* backend/tests/test_analysis_report_type.py
git commit -m "feat(market-analysis): report_type column + composite-unique(session_date, report_type)"
```

---

### Task 2: Session engine — parameterize `generator.py` by `report_type`

**Files:**
- Modify: `backend/app/services/ai/market_analysis/generator.py`
- Modify: `backend/app/services/ai/market_analysis/memory.py`
- Test: `backend/tests/test_session_engine.py`

**Interfaces:**
- Consumes: `AnalysisHistory.report_type` (Task 1).
- Produces:
  - `@dataclass SessionConfig` with fields: `report_type: str`, `payload_builder: Callable[[], Awaitable[dict]]`, `prompt_builder: Callable[[dict, str], str]`, `system_prompt: str`, `validator: Callable[[dict, dict], list[str]]`, `session_display: dict[str, str]`, `use_memory: bool`, `persist_claims: bool`.
  - `async def run_session_analysis(config: SessionConfig, *, max_retries=3, temperature=0.3, payload=None, db=None) -> dict` — the generalized pipeline (payload→[memory if use_memory]→classify→prompt→chat_completion→parse→validate→retry→persist with `config.report_type`).
  - `DAILY_CONFIG: SessionConfig` (wraps the existing `build_analysis_payload`, `build_user_prompt`, `SYSTEM_PROMPT`, `validate_output`, `SESSION_DISPLAY`, `use_memory=True`, `persist_claims=True`).
  - `generate_analysis(...)` keeps its signature but delegates to `run_session_analysis(DAILY_CONFIG, ...)`; `run_daily_analysis(session)` unchanged externally.
  - `persist_analysis(db, output, session_date, session_type, *, report_type="daily", persist_claims=True)` (memory.py) — stores `report_type`; skips claim extraction when `persist_claims=False`.

- [ ] **Step 1: Write the failing test** — assert the daily path still works via the config, and a minimal custom config persists a different report_type:

```python
# backend/tests/test_session_engine.py
import datetime as dt
from unittest.mock import AsyncMock, patch
import pytest
from app.services.ai.market_analysis import generator as G
from sqlalchemy import select
from app.models.market_analysis import AnalysisHistory

FAKE_OUT = {"headline": "VN-Index tăng 0,5% — thanh khoản cải thiện",
            "tagline": {"text": "TÍCH CỰC", "color": "up"},
            "paragraphs": {"structure": "a", "smart_money": "b", "market_health": "c"},
            "scenarios": [], "watchlist": [], "unexplained": None}

@pytest.mark.asyncio
async def test_run_session_analysis_persists_report_type(db_session):
    cfg = G.SessionConfig(report_type="midday",
                          payload_builder=AsyncMock(return_value={"meta": {"generated_for_date": "2026-07-01"}, "charts": {}}),
                          prompt_builder=lambda p, s: "prompt", system_prompt="sys",
                          validator=lambda out, p: [], session_display={}, use_memory=False, persist_claims=False)
    with patch.object(G, "chat_completion", new=AsyncMock(return_value=(__import__("json").dumps(FAKE_OUT), "deepseek"))):
        res = await G.run_session_analysis(cfg, db=db_session)
    assert res["persisted"] is True
    row = (await db_session.execute(select(AnalysisHistory).where(AnalysisHistory.report_type == "midday"))).scalar_one()
    assert row.report_type == "midday"
```

- [ ] **Step 2: Run it (red)** — `uv run pytest tests/test_session_engine.py -q` → FAIL (`SessionConfig`/`run_session_analysis` undefined).

- [ ] **Step 3: Implement** — refactor `generator.py`:
  - Add the `SessionConfig` dataclass (imports: `dataclasses.dataclass`, `typing.Callable/Awaitable`).
  - Move the body of the current `generate_analysis` into `run_session_analysis(config, *, ...)`, replacing hard-coded calls: `build_analysis_payload()` → `config.payload_builder()`; `build_user_prompt(payload, session_type)` → `config.prompt_builder(payload, session_type)`; `SYSTEM_PROMPT` → `config.system_prompt`; `validate_output(...)` → `config.validator(...)`; `SESSION_DISPLAY.get(...)` → `config.session_display.get(...)`; gate the memory block on `config.use_memory`; call `persist_analysis(db, output, session_date, session_type, report_type=config.report_type, persist_claims=config.persist_claims)`. Keep the `hard_errors`/best-effort-publish logic verbatim.
  - Define `DAILY_CONFIG = SessionConfig(report_type="daily", payload_builder=build_analysis_payload, prompt_builder=build_user_prompt, system_prompt=SYSTEM_PROMPT, validator=validate_output, session_display=SESSION_DISPLAY, use_memory=True, persist_claims=True)`.
  - `generate_analysis(*, max_retries=3, temperature=0.3, payload=None, db=None)` → `return await run_session_analysis(DAILY_CONFIG, max_retries=max_retries, temperature=temperature, payload=payload, db=db)`.
  - In `memory.py`, extend `persist_analysis` with `report_type: str = "daily"` (set `report_type` on the upserted `AnalysisHistory`; the upsert lookup key becomes `(session_date, report_type)`) and `persist_claims: bool = True` (skip `extract_claims`/claim rows when False).

- [ ] **Step 4: Run it (green) + the existing market-analysis suite** — `uv run pytest tests/ -k "session_engine or market_analysis or generator or memory" -q` → PASS (daily behavior unchanged; new test passes).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai/market_analysis/generator.py backend/app/services/ai/market_analysis/memory.py backend/tests/test_session_engine.py
git commit -m "refactor(market-analysis): SessionConfig + run_session_analysis; daily = DAILY_CONFIG (byte-equivalent)"
```

---

### Task 3: Mid-day payload collector + charts

**Files:**
- Create: `backend/app/services/ai/market_analysis/midday_payload.py`
- Test: `backend/tests/test_midday_payload.py`

**Interfaces:**
- Consumes: the existing data-source functions used by `payload.py` (`fetch_market_index`, `fetch_liquidity`, `fetch_index_impact`, `fetch_foreign`, `fetch_foreign_top`, `fetch_proprietary`, `fetch_proprietary_top`, `fetch_ohlcv`, `fetch_breadth`) and `_safe(...)`; the previous EOD record via a small reader.
- Produces:
  - `async def build_midday_payload(db) -> dict` — same top-level shape as `build_analysis_payload()` (`meta`, index blocks, `charts`) but **AM-scoped** (snapshot "now", intended to run ~11:30), **plus a `pulse` block** consumed by the mid-day pulse bar (Task 13): `pulse = { vn_index: { value, change, change_pct, sparkline: float[] (~30 AM 5-min points) }, breadth: { up, down }, foreign_net_billion, liquidity: { am_value_billion, ma20_billion|None, vs_ma20_pct|None } }`. `meta.report_type = "midday"`, `meta.generated_for_date`, `meta.session_phase = "am"`, `meta.missing_fields` lists any degraded blocks.
  - `def _build_midday_charts(*, am_blocks..., eod_previous_charts: dict | None) -> dict` — the `charts` dict: AM-live tiers (`breadth`, `contribution`, `foreign_detail`, `prop_detail`) each with `data_state: "am_session"`; frozen tiers (`market_health_detail`, `sector_rotation`) copied verbatim from `eod_previous_charts` with `data_state: "eod_previous"` (or `None` if no prior EOD).
  - `async def _load_previous_eod(db) -> dict | None` — returns the latest `report_type="daily"` record's `meta.charts` + `{headline, tagline, paragraphs, scenarios, watchlist}` (for LLM continuity + frozen cards).
- Degradation: `fetch_foreign`/`fetch_proprietary`/`fetch_index_impact` are called "now" (accumulated AM value). If a call returns empty/None, that block is set `None`, its ticker added to `meta.missing_fields`, and `charts.<block>.data_state = "unavailable"` — **never fabricate**.
- **AM-only liquidity + MA20:** `fetch_liquidity(symbols="ALL", time_frame="ONE_MINUTE", from_ts=<today 09:00 ICT>, to_ts=<now>)` → AM total (last accumulated value); MA20 = same AM-window total over the last 20 trading days (loop `fetch_liquidity` per day or reuse a persisted history) — if the 20-day backfill is too costly for v1, compute over the days available and set `meta.missing_fields += ["am_ma20_partial"]`.

- [ ] **Step 1: Write the failing test** (mock every data source; assert AM shape + degradation + frozen passthrough):

```python
# backend/tests/test_midday_payload.py
from unittest.mock import AsyncMock, patch
import pytest
from app.services.ai.market_analysis import midday_payload as MP

@pytest.mark.asyncio
async def test_build_midday_charts_tags_data_state():
    eod = {"market_health_detail": {"pct_above_ma20": 40.0, "trend_20d": [1,2]}, "sector_rotation": {"sectors_today": [{"name":"Ngân hàng","pct":1.2}]}}
    charts = MP._build_midday_charts(
        breadth={"up": 100, "down": 80, "flat": 10, "ceiling": 2, "floor": 1, "ratio_up_down": "1 : 0.8", "classification": "Đi ngang", "pct_above_ma20": None},
        contribution={"top_positive": [], "top_negative": []},
        foreign_detail={"total_buy_vnd_billion": 100.0, "total_sell_vnd_billion": 80.0, "streak": {"count":1,"direction":"buy","last_5d_cumulative":None}, "last_12_sessions": [], "top_sell": [], "top_buy": []},
        prop_detail=None,  # degraded
        eod_previous_charts=eod,
    )
    assert charts["breadth"]["data_state"] == "am_session"
    assert charts["market_health_detail"]["data_state"] == "eod_previous"
    assert charts["market_health_detail"]["pct_above_ma20"] == 40.0
    assert charts["prop_detail"]["data_state"] == "unavailable"
```

- [ ] **Step 2: Run it (red)** — `uv run pytest tests/test_midday_payload.py -q` → FAIL (module missing).

- [ ] **Step 3: Implement `_build_midday_charts` + `build_midday_payload` + `_load_previous_eod`.** Model `build_midday_payload` on `payload.py::build_analysis_payload` (same `_safe` wrappers, same source functions, same derived-field helpers) but: (a) call the market-overview/flow/impact sources "now" (no EOD-close assumption); (b) sum AM-window liquidity + MA20 as above; (c) for `market_health_detail` + `sector_rotation`, do NOT compute — read them from `_load_previous_eod(db)`; (d) pass everything to `_build_midday_charts`, which sets `data_state` per block (`"am_session"` for live, `"eod_previous"` for frozen, `"unavailable"` when the source returned nothing — always include the key with a `data_state`). Set `meta.report_type="midday"`, `meta.session_phase="am"`, `meta.missing_fields`.

- [ ] **Step 4: Run it (green)** — `uv run pytest tests/test_midday_payload.py -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai/market_analysis/midday_payload.py backend/tests/test_midday_payload.py
git commit -m "feat(midday): AM-session payload collector + charts (data_state tags, graceful degrade, frozen EOD passthrough)"
```

---

### Task 4: Mid-day prompt + few-shot

**Files:**
- Create: `backend/app/services/ai/market_analysis/midday_prompts.py`
- Test: `backend/tests/test_midday_prompts.py`

**Interfaces:**
- Produces: `MIDDAY_SYSTEM_PROMPT: str` (mirrors the daily `SYSTEM_PROMPT` voice/rules — Vietnamese, no buy/sell, no fabrication, U+2212 minus, span-wrapped numbers — but framed as an **interim morning recap** oriented to the afternoon; instructs: exactly 2 paragraphs, a pending market_health, exactly 3 scenarios incl. a bull-trap, exactly 5 watchlist with item[1].key=='Giao dịch chiều'); `def build_midday_user_prompt(payload: dict, session_type: str) -> str` (embeds the AM payload JSON + the previous-EOD continuity block + a 1-shot midday sample + the exact output schema).
- Consumes: the midday payload (Task 3).

- [ ] **Step 1: Write the failing test** — assert the prompt encodes the hard contract:

```python
# backend/tests/test_midday_prompts.py
from app.services.ai.market_analysis.midday_prompts import MIDDAY_SYSTEM_PROMPT, build_midday_user_prompt

def test_system_prompt_encodes_midday_contract():
    s = MIDDAY_SYSTEM_PROMPT
    assert "Giao dịch chiều" in s
    assert "phiên sáng" in s.lower()
    for k in ["2 đoạn", "3 kịch bản", "5"]:  # 2 paragraphs, 3 scenarios, 5 watchlist (phrasing may vary — keep these tokens)
        assert k in s

def test_user_prompt_embeds_payload_and_schema():
    p = {"meta": {"generated_for_date": "2026-07-01"}, "charts": {}, "eod_previous": {"headline": "hôm qua"}}
    out = build_midday_user_prompt(p, "low_volatility")
    assert "2026-07-01" in out and "session_structure" in out and "afternoon_session" in out
```

- [ ] **Step 2: Run it (red)** → FAIL.
- [ ] **Step 3: Implement** the two prompt constants/functions per §4.2 of the spec (copy the daily prompt's structure from `prompts.py`; keep the banned-word list + number/locale rules identical; add the midday-specific counts + `'Giao dịch chiều'` + bull-trap scenario + pending market_health). Provide one inline few-shot midday example.
- [ ] **Step 4: Run it (green)** → PASS.
- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai/market_analysis/midday_prompts.py backend/tests/test_midday_prompts.py
git commit -m "feat(midday): DeepSeek prompt + few-shot (interim AM recap, exact contract)"
```

---

### Task 5: Mid-day validator

**Files:**
- Create: `backend/app/services/ai/market_analysis/midday_validator.py`
- Test: `backend/tests/test_midday_validator.py`

**Interfaces:**
- Consumes: `hard_errors` + `SOFT_ERROR_PREFIXES` from `validator.py` (reuse; do not redefine the soft/hard split).
- Produces: `def validate_midday(out: dict, payload: dict) -> list[str]` — returns error strings (same convention as `validate_output`). HARD rules (block publish): headline 60–90 chars; `paragraphs` has exactly `session_structure`+`money_flow` with `status=='published'` and a `market_health` with `status=='pending'`; `len(scenarios)==3` with the 3rd `type=='down'` and all `scope=='afternoon_session'`; `len(watchlist)==5` and `watchlist[1]['key']=='Giao dịch chiều'`; banned-word scan (reuse the daily forbidden lists); U+2212 check (no ASCII `-` before a digit in content); no buy/sell reco. SOFT rules (prefix `BUG16`-style, never block): number-repetition, minor span-wrap gaps.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_midday_validator.py
from app.services.ai.market_analysis.midday_validator import validate_midday

def _ok():
    return {
        "headline": "VN-Index giảm 0,4% phiên sáng — thanh khoản dưới trung bình 20 phiên",
        "tagline": {"text": "THẬN TRỌNG · Thanh khoản thấp · Khối ngoại bán", "color": "neutral"},
        "paragraphs": {
            "session_structure": {"status": "published", "content": "Chỉ số <span class='num'>1.234</span> ..."},
            "money_flow": {"status": "published", "content": "Khối ngoại bán <span class='down-text num'>−120</span> tỷ ..."},
            "market_health": {"status": "pending", "pending_message": "Cập nhật 16:30", "pending_until": "2026-07-01T16:30:00+07:00"},
        },
        "unexplained": {"title": "Điểm cần xác nhận trong phiên chiều", "content": "Nếu VN-Index giữ trên <strong>1.230</strong> ..."},
        "scenarios": [
            {"type": "up", "condition": "Nếu ...", "outcome": "...", "scope": "afternoon_session"},
            {"type": "down", "condition": "Nếu ...", "outcome": "...", "scope": "afternoon_session"},
            {"type": "down", "condition": "Khi thanh khoản ...", "outcome": "...", "scope": "afternoon_session"},
        ],
        "watchlist": [
            {"key": "VN-Index", "alert_level": "alert", "reason": "— vùng ..."},
            {"key": "Giao dịch chiều", "alert_level": "alert", "reason": "— ..."},
            {"key": "VHM", "alert_level": "normal", "reason": "— ..."},
            {"key": "Ngân hàng", "alert_level": "normal", "reason": "— ..."},
            {"key": "Thanh khoản", "alert_level": "warn", "reason": "— ..."},
        ],
    }

def test_valid_midday_passes():
    assert validate_midday(_ok(), {}) == []

def test_watchlist_item1_must_be_giao_dich_chieu():
    o = _ok(); o["watchlist"][1]["key"] = "FPT"
    errs = validate_midday(o, {})
    assert any("Giao dịch chiều" in e for e in errs)

def test_scenarios_must_be_three():
    o = _ok(); o["scenarios"] = o["scenarios"][:2]
    assert any("kịch bản" in e.lower() or "scenario" in e.lower() for e in validate_midday(o, {}))

def test_ascii_hyphen_before_digit_flagged():
    o = _ok(); o["paragraphs"]["money_flow"]["content"] = "bán -120 tỷ"
    assert any("−" in e or "U+2212" in e or "hyphen" in e.lower() for e in validate_midday(o, {}))
```

- [ ] **Step 2: Run it (red)** → FAIL.
- [ ] **Step 3: Implement** `validate_midday` per the rules above; import + reuse `hard_errors`, `SOFT_ERROR_PREFIXES`, and the forbidden-term lists from `validator.py`.
- [ ] **Step 4: Run it (green)** — `uv run pytest tests/test_midday_validator.py -q` → PASS (4 tests).
- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai/market_analysis/midday_validator.py backend/tests/test_midday_validator.py
git commit -m "feat(midday): validator (exact counts, Giao dịch chiều, U+2212, banned words; soft/hard split)"
```

---

### Task 6: Mid-day session config + runner + flags

**Files:**
- Modify: `backend/app/services/ai/market_analysis/generator.py`
- Modify: `backend/app/core/config.py`
- Test: `backend/tests/test_run_midday_analysis.py`

**Interfaces:**
- Consumes: `SessionConfig`/`run_session_analysis` (Task 2), `build_midday_payload` (T3), `MIDDAY_SYSTEM_PROMPT`/`build_midday_user_prompt` (T4), `validate_midday` (T5).
- Produces: `MIDDAY_CONFIG: SessionConfig` (report_type="midday", payload_builder=lambda: build_midday_payload(db)… — see note, prompt_builder=build_midday_user_prompt, system_prompt=MIDDAY_SYSTEM_PROMPT, validator=validate_midday, session_display=SESSION_DISPLAY, use_memory=False, persist_claims=False); `async def run_midday_analysis(session=None) -> dict` (opens a db session like `run_daily_analysis`, calls `run_session_analysis(MIDDAY_CONFIG, db=...)`). Config additions: `MIDDAY_ANALYSIS_ENABLED: bool=False`, `MIDDAY_ANALYSIS_CRON_HOUR: int=11`, `MIDDAY_ANALYSIS_CRON_MINUTE: int=30`.
- Note: `build_midday_payload` needs `db`. Give `SessionConfig.payload_builder` an optional `db` param OR have `run_midday_analysis` build the payload itself and pass `payload=` into `run_session_analysis` (simpler — do this: `payload = await build_midday_payload(db); await run_session_analysis(MIDDAY_CONFIG, payload=payload, db=db)`, and set `MIDDAY_CONFIG.payload_builder` to a stub that raises if called without a payload).

- [ ] **Step 1: Write the failing test** (mock chat_completion + build_midday_payload; assert a midday record persists):

```python
# backend/tests/test_run_midday_analysis.py
import json
from unittest.mock import AsyncMock, patch
import pytest
from sqlalchemy import select
from app.services.ai.market_analysis import generator as G
from app.models.market_analysis import AnalysisHistory

VALID = json.dumps({
  "headline": "VN-Index giảm 0,4% phiên sáng — thanh khoản dưới trung bình 20 phiên",
  "tagline": {"text": "THẬN TRỌNG · Thanh khoản thấp · Khối ngoại bán", "color": "neutral"},
  "paragraphs": {"session_structure": {"status":"published","content":"a"},
                 "money_flow": {"status":"published","content":"b"},
                 "market_health": {"status":"pending","pending_message":"16:30","pending_until":"2026-07-01T16:30:00+07:00"}},
  "unexplained": {"title":"Điểm cần xác nhận trong phiên chiều","content":"Nếu ..."},
  "scenarios": [{"type":"up","condition":"Nếu","outcome":"x","scope":"afternoon_session"},
                {"type":"down","condition":"Nếu","outcome":"y","scope":"afternoon_session"},
                {"type":"down","condition":"Khi","outcome":"z","scope":"afternoon_session"}],
  "watchlist": [{"key":"VN-Index","alert_level":"alert","reason":"—"},{"key":"Giao dịch chiều","alert_level":"alert","reason":"—"},
                {"key":"VHM","alert_level":"normal","reason":"—"},{"key":"NH","alert_level":"normal","reason":"—"},{"key":"TK","alert_level":"warn","reason":"—"}],
})

@pytest.mark.asyncio
async def test_run_midday_persists_midday_record(db_session):
    payload = {"meta": {"generated_for_date": "2026-07-01"}, "charts": {}}
    with patch.object(G, "build_midday_payload", new=AsyncMock(return_value=payload)), \
         patch.object(G, "chat_completion", new=AsyncMock(return_value=(VALID, "deepseek"))):
        res = await G.run_midday_analysis(session=db_session)
    assert res["persisted"] is True
    row = (await db_session.execute(select(AnalysisHistory).where(AnalysisHistory.report_type == "midday"))).scalar_one()
    assert row.report_type == "midday" and "Giao dịch chiều" in json.dumps(row.watchlist, ensure_ascii=False)
```

- [ ] **Step 2: Run it (red)** → FAIL.
- [ ] **Step 3: Implement** `MIDDAY_CONFIG` + `run_midday_analysis` in `generator.py` (import the midday payload/prompt/validator); add the 3 config settings to `config.py`.
- [ ] **Step 4: Run it (green)** — `uv run pytest tests/test_run_midday_analysis.py -q` → PASS.
- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai/market_analysis/generator.py backend/app/core/config.py backend/tests/test_run_midday_analysis.py
git commit -m "feat(midday): MIDDAY_CONFIG + run_midday_analysis + enable/cron flags"
```

---

### Task 7: Mid-day endpoints

**Files:**
- Modify: `backend/app/api/v1/endpoints/market_analysis.py`
- Test: `backend/tests/test_midday_endpoints.py`

**Interfaces:**
- Produces: `GET /api/v1/market-analysis/midday/latest`, `GET /api/v1/market-analysis/midday/{session_date}`, admin `POST /api/v1/market-analysis/midday/run`. Same `AnalysisOut` response shape as daily (incl. `charts` from `meta`), filtered to `report_type='midday'`. The daily routes are unchanged (they filter `report_type='daily'` — add that filter to the existing daily queries so a same-day midday record can't leak into `daily/latest`).

- [ ] **Step 1: Write the failing test** — seed a midday row, assert `midday/latest` returns it and `daily/latest` does not:

```python
# backend/tests/test_midday_endpoints.py
import datetime as dt
import pytest
from httpx import AsyncClient
from app.models.market_analysis import AnalysisHistory

@pytest.mark.asyncio
async def test_midday_latest_returns_only_midday(client: AsyncClient, db_session):
    d = dt.date(2026, 7, 1)
    db_session.add(AnalysisHistory(public_id="m", session_date=d, session_type="low_volatility", report_type="midday",
                                   headline="Midday brief", tagline={"text":"x","color":"neutral"}, paragraphs={}, scenarios=[], watchlist=[], meta={"charts": {}}, is_published=True))
    await db_session.commit()
    r = await client.get("/api/v1/market-analysis/midday/latest")
    assert r.status_code == 200 and r.json()["headline"] == "Midday brief"
```
(Use whatever async client/fixtures the existing endpoint tests use — mirror `tests/` conventions.)

- [ ] **Step 2: Run it (red)** → FAIL (404 / route missing).
- [ ] **Step 3: Implement** the 3 midday routes by parameterizing the existing daily handlers on `report_type` (factor a shared `_get_latest(db, report_type)` / `_get_by_date(...)` if clean), and add `report_type='daily'` to the existing daily queries. Admin `midday/run` calls `run_midday_analysis` (mirror `daily/run`, same auth gate).
- [ ] **Step 4: Run it (green)** → PASS.
- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/market_analysis.py backend/tests/test_midday_endpoints.py
git commit -m "feat(midday): /market-analysis/midday latest|{date}|run endpoints (daily filtered to report_type=daily)"
```

---

### Task 8: Mid-day cron job (11:30, advisory lock)

**Files:**
- Modify: `backend/app/services/jobs/market_analysis_job.py`
- Modify: `backend/app/services/jobs/__init__.py`
- Test: `backend/tests/test_midday_job.py`

**Interfaces:**
- Produces: `async def run_midday_analysis_job(session=None) -> dict` — mirrors `run_market_analysis_job` but with a **distinct** advisory lock key `_MIDDAY_LOCK_KEY = 826_101_731`, `is_trading_day` gate (returns `{"skipped": "not_trading_day"|"locked", "date": ...}`), and calls `run_midday_analysis`. Registered in `__init__.py` behind `MIDDAY_ANALYSIS_ENABLED` with `CronTrigger(day_of_week="mon-fri", hour=MIDDAY_ANALYSIS_CRON_HOUR, minute=MIDDAY_ANALYSIS_CRON_MINUTE, timezone="Asia/Ho_Chi_Minh")`.

- [ ] **Step 1: Write the failing test** — assert non-trading-day gating (no network):

```python
# backend/tests/test_midday_job.py
import datetime as dt
from unittest.mock import patch
import pytest
from app.services.jobs import market_analysis_job as J

@pytest.mark.asyncio
async def test_midday_job_skips_non_trading_day():
    with patch.object(J, "is_trading_day", return_value=False):
        res = await J.run_midday_analysis_job(session=object())
    assert res == {"skipped": "not_trading_day", "date": res["date"]}
```

- [ ] **Step 2: Run it (red)** → FAIL.
- [ ] **Step 3: Implement** `run_midday_analysis_job` (copy `run_market_analysis_job`, swap the lock key + `run_daily_analysis`→`run_midday_analysis`) and register the cron in `__init__.py` under the `MIDDAY_ANALYSIS_ENABLED` flag (mirror the daily registration block; distinct job id).
- [ ] **Step 4: Run it (green)** → PASS.
- [ ] **Step 5: Commit**

```bash
git add backend/app/services/jobs/market_analysis_job.py backend/app/services/jobs/__init__.py backend/tests/test_midday_job.py
git commit -m "feat(midday): 11:30 cron job with distinct advisory lock, gated by MIDDAY_ANALYSIS_ENABLED"
```

---

### Task 9: Frontend — `MidDayAnalysis` type + fetch hook

**Files:**
- Create: `dashboard/src/features/market-overview/midday/types.ts`
- Create: `dashboard/src/features/market-overview/midday/useMidDayMarketAnalysis.ts`
- Test: `dashboard/src/features/market-overview/midday/useMidDayMarketAnalysis.test.ts`

**Interfaces:**
- Consumes: the daily `MarketCharts` type (`../daily/types`) + the Ky `api` client.
- Produces: `MidDayAnalysis` type — like `DailyAnalysis` but: `report_type: "midday"`; `paragraphs: { session_structure: MidPara; money_flow: MidPara; market_health: PendingPara }` where `MidPara = { status: "published"; content: string }` and `PendingPara = { status: "pending"; pending_message: string; pending_until: string }`; `scenarios: { type: "up"|"down"; condition: string; outcome: string; scope: "afternoon_session" }[]` (length 3); `watchlist: { key: string; alert_level: "normal"|"alert"|"warn"; reason: string }[]` (length 5); `tagline: { text: string; color: "up"|"down"|"neutral" }`; `unexplained: { title: string; content: string } | null`; `charts?: MidDayCharts` where `MidDayCharts` extends each `MarketCharts` block with `data_state?: "am_session"|"eod_previous"|"unavailable"`; `pulse?: { vn_index: { value: number; change: number; change_pct: number; sparkline: number[] }; breadth: { up: number; down: number }; foreign_net_billion: number; liquidity: { am_value_billion: number; ma20_billion: number | null; vs_ma20_pct: number | null } }` (mirrors the backend `pulse` block from Task 3). `useMidDayMarketAnalysis(enabled=true)` → `useQuery<MidDayAnalysis>({ queryKey: ["market-analysis","midday","latest"], queryFn: () => api.get("market-analysis/midday/latest").json<MidDayAnalysis>(), staleTime: 30*60*1000, enabled })`.

- [ ] **Step 1: Write the failing test** (mock `api`, assert the hook shape). Mirror the daily hook test if one exists; else:

```ts
// useMidDayMarketAnalysis.test.ts
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { describe, it, expect, vi } from "vitest"
vi.mock("@/shared/http/client", () => ({ api: { get: () => ({ json: async () => ({ report_type: "midday", headline: "M" }) }) } }))
import { useMidDayMarketAnalysis } from "./useMidDayMarketAnalysis"

it("fetches the midday endpoint", async () => {
  const qc = new QueryClient()
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useMidDayMarketAnalysis(), { wrapper })
  await waitFor(() => expect(result.current.data?.headline).toBe("M"))
})
```
(Adjust the `api` import path to match the daily hook's actual import.)

- [ ] **Step 2: Run it (red)** → FAIL.
- [ ] **Step 3: Implement** `types.ts` + the hook (copy `useDailyMarketAnalysis.ts` structure; swap key + endpoint + type).
- [ ] **Step 4: Run it (green)** → PASS.
- [ ] **Step 5: Commit**

```bash
git add dashboard/src/features/market-overview/midday/types.ts dashboard/src/features/market-overview/midday/useMidDayMarketAnalysis.ts dashboard/src/features/market-overview/midday/useMidDayMarketAnalysis.test.ts
git commit -m "feat(midday-fe): MidDayAnalysis type + useMidDayMarketAnalysis hook"
```

---

### Task 10: Frontend — `getDisplayMode()` wall-clock machine

**Files:**
- Create: `dashboard/src/features/market-overview/midday/getDisplayMode.ts`
- Test: `dashboard/src/features/market-overview/midday/getDisplayMode.test.ts`

**Interfaces:**
- Produces: `type DisplayMode = "eod_yesterday" | "midday_loading" | "midday" | "eod_today"`; `function getDisplayMode(now: Date, opts?: { isTradingDay?: boolean }): DisplayMode`. Rules (ICT wall-clock, using local hours since the app runs in ICT; keep pure + injectable `now`): non-trading-day → `eod_yesterday`; `< 11:30` → `eod_yesterday`; `11:30–11:45` → `midday_loading`; `11:45–16:30` → `midday`; `≥ 16:30` → `eod_today`. (Pre-market 08:00 window is out of scope — shows `eod_yesterday` for now.)

- [ ] **Step 1: Write the failing test**

```ts
// getDisplayMode.test.ts
import { describe, it, expect } from "vitest"
import { getDisplayMode } from "./getDisplayMode"
const at = (h: number, m = 0) => new Date(2026, 6, 1, h, m) // Wed 2026-07-01
describe("getDisplayMode", () => {
  it("before 11:30 → eod_yesterday", () => expect(getDisplayMode(at(9, 30))).toBe("eod_yesterday"))
  it("11:30–11:45 → midday_loading", () => expect(getDisplayMode(at(11, 35))).toBe("midday_loading"))
  it("11:45–16:30 → midday", () => { expect(getDisplayMode(at(12, 0))).toBe("midday"); expect(getDisplayMode(at(14, 45))).toBe("midday") })
  it("after 16:30 → eod_today", () => expect(getDisplayMode(at(16, 30))).toBe("eod_today"))
  it("non-trading-day → eod_yesterday", () => expect(getDisplayMode(at(12, 0), { isTradingDay: false })).toBe("eod_yesterday"))
})
```

- [ ] **Step 2: Run it (red)** → FAIL.
- [ ] **Step 3: Implement** the pure function per the rules (compare `now.getHours()*60+now.getMinutes()` to the boundaries 690/705/990).
- [ ] **Step 4: Run it (green)** → PASS.
- [ ] **Step 5: Commit**

```bash
git add dashboard/src/features/market-overview/midday/getDisplayMode.ts dashboard/src/features/market-overview/midday/getDisplayMode.test.ts
git commit -m "feat(midday-fe): getDisplayMode wall-clock machine"
```

---

### Task 11: Frontend — frozen-card variant on Health + Rotation charts

**Files:**
- Modify: `dashboard/src/features/market-overview/daily/charts/ChartCard.tsx`
- Modify: `dashboard/src/features/market-overview/daily/charts/HealthLineChart.tsx`
- Modify: `dashboard/src/features/market-overview/daily/charts/RotationChart.tsx`
- Test: `dashboard/src/features/market-overview/daily/charts/frozen-variant.test.tsx`

**Interfaces:**
- Produces (additive; daily default unchanged): `ChartCard` gains optional `tag?: { label: string; tone?: "am" | "frozen" }` (renders a small tag in the card header) and `frozen?: boolean` (adds `opacity-[0.55] pointer-events-none` to the body + a bottom "frozen" banner via a `frozenNote?: string`). `HealthLineChart` + `RotationChart` gain optional `frozen?: boolean` + `dataTag?: string` + `frozenNote?: string`, all forwarded to `ChartCard`. When omitted → current behavior.

- [ ] **Step 1: Write the failing test**

```tsx
// frozen-variant.test.tsx
import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, it, expect } from "vitest"
import { RotationChart } from "./RotationChart"
it("renders a frozen tag + note when frozen", () => {
  render(<RotationChart data={{ sectors_today: [{ name: "Ngân hàng", pct: 1.2 }] }} frozen dataTag="Cuối ngày 30/06" frozenNote="Số cuối ngày · chờ 16:30" />)
  expect(screen.getByText(/Cuối ngày 30\/06/)).toBeInTheDocument()
  expect(screen.getByText(/chờ 16:30/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it (red)** → FAIL (props not accepted).
- [ ] **Step 3: Implement** — add the optional props to `ChartCard` (render `tag` in the header, wrap body with the dim + `frozenNote` banner when `frozen`); thread `frozen`/`dataTag`/`frozenNote` from `HealthLineChart` + `RotationChart` into their `ChartCard`. Use theme tokens (`--color-text-3` grey for frozen). Do NOT change the default (unfrozen) render.
- [ ] **Step 4: Run it (green) + the existing daily chart tests** — `npx vitest run src/features/market-overview/daily` → PASS (daily charts unaffected).
- [ ] **Step 5: Commit**

```bash
git add dashboard/src/features/market-overview/daily/charts/ChartCard.tsx dashboard/src/features/market-overview/daily/charts/HealthLineChart.tsx dashboard/src/features/market-overview/daily/charts/RotationChart.tsx dashboard/src/features/market-overview/daily/charts/frozen-variant.test.tsx
git commit -m "feat(midday-fe): optional frozen/dataTag variant on ChartCard + Health/Rotation (daily unchanged)"
```

---

### Task 12: Frontend — MidDay article + takeaway + orange token

**Files:**
- Create: `dashboard/src/features/market-overview/midday/MidDayArticle.tsx`
- Create: `dashboard/src/features/market-overview/midday/MidDayTakeaway.tsx`
- Create: `dashboard/src/features/market-overview/midday/midday.css`
- Test: `dashboard/src/features/market-overview/midday/MidDayArticle.test.tsx`

**Interfaces:**
- Consumes: `MidDayAnalysis` (Task 9). Both components take `{ data: MidDayAnalysis }` as a prop (unlike the daily Article/Takeaway which read hooks internally — the midday variants are prop-driven so `MidDayView` owns the fetch).
- Produces: `MidDayArticle({ data })` — orange badge "IQX AI · PHIÊN SÁNG" (uses `.mm-*` token); headline + tagline (◆, colored by `tagline.color`); the 2 published paragraphs (Cấu trúc phiên sáng / Dòng tiền phiên sáng, rendered as sanitized HTML like the daily article does); the `market_health` **pending placeholder** (dashed border, ⏱, `pending_message`); the "Điểm cần xác nhận trong phiên chiều" callout (orange left-border). `MidDayTakeaway({ data })` — "Kịch bản phiên chiều" (3 scenario bullets from `data.scenarios`, condition/outcome as sanitized HTML) + a countdown pill to 14:45 + "Đáng quan sát phiên chiều" (5 watchlist bullets by `alert_level`). `midday.css` defines `.mm-article { --mm-accent: #FFB347; --mm-accent-soft: #FFB34722; }` and the badge/shimmer/callout styles (mirror `article.css` but orange).

- [ ] **Step 1: Write the failing test**

```tsx
// MidDayArticle.test.tsx
import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, it, expect } from "vitest"
import { MidDayArticle } from "./MidDayArticle"
const data = {
  report_type: "midday", headline: "VN-Index giảm 0,4% phiên sáng — thanh khoản thấp",
  tagline: { text: "THẬN TRỌNG", color: "neutral" },
  paragraphs: { session_structure: { status: "published", content: "<p>a</p>" },
                money_flow: { status: "published", content: "<p>b</p>" },
                market_health: { status: "pending", pending_message: "Cập nhật 16:30", pending_until: "" } },
  unexplained: { title: "Điểm cần xác nhận trong phiên chiều", content: "c" },
  scenarios: [], watchlist: [],
} as any
describe("MidDayArticle", () => {
  it("shows the PHIÊN SÁNG badge, 2 paragraphs and the pending placeholder", () => {
    render(<MidDayArticle data={data} />)
    expect(screen.getByText(/PHIÊN SÁNG/)).toBeInTheDocument()
    expect(screen.getByText(/Cập nhật 16:30/)).toBeInTheDocument()
    expect(screen.getByText(/Điểm cần xác nhận trong phiên chiều/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it (red)** → FAIL.
- [ ] **Step 3: Implement** both components + `midday.css` (import the css in the components; reuse the daily article's sanitize-HTML helper — check `MarketAnalysisArticle.tsx` for the sanitizer it uses and reuse it; render paragraph content via the same mechanism, NOT `dangerouslySetInnerHTML` if the daily one avoids it — match the daily pattern exactly).
- [ ] **Step 4: Run it (green) + build** — `npx vitest run src/features/market-overview/midday` + `npm run build` → PASS/clean.
- [ ] **Step 5: Commit**

```bash
git add dashboard/src/features/market-overview/midday/MidDayArticle.tsx dashboard/src/features/market-overview/midday/MidDayTakeaway.tsx dashboard/src/features/market-overview/midday/midday.css dashboard/src/features/market-overview/midday/MidDayArticle.test.tsx
git commit -m "feat(midday-fe): MidDayArticle + MidDayTakeaway + orange token (2 published + pending, 3 scenarios + countdown)"
```

---

### Task 13: Frontend — MidDayPulseBar

**Files:**
- Create: `dashboard/src/features/market-overview/midday/MidDayPulseBar.tsx`
- Test: `dashboard/src/features/market-overview/midday/MidDayPulseBar.test.tsx`

**Interfaces:**
- Consumes: `MidDayAnalysis["pulse"]` (VN-Index value/change/sparkline, breadth, foreign net, AM liquidity vs MA20 — from Task 3's `pulse` block / Task 9's type) + `charts.market_health_detail` (for the frozen cell 5). Prop-driven: `MidDayPulseBar({ data, isLunch }: { data: MidDayAnalysis; isLunch: boolean })`.
- Produces: a 5-cell bar (VN-Index hero + AM sparkline · breadth up/down · foreign net + streak · AM liquidity vs MA20 · **cell 5 market-health FROZEN grey** with "Số cuối ngày dd/mm · chờ 16:30"). When `isLunch`, render the "Tạm chốt cuối phiên sáng" banner above the cells; the component itself does no polling (parent controls refetch; during lunch the parent suppresses refetch — see Task 14).

- [ ] **Step 1: Write the failing test** — assert the lunch banner + frozen cell:

```tsx
// MidDayPulseBar.test.tsx
import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, it, expect } from "vitest"
import { MidDayPulseBar } from "./MidDayPulseBar"
const data = { charts: { breadth: { up: 100, down: 80, flat: 5, ceiling: 1, floor: 0, ratio_up_down: "1 : 0.8", classification: "Đi ngang", pct_above_ma20: null, data_state: "am_session" },
  foreign_detail: { total_buy_vnd_billion: 100, total_sell_vnd_billion: 120, streak: { count: 2, direction: "sell", last_5d_cumulative: null }, last_12_sessions: [], top_sell: [], top_buy: [], data_state: "am_session" },
  market_health_detail: { pct_above_ma20: 40, data_state: "eod_previous" } } } as any
it("shows the lunch banner + frozen health cell", () => {
  render(<MidDayPulseBar data={data} isLunch />)
  expect(screen.getByText(/Tạm chốt cuối phiên sáng/)).toBeInTheDocument()
  expect(screen.getByText(/chờ 16:30|Số cuối ngày/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it (red)** → FAIL.
- [ ] **Step 3: Implement** `MidDayPulseBar` (model the cell layout on the daily `MarketPulseBar`, but prop-driven from `data.pulse` — defined by Task 3's `pulse` block + the Task 9 type; orange accents; frozen cell 5 from `charts.market_health_detail`; lunch banner).
- [ ] **Step 4: Run it (green) + build** → PASS/clean.
- [ ] **Step 5: Commit**

```bash
git add dashboard/src/features/market-overview/midday/MidDayPulseBar.tsx dashboard/src/features/market-overview/midday/MidDayPulseBar.test.tsx
git commit -m "feat(midday-fe): MidDayPulseBar (lunch banner, frozen health cell, AM cells)"
```

---

### Task 14: Frontend — MidDayView + HomeMarketView + wire HomeWorkspace

**Files:**
- Create: `dashboard/src/features/market-overview/midday/MidDayView.tsx`
- Create: `dashboard/src/features/market-overview/HomeMarketView.tsx`
- Modify: `dashboard/src/features/home-workspace/HomeWorkspace.tsx`
- Test: `dashboard/src/features/market-overview/HomeMarketView.test.tsx`

**Interfaces:**
- Consumes: `useMidDayMarketAnalysis` (T9), `getDisplayMode` (T10), `MidDayArticle`/`MidDayTakeaway` (T12), `MidDayPulseBar` (T13), the frozen chart variants (T11), the existing daily chart components; `MarketDailyPage` (EOD).
- Produces:
  - `MidDayView()` — fetches `useMidDayMarketAnalysis()`; when `isLunch` (11:30–13:00) sets the query's `refetchInterval` to `false` (suppress polling), else 30s; renders `MidDayArticle` + `MidDayPulseBar(isLunch)` + `MidDayTakeaway` + tier-grouped charts (4 AM-live: BreadthChart/ContributionChart/ForeignFlowCard/PropFlowCard tagged "Phiên sáng"; 2 frozen: `<HealthLineChart frozen dataTag="Cuối ngày …"/>` + `<RotationChart frozen dataTag="…"/>`). Loading (`midday_loading`) → skeleton; no midday data → render `<MarketDailyPage/>` (previous EOD) with a small "Bản phiên sáng đang xử lý…" notice.
  - `HomeMarketView()` — computes `const mode = getDisplayMode(new Date())` (recompute on an interval/timer so it advances across boundaries); renders `MidDayView` for `midday`/`midday_loading`, else `<MarketDailyPage/>`.
  - `HomeWorkspace.tsx`: replace the `const market = (<div…><MarketDailyPage/></div>)` with `<div…><HomeMarketView/></div>` (both desktop + mobile branches use the same `market` element — one change).

- [ ] **Step 1: Write the failing test** — mock the mode + children, assert routing:

```tsx
// HomeMarketView.test.tsx
import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, it, expect, vi } from "vitest"
vi.mock("./midday/getDisplayMode", () => ({ getDisplayMode: () => "midday" }))
vi.mock("./midday/MidDayView", () => ({ MidDayView: () => <div>MIDDAY_VIEW</div> }))
vi.mock("./daily/MarketDailyPage", () => ({ MarketDailyPage: () => <div>EOD_PAGE</div> }))
import { HomeMarketView } from "./HomeMarketView"
it("renders MidDayView in midday mode", () => {
  render(<HomeMarketView />)
  expect(screen.getByText("MIDDAY_VIEW")).toBeInTheDocument()
  expect(screen.queryByText("EOD_PAGE")).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run it (red)** → FAIL.
- [ ] **Step 3: Implement** `MidDayView`, `HomeMarketView` (recompute mode with a `useState`+`setInterval` every 30–60s so it advances), and the one-line `HomeWorkspace` swap. Keep the `useMidDayMarketAnalysis` `enabled` only in midday modes.
- [ ] **Step 4: Run it (green) + whole suite + build** — `npx vitest run` + `npm run build` → all pass/clean.
- [ ] **Step 5: Commit**

```bash
git add dashboard/src/features/market-overview/midday/MidDayView.tsx dashboard/src/features/market-overview/HomeMarketView.tsx dashboard/src/features/home-workspace/HomeWorkspace.tsx dashboard/src/features/market-overview/HomeMarketView.test.tsx
git commit -m "feat(midday-fe): MidDayView + HomeMarketView display-mode switch; wire into HomeWorkspace"
```

---

### Task 15: Full verification + manual smoke

**Files:** none.

- [ ] **Step 1:** Backend `cd backend && uv run pytest -q` → all green. Frontend `cd dashboard && npx vitest run && npm run build` → all green/clean.
- [ ] **Step 2: Manual** — locally set `MIDDAY_ANALYSIS_ENABLED=true`; force a midday run (`POST /api/v1/market-analysis/midday/run` as admin) with mocked/live data; hit `/api/v1/market-analysis/midday/latest` → valid midday shape (2 published + pending, 3 scenarios incl. bull-trap, watchlist[1]=='Giao dịch chiều', charts with data_state tags). Frontend: temporarily force `getDisplayMode` to `midday` → the home left column shows the orange mid-day variant (2 paragraphs + pending placeholder, lunch banner if applicable, 3 scenarios + countdown, 4 AM cards + 2 frozen dimmed cards). Confirm `/api/v1/market-analysis/daily/latest` + the 16:30 EOD flow + the home EOD view are unchanged. Toggle light/dark.
- [ ] **Step 3:** Confirm the daily EOD path is byte-equivalent (its tests + the daily endpoint + the 16:30 cron behavior unchanged).

---

## Out of scope (this cycle)
- International-data pipeline (SP-1), pre-market session (SP-3), editor-review portal + push notifications (SP-4).
- **Share-snapshot** (html2canvas) — needs a new dependency; defer to a fast-follow (the spec lists it but it's non-essential for v1).
- Endpoint unification under `/api/v1/market/dashboard` (kept the parallel `market-analysis/midday/*` naming).
- Afternoon (13:00–14:45) live intraday refresh beyond the pulse cells; the 20-day AM-liquidity MA backfill may ship partial (flagged in `meta.missing_fields`).
- Nav market-clock/live-dot `lunch_break`/`atc` state colors (spec §5.1) — cosmetic polish deferred; the `getDisplayMode` page switch is the v1 core.

## Plan complete — mid-day session: a shared session engine (report_type) + an AM-session pipeline (DeepSeek, graceful degrade) + an orange home-page display-mode variant, with EOD untouched.
