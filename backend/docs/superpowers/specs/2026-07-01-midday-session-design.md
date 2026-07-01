# Mid-day session ("Cập nhật phiên sáng") — Design

- **Date:** 2026-07-01
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Source:** `~/Downloads/iqx-update/` — `iqx-midday-spec.md`, `iqx-midday-llm-prompt.md`, `iqx-terminal-midday.html` (analyzed 2026-07-01).
- **Part of a larger effort** (intraday sessions + international data). Decomposition & build order (user-approved): this **mid-day** cycle first (includes the shared foundation), then **SP-1 international data**, then **SP-3 pre-market**, then **SP-4 editor portal + push**. Each ships independently.

## Locked decisions (user)
- **Full set, mid-day first.** Build the mid-day session now; other sub-projects follow as separate spec→plan→build cycles.
- **LLM = DeepSeek** via the existing `proxy_client.chat_completion` (`deepseek-v4-pro`) + the existing retry/validate scaffold. Do NOT introduce Claude/OpenAI (the prompt files recommend Claude; we override for consistency/cost).
- **Surface = home-page display-modes.** The intraday briefs are wall-clock display-mode states of the existing home page (`MarketDailyPage` inside `HomeWorkspace`), NOT a new `/thi-truong` route.
- **International data = Yahoo-only v1** (relevant to SP-1, not this cycle).

## 1. Goal

Add a second daily AI market brief — **"Cập nhật phiên sáng"** — published ~11:45 ICT covering only the morning session (09:00–11:30), as a new display-mode of the home page. It mirrors the existing EOD "Nhận định phiên" (16:30) but is AM-scoped, forward-looking to the afternoon, and renders two of its chart tiers **frozen** from the previous EOD (they can't be computed intraday).

## 2. Architecture overview

Three layers, ~80% reusing the existing daily market-analysis pipeline (`backend/app/services/ai/market_analysis/`) and the daily terminal frontend (`dashboard/src/features/market-overview/daily/`):

- **(A) Foundation — a shared "session engine"** so EOD, mid-day (and later pre-market) are one parameterized pipeline keyed by `report_type`, with per-day-per-type storage.
- **(B) Mid-day backend pipeline** — an AM-session data collector + mid-day prompt/validator + a cron, producing a persisted `report_type='midday'` record with a `charts` block (AM-live + EOD-frozen).
- **(C) Mid-day frontend** — a display-mode machine on the home page + a mid-day variant of the daily terminal components.

Deferred to later cycles: international-data pipeline (SP-1), pre-market (SP-3), editor-review portal + push notifications (SP-4). **Mid-day v1 auto-publishes** (no editor gate), exactly like EOD does today.

---

## 3. (A) Foundation — session engine + storage

### 3.1 Storage migration (the hard blocker)
The market-analysis model (`backend/app/models/market_analysis.py`) today has `session_date` **`unique=True`** and a `session_type` column that stores the **market classifier** (`narrow_rally`, `broad_selloff`, …) — NOT a report discriminator. Three reports/day cannot coexist as-is.

- Add a new column **`report_type: str`** with values `'daily' | 'midday' | 'premarket'`; default/backfill existing rows to `'daily'`.
- Replace the `session_date` unique constraint with a **composite `UNIQUE(session_date, report_type)`**.
- Leave `session_type` (classifier) untouched — do NOT overload it.
- Alembic migration; backfill; verify EOD reads/writes unchanged.

### 3.2 Session-engine parameterization
`generator.py::generate_analysis()` is already `payload`/`db`-parameterized. Generalize (without changing EOD behavior):
- Introduce a `SessionConfig` keyed by `report_type` bundling: `payload_builder`, `prompt_set` (system + user builders), `validator` (rule set), `session_display` map, and the persist `report_type`.
- EOD becomes the `daily` config (same payload/prompt/validator it uses now — a pure refactor, byte-equivalent behavior). Mid-day is a new `midday` config.
- `run_session_analysis(config, *, db)` runs payload→(memory)→classify→prompt→DeepSeek→validate→retry→persist(report_type). Keep the existing memory/continuity + advisory-lock + best-effort-publish-on-cosmetic-warnings behavior.
- `memory.persist_analysis(db, output, session_date, session_type)` → extend to also store `report_type` (it already receives session_type; add the discriminator).

### 3.3 Read endpoint
- Add `GET /api/v1/market-analysis/midday/latest` and `GET /api/v1/market-analysis/midday/{date}` — parallel to the existing `daily/latest|/{date}`, filtered to `report_type='midday'`. Same response envelope/shape as daily (`meta` + article blocks + `charts`).
- The existing `daily/latest` endpoint is unchanged (serves `report_type='daily'`).
- Admin trigger `POST /market-analysis/midday/run` (parallel to the daily run endpoint), gated like the daily one.

---

## 4. (B) Mid-day backend pipeline

### 4.1 AM-session data collector (`payload.py` → a mid-day payload builder)
Snapshot at 11:30 ICT, reusing existing data-source functions (verified available intraday — see §7):
- **VN-Index intraday**: ~30 five-minute datapoints 09:00–11:30 for the sparkline + AM open/high/low/last — from `fetch_liquidity(symbols="VNINDEX", time_frame="ONE_MINUTE", from_ts, to_ts)` (or the realtime 1-min OHLC bridge), bucketed to 5-min.
- **HNX + UPCOM**: `fetch_market_index(["HNXIndex","HNXUpcomIndex"])` (live value + %change).
- **HOSE breadth** (ceiling/up/flat/down/floor at AM close): `fetch_market_index()` — its response already embeds `total_stock_ceiling/floor/increase/decline/no_change`. Single call at 11:30 = the AM-close snapshot.
- **Top index contributors** (AM): `fetch_index_impact(...)` if it returns intraday; else derive from per-symbol OHLC deltas (open@09:00 → last@11:30) × index weights.
- **Foreign flow (AM)**: call `fetch_foreign()` / `fetch_foreign_top()` **at 11:30** (returns the session's accumulated foreign flow) + compute the multi-session streak from persisted history. **Graceful degrade** (spec-mandated): if intraday foreign isn't exposed, show top-N / mark "số cuối ngày" and the LLM writes around it.
- **Prop flow (tự doanh, AM)**: `fetch_proprietary()` / `fetch_proprietary_top()` at 11:30; same degrade path (the single riskiest source; the spec explicitly allows "Đang xử lý"/"thiếu data tự doanh").
- **AM liquidity + AM-only MA20**: `fetch_liquidity(symbols="ALL", ONE_MINUTE, AM window)` summed to the AM total; MA20 = same AM-window sum over the last 20 trading days (backfilled/persisted) + a 7-session history.
- **Frozen from previous EOD**: read the latest `report_type='daily'` record's `charts.market_health_detail` + `charts.sector_rotation` and forward them verbatim (tagged `data_state:'eod_previous'`), plus feed the previous EOD `ai_analysis` as LLM continuity context.

**Build-time verification task** (like the portfolio-manager `_pick` verification): a live check confirming which of `fetch_index_impact/fetch_foreign/fetch_proprietary` return intraday-accumulated values at a mid-session call vs EOD-only, wiring the degrade path accordingly. No fabricated numbers — degrade, never invent.

### 4.2 Mid-day prompt + validator
- New `midday` prompt set in `prompts.py` + few-shot in `samples.py` (mirrors the daily editorial voice: Vietnamese locale, span-wrapped numbers, U+2212 `−`, banned-word list). System prompt frames it as an **interim** morning recap oriented toward the afternoon.
- **Output contract** (flat JSON, DeepSeek via `proxy_client`, temperature ~0.4): `headline` (60–90 chars, includes VN-Index %, one em-dash clause, no trailing period); `tagline` `{text, color}` where `color` = `up` only if VN-Index >+0.5% AND breadth up>down, `down` symmetric, else `neutral`; **and neutral whenever AM KLGD < 30% of MA20**; `paragraphs` = **exactly 2** (`session_structure`, `money_flow`, each 90–140 words, `status:'published'`); a 3rd `market_health` object with `status:'pending'` + `pending_message` + `pending_until` (16:30) — **not generated**, rendered as placeholder; `unexplained` `{title:'Điểm cần xác nhận trong phiên chiều', content}` (60–110 words, ≥1 concrete threshold + ≥1 EOD-carryover anomaly + one "nếu X thì Y"); `scenarios` = **exactly 3** (`up`, `down`, and a `down` bull-trap/tăng-giả keyed to low total-day liquidity), each `{type, condition (starts "Nếu"/"Khi", numeric thresholds in <strong>), outcome (<strong> target), scope:'afternoon_session'}`; `watchlist` = **exactly 5** `{key, alert_level ∈ normal|alert|warn, reason (starts "—")}` where **item index 1 key === `'Giao dịch chiều'`** (alert level).
- **Validator** (extend `validator.py` with a midday rule set; soft/hard split like today): headline length; paragraphs==2; scenarios==3; watchlist==5 & item[1].key=='Giao dịch chiều'; banned words; hyphen-vs-U+2212 for negatives; numbers span-wrapped in paragraphs (`<span class='num'>` variants) but `<strong>` in scenario condition/outcome; no buy/sell reco / no first-person / no fabrication. Cosmetic rules stay SOFT (never black out the publish — the lesson from the daily BUG16 outage).
- Reconcile the file's internal drift: prose says scenarios exactly 3 / watchlist 5 / events N/A here — use **3 scenarios, 5 watchlist**. (The premarket file's `events_filtered` 3–10 vs 5–8 drift is out of scope this cycle.)

### 4.3 Charts block
Reuse the daily `_build_charts` shape. AM-live tiers → `data_state:'am_session'`: breadth, contribution, foreign_detail, prop_detail. Frozen tiers → `data_state:'eod_previous'` (forwarded from previous EOD): market_health_detail, sector_rotation. Add `data_state` to each chart sub-block; frontend uses it to tag/dim.

### 4.4 Scheduling
- New cron `market_analysis_midday` at **11:30 ICT**, Mon–Fri, gated by a flag (e.g. `MIDDAY_ANALYSIS_ENABLED`, default OFF), using the existing APScheduler + **Postgres advisory-lock** pattern with a **distinct lock key** (one worker per firing under `--workers 4`). Reuse `market_calendar.is_trading_day()` for weekday/holiday gating.
- Timing: collect 11:30–11:35 → LLM 11:35–11:40 → persist/publish ~11:45. Fallback: if no valid midday record by the read time, the endpoint returns nothing and the frontend shows the previous EOD with a notice (§5).

---

## 5. (C) Mid-day frontend

### 5.1 Display-mode machine (home page)
- A `getDisplayMode(now, holiday)` helper on the home page returns one of: `eod_yesterday` (pre-open / before midday), `midday_loading` (11:30–11:45 skeleton), `midday` (11:45–16:30), `eod_today` (16:30+). Weekend/holiday → last EOD.
- `HomeWorkspace`'s left column renders the mode: `midday`/`midday_loading` → the **mid-day variant**; else the existing `MarketDailyPage` (EOD). Extend `useDailyMarketAnalysis` with a session/phase param (default `daily`) to fetch `midday/latest` when in a midday mode. Nav market-clock/live-dot gains `lunch_break` (orange) + `atc` states.

### 5.2 Mid-day variant (reuses the daily components with variants)
- **Token:** orange `--neutral #FFB347` for the AI badge/shimmer (vs EOD purple).
- **AI card:** badge "IQX AI · PHIÊN SÁNG"; headline + tagline (◆); **2 published paragraphs** (Cấu trúc phiên sáng / Dòng tiền phiên sáng) + **1 pending placeholder** (Sức khỏe thị trường — dashed, ⏱, "Bản đầy đủ cuối ngày có lúc 16:30"); "Điểm cần xác nhận trong phiên chiều" callout (orange left-border); footer share-snapshot (html2canvas → `IQX-phien-sang-{YYYYMMDD}.png`).
- **Pulse Bar:** 5 cells (VN-Index hero + AM sparkline · breadth · foreign net + streak · AM liquidity vs MA20 · **cell 5 market-health FROZEN grey**); mandatory **"Tạm chốt cuối phiên sáng"** banner during lunch (11:30–13:00); 30s polling **suppressed** during lunch (banner sub-text only).
- **Takeaway:** "Kịch bản phiên chiều" with a **countdown pill to 14:45** + **3 scenarios** (up/down/bull-trap) · "Đáng quan sát phiên chiều" with **5 watchlist** items.
- **Charts:** 4 AM-live cards tagged **"Phiên sáng"** (orange) + 2 **frozen** cards tagged **"Cuối ngày dd/mm"** (grey, opacity 0.55, frozen-banner overlay). Reuse all 6 existing chart components + Pulse Bar + AI-card + Takeaway, driven by the `data_state`/tag from the payload.
- Mobile ≤768px: pulse 2-col, takeaway 1-col, charts 1-col (existing responsive rules).

---

## 6. Error handling / degradation
- LLM: 1 retry with error list injected; on 2nd failure, publish best-effort if only cosmetic (soft) warnings remain, else no midday record → frontend shows previous EOD + notice.
- Data: any AM source missing/late → that card shows "Đang xử lý" / "số cuối ngày"; the LLM is told which blocks are missing and writes around them (no fabrication).
- Lunch break: numbers frozen; only banner/clock update.

## 7. Data availability (verified 2026-07-01)
Available now: VN-Index sparkline + O/H/L, HNX/UPCOM, HOSE breadth (embedded in `fetch_market_index`), AM liquidity + AM-only MA20. Derivable: top contributors (per-symbol deltas × weights). **Gap:** foreign/prop **per-ticker AM** — VCI is day-granular, DNSE doesn't tag investor type → call the VCI endpoints at 11:30 for the accumulated value, and **degrade gracefully** (top-N / "số cuối ngày") if intraday per-ticker isn't exposed. The build's first backend task verifies this live and wires the degrade path.

## 8. Testing (Vitest+RTL frontend; pytest+sqlite backend)
- **Foundation:** migration adds `report_type` + composite unique (EOD row still readable); `daily` session config produces byte-equivalent EOD behavior (regression); `midday/latest` endpoint returns a midday record and 404/empty when none.
- **Backend pipeline:** midday validator (paragraphs==2, scenarios==3, watchlist==5 & item[1]=='Giao dịch chiều', banned words, U+2212, span/strong wrapping); tagline neutral when KLGD<30% MA20; AM-collector assembles a payload from mocked sources + graceful degrade when foreign/prop absent; frozen cards forwarded from a prior EOD record.
- **Frontend:** `getDisplayMode()` transitions across the day boundaries + holiday; mid-day variant renders 2 published + 1 pending paragraph, 3 scenarios, countdown, 4 live + 2 frozen (dimmed+banner) cards; lunch-break polling suppression; orange token. Build passes `npm run build`.

## 9. Out of scope (this cycle)
- International-data pipeline (SP-1), pre-market (SP-3), editor-review portal + push notifications (SP-4).
- Endpoint unification under `/api/v1/market/dashboard` (specs propose it; we keep the parallel `market-analysis/midday/*` naming for minimal change).
- Afternoon (13:00–14:45) live intraday refresh of the mid-day numbers beyond the pulse cells (mid-day content loads once on publish).
- Iron-ore/rubber and other international symbols (SP-1, Yahoo-only).
