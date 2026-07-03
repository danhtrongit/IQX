# Pre-market Session (SP-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The third daily AI brief — "Sáng nay cần lưu ý" (`report_type='premarket'`, generated 07:15 ICT, displayed 08:00–09:00 on the home page) — news digest + world overview + events + watch list, via the shared session engine with its own prompt/validator.

**Architecture:** A premarket payload builder (world grid from Plan A's `market_data_snapshot`, news from `fetch_news_list` with a 17:00→06:30 window + source-rank dedup, corporate events from `fetch_events_calendar` normalized, prior-EOD context) + a DeepSeek prompt/validator pair with **zero ID-hallucination** enforcement + `PREMARKET_CONFIG`/`run_premarket_analysis` (resolving ids→objects before persist) + endpoints + an 07:15 cron. Frontend: a cyan `PreMarketView` (world grid, 5 news cards, events timeline, watch list, ATO countdown — NO VN charts) shown by `getDisplayMode` in the 08:00–09:00 window.

**Tech Stack:** Python 3.14/FastAPI/SQLAlchemy/APScheduler/DeepSeek via `proxy_client`; React 19/Arco/TanStack Query/Vitest+RTL.

## Global Constraints

- **DEPENDS ON PLAN A** (`market_data_snapshot` + `load_latest_snapshot` + the wave crons). Build after Plan A merges to the branch.
- **LLM = DeepSeek** via `chat_completion`; temperature **0.5**; no other provider.
- Output contract (exact): `headline` 60–90 chars + em-dash, no trailing period · `tagline` `{SENTIMENT_CAPS} · {N tin tích cực} · {N sự kiện cao} · {1 lưu ý}` · `world_paragraph` 70–130 words, span-wrapped numbers · `hot_news` count `== min(5, len(news_pool))` with `{id VERBATIM from pool, rank_order, insight 30–55 words prefixed "<strong>Tác động phiên sáng nay:</strong> "}` · `events_filtered` 2–10 (prompt guides 5–8) `{id from pool, note 8–20 words, impact high|medium|low}` sorted by time asc · `watch_today` 5–6 `{level normal|alert|warn, content 20–50 words}`, **`[0]` MUST mention VN-Index**.
- **Zero ID hallucination:** every `hot_news[].id`/`events_filtered[].id` must exist in the input pools — HARD validator rule.
- Voice rules identical to daily/midday: Vietnamese, no buy/sell, no first-person, no fabrication, banned-word lists reused from `validator.py`, U+2212 on VISIBLE text (HTML-stripped — the midday lesson), vi-VN number locale.
- **The few-shot sample must pass the validator** — a mandatory test (the C1 lesson). `run_premarket_analysis` must be exported from `market_analysis/__init__.py` (the C2 lesson).
- News window: **17:00 previous trading day → 06:30 today**; dedup keeps the higher-ranked source (Reuters > Bloomberg > VnExpress = Tuổi Trẻ > CafeF = NDH > Tinnhanhchungkhoan = ĐTCK > others). Events: corporate-only v1 (VCI), empty pool is legitimate.
- USD/VND sentiment INVERTED (USD weakening = positive) — computed in the payload.
- Persisted record stores RESOLVED blocks (ids joined with pool objects) — the FE never sees the pools.
- Crons: generate **07:15 ICT** mon-fri, lock `826_101_734`, flag `PREMARKET_ANALYSIS_ENABLED: bool = False`. FE window: **08:00–08:59** (`getDisplayMode` → `"premarket"`).
- Frontend: cyan `--pm-accent: #4FD0FF`; no `import React` in source; theme tokens; `npm run build` gate; EOD + midday behavior untouched.
- Reference: design spec `backend/docs/superpowers/specs/2026-07-03-intl-data-premarket-design.md` (Part B); the midday analogues under `app/services/ai/market_analysis/midday_*.py` and `dashboard/src/features/market-overview/midday/` are the patterns to mirror.

## File Structure

Backend: Create `app/services/ai/market_analysis/{premarket_payload.py, premarket_prompts.py, premarket_validator.py}`; Modify `generator.py` (+`PREMARKET_CONFIG`, `run_premarket_analysis`), `market_analysis/__init__.py` (export), `app/api/v1/endpoints/market_analysis.py` (3 routes), `app/services/jobs/market_analysis_job.py` + `jobs/__init__.py` (cron), `app/core/config.py` (flag). Tests in `backend/tests/`.
Frontend: Create `dashboard/src/features/market-overview/premarket/{types.ts, usePreMarketAnalysis.ts, PreMarketView.tsx, premarket.css}` (+tests); Modify `midday/getDisplayMode.ts` (+"premarket") and `HomeMarketView.tsx` (route it).

---

### Task B1: LIVE-verify VCI events + normalizers (events + news)

**Files:**
- Create: `backend/app/services/ai/market_analysis/premarket_payload.py` (normalizer half)
- Test: `backend/tests/test_premarket_normalizers.py`

**Interfaces:**
- Produces:
  - `def normalize_news(items: list[dict], *, window_start: datetime, window_end: datetime) -> list[dict]` — filters by `update_date` within the window; maps `{id, title, summary(short_content), source(source_name or source), published_at(update_date), tickers([ticker] if ticker else []), sectors([industry] if industry else []), sentiment, url(source_link)}`; **dedup**: near-duplicate titles (casefolded, ≥0.8 similarity via `difflib.SequenceMatcher` on the first 80 chars) keep the item whose source ranks higher in `SOURCE_RANK` (Reuters=0, Bloomberg=1, VnExpress=2, "Tuổi Trẻ"=2, CafeF=3, NDH=3, Tinnhanhchungkhoan=4, ĐTCK=4, other=9); cap 20.
  - `def normalize_events(raw: list[dict]) -> list[dict]` — maps VCI rows to `{id, type, time, time_label, title, tickers}` where `type` = `ex_dividend|agm|insider|listing|other` from the VCI event-type code, `id` = a stable string (VCI id or `f"{code}-{date}-{ticker}"`).
- **Step 0 (verification, before coding `normalize_events`):** run a LIVE call `fetch_events_calendar(start=<today or a recent weekday>, end=<same>)` and RECORD the real field names of a returned row (eventTypeCode? companyCode? eventDate/eventTime? id?) in the task report — the normalizer maps the REAL keys, not guesses. If today returns 0 rows, widen to a 7-day window to capture examples of each type.

- [ ] **Step 1: Write the failing tests** (fixtures use the REAL field names found in Step 0 — the test file documents them):

```python
# backend/tests/test_premarket_normalizers.py  (adjust fixture keys to Step-0 findings)
from datetime import datetime, timezone, timedelta
from app.services.ai.market_analysis.premarket_payload import normalize_news, normalize_events

_ICT = timezone(timedelta(hours=7))

def _news(title, source, ts, **kw):
    return {"id": kw.get("id", title[:8]), "title": title, "short_content": "tóm tắt", "source_name": source,
            "update_date": ts, "ticker": kw.get("ticker"), "industry": kw.get("industry"),
            "sentiment": kw.get("sentiment", "neutral"), "source_link": "https://x"}

def test_news_window_filter_and_shape():
    ws = datetime(2026, 7, 2, 17, 0, tzinfo=_ICT); we = datetime(2026, 7, 3, 6, 30, tzinfo=_ICT)
    items = [_news("Trong cửa sổ", "CafeF", "2026-07-02T20:00:00+07:00"),
             _news("Quá sớm", "CafeF", "2026-07-02T10:00:00+07:00")]
    out = normalize_news(items, window_start=ws, window_end=we)
    assert [n["title"] for n in out] == ["Trong cửa sổ"]
    assert set(out[0]) >= {"id", "title", "summary", "source", "published_at", "tickers", "sentiment", "url"}

def test_news_dedup_keeps_higher_ranked_source():
    ws = datetime(2026, 7, 2, 17, 0, tzinfo=_ICT); we = datetime(2026, 7, 3, 6, 30, tzinfo=_ICT)
    items = [_news("Fed giữ nguyên lãi suất tháng 7", "CafeF", "2026-07-03T01:00:00+07:00", id="a"),
             _news("Fed giữ nguyên lãi suất tháng 7 ", "Reuters", "2026-07-03T02:00:00+07:00", id="b")]
    out = normalize_news(items, window_start=ws, window_end=we)
    assert len(out) == 1 and out[0]["id"] == "b"  # Reuters outranks CafeF

def test_events_normalize_types():
    raw = [  # keys per Step-0 live verification — adjust
        {"id": 1, "event_type_code": "DIV", "event_date": "2026-07-03", "event_time": None,
         "event_name": "VHM giao dịch không hưởng quyền cổ tức", "company_code": "VHM"},
        {"id": 2, "event_type_code": "AGME", "event_date": "2026-07-03", "event_time": "14:00",
         "event_name": "ĐHCĐ bất thường", "company_code": "SSI"},
    ]
    out = normalize_events(raw)
    assert out[0]["type"] == "ex_dividend" and out[0]["tickers"] == ["VHM"]
    assert out[1]["type"] == "agm" and out[1]["time_label"]
```

- [ ] **Step 2: red** → FAIL. **Step 3:** implement both normalizers (+`SOURCE_RANK` const) in `premarket_payload.py`. **Step 4: green** + report the live VCI row shape. 
- [ ] **Step 5: Commit** — `git commit -m "feat(premarket): news window+dedup and VCI event normalizers (live-verified field map)"`

---

### Task B2: Premarket payload builder

**Files:**
- Modify: `backend/app/services/ai/market_analysis/premarket_payload.py`
- Test: `backend/tests/test_premarket_payload.py`

**Interfaces:**
- Produces: `async def build_premarket_payload(db) -> dict` with top-level keys: `meta` (`report_type="premarket"`, `generated_for_date`, `missing_fields`, `weekday_vi`, `is_post_weekend`, `is_post_holiday`), `global_markets` (`{cells: [6 dicts {id,label,value,change_pct,sentiment,stale}], context: {...kospi/dxy/futures/vix...}}` — from `load_latest_snapshot(db)`: cells = ^GSPC, ^IXIC, ^N225, BZ=F, GC=F, VND=X; **USD/VND sentiment inverted**: `change_pct < 0 → "up"`), `news_pool` (normalize_news over `fetch_news_list("business", page_size=20, update_from=…, update_to=…)`, window 17:00 prev trading day→06:30 today), `events_pool` (normalize_events over `fetch_events_calendar(today, today)`), `eod_previous_summary` (latest `report_type='daily'` row: headline/tagline/scenarios/watchlist), `config`.
- Degrade: snapshot rows absent → cell `{value: None, stale: true}` + `missing_fields += ["global_markets"]`; **USD/VND cell only**: when the `VND=X` row is missing/stale, fall back to the existing `vcb.fetch_fx(today)` sell rate for `value` (change_pct None, `source:"vcb"`); news/events fetch failure → empty pool + missing_fields entry. `is_post_weekend/is_post_holiday` from `market_calendar` (Monday → post_weekend; previous calendar day not a trading day and not weekend → post_holiday).
- Consumes: A-plan `load_latest_snapshot`; `fetch_news_list`, `fetch_events_calendar`, the `_safe` wrapper pattern (READ `midday_payload.py` and mirror its structure/degrade style).

- [ ] **Step 1: Failing test** (mock sources; assert shape + inversion + degrade):

```python
# backend/tests/test_premarket_payload.py
import datetime as dt
from unittest.mock import AsyncMock, patch
import pytest
from app.services.ai.market_analysis import premarket_payload as PP

def _snap(symbol, price, pct, stale=False):
    class R:  # minimal stand-in for MarketDataSnapshot row
        pass
    r = R(); r.symbol = symbol; r.last_price = price; r.change_percent = pct; r.stale = stale
    r.asset_category = "fx" if symbol == "VND=X" else "us_index"; r.name = symbol
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
```

- [ ] **Step 2: red.** **Step 3:** implement `build_premarket_payload` (6 fixed cells always emitted; context block; pools; eod_previous via the same latest-daily query midday uses — factor/reuse `_load_previous_eod` if importable). **Step 4: green.** 
- [ ] **Step 5: Commit** — `git commit -m "feat(premarket): payload builder (snapshot cells + inverted USD/VND, pools, EOD context, degrade)"`

---

### Task B3: Prompt + few-shot

**Files:**
- Create: `backend/app/services/ai/market_analysis/premarket_prompts.py`
- Test: `backend/tests/test_premarket_prompts.py`

**Interfaces:**
- Produces: `PREMARKET_SYSTEM_PROMPT: str`, `build_premarket_user_prompt(payload, session_type) -> str`, `_PREMARKET_SAMPLE: str` (one few-shot whose JSON CONFORMS to the full contract — it will be validated in B4's cross test). System prompt: interim morning-brief voice; the 6-field contract from Global Constraints verbatim (incl. `id` copied from pools, insight prefix, watch_today[0] VN-Index, tagline format); `is_post_weekend/is_post_holiday` adjust the opening; ex-dividend reference-price drops ≠ organic selling; write around missing blocks (never fabricate); daily banned-word + U+2212 + span rules.

- [ ] **Step 1: Failing test:**

```python
# backend/tests/test_premarket_prompts.py
import json
from app.services.ai.market_analysis.premarket_prompts import (
    PREMARKET_SYSTEM_PROMPT, build_premarket_user_prompt, _PREMARKET_SAMPLE)

def test_system_prompt_encodes_contract():
    s = PREMARKET_SYSTEM_PROMPT
    for token in ["Tác động phiên sáng nay", "VN-Index", "hot_news", "events_filtered", "watch_today", "60", "90"]:
        assert token in s

def test_user_prompt_embeds_payload():
    p = {"meta": {"generated_for_date": "2026-07-03"}, "global_markets": {"cells": []},
         "news_pool": [], "events_pool": [], "eod_previous_summary": None,
         "config": {"is_post_weekend": False, "is_post_holiday": False, "weekday_vi": "Thứ Năm"}}
    out = build_premarket_user_prompt(p, "premarket")
    assert "2026-07-03" in out and "watch_today" in out

def test_sample_parses_as_json():
    data = json.loads(_PREMARKET_SAMPLE[_PREMARKET_SAMPLE.index("{"):])
    assert set(data) == {"headline", "tagline", "world_paragraph", "hot_news", "events_filtered", "watch_today"}
```

- [ ] **Step 2: red.** **Step 3:** implement (mirror `midday_prompts.py` structure/voice; temp is set by the caller). **Step 4: green.** 
- [ ] **Step 5: Commit** — `git commit -m "feat(premarket): DeepSeek prompt + conforming few-shot (3rd daily prompt)"`

---

### Task B4: Validator (+ sample-through-validator guard)

**Files:**
- Create: `backend/app/services/ai/market_analysis/premarket_validator.py`
- Test: `backend/tests/test_premarket_validator.py`

**Interfaces:**
- Produces: `def validate_premarket(out: dict, payload: dict) -> list[str]`. HARD: headline 60–90 + contains "—"; tagline non-empty; world_paragraph 70–130 words (HTML-stripped word count); `len(hot_news) == min(5, len(payload["news_pool"]))`; **every hot_news[].id ∈ pool ids; every events_filtered[].id ∈ pool ids**; insight starts with `<strong>Tác động phiên sáng nay:</strong>` and is 30–55 words (stripped); events_filtered count 2–10 (skip when both pool and output empty), impact ∈ enum; watch_today 5–6, `[0]["content"]` contains "VN-Index", level ∈ enum; banned words (reuse FORBIDDEN_*); ASCII `-` before digit on STRIPPED text → error (reuse the `_strip` approach from `midday_validator.py`). SOFT (`BUG16`-prefix): number repetition.
- Consumes: `hard_errors`, `SOFT_ERROR_PREFIXES`, FORBIDDEN_* from `validator.py`; `_PREMARKET_SAMPLE` + a minimal fixture payload for the cross-test.

- [ ] **Step 1: Failing tests** — a valid fixture passes; each hard rule trips; AND the cross-guard:

```python
# backend/tests/test_premarket_validator.py (excerpt — implement _ok()/pool fixtures fully)
import json
from app.services.ai.market_analysis.premarket_validator import validate_premarket
from app.services.ai.market_analysis.premarket_prompts import _PREMARKET_SAMPLE

def test_sample_passes_validator():
    sample = json.loads(_PREMARKET_SAMPLE[_PREMARKET_SAMPLE.index("{"):])
    payload = {"news_pool": [{"id": h["id"]} for h in sample["hot_news"]],
               "events_pool": [{"id": e["id"]} for e in sample["events_filtered"]]}
    assert validate_premarket(sample, payload) == []

def test_hallucinated_news_id_is_hard_error():
    sample = json.loads(_PREMARKET_SAMPLE[_PREMARKET_SAMPLE.index("{"):])
    payload = {"news_pool": [{"id": "khac"}], "events_pool": [{"id": e["id"]} for e in sample["events_filtered"]]}
    errs = validate_premarket(sample, payload)
    assert any("id" in e.lower() for e in errs)

def test_watch_today_zero_must_be_vnindex():
    sample = json.loads(_PREMARKET_SAMPLE[_PREMARKET_SAMPLE.index("{"):])
    sample["watch_today"][0]["content"] = "HPG cần chú ý vùng 28.000"
    payload = {"news_pool": [{"id": h["id"]} for h in sample["hot_news"]],
               "events_pool": [{"id": e["id"]} for e in sample["events_filtered"]]}
    assert any("VN-Index" in e for e in validate_premarket(sample, payload))
```
(+ count tests: hot_news vs small pool `min(5, len(pool))`; events 2–10; insight prefix/word-bounds; hyphen-before-digit on stripped text.)

- [ ] **Step 2: red.** **Step 3:** implement. **Step 4: green** + `uv run pytest tests/ -k premarket -q`. 
- [ ] **Step 5: Commit** — `git commit -m "feat(premarket): validator (zero ID-hallucination, exact counts, VN-Index watch[0]; sample passes)"`

---

### Task B5: Config + runner (resolve ids→objects) + endpoints + export

**Files:**
- Modify: `backend/app/services/ai/market_analysis/generator.py`, `backend/app/services/ai/market_analysis/__init__.py`, `backend/app/api/v1/endpoints/market_analysis.py`, `backend/app/core/config.py`
- Test: `backend/tests/test_run_premarket_analysis.py`, extend `backend/tests/test_midday_endpoints.py` conventions in a new `backend/tests/test_premarket_endpoints.py`

**Interfaces:**
- Produces: `PREMARKET_CONFIG = SessionConfig(report_type="premarket", payload_builder=<stub raising>, prompt_builder=build_premarket_user_prompt, system_prompt=PREMARKET_SYSTEM_PROMPT, validator=validate_premarket, session_display=SESSION_DISPLAY, use_memory=False, persist_claims=False)`; `async def run_premarket_analysis(session=None)` — builds payload with db, calls `run_session_analysis(MIDDAY-style, temperature=0.5, payload=payload, db=db)`; **after a publishable output and BEFORE persist**, resolves `hot_news[].id`→full news_pool object (merged with insight/rank_order) and `events_filtered[].id`→events_pool object (merged with note/impact), and attaches `output["world_overview"] = payload["global_markets"]` so the record is self-contained. Export `run_premarket_analysis` from `__init__.py` (+`__all__`). Endpoints: `GET /market-analysis/premarket/latest|/{date}` + admin `POST /market-analysis/premarket/run` via the existing `_get_latest/_get_by_date(report_type)` helpers. Config: `PREMARKET_ANALYSIS_ENABLED: bool = False`, `PREMARKET_ANALYSIS_CRON_HOUR: int = 7`, `PREMARKET_ANALYSIS_CRON_MINUTE: int = 15`.
- Note: resolution happens INSIDE `run_premarket_analysis` between generation and persist (persist stores the resolved `output` — since `run_session_analysis` persists internally, implement resolution as a small post-validate hook: simplest correct approach = add an optional `SessionConfig.postprocess: Callable[[dict, dict], dict] | None = None` applied to `output` right before `persist_analysis` in `run_session_analysis` (daily/midday leave it None — behavior unchanged), and set it for PREMARKET_CONFIG to the resolver.

- [ ] **Step 1: Failing test** (mirror `test_run_midday_analysis.py`): mock `build_premarket_payload` + `chat_completion` returning a VALID premarket JSON whose hot_news ids ∈ mocked pool; assert `persisted=True`, DB row `report_type='premarket'`, and the persisted `paragraphs`/`meta` (wherever blocks land per the AnalysisHistory field mapping — store `world_overview/hot_news/events_filtered/watch_today` inside the record's JSON fields: `headline` top-level, **`tagline={"text": <string>}`** (normalize the contract's plain string into the JSON column), `paragraphs={"world_paragraph": ...}`, `watchlist=watch_today`, `meta={"world_overview": ..., "hot_news": [resolved...], "events_filtered": [resolved...]}` — pick this exact mapping) contains a RESOLVED hot_news item (has `title` from the pool, not just id).
- [ ] **Step 2: red.** **Step 3:** implement (SessionConfig.postprocess + resolver + config + endpoints + export). **Step 4: green** + endpoint isolation tests (premarket rows never appear in daily/midday endpoints — mirror `test_midday_endpoints.py`). Regression: `uv run pytest tests/ -k "premarket or midday or market_analysis or session_engine" -q`. 
- [ ] **Step 5: Commit** — `git commit -m "feat(premarket): PREMARKET_CONFIG + run_premarket_analysis (postprocess resolves ids→objects) + endpoints + export"`

---

### Task B6: Cron 07:15

**Files:** Modify `backend/app/services/jobs/market_analysis_job.py`, `backend/app/services/jobs/__init__.py`; Test `backend/tests/test_premarket_job.py`.
- `run_premarket_analysis_job(session=None)` — mirror the midday job verbatim with `_PREMARKET_LOCK_KEY = 826_101_734`, `is_trading_day` gate, calls `run_premarket_analysis` (import from the package — the export exists per B5; the job test MUST drive the trading-day branch with a mock to execute the import, the C2 lesson). Cron behind `PREMARKET_ANALYSIS_ENABLED`, id `market_analysis_premarket`, 07:15 ICT mon-fri.
- [ ] Failing tests (non-trading-day gate + trading-day branch executes the import path) → red → implement → green → `git commit -m "feat(premarket): 07:15 cron job (lock 826_101_734, PREMARKET_ANALYSIS_ENABLED)"`

---

### Task B7: FE — types + hook + getDisplayMode window

**Files:**
- Create: `dashboard/src/features/market-overview/premarket/types.ts`, `premarket/usePreMarketAnalysis.ts` (+ test)
- Modify: `dashboard/src/features/market-overview/midday/getDisplayMode.ts` (+ its test)

**Interfaces:**
- `PreMarketAnalysis`: `{ id, session_date, report_type: "premarket", headline, tagline: { text: string }, paragraphs: {world_paragraph?: string}, watchlist: {level, content}[], meta: { world_overview?: {cells: {id,label,value,change_pct,sentiment,stale}[], context?}, hot_news?: ResolvedNews[], events_filtered?: ResolvedEvent[] } }` where `ResolvedNews = {id,title,summary,source,published_at,tickers,sentiment,url,insight,rank_order}`, `ResolvedEvent = {id,type,time,time_label,title,tickers,note,impact}`. Hook mirrors the midday one: key `["market-analysis","premarket","latest"]`, endpoint `market-analysis/premarket/latest`.
- `getDisplayMode`: insert `premarket` — minutes ∈ [480, 540) (08:00–08:59) on trading days → `"premarket"`; everything else unchanged (`DisplayMode` union gains `"premarket"`).
- [ ] Failing tests: hook fetch (mirror midday hook test); getDisplayMode `at(8,0)→"premarket"`, `at(8,59)→"premarket"`, `at(9,0)→"eod_yesterday"`, `at(7,59)→"eod_yesterday"`, non-trading-day unchanged → red → implement → green (+ ALL existing getDisplayMode tests stay green) → `git commit -m "feat(premarket-fe): PreMarketAnalysis type + hook + 08:00-09:00 display window"`

---

### Task B8: FE — PreMarketView (cyan) + css

**Files:**
- Create: `dashboard/src/features/market-overview/premarket/PreMarketView.tsx`, `premarket/PreMarketView.test.tsx`, `premarket/premarket.css`

**Interfaces:**
- `PreMarketView()` — fetches `usePreMarketAnalysis()`; loading → `Spin`; **no data → `<MarketDailyPage/>` + notice "Bản trước phiên đang xử lý — hiển thị bản cuối ngày hôm trước."** (midday fallback pattern). With data renders, in order: cyan badge "IQX AI · SÁNG NAY" + headline + cyan tagline (ALWAYS cyan — `.pm-tagline` fixed color, not sentiment-driven) · **world grid** 6 cells from `meta.world_overview.cells` (label/value/±% with up/down text colors; `value==null or stale` → "—" + `title` note) + `paragraphs.world_paragraph` (sanitizeInline — same helper as daily/midday) · **news cards** from `meta.hot_news` (sentiment chip pos/neg/neu, source + time, title, ticker pills, insight via sanitizeInline) — section hidden when absent · **events timeline** from `meta.events_filtered` (time_label, type icon char per type, title, tickers, impact chip Cao/Trung bình/Thấp) — hidden when empty · **watch list** from `watchlist` (dot colors: normal=cyan, alert=amber, warn=red) · **ATO countdown** to 09:00:00 (ticking `useState`+`setInterval(1000)` with cleanup — midday countdown pattern, but 1 s tick for the clock display `HH:MM:SS`) + notice banner "Phiên giao dịch sắp mở lúc 9:00…". `premarket.css`: `.pm-view { --pm-accent:#4FD0FF; --pm-accent-soft:#4FD0FF22; }` + badge/shimmer/chip/timeline/dot styles mirroring `midday.css` in cyan. NO chart tiers, NO pulse bar.
- [ ] Failing test: fixture with 2 cells (one null/stale) + 2 news + 1 event + 3 watch items → asserts "SÁNG NAY" badge, a "—" cell, a news insight text, the impact chip, the countdown element present; a second test with NO data asserts the EOD fallback + notice (mock `MarketDailyPage`). → red → implement → green + `npm run build` → `git commit -m "feat(premarket-fe): PreMarketView — world grid, news cards, events timeline, watch list, ATO countdown (cyan)"`

---

### Task B9: FE — wire HomeMarketView + full verification

**Files:** Modify `dashboard/src/features/market-overview/HomeMarketView.tsx` (+ its test).
- Route `mode === "premarket"` → `<PreMarketView/>` (lazy-friendly direct import matches the midday pattern); all other modes unchanged. Update `HomeMarketView.test.tsx` with a premarket-mode case (mock getDisplayMode → "premarket", assert PreMarketView renders and others don't).
- [ ] red → implement → green.
- [ ] **Full gates:** backend `uv run pytest -q` (whole suite) + frontend `npx vitest run` + `npm run build` — ALL green; confirm daily+midday tests untouched.
- [ ] **Manual smoke (with flags on locally):** run wave1+wave2 jobs (or seed snapshot rows) → `POST premarket/run` → `GET premarket/latest` valid shape (resolved hot_news with titles; watch_today[0] VN-Index) → force `getDisplayMode`→"premarket" → home left column shows the cyan brief; countdown ticks; light+dark legible.
- [ ] Commit any test-only adjustments; final commit message `feat(premarket-fe): route premarket display mode in HomeMarketView`.

---

## Out of scope (Plan B)
Editor portal + 08:00 push (SP-4); share/OG image; macro-events calendar; Finnhub keys; pulse bar (N/A pre-open); `charts` tiers (empty for premarket); MSN deprecation.
