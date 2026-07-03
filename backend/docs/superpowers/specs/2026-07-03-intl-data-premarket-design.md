# International data pipeline + Pre-market session — Design

- **Date:** 2026-07-03
- **Status:** Approved (brainstorming) → ready for implementation plans
- **Source:** `~/Downloads/iqx-update/` — `iqx-premarket-spec.md`, `iqx-premarket-llm-prompt.md`, `iqx-terminal-premarket.html`, `API DATA/iqx-international-data-spec.md` (re-analyzed 2026-07-03).
- **Goal (user, verbatim):** "Mỗi ngày chạy 3 lần với 3 prompt khác nhau" — complete the third daily brief. EOD (16:30, `DAILY_CONFIG`) and Mid-day (11:30, `MIDDAY_CONFIG`) are LIVE; this cycle adds **Pre-market** (`PREMARKET_CONFIG`) and the international-data pipeline it depends on.
- **Two parts, two plans, one branch** (`feat/intl-data-premarket`): **Plan A = SP-1 international data** (build first, independently shippable — also fills the broken-MSN world-index gap), **Plan B = SP-3 pre-market session** (depends on Plan A).

## Locked decisions (user)
- SP-1 + SP-3 in ONE cycle; SP-1 first.
- **Full ~45 symbols** (8 categories) per the intl spec — not a trimmed set.
- **News/events from existing sources + graceful degrade** (no new external aggregator in v1).
- Carried from prior cycles: **LLM = DeepSeek** via `proxy_client` (not Claude); **surface = home-page display-modes**; **Yahoo-only $0** (accept the iron-ore/rubber gap); auto-publish (editor portal + push = SP-4, deferred).

## Verified infrastructure (2026-07-03, against the real backend)
- **news_pool READY:** `sources/vietcap_ai_news.py::fetch_news_list(kind, page, page_size, update_from, update_to, ticker, industry, source, sentiment)` → items with `{id, slug, ticker, industry, title, short_content, source, source_name, sentiment, score, update_date, source_link}`. Time-window capable; per-article sentiment + ticker already present.
- **events_pool ADAPT:** `sources/vietcap.py::fetch_events_calendar(start, end, event_type, limit)` (VCI `/v1/events`; event_type ∈ dividend|insider|agm|others) EXISTS — needs a normalization layer + same-day filter. No macro-calendar source → **v1 events are corporate-only** (degrade allowed).
- **Global:** NO Yahoo source exists (Plan A builds it). `vcb.py::fetch_fx(date)` (USD/VND) + `sjc.py::fetch_gold(date)` + `binance.py::fetch_ticker/ohlc` functional; `msn.py` world-index broken (`resolve_apikey` 404).
- **Patterns READY:** `orchestrator.py::fetch_from_registry(key, handlers, override, validator)` + `registry.py::SourceChain` + `fallback.py::fetch_with_fallback` + `get_headers()` in `http.py` — the new source and endpoint copy these. Scheduler (6 jobs) + advisory-lock pattern ready. `analysis_history` has `report_type` with 'premarket' unclaimed; **no `market_data_snapshot` table exists** (new migration).

---

## Part A — International data pipeline (SP-1)

### A1. Yahoo source — `app/services/market_data/sources/yahoo.py`
- `async def fetch_chart(symbol: str) -> tuple[dict, str]` — GET `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d`; parse `meta`: `last_price = regularMarketPrice`, `previous_close = chartPreviousClose ?? previousClose` (both exist and can differ — replicate the spec's aliasing), `day_high/day_low` (regularMarketDayHigh/Low), `volume` (regularMarketVolume), `currency`, `market_state` (REGULAR|CLOSED|PRE|POST), `market_time` (regularMarketTime → ISO). Derived: `change_value`, `change_percent` (raw percent, e.g. 0.4048).
- Batch helper `async def fetch_many(symbols: list[str]) -> dict[str, dict]` — semaphore(5) + 100–200 ms jitter + UA rotation via `get_headers("YAHOO")`. Per-symbol failure → omit from result (caller handles stale).
- The VPS is Singapore-hosted (Yahoo blocks AWS-US-East IPs — already satisfied).

### A2. Symbol universe — `app/services/market_data/intl_symbols.py`
One config constant `INTL_SYMBOLS: dict[category, list[{symbol, name}]]` — 8 categories, ~45 symbols per the intl spec: `us_index` (^DJI ^GSPC ^IXIC ^RUT ^VIX), `us_futures` (ES=F NQ=F YM=F), `asia_index` (^N225 ^KS11 ^HSI 000001.SS 399001.SZ ^TWII ^STI ^AXJO), `fx` (DX-Y.NYB VND=X CNY=X JPY=X KRW=X EURUSD=X), `commodity` (BZ=F CL=F GC=F SI=F HG=F NG=F SB=F KC=F ZC=F ZS=F ZW=F), `bond` (^TNX ^IRX ^TYX), `crypto` (BTC-USD ETH-USD — fetched via existing Binance, mapped into the same snapshot shape), `etf` (VNM EEM FM SPY AAXJ). Iron ore + TOCOM rubber: OMITTED v1 (no Yahoo ticker; Yahoo-only budget) — the LLM narrative notes the gap when steel/rubber matter. ETF NAV/premium: omitted v1 (no Yahoo NAV field). Yield-curve slope: derived `^TNX − ^IRX` in bps, labeled approximate (IRX is a 13-week proxy).

### A3. Storage — `market_data_snapshot` (new table + Alembic migration)
Columns per the intl spec §4: `id BIGSERIAL`, `snapshot_date DATE`, `asset_category VARCHAR(32)`, `symbol VARCHAR(32)`, `name VARCHAR(128)`, `last_price/previous_close/change_value NUMERIC(18,6)`, `change_percent NUMERIC(10,4)`, `day_high/day_low NUMERIC(18,6)`, `volume BIGINT`, `currency VARCHAR(8)`, `market_state VARCHAR(16)`, `market_time TIMESTAMPTZ`, `source VARCHAR(32)`, `stale BOOLEAN default false`, `fetched_at TIMESTAMPTZ`. **DEVIATION from spec:** `UNIQUE(snapshot_date, symbol)` (not `+source`) with UPSERT — later waves UPDATE the day's row (one current row per symbol per day; `source` records who supplied it). No `raw_response` column (lean rows; raw available in logs).
- **Stale fallback:** when a symbol fails all fetch attempts in a wave, copy the previous day's row with `stale=true` (never fabricate); if no previous row, the symbol is absent and consumers degrade.

### A4. Snapshot job — `app/services/jobs/intl_snapshot_job.py`
`async def run_intl_snapshot_job(wave: int, session=None)` — gated by `is_trading_day` + advisory lock (new key `826_101_733`); fetch per wave and upsert:
- **Wave 1 — 06:00 ICT** (Mon–Fri): ALL symbols (US closed → stable).
- **Wave 2 — 07:05 ICT**: refresh `^N225 ^KS11 ^AXJO` (just opened, 09:00 JST/KST = 07:00 ICT) + fx + commodities — the values the pre-market brief freezes.
- **Wave 3 — 08:30 ICT**: refresh `^HSI 000001.SS 399001.SZ VNM` (post-premarket; completes the day's snapshot for other consumers).
Registered in `jobs/__init__.py` behind **`INTL_DATA_ENABLED: bool = False`** with three CronTriggers (`Asia/Ho_Chi_Minh`), distinct job ids (`intl_snapshot_wave1|2|3`). Failure alerting v1 = `logger.error` when >20% of a wave fails or a critical symbol (^GSPC ^N225 DX-Y.NYB BZ=F GC=F VNM) fails (Slack/Telegram alert deferred).

### A5. Read endpoint — extend `app/api/v1/endpoints/market_global.py`
`GET /api/v1/market-data/global/snapshot?category={category?}` → latest `snapshot_date` rows (optionally filtered by category), serialized with `stale` flags. Additive; the MSN endpoints stay untouched (deprecation later).

---

## Part B — Pre-market session (SP-3, `report_type='premarket'`, the third prompt)

### B1. Payload — `app/services/ai/market_analysis/premarket_payload.py`
`async def build_premarket_payload(db) -> dict`:
- **`global_markets`**: read today's `market_data_snapshot` rows — the 6 grid cells (S&P 500 ^GSPC, NASDAQ ^IXIC, NIKKEI ^N225, Brent BZ=F, Gold GC=F, USD/VND VND=X⊕VCB) + context (KOSPI, DXY, US futures, ^VIX) for the world paragraph. USD/VND sentiment is INVERTED (USD weakening = positive for foreign flow) — computed in the payload, not by the FE.
- **`news_pool`** (10–20): `fetch_news_list("business", page_size=20, update_from=<yesterday>, update_to=<today>)` → filter window **17:00 previous trading day → 06:30 today** by `update_date`; normalize `{id, title, summary(short_content), source(source_name), published_at(update_date), tickers([ticker]), sectors([industry]), sentiment, url(source_link)}`; dedup near-duplicates keeping the higher-ranked source (Reuters > Bloomberg > VnExpress = Tuổi Trẻ > CafeF = NDH > Tinnhanhchungkhoan = ĐTCK > khác); trim to title+1-line summary (input budget <12k tokens).
- **`events_pool`** (0–15): `fetch_events_calendar(start=<today>, end=<today>)` → normalize `{id, type: ex_dividend|agm|insider|listing|other (mapped from VCI eventTypeCode), time/time_label, title(eventName), tickers([companyCode])}`. **Corporate-only v1** (no macro calendar); empty pool is a legitimate degrade.
- **`eod_previous_summary`**: latest `report_type='daily'` record — headline, tagline, scenarios, watchlist (context for `watch_today[0]` VN-Index levels; the numeric S/R thresholds live in the EOD scenarios' `<strong>` values).
- **`config`**: date, weekday_vi, `is_post_weekend`, `is_post_holiday` (from `market_calendar`).
- `meta.report_type='premarket'`, `meta.missing_fields` per degraded block. A build-time verification task confirms the real VCI event-response field names before normalization is finalized.

### B2. Prompt — `premarket_prompts.py` (DeepSeek, temperature 0.5)
`PREMARKET_SYSTEM_PROMPT` + `build_premarket_user_prompt(payload, session_type)` + 1 few-shot. Output contract (6 fields, flat JSON):
- `headline` 60–90 chars, contains an em-dash, no trailing period.
- `tagline` `{SENTIMENT_CAPS} · {N tin tích cực} · {N sự kiện cao} · {1 lưu ý}`.
- `world_paragraph` 70–130 words, span-wrapped numbers (`num`/`up-text num`/`down-text num`), opening adjusted by `is_post_weekend/is_post_holiday`.
- `hot_news` **exactly 5** (floor 3 when pool <3 qualifying): `{id — copied VERBATIM from news_pool, rank_order 1–5, insight 30–55 words prefixed "<strong>Tác động phiên sáng nay:</strong> "}`.
- `events_filtered` 5–8 (floor 2–3 when pool sparse): `{id from events_pool, note 8–20 words, impact high|medium|low}`, sorted by time ascending.
- `watch_today` 5–6: `{level normal|alert|warn, content 20–50 words, tickers in <span class='tkr'>}`; **`watch_today[0]` MUST be VN-Index** (S/R from eod_previous_summary).
Voice rules identical to daily/midday (Vietnamese, no buy/sell, no first-person, no fabrication, banned-word list, U+2212, vi-VN number locale). Ex-div price-reference drops must be distinguished from organic selling.

### B3. Validator — `premarket_validator.py`
Reuse `hard_errors`/`SOFT_ERROR_PREFIXES`/FORBIDDEN_* from `validator.py`. HARD: headline 60–90 + em-dash; `hot_news` count — exact rule: `expected = min(5, len(news_pool))`, error iff `len(hot_news) != expected` (pool ≥5 → exactly 5; smaller pool → exactly the pool size); **every `hot_news[].id` and `events_filtered[].id` EXISTS in the input pools (zero ID hallucination)**; insight prefix + 30–55-word bounds; `events_filtered` count 2–10 (prompt guides 5–8; reconciles the source files' 3–10-vs-5–8 drift); `watch_today` 5–6 with `[0]` containing "VN-Index"; banned words; U+2212-before-digit on visible text (HTML-stripped — the midday lesson); level/impact enums. SOFT: number-repetition, minor span gaps. **A test feeds the few-shot sample through `validate_premarket` and asserts `== []`** (the C1 lesson — prompt/validator alignment guarded).

### B4. Engine + endpoints + cron
- `PREMARKET_CONFIG = SessionConfig(report_type="premarket", …, use_memory=False, persist_claims=False)` + `run_premarket_analysis(session=None)` (payload built explicitly with db, passed via `payload=` — the midday pattern). After a valid generation and BEFORE persist, `run_premarket_analysis` **resolves ids → full objects**: `hot_news[].id` joined with its `news_pool` entry (title/source/published_at/tickers/sentiment/url + the generated insight) and `events_filtered[].id` with its `events_pool` entry — the persisted record stores the RESOLVED blocks so the frontend never needs the input pools. Exported from `market_analysis/__init__.py` (the C2 lesson).
- Endpoints `GET /market-analysis/premarket/latest|/{date}` + admin `POST /market-analysis/premarket/run` via the shared `_get_latest/_get_by_date(report_type)` helpers.
- Cron **07:15 ICT** Mon–Fri (`run_premarket_analysis_job`, advisory lock `826_101_734`), gated by **`PREMARKET_ANALYSIS_ENABLED: bool = False`**; timing: wave-1 06:00 + wave-2 07:05 populate the snapshot → generate 07:15 → FE displays from 08:00. `pulse` not applicable (no VN intraday pre-open); the `charts` meta block is empty for premarket (frontend renders no chart tiers).

### B5. Frontend — `dashboard/src/features/market-overview/premarket/`
- `getDisplayMode` gains `"premarket"`: trading days **08:00–08:59** → `premarket` (before 08:00 stays `eod_yesterday`; 09:00–11:30 back to `eod_yesterday` per the current machine; the rest unchanged).
- `types.ts` (`PreMarketAnalysis`: headline, tagline, world_overview {cells[6], paragraph}, hot_news[], events_filtered[] (joined server-side or rendered from ids+pools in meta — decision: the backend persists the RESOLVED blocks (news items joined with their pool entries) into the record so the FE never needs the pools), watch_today[], meta) + `usePreMarketAnalysis` hook (`market-analysis/premarket/latest`).
- `PreMarketView.tsx` (cyan `--pm-accent: #4FD0FF` tokens in `premarket.css`): badge "IQX AI · SÁNG NAY"; headline + cyan tagline (ALWAYS cyan regardless of sentiment — spec); **world grid 6 cells** (label/value/±% with up/down colors; USD/VND inverted sentiment comes precomputed) + world paragraph; **5 news cards** (sentiment chip pos/neg/neu + source + time + title + ticker pills + insight blockquote); **events timeline** (time + type icon + title + tickers + impact chip Cao/TB/Thấp — hidden when empty); **watch list** (3 dot levels cyan/amber/red); **ATO countdown** to 09:00:00 (ticking `useState`+`setInterval`, the midday countdown pattern) + notice banner ("Phiên giao dịch sắp mở lúc 9:00 …"). NO VN chart tiers, no pulse bar.
- `HomeMarketView` routes `premarket` → `PreMarketView`; no record → EOD-yesterday + "Bản trước phiên đang xử lý…" notice (same fallback pattern).
- Mobile: grid 6→2 cols, impact chip hidden (per mockup).

### Degradation (both parts, consistent with midday)
Snapshot symbol missing/stale → grid cell "—"/stale note, LLM writes around it; news pool <3 → 3 cards; events empty → block hidden; EOD-previous missing → watch_today[0] generic VN-Index caution; a hard LLM/validator failure → no record → FE shows EOD-yesterday + notice. Never fabricate.

### Testing
- **A:** yahoo parser (fixture JSON → fields incl. the previous_close aliasing + change math); fetch_many partial-failure; snapshot upsert (wave-2 updates wave-1 rows; stale copy path); wave job trading-day gate; endpoint category filter.
- **B:** payload normalization (news window-filter 17:00→06:30, dedup ranking, events VCI-code mapping — with a live-verification first task for real VCI field names); validator (counts incl. small-pool floors, **ID-existence**, insight prefix/word-bounds, watch_today[0], U+2212 on stripped text); **few-shot-through-validator == []**; run_premarket persists `report_type='premarket'`; endpoints isolation (premarket rows never leak into daily/midday and vice versa); getDisplayMode 08:00–09:00 boundary tests; PreMarketView renders 4 blocks + countdown ticks + fallback; degrade cases (missing cell, empty events).
- Suites + `npm run build` gates as always; EOD + midday tests must stay green (no behavior change to the other two sessions).

### Out of scope (unchanged)
Editor portal + push notification (SP-4); share/OG image; Finnhub/Alpha Vantage fallback keys (env hooks may exist but unwired); iron-ore/TOCOM rubber; international macro-events calendar; ETF NAV/premium; 15-min realtime refresh loop; MSN endpoint deprecation; the 08:00 push deep-link.
