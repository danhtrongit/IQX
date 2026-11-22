# PLAN · Bot và Chiến lược v2.0 (update 22-11)

Spec: `IQX-Bot-Chien-Luoc-SPEC.md` (v2.0, authoritative). Mockup `IQX-Bot-Chien-Luoc-MAU.html` = content/behaviour only.
v1.0 (`IQX-Chien-Luoc-Backtest-Bot-SPEC.md`) consulted only for §10.1 DDL detail. Migrations of this workstream: **0058–0061 only**.
Task kind for all workers: implementation (backend/frontend), priority 3. Do not read/scan `node_modules/`, `dist/`, `mobile/`.

---

## 1. Current-state map (2026-11-22, main @ 7e4ec660)

| Area | Where | Today |
|---|---|---|
| Bot runner | `backend/src/modules/bots/bot.service.ts` (2734 l.) `runAccountSession` → `captureFrozenRun` → `executeFrozenRun` → `applyStrategy` (l.1342) | Policy `iqx-bot-v1.1` (`bot.domain.ts`). Frozen receipt + snapshot hash + decisions + executions + NAV + reconcile. Close-of-session fill, 12% NAV budget, 2 buys, GTGD20 desc/A→Z, no rebuy same session, cash from sells reused. **No T+2.** NAV basis locked **before** sells. Max holding only from shared-config `max_holding`; a **blocked Sell side skips the time exit** (violates R05). Buy gate on restricted-security status. |
| Bot prices | `market-integration/bot-market-snapshot.provider.ts` (VCI close + GTGD20) and `quant/market-data.adapter.ts` (VND→VCI chain, 400-session warmup) | Not the Flashback store. |
| Bot config | `strategy-config/*` (`shared_config_revisions`, `effective_config_sessions`, PATCH `/api/v2/strategy/shared-config`), `bots/bot.shared-config.ts`, `bot.config-gate.ts`, `bot.config-pause.ts` (V3 pauses) | Effective = first session after save date. |
| Bot universe | `bots/bot-universe.*` (`bot_universe_revisions`: `vn30` / `custom` saved-list snapshot), `market-integration/index-membership.service.ts` (`index_membership_snapshots`, VN30 + screener baskets incl. VN100 captured 18:40) | Write API `/api/v2/bot/universe/apply-list|revert-vn30|pending/cancel`. `saved-filters/saved-filters.bot-usage.ts` blocks deleting a list the Bot uses. |
| Bot calendar | `bots/bot-holding.ts`, `strategy-config/strategy-config.calendar.ts` | Weekdays minus `virtual_trading_configs.holidays`. |
| Bot read API | `bots.controller.ts` (`GET /api/v2/bot`, `/positions`, `/status`, `/journal`, `/performance`), `bot-history.controller.ts` (`/trades`, `/journal/sessions[/:session]`) | One bot per user (`bot_instances.user_id` unique) — no `:id` in routes. |
| Jobs | `runtime/runtime.schedules.ts`, handlers `platform/domain-runtime.module.ts` | `bot.session-eod` cron 19:00 Mon–Fri; `market.index-membership` 18:40; `market.daily-bars` (DNSE, 520 sessions, screener) every 10 min. Flag pattern `JOB_<NAME>_ENABLED`. |
| Backtest | `strategy-backtests/*` (service 1064 l., worker-thread executor 2 concurrent / 8 queued / **30 s**), engine `quant/v2/backtest.ts` | Single symbol, `next_open`/`same_close`, user capital, fee preset, research/system modes. Table `backtest_runs` (immutable trigger, `shared_revision NOT NULL` + FK, idempotency). Draft mode (`shared_revision = 0`). |
| Flashback store | `fb_dataset_versions/symbols/bars/prefix` (0039), builder `flashback/flashback-dataset.*` | DNSE adjusted ×1000 → VND, from 2012-03, VN100 basket (97 ok symbols). **Frozen at build time; rebuilt only after Feb/Aug rebalance (job 03:15).** No VNINDEX series, no daily append. |
| IQX templates | `iqx-templates/*` (0057: `iqx_templates`, immutable `iqx_template_versions`, `iqx_template_used`), admin `/admin/iqx-templates` | 5 strategies **published to prod as v1** (2026-11-20), `definition = {max_holding: 60/30/40/10/30, indicators}`, no universe. |
| Notifications | `notifications/` = Telegram only. `auth/email.service.ts` (HTTP provider; `EMAIL_ENABLED`, `EMAIL_PROVIDER_URL`, `EMAIL_API_KEY`, `EMAIL_SENDER`) | **No inbox, no settings, no bell, no unsubscribe.** `users.is_email_verified` exists. Bulletin first publish = `bulletins.service.ts publish()` (`first = published_at === null`, ~l.461). |
| Luyện tập mini | backend `practice/*` (`/api/v2/practice/*`, tables 0017, guard `ACADEMY_ENABLED`); frontend `pages/demo-trading/practice/*` (~7.4k l.), `?tool=bot&practice=<id>`, "Luyện tập" button in `bot/panel/indicator-row.tsx` | To remove. |
| Alerts | `alerts/strategy-alerts.*` — versions pin a **full config copy**; source kinds `shared_config` / `backtest_run` / `kept` | Evaluation never reads live shared config. |
| Frontend | Backtest `pages/strategy/backtest/*` (`backtest-tab.tsx` 663 l., reused by admin compose page); Bot `pages/demo-trading/bot/{panel,main,universe,config}/*`; header `components/layout/header.tsx`; filter `pages/strategy/filter/{filter-tab,results-panel}.tsx`; client `src/lib/contract-client.ts` + generated `src/lib/generated/*` | Tests: vitest beside sources; Playwright `frontend/e2e/` (`update-1911-acceptance.spec.ts`). |
| Academy | `academy/content/v4/lessons/*.vi.json` | Grep: no sentence about 60-session hold, T+1 settlement, Bot config, Lưu cho Bot, mini, next-open fill (only `ch06-l02` "Phiên T+1" = indicator timing, not settlement). Học viện v5 is a separate workstream. |

## 2. Gap table

| Spec § | Change | Owner |
|---|---|---|
| §2.1, Q10, §17.2/4 | New **daily price store** (VN100 + VN30 + VNINDEX + held symbols), DNSE adjusted ×1000 VND, full history; Bot and Backtest read only it | W1 |
| §2.2 | Universe resolver: VN30/VN100 current members (Backtest) / members at session (Bot); saved_list = copied symbols ∩ store-eligible; `UNIVERSE_EMPTY` | W1 (resolver), W2 (API), W3 (Bot) |
| §2.3 | Date bounds: earliest = store session #451, latest = `data_as_of`, ≤ 3653 days | W1/W2 |
| §3 | **Shared rules module** (pure): calendar, counted/held, T+2, due, sell→NAV→rank→buy, skip reasons, integer VND | W1 |
| §3.6–3.7, §6 | Schedule table + lock at cutoff + follow_latest + IQX pin + due-impact + 409/422 | W3 |
| §4, §12 | Backtest basket runs, 2 tabs, strategy menu, save menu, versions, saved runs, results (7 KPIs, 3 lines, 5 tabs) | W2 (API), W5 (UI) |
| §5 | Bot panel: strategy lists, Lịch phiên, diff, keep-last, IQX update, 3 tables, principles modal; remove universe/limit/16 indicators/config | W3 (API), W6 (UI) |
| §7 | IQX v2 content (universe, max_holding 30), admin columns, publish checks, hide semantics, events | W2 (API/seed), W5 (admin UI) |
| §8 | Notifications: settings, inbox, bell, email outbox, unsubscribe, bulletin hook, bot-trades hook | W4 (API), W6 (UI), W3 (bot hook call) |
| §9 | Remove shared-config PATCH, bot universe writes, practice API, Lưu cho Bot, Tạo cảnh báo, symbol param | W2/W3/W5/W6 |
| §11 | One-off conversion script + dry-run + reconciliation | W3 |
| §13 | Filter → "Backtest với rổ là kết quả này"; drop "Đi cặp với"; allow deleting lists | W2 (bot-usage removal), W5 (UI) |
| §14 | Academy wording review | Main agent (report only; see D16) |

## 3. Decisions (spec §17 and open points)

| # | Point | Decision | Why |
|---|---|---|---|
| D1 | §17.1 cutoff time + calendar | **Cutoff 19:00 ICT** (env `BOT_SESSION_CUTOFF=19:00`), = the moment the store's session D is committed for the Bot. Past sessions = dates with a VNINDEX bar in the store. Future sessions (Phiên tới, due dates) = predicted with weekdays − `virtual_trading_configs.holidays`. | Keeps the proven 19:00 slot after membership capture (18:40) and the 15:15 DNSE readiness. Store cannot know future dates. |
| D2 | §17.2 Flashback store facts | Flashback store: OHLCV + value, DNSE **adjusted**, VND (×1000), from 2012-03, ~97 VN100 symbols, **no VNINDEX, frozen per version, departed symbols not kept**. Therefore the spec's "kho VN100 của Flashback" is implemented as a **daily layer of the same store** (`strategy_price_*`, migration 0058): same source, same unit conversion (`flashback.market-data.ts` scale table / dataset source), full adjusted series refreshed daily, VNINDEX included, departed symbols kept while held. Flashback tables untouched. | The frozen dataset cannot serve a daily Bot; appending raw bars to an adjusted frozen series creates fake gaps at ex-dates. |
| D3 | Adjustments | Refresh re-fetches the **full** DNSE series per symbol (1 call each, ~110 calls/day). If overlapping closes differ → replace the symbol's series in one tx, bump `series_rev`. Runs snapshot `data_as_of` + per-symbol `series_rev` hash. | Adjusted history stays continuous; runs stay reproducible from their snapshot. |
| D4 | Store eligibility | "Thuộc kho VN100" = in the **latest VN100 membership snapshot** and has bars in the store. VN30 ⊂ VN100. Store refresh set = VN100 ∪ VN30 ∪ VNINDEX ∪ symbols of open Bot positions. Bars are never deleted. | §2.2 + valuing positions after a symbol leaves VN100. |
| D5 | §17.3 Bot vs §3 differences to fix | (a) add T+2 (`sellable_from = entry + 2 sessions`); (b) NAV for sizing computed **after** sells (§3.3 step 2); (c) time exit independent of Sell-side status/grants/missing data (R04/R05); (d) 30% cap: **skip** with reason, no lot shrinking; (e) prices/GTGD20 from the store (GTGD20 = mean close×volume of last 20 sessions incl. D); (f) session counting on store calendar, suspended days count (Q21); (g) **drop the restricted-security buy gate** (Backtest cannot replay it → Q2 parity); (h) policy `iqx-bot-v2.0`, receipts of v1.x stay verifiable via `bot.legacy.ts`. Fees: buy 15 bps; sell 15 bps + tax 10 bps = 0.15% / 0.25% (migration defaults; dry-run prints prod row). | Q2 "khác nhau là lỗi". |
| D6 | §17.4 Bot price source plan | Bot snapshot provider reads the store only (W3 replaces VCI provider usage in the runner). Old provider kept until release+1 for legacy receipts' display only. | — |
| D7 | Indicator warmup | Signals are computed on the **full stored series from its first bar** in both engines (no rolling window); §2.3 bound (session #451) only limits `Từ ngày`. | Recursive indicators (EMA/Wilder) seed identically → exact parity (R15). |
| D8 | §17.5 VN100 × 10 y budget | Target < 10 s in the worker thread: load bars columnar (typed arrays) once per run, signals memoised per (config_hash, symbol, series_rev). W1 measures and records numbers in DEV-NOTES; if > 20 s, cache series per `data_as_of` in-process (LRU 2 entries). Keep the 30 s executor budget. Basket ≤ 100 symbols. | §10.6. Worker memory cap 1500 M (OOM history 2026-11-05) → no per-bar objects for 350k bars. |
| D9 | §17.6 IQX already in prod? | **Yes (v1, 2026-11-20).** Migration 0059 publishes **v{current+1}** for each strategy template whose current content has no `universe`: same indicators, `universe vn30`, `max_holding 30`, reason `Thêm rổ mã; giữ tối đa 30 phiên`. v1 rows untouched (immutable). | §7.1. |
| D10 | §17.7 dry-run numbers | Produced by the conversion script on a prod-dump rehearsal (§5.3) and pasted into DEV-NOTES before apply. | — |
| D11 | §17.8 alerts pinned to `backtest_run`/`shared_revision` | **No change**: alert versions already hold a full config copy; they keep evaluating. "Tạo cảnh báo" button removed from Backtest. Alerts tab unchanged (spec: "giữ như web hiện tại"); its `shared-config/revisions` read stays. New basket runs are rejected by the alert source resolver with the existing 422 `RUN_CONFIG_UNAVAILABLE` (unreachable from UI). | Smallest safe change; spec keeps the alerts tab. |
| D12 | §17.9 mini removal | Frontend: delete `pages/demo-trading/practice/**`, `?practice=` parsing, "Luyện tập" buttons. Backend: unregister `PracticeModule` from `app.ts`, delete module + its unit tests; tables 0017 kept as archive (no migration). | §9. |
| D13 | §17.10 email | Reuse `auth/email.service.ts` provider (generalise `send()`); senders `EMAIL_SENDER_BULLETIN`, `EMAIL_SENDER_BOT` (default `EMAIL_SENDER`). Outbox table + job `notifications.email-dispatch` (1 min, max 3 attempts). Domain/provider confirmation = owner action before enabling (`EMAIL_ENABLED`). | No new provider. |
| D14 | Strategy `content` shape (§10.2 buy/sell arrays) | Stored as `{universe, indicators, max_holding, sell_only?}` where `indicators` is the **existing V3 per-indicator map** (`master_enabled`, `buy{enabled,rules}`, `sell{…}`) — the format IQX definitions and shared-config revisions already use. "Buy/Sell cards" are views of that map. `config_hash = sha256(canonicalJson(content))` (saved_list includes its filtered `symbols`). | Spec allows mapping to the real schema; reuses `validateConfig`, `sideSignals`, hashing; zero-risk conversion. |
| D15 | Bot routes `/bots/:id/...` | Mapped to `/api/v2/bot/...` (current user's single bot). Bot endpoints keep `ApiAuthGuard` only (no Premium) and include a Bot-side strategy list (`/bot/strategy-options`) so non-Premium Bot users can pick IQX strategies. Spec closed-trades/log = existing `/bot/trades` and `/bot/journal/sessions`, extended. | One bot per user; Backtest is Premium-gated. |
| D16 | §14 Academy | v4 lessons contain none of the listed claims (grep above). Main agent re-greps after Học viện v5 lands and hands over "no sentence changed" (or the list). This workstream edits no academy content files. | Học viện v5 workstream owns content. |
| D17 | Migrated `max_holding` (§11.2 says 30) | 30, **except** when the effective revision already has `max_holding` (live since 19-11): keep it (values 1–2 → 3). Dry-run lists affected accounts. | M01 "same orders as before"; v1.1 time exit is live. Owner can veto → then 30. |
| D18 | Paused V3 bots / outdated revisions | Outdated (pre iqx-rules-4.0) revision = "no usable rows". A newer pending V3 revision → used as the strategy. Otherwise "Chưa chọn". `bot_config_pauses` rows resolved by the conversion. | Q22: no pause after conversion. |
| D19 | Universe for conversion | Effective (or pending-at-P) `bot_universe_revisions`: `vn30` → `vn30`; `custom` → `saved_list` with tickers ∩ VN100. Empty after filter → strategy still created but `UNIVERSE_EMPTY` noted; Bot logs `Rổ mua không có mã`. | Mirrors old behaviour at P. |
| D20 | Notification recipients/defaults | No settings row = defaults (on, both types on, email off). Bulletin fan-out = one `insert … select` over active users, `on conflict do nothing`. Bot trades = inserted **in the run's commit transaction**. | M06 without a backfill; atomic dedupe (T03). |
| D21 | Unsubscribe | Email link → frontend `/thong-bao/tat?token=` which calls `POST /api/v2/notifications/unsubscribe` (not GET). Token = HMAC (`NOTIFICATION_TOKEN_SECRET`) over email-row id; single use (`unsubscribe_used_at`). | Mail scanners prefetch GET links; spec intent (one click, no login) kept. |
| D22 | `origin` of user strategies | Column kept, null in v2 flows (IQX tab never fills the draft, §4.2). | — |
| D23 | Draft "ran" check | Client: deep-equal of normalised draft vs content of last successful run; server authority = `from_run_id` hash check (`422 RUN_REQUIRED`). Restore = `POST …/versions/:v/restore` (from_run_id null, note `Khôi phục từ bản …`). | No client-side sha256 drift. |
| D24 | IQX ids | API uses `iqx_templates.id` (uuid) + `slug` in payloads. | Existing frontend uses ids. |
| D25 | Unexpected closure on a predicted session | Locked row whose date gets no VNINDEX bar by 23:50 → run marked `skipped_no_session`, row re-dated to next predicted session (unlocked again). | Rare; avoids phantom sessions. |

## 4. Architecture

- **`backend/src/modules/strategy-rules/` (W1, pure, no Nest/DB):** `content.ts` (StrategyContent zod, `validateStrategyContent` → `STRATEGY_INVALID` details: ≥1 enabled Buy row unless `sell_only`, `max_holding` int 3–250, universe shape), `hash.ts`, `calendar.ts` (SessionCalendar: index, `countSessions`, `addSessions`, `predictFuture(holidays)`), `signals.ts` (per symbol per date tri-state buy/sell via `quant/v2` `sideSignals`, VNINDEX market context like `withSharedConfigSignals`), `session.ts` (`stepSession(state, input, params) → {sells, buys, skips, journal, nav, nextState}`; bigint VND; exact §3.3 order and messages), `backtest.ts` (`runBasketBacktest` loops `stepSession`; KPIs, per_symbol, open_positions, skipped_orders, basket_buy_hold, vnindex curve, warnings §4.8), `constants.ts` (`RULES_VERSION = 'iqx-strategy-rules-2.0'`, fixed params), `contracts.ts` (shared TS types + DI tokens for ports below).
- **Ports (declared in `contracts.ts` by W1):** `PRICE_STORE` (read bars/calendar/eligibility — impl W1), `STRATEGY_READER` (resolve `{source,id,version}` → content+label+hidden — impl W2), `BOT_SCHEDULE_PORT` (`usage(userId, source, id) → {last,next}`, `applyNext(tx, userId, ref, expectedNext, confirmDue)`, `impact(userId, ref)`, `botCountsByIqx()` — impl W3), `NOTIFICATION_WRITER` (`botTrades(tx, userId, tradeDate, payload)` — impl W4).
- **`backend/src/modules/price-store/` (W1):** repository + refresh service (DNSE via `market-data/providers/dnse.provider.ts`, scale via flashback helper), `scripts/price-store-build.ts` (initial full load at deploy).
- **`backend/src/modules/strategies/` (W2):** user strategies, versions, universe options, store meta; backtests move to basket mode inside existing `strategy-backtests/`.
- **Bots (W3):** `bot-strategy-schedule.service.ts`, runner refactor: `applyStrategy` becomes "build `SessionInput` from store + frozen signals → `stepSession` → persist with existing ledger helpers (`sell`, `buy`, `insertDecision`, NAV, reconcile)". Receipt/snapshot/idempotency infra kept.
- **`backend/src/modules/notifications/` (W4):** add settings/inbox/outbox/unsubscribe next to Telegram.
- **Jobs (W3 wires all):** `strategy.price-store-refresh` (every 10 min, idempotent, acts after 15:15 when VNINDEX has a newer closed bar), `bot.session-eod` → every 10 min on trading days from cutoff to 23:50 (first tick ≥ cutoff locks rows for D; runs when store has D; retries no-op after success), `notifications.email-dispatch` (every 60 s).

## 5. Database (0058–0061)

### 5.1 Migrations (all additive, idempotent `IF NOT EXISTS`; never edit after apply)

**0058_strategy_price_store.sql (W1)**
- `strategy_price_symbols(symbol pk, source varchar(40), price_unit 'VND', adjusted bool, first_date, last_date, bars_count int, series_rev int, series_hash char(64), refreshed_at timestamptz, last_error text)`.
- `strategy_price_bars(symbol, date, open, high, low, close, volume bigint, value_vnd bigint, primary key(symbol,date))` + index `(date)`. VNINDEX stored as symbol `VNINDEX` (index points ×100 as bigint or numeric(12,2) — W1 picks numeric for VNINDEX in a separate nullable column `close_idx`; document).
- Comment: Bot + Backtest read only this; Flashback tables untouched.

**0059_user_strategies.sql (W2)**
- `user_strategies(id uuid pk, user_id fk cascade, name varchar(40) check trimmed non-empty, latest_version int ≥1, origin jsonb null, sell_only bool default false, created_at, updated_at, deleted_at)`; unique index `(user_id, lower(name)) where deleted_at is null`; index `(user_id) where deleted_at is null`.
- `user_strategy_versions(strategy_id fk restrict, version, content jsonb, config_hash char(64), from_run_id uuid null references backtest_runs(id), note varchar(120), created_at)`, PK `(strategy_id, version)`; trigger forbidding UPDATE/DELETE (reuse `strategy_forbid_update()` from 0019 + a delete variant).
- `backtest_runs`: `shared_revision` drop NOT NULL (FK stays, null-safe); kind check add `'basket'`; add `strategy_source varchar(8) check in ('iqx','user','draft')`, `strategy_ref_id text`, `strategy_version int`; index `(user_id, strategy_source, strategy_ref_id, created_at desc)`. Legacy = `kind <> 'basket'` (presenter). ALTERs do not fire the immutable row trigger.
- `iqx_template_used`: add `event varchar(24) not null default 'used' check in ('used','strategy_run','strategy_assigned')`.
- IQX v2 publish (D9) as a guarded `INSERT … SELECT` + `UPDATE iqx_templates set current_version` only for strategy templates whose current content lacks `definition.universe`.

**0060_bot_strategy_schedule.sql (W3)**
- `bot_strategy_schedule(bot_id uuid fk bot_instances cascade, session_date date, strategy_source varchar(8) null check in ('iqx','user'), strategy_id text null, version int null, follow_latest bool not null default false, locked_at timestamptz null, run_status varchar(24) null, updated_at, updated_by uuid null, primary key(bot_id, session_date))`; checks: source/id both null or both set; `locked_at is not null and strategy_source is not null → version is not null`; `follow_latest → strategy_source = 'user'`; unique partial index `(bot_id) where locked_at is null`.
- `bot_positions`: add `anchor_session date`, `anchor_reason varchar(16) check in ('entry','policy_cutover')`, `sellable_from_session date` (entry = existing `opened_session`).
- `bot_executions`: add `exit_reason varchar(16) check in ('indicator','max_holding','legacy')`, `exit_reasons jsonb`, `holding_sessions int`, `counted_sessions int`, `max_holding_at_exit int`, `strategy_source`, `strategy_id text`, `strategy_version int`.
- `bot_run_receipts`: add `strategy_source`, `strategy_id`, `strategy_version`, `universe jsonb`, `counters jsonb` (`time_exits, t2_blocked, due_unfilled, universe_empty`).
- `bot_strategy_conversion_log(user_id pk, bot_id, group_kind varchar(24), strategy_id uuid null, versions int, max_holding int, excluded_symbols text[], positions_anchored int, p_session date, dry_run_hash char(64), converted_at)`.

**0061_user_notifications.sql (W4)**
- `user_notification_settings(user_id pk fk cascade, enabled bool, bulletin bool, bot_trades bool, email bool, updated_at)`.
- `user_notifications(id uuid pk, user_id fk cascade, type varchar(16) check in ('bulletin','bot_trades'), trade_date date, title, body, link, payload jsonb, read_at, created_at, unique(user_id,type,trade_date))`; index `(user_id, created_at desc)`, partial `(user_id) where read_at is null`.
- `user_notification_emails(id uuid pk, notification_id fk cascade unique, to_email, sender, subject, html, status check in ('pending','sent','failed','skipped'), attempts int, last_error, sent_at, unsubscribe_used_at, created_at)`.

### 5.2 Conversion (§11) — `backend/scripts/bot-strategy-v2-convert.ts` (W3)
- Pattern of `indicator-conditions-v3-migrate.ts`: dry-run default; `--apply` needs `BOT_STRATEGY_V2_CONVERSION_APPROVED=true`; advisory lock; refuses 18:30–19:40 ICT, when any `bot_run_receipts.status='running'`, or when the Bot job flag is on; per-user transaction; idempotent via `bot_strategy_conversion_log`.
- P = first predicted session > today (ICT). Groups per §11.2 + D17–D19: buy rows → strategy `Chiến lược của tôi (từ thiết lập cũ)` v1 (`note Chuyển từ thiết lập Bot cũ`), + v2 from pending revision (`Chuyển từ cấu hình chung chưa áp dụng`); sell-only → `sell_only=true`; nothing → no strategy. Name collision impossible (new table).
- Schedule rows: `last` = (last receipt date or activation date, locked, converted version), `next` = P, `follow_latest=true` (or null strategy).
- Open positions: `anchor_session = P`, `anchor_reason='policy_cutover'`, `sellable_from_session = entry + 2 sessions` (real calendar).
- Closed executions: untouched (`exit_reason` null = legacy). Old backtest runs untouched. No notification rows. `bot_config_pauses` resolved.
- Dry-run output (JSON + table): accounts, open positions, revisions, count per group, accounts with symbols filtered out of VN100 (and which), `max_holding` kept vs 30, positions that would be due at P (**must be 0**), fee config row.
- Rollback = deploy previous release: old code ignores new tables/columns, `shared_config_revisions`/`bot_universe_revisions` untouched. Script `bot-strategy-v2-rollback.ts` only clears schedule rows and anchor columns (never deletes strategies, versions, trades) — for re-running conversion after a fix.

### 5.3 Rehearsal (main agent, before prod)
1. Restore latest prod dump (`backups/pre-*.dump`) into local `iqx_v2_rehearsal`; `npm run db:migrate` (0058–0061).
2. `node dist/scripts/price-store-build.js` (real DNSE) → verify counts, `data_as_of`, VNINDEX present.
3. Converter dry-run → paste numbers into DEV-NOTES (§17.7) → `--apply` → re-run (no-op) → reconciliation SQL: counts per group = log rows; `bot_executions`, `bot_cash_ledger`, `user_notifications` counts unchanged; 0 positions due at P.
4. Run `bot.session-eod` for a simulated P on the rehearsal DB with `BOT_NEW_BUYS_ENABLED` as prod; inspect journal; then restore dump again for the real deploy.

## 6. API contract (all JSON; errors `{code, message, details?}`)

### 6.1 Strategy (`/api/v2/strategy`, guards: feature flag + `ApiAuthGuard` + `PremiumGuard`) — W2
| Method · path | Request | Response / errors |
|---|---|---|
| GET `/store/meta` | — | `{data_store:'flashback_vn100', data_as_of, earliest_start, price_unit:'VND', adjusted:true}` |
| GET `/universe-options` | — | `{vn30:{symbols[]}, vn100:{symbols[]}, saved_lists:[{id,name,symbols_total,symbols_kept[],excluded[]}]}` |
| GET `/strategies` | — | `{items:[{id,name,latest_version,latest_saved_at,universe_label,universe_count,sell_only,on_bot:{last:bool,next:bool}}], limit:20}` |
| POST `/strategies` | `{name, content, from_run_id, apply_next?:bool, expected_next_session?, confirm_due_positions?:string[]}` | 201 `{strategy, version, schedule?}`; 409 `STRATEGY_NAME_TAKEN`/`STRATEGY_LIMIT`; 422 `RUN_REQUIRED`/`STRATEGY_INVALID`/`UNIVERSE_EMPTY`; apply errors as PUT schedule |
| PATCH `/strategies/:id` | `{name}` | 200; 409 `STRATEGY_NAME_TAKEN`; 404 `STRATEGY_NOT_FOUND` |
| DELETE `/strategies/:id` | — | 204; 409 `STRATEGY_IN_USE` |
| GET `/strategies/:id/versions` | — | `{items:[{version,created_at,note,universe_label,max_holding,on_bot:{last,next}}]}` |
| GET `/strategies/:id/versions/:v` | — | `{version, content, config_hash, created_at, note}` |
| POST `/strategies/:id/versions` | `{content, from_run_id, expected_latest_version, apply_next?, expected_next_session?, confirm_due_positions?}` | 201; 409 `STRATEGY_VERSION_CONFLICT`; + above |
| POST `/strategies/:id/versions/:v/restore` | `{expected_latest_version, apply_next?, expected_next_session?, confirm_due_positions?}` | 201 (note `Khôi phục từ bản dd/mm HH:mm`) |
| GET `/iqx-templates?kind=strategy` (existing) | — | items + `universe`, `max_holding`, `current_version`, `on_bot` |
| GET `/iqx-templates/:id/versions` · `/:id/versions/:v` | — | version list (v, published_at, reason) / content; hidden ones readable only if the user's Bot uses them |
| POST `/backtests` | `{idempotency_key, strategy:{source:'iqx',id,version}|{source:'user',id,version}|{source:'draft',content,base:{id,version}|null}, start, end}` | 201 run view; 422 `DATE_RANGE_INVALID`/`UNIVERSE_EMPTY`/`STRATEGY_INVALID`; 409 `IQX_TEMPLATE_HIDDEN` only for IQX not used by own Bot; existing queue/timeout codes |
| GET `/backtests?strategy_source=&strategy_id=&limit=` | — | items `{run_id, created_at, legacy, strategy_label, version_label, universe_label, start, end, kpis:{total_return, max_drawdown, closed_trades}}` |
| GET `/backtests/:id` · `/:id/trades?offset&limit` | — | run: `snapshot{strategy_ref, content, config_hash, universe_resolved[], excluded_symbols[], data_store, data_as_of, price_unit, adjusted, rules_version, fee_rules, warnings[]}`, `kpis` (7), `curve[{date,strategy,basket,vnindex}]`, `per_symbol[]`, `open_positions[]`, `skipped_orders{counts, items(60)}`, `basket_buy_hold`; trades `{exit_reason, exit_reasons[], holding_sessions, max_holding_at_exit,…}` |
| Removed | PATCH `/shared-config` → 410 `SHARED_CONFIG_RETIRED`; `shared_revision/symbol/assumptions/research/system` in POST `/backtests` → 422 `STRATEGY_INVALID` | GET `shared-config/revisions` kept (alerts) |

### 6.2 Bot (`/api/v2/bot`, `ApiAuthGuard`) — W3
| Method · path | Request | Response / errors |
|---|---|---|
| GET `/strategy-options` | — | `{iqx:[{id,slug,name,version,universe_label,max_holding,hidden,on_bot}], mine:[{id,name,latest_version,latest_saved_at,on_bot}]}` (hidden IQX only if last/next uses it) |
| GET `/schedule` | — | `{last:Entry|null, next:Entry & {follow_latest, cutoff_at}, iqx_update:{latest_version, content}|null}`; `Entry = {session_date, source, id, name, version, version_label, hidden, content}` or `{session_date, source:null}` |
| GET `/schedule/next/impact?source&id&version` | — | `{next_session, n_current, n_new, positions:[{symbol, counted, sell_session}]}` |
| PUT `/schedule/next` | `{source, id, version?, expected_next_session, confirm_due_positions?}` | 200 schedule; 409 `SCHEDULE_SESSION_LOCKED` (+ `details.next_session`), `IQX_TEMPLATE_HIDDEN`, `DUE_POSITIONS_CHANGED` (+ positions); 422 `DUE_CONFIRM_REQUIRED`; 404 `STRATEGY_NOT_FOUND` |
| POST `/schedule/next/keep-last` | `{expected_next_session, confirm_due_positions?}` | same |
| GET `/positions` (extended) | — | + `entry_session, anchor_session, anchor_reason, sellable_from_session, counted, held, max_holding, due_session, sell_state ('t2_wait'|'sellable'|'due'|'due_unfilled'), sell_state_detail, entry_universe_label, in_universe` |
| GET `/trades` (extended) | `offset, limit` | + `holding_sessions, exit_reason, exit_reasons, max_holding_at_exit, strategy_label, version_label` |
| GET `/journal/sessions` (extended) | `offset, limit` | rows per session: `strategy_label, version_label, universe_label, universe_count, summary, counters{time_exits,t2_blocked,due_unfilled,universe_empty,…}` |
| Removed | `/bot/universe/*`; any config/indicator toggle endpoints | 404 |

### 6.3 Notifications — W4
| Method · path | Request | Response |
|---|---|---|
| GET/PUT `/api/v2/me/notification-settings` | `{enabled, types:{bulletin, bot_trades}, channels:{email}}` | + `email_available` (verified email), `updated_at`; PUT with email while unverified → 422 `EMAIL_UNVERIFIED` |
| GET `/api/v2/me/notifications?limit=50` | — | `{items:[{id,type,trade_date,title,body,link,read_at,created_at}], unread_count}` |
| GET `/api/v2/me/notifications/unread-count` | — | `{unread_count}` (header polling 60 s) |
| POST `/api/v2/me/notifications/read` | `{id}` or `{all:true}` | `{unread_count}` |
| POST `/api/v2/notifications/unsubscribe` (public, throttled) | `{token}` | `{type, status:'unsubscribed'|'already_used'}`; 400 `TOKEN_INVALID` |

### 6.4 Admin IQX (`/api/v2/admin/iqx-templates`) — W2
Strategy draft/publish validates `universe.type ∈ {vn30,vn100}`, `max_holding` 3–250, ≥1 enabled Buy **and** Sell row (`STRATEGY_INVALID`); list adds `universe`, `max_holding`, `bots_using` (next-session count), `trial_runs_30d`. Hide keeps pinned schedules running.

## 7. Work breakdown

Ordering: **W1 → (W2 ∥ W3 ∥ W4) → contracts checkpoint → (W5 ∥ W6)** → main: integration, rehearsal, e2e, deploy.
Contracts checkpoint: W2/W3/W4 first push zod schemas + controllers (stub services allowed) so the main agent runs `cd backend && npm run contracts:generate` then `cd frontend && npm run contracts:generate` once; frontend workers never edit `src/lib/generated/*` or `backend/contracts/*` themselves.
Shared integration files (single-line additions only, conflicts resolved by main): `backend/src/app.ts` (module list), `backend/src/modules/runtime/runtime.types.ts` (owned by W3), `frontend/src/App.tsx` (owned by W6).
Routing (Claude-only workers): W1 `opus` high (algorithm core); W2/W3/W4 `opus` medium (backend); W5/W6 `opus` high (frontend). Each on its own branch/worktree.

### W1 — Rules module + price store (foundation)
- **Goal:** §2, §3 as one pure module + the daily VN100 store; golden tests R01–R14, R16, R17 at module level.
- **Files:** `backend/src/modules/strategy-rules/**` (new), `backend/src/modules/price-store/**` (new), `backend/migrations/0058_strategy_price_store.sql`, `backend/scripts/price-store-build.ts`, `backend/test/unit/strategy-rules-*.test.ts`, `backend/test/unit/price-store-*.test.ts`, `backend/test/integration/price-store.integration.spec.ts`.
- **Steps:** contracts.ts + content.ts + hash first (push early: others depend) → calendar → signals (reuse `quant/v2`) → `stepSession` (bigint) → `runBasketBacktest` + KPIs/§4.7 formulas + warnings → store repo (columnar reads) + refresh (DNSE full series, adjustment replace, eligibility D4) + build script → perf bench VN100×10y.
- **Acceptance:** R01–R14, R16, R17 golden tests (input → expected orders/NAV, both via `stepSession` and `runBasketBacktest`); S11 (N=5: no hold >5, no sell before entry+2); KPIs (annualised `—` when < 60 sessions); store refresh idempotent, replaces series on adjustment, never deletes; bench numbers recorded.
- **Verify:** `cd backend && npm run lint && npm run typecheck && npx vitest run test/unit/strategy-rules test/unit/price-store && npm run test:integration -- price-store && npm run build`.

### W2 — Strategies, versions, Backtest API, IQX admin API (depends W1 contracts)
- **Goal:** §4 server side, §6.2, §7, §10.3, §13 (list deletion), migration 0059.
- **Files:** `backend/src/modules/strategies/**` (new), `backend/src/modules/strategy-backtests/**`, `backend/src/modules/iqx-templates/**` (+ seed json for v2 content), `backend/src/modules/saved-filters/saved-filters.bot-usage.ts` (delete) + its call sites in `saved-filters.service.ts`/`saved-results.service.ts`, `backend/src/modules/strategy-config/strategy-config.controller.ts` (PATCH → 410), `backend/migrations/0059_user_strategies.sql`, tests `backend/test/unit/strategies-*.test.ts`, `backend/test/unit/strategy-backtests-*.test.ts` (update), `backend/test/system/strategies.system.spec.ts`.
- **Steps:** schemas/controllers (contract first) → repository + limits/soft delete/name uniqueness in tx → versions (immutable, `expected_latest_version`, `from_run_id` check, restore) → `apply_next` via `BOT_SCHEDULE_PORT` in the same tx → POST `/backtests` basket mode on W1 engine in the existing worker executor, snapshot + legacy listing + filters → IQX: v2 seed, validation, list stats (`iqx_template_used.event`), hidden handling, `STRATEGY_READER` impl → retire old request fields + shared-config PATCH.
- **Acceptance:** S05, S06 (API 422), S08 (limit 20, name taken, concurrent save → one 409 `STRATEGY_VERSION_CONFLICT`), S09, S11 (via API), S13 (legacy runs `legacy:true`), S14 (restore creates new version), B07/B08 server parts, §7.2 publish checks, idempotency + immutability preserved.
- **Verify:** `cd backend && npm run lint && npm run typecheck && npx vitest run test/unit/strategies test/unit/strategy-backtests test/unit/iqx-templates && npm run test:system -- strategies && npm run build && npm run contracts:check` (after main regenerates contracts).

### W3 — Bot runner, schedule, conversion, jobs (depends W1 contracts; uses W2/W4 ports)
- **Goal:** §3 in the Bot path, §5 server side, §6, §11, policy `iqx-bot-v2.0`, mini backend removal, all runtime wiring.
- **Files:** `backend/src/modules/bots/**`, `backend/src/modules/market-integration/bot-market-snapshot.provider.ts`, `backend/src/modules/runtime/runtime.schedules.ts`, `backend/src/modules/runtime/runtime.types.ts`, `backend/src/platform/domain-runtime.module.ts`, `backend/src/modules/practice/**` (delete), `backend/src/app.ts` (remove PracticeModule), `backend/migrations/0060_bot_strategy_schedule.sql`, `backend/scripts/bot-strategy-v2-convert.ts`, `backend/scripts/bot-strategy-v2-rollback.ts`, tests `backend/test/unit/bots-*.test.ts` (update/remove universe+config-gate ones), `backend/test/unit/practice-*.test.ts` (delete), `backend/test/system/bot-strategy-*.system.spec.ts`, `backend/test/system/bot-*.system.spec.ts` (update).
- **Steps:** migration → schedule service (next-session calc D1, lazy next row, lock at cutoff, follow_latest resolve, keep-last, IQX pin/update, impact §6.5, 409/422 codes) + `BOT_SCHEDULE_PORT` impl → runner: input from store + frozen signals + `stepSession`, persist new ledger fields, journal counters, `NOTIFICATION_WRITER.botTrades` inside commit tx when ≥1 execution → read API extensions + `/strategy-options` → remove universe/config write paths → jobs (price-store refresh, session tick, email dispatch) → conversion + rollback scripts with dry-run report.
- **Acceptance:** R14 (retry same session: no resell, no dup rows, same version), **R15 replay system test** (60 sessions: Bot executions and daily NAV identical to `runBasketBacktest`), B02–B06, B09 (save before/after cutoff, holiday skipped), B10–B13, T01–T03 and T12 at service level, M01–M06 on fixtures (M02: position held 80 real sessions not sold at P, due P+30), "no mass sell at deploy" check.
- **Verify:** `cd backend && npm run lint && npm run typecheck && npx vitest run test/unit/bots && npm run test:system -- bot && node dist/scripts/bot-strategy-v2-convert.js` (dry-run on local DB) `&& npm run build`.

### W4 — Notifications backend (independent; depends W1 contracts only for port)
- **Goal:** §8 server side, migration 0061.
- **Files:** `backend/src/modules/notifications/**` (add services/controllers; Telegram untouched), `backend/src/modules/auth/email.service.ts` (generic `send` + sender), `backend/src/modules/market-bulletins/bulletins.service.ts` (first-publish hook only), `backend/src/platform/config/environment.ts` (new env vars), `backend/migrations/0061_user_notifications.sql`, tests `backend/test/unit/notifications-*.test.ts`, `backend/test/system/notifications.system.spec.ts`.
- **Steps:** migration → settings (lazy defaults, email availability) → inbox list/read/unread-count → `NOTIFICATION_WRITER` impl (bot trades: title/body/link per §8.1, email outbox row when enabled) → bulletin fan-out on first publish only (republish/unpublish none) → email templates §8.4 + dispatcher (3 attempts) → unsubscribe token (HMAC, single use).
- **Acceptance:** T01–T08, T11 (writer never called by conversion), T12; dedupe on (user,type,trade_date); email failure does not affect web notification.
- **Verify:** `cd backend && npm run lint && npm run typecheck && npx vitest run test/unit/notifications && npm run test:system -- notifications && npm run build`.

### W5 — Frontend Backtest + admin Mẫu IQX + Bộ lọc link (after contracts checkpoint; uses W6 shared schedule hooks)
- **Goal:** §4, §7.2 UI, §12, §13.
- **Files:** `frontend/src/pages/strategy/backtest/**`, `frontend/src/pages/strategy/strategy-page.tsx`, `frontend/src/pages/strategy/shared/iqx*.ts(x)`, `frontend/src/pages/strategy/filter/{filter-tab,results-panel,iqx}.tsx/ts`, `frontend/src/pages/strategy/alerts/alert-form.tsx` (drop backtest-run entry point only if needed), `frontend/src/pages/strategy/test-support.ts`, `frontend/src/pages/admin/iqx-templates/**`, new `frontend/e2e/update-2211-backtest.spec.ts`; update affected cases in `frontend/e2e/update-1911-acceptance.spec.ts` (Backtest/admin parts only).
- **Steps:** API layer (`backtest/api.ts`, hooks) → tab IQX read-only view + versions → tab Chỉ báo: strategy menu (list, limit, delete lock, replace-draft confirm), basket picker + excluded notice, Giữ tối đa input rules, Run gating → Lưu ▾ (4 items, name dialog, §4.4.2 apply dialog with due block from W6 shared component) → results (7 KPIs, 3-line chart, 5 tabs, symbol chart 3 marker kinds, stale label) → saved runs dialog (filter, legacy view) → leave-page guard → admin compose with basket/max_holding, columns, hide copy → filter: "Backtest với rổ là kết quả này" (router state), drop pair line and per-symbol links.
- **Acceptance:** S01–S14, V01/V02 for Backtest + admin, §13.
- **Verify:** `cd frontend && npm run typecheck && npm run lint && npx vitest run src/pages/strategy src/pages/admin/iqx-templates && npx playwright test e2e/update-2211-backtest.spec.ts && npm run build`.

### W6 — Frontend Bot + bell + notification settings + mini removal (after contracts checkpoint)
- **Goal:** §5, §8.2–8.3 UI, unsubscribe page, §9 removals in Bot/mini.
- **Files:** `frontend/src/pages/demo-trading/bot/**`, `frontend/src/pages/demo-trading/demo-trading-page.tsx`, `frontend/src/pages/demo-trading/practice/**` (delete), `frontend/src/config/chrome.ts` (practice param), `frontend/src/components/layout/header.tsx` + new `frontend/src/components/layout/notification-bell.tsx`, new `frontend/src/pages/notifications/unsubscribe-page.tsx`, `frontend/src/App.tsx` (unsubscribe route; `/backtest/:symbol` → `/chien-luoc?tab=backtest`), new shared `frontend/src/pages/strategy/shared/{bot-schedule.ts,due-confirm.tsx,strategy-diff.ts}` (**first deliverable**, consumed by W5), new `frontend/e2e/update-2211-bot.spec.ts`; Bot/mini cases in `frontend/e2e/update-1911-acceptance.spec.ts`.
- **Steps:** shared schedule hooks + due-confirm + diff → remove universe/config/16-indicator/mini UI → strategy lists (IQX/mine, Chi tiết deep links, Dùng dialog) → Lịch phiên (2 rows, change marker, diff, keep-last, IQX update) → tables Đang giữ/Lịch sử/Nhật ký + detail dialogs → principles modal §5.7 → THÔNG BÁO card (master/type/email rules) → header bell (poll 60 s, list 50, mark read, deep links, settings link opens Bot panel + scroll on 390 px) → unsubscribe page.
- **Acceptance:** B01–B14 (UI), T08–T10, V01/V02 for Bot/bell; no emoji (lucide icons only).
- **Verify:** `cd frontend && npm run typecheck && npm run lint && npx vitest run src/pages/demo-trading src/components/layout src/pages/notifications && npx playwright test e2e/update-2211-bot.spec.ts && npm run build`.

### Main agent (after merges)
Regenerate contracts; `cd backend && npm run verify`; `cd frontend && npm run verify`; full system suite; rehearsal §5.3; §14 academy grep report; DEV-NOTES.md + ACCEPTANCE.md (each §16 case: input, expected/actual, test file, env); deploy.

## 8. Risks (production)

| Risk | Mitigation |
|---|---|
| Bot job runs new code before conversion → every Bot "chưa chọn" for a session | Deploy with `JOB_BOT_SESSION_EOD_ENABLED=false`; apply conversion; verify; re-enable. |
| Mass sell of old positions at P | Anchor = P (Q20); dry-run asserts 0 positions due at P; system test M02. |
| Price store not fresh by 19:00 (DNSE outage) | Session tick retries until 23:50; rows locked at cutoff anyway; run marked failed-retryable, no fallback source; admin log. |
| Adjustment replaces history → indicator jumps vs yesterday's evaluation | Expected and consistent for both engines; `series_rev` in snapshots. |
| Worker OOM (1500 M cap) with VN100 × full history × N bots | Columnar arrays, one load per session tick shared by all bots, signals memoised per `config_hash` (IQX strategies shared by many bots). Measure in rehearsal with prod bot count. |
| Policy change for live bots (T+2, NAV after sells, no security gate, Sell-blocked no longer blocks time exits) | Listed in DEV-NOTES + release note; rule receipts keep `iqx-bot-v2.0`; v1.x receipts verified by `bot.legacy.ts`. |
| Old tabs/mobile calling removed endpoints (`PATCH shared-config`, `/bot/universe/*`, `/practice/*`) | 410/404 with codes; mobile is paused (not updated, per AGENTS.md). |
| Email reputation / volume | `EMAIL_ENABLED` stays false until owner confirms sender domain; email default off per user; dispatcher rate-limited. |
| IQX v2 seed when admin already published a new version | Migration only bumps templates lacking `universe`; otherwise admin edits manually (logged). |
| Concurrent save vs cutoff lock | `expected_next_session` + unique unlocked-row index + row lock in tx → `SCHEDULE_SESSION_LOCKED`. |

## 9. Deploy notes

- Script: `deploy-u411.sh <name> <old> <new> 0061 …` style (migrations + API + worker + market-ingest restart). Backup dump `pre-botv2-<ts>.dump` first.
- Before swap: `node dist/scripts/price-store-build.js` (≈110 DNSE calls; abort deploy on failure).
- After migrate, with `JOB_BOT_SESSION_EOD_ENABLED=false`: converter dry-run → review → `BOT_STRATEGY_V2_CONVERSION_APPROVED=true node dist/scripts/bot-strategy-v2-convert.js --apply` → reconciliation SQL → re-enable job. Deploy window: after the 19:00 run of day D has succeeded (≥ 19:40) or on a non-trading day, so P = next session.
- New env: `BOT_SESSION_CUTOFF=19:00`, `JOB_STRATEGY_PRICE_STORE_REFRESH_ENABLED` (default true), `JOB_NOTIFICATIONS_EMAIL_DISPATCH_ENABLED` (default true; no-op while `EMAIL_ENABLED=false`), `EMAIL_SENDER_BULLETIN`, `EMAIL_SENDER_BOT`, `NOTIFICATION_TOKEN_SECRET` (required in prod).
- Services restarted: API, worker (jobs + backtest worker threads), market-ingest (same code version). Frontend dist + app shell as usual.
- Post-deploy checks: `/api/v2/strategy/store/meta` `data_as_of`; one manual Backtest VN100×10y timing; first P session journal for 3 sample accounts per conversion group; notifications count for P = accounts with ≥1 execution.

## W1 notes

- Bench (`STRATEGY_RULES_BENCH=1 npx vitest run test/unit/strategy-rules-bench`, synthetic VN100 = 100 symbols × 3 700 sessions, range 2 520 sessions ≈ 10 y, one thread, machine load ≈ 11–25): RSI-only cold 788 ms (CPU 874 ms), 194 trades; RSI+MACD+MA+BB cold 3 699 ms (CPU 3 447 ms); warm with cached signals ≈ 110 ms; heap 110 MB. Under the 10 s target (D8).
- Perf choices: `createFastSeriesCache` (same `calc`, cheaper memo key than `createSeriesCache`), signals evaluated only from the range start (indicators still run from the first bar, D7), Backtest passes only Buy-true candidates to `stepSession` (identical result), GTGD20 computed only for Buy-true symbols.
- Indicator card with no enabled row on a side is neutral (ignored) for that side; a side with no active card is false (v1 made the whole side false on any empty card).
- `sell_issue` on a held symbol: Sell signal treated as unknown, so a due position is still sold by `max_holding` (R05) and the issue is journaled.
- Store: VNINDEX price columns hold points × 100, exact points in `close_idx`; VNINDEX is written last so `data_as_of` never runs ahead of stock bars; refresh status `up_to_date | refreshed | partial | failed` (`partial` = failures above `maxFailures`, VNINDEX not advanced). A vendor answer with no bars is a recorded failure, never a delete.
- 30 % NAV cap is kept and tested in `sizeBuy`, but with 12 % budget + 2 buys/session it is only reachable through price moves of held positions.
- R17 is asserted on the Bot replay path (stepSession per session on the store-as-of-D); Backtest equality is covered by R15.
- `app.ts` untouched: W2/W3 import `PriceStoreModule` (exports `PriceStoreService` and `PRICE_STORE`). The scheduled refresh job (`JOB_STRATEGY_PRICE_STORE_REFRESH_ENABLED`) is not in W1 scope; it calls `PriceStoreService.refresh()`.
- Integration test ran on Testcontainers (Colima) with its own throwaway database.
