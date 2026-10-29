# Indicator conditions V3: design + owner decisions

Implementation plan for `IQX_CHI_BAO_SPEC.md` (SPEC V3). Content standard per row: `HTML-EXTRACT.md` (extracted from `IQX_CHI_BAO_MAU.html`; HTML wins on wording/ops).

## Owner decisions (2026-10-29) — these OVERRIDE the "Open questions" section below

1. **Bot "đang chạy"** = `bot_accounts.status='active'` AND a `bot_instances` row exists AND the pre-migration effective config has at least one indicator with master on + side on + at least one rule on. Those get a silent pause row; others are "đang tắt sẵn" and only get the new default config.
2. **Strategy alerts: auto re-pin.** The migration appends a new `strategy_alert_versions` row pinned to the user's migrated shared-config revision (new defaults), keeping the alert's enabled/paused state, schedule and other fields. Applies to alerts sourced from a shared-config revision AND alerts sourced from a backtest run snapshot (old config cannot be evaluated; re-pin to the migrated revision). No notification. Old versions/events stay untouched (history).
3. **NO_SIGNAL across indicators:** keep each product's current multi-indicator combination (spec §0.2). Only the per-indicator result is unified (`no_signal` everywhere). Do NOT change how Bot / Backtest / Alerts combine indicators.
4. **Volume:** unchanged. Keeps its params+rules shape and its form; migration copies it verbatim.
5. Scope defaults accepted: legacy 38-factor engine / STRATEGY_TEMPLATES / legacy market alerts out of scope; "Đặt lại" keeps current per-tab behaviour; server keeps enforcing decimal step multiples.

---

# SPEC V3 synthesis: indicator conditions (read-only, no repo file modified)

Paths are relative to `/Users/danhtrongit/Projects/IQX/`. The spec is at `backend/docs/indicator-conditions-v3/IQX_CHI_BAO_SPEC.md`, which I read in full. The sample HTML is `IQX_CHI_BAO_MAU.html` in the same folder; the spec calls it `IQX_CHI_BAO_MAU_v2.html`, but that file does not exist on disk.

I checked the claims below by opening the files myself: `quant/v2/{types,signals,rules,config,indicators}.ts`, the registry JSON (dumped with node), `strategy-config.service.ts:55-160,375-420`, `bot.service.ts:498,543,674-740`, `practice.service.ts:98-102`, `0001` (bot_accounts and bot_instances), `0009`, `0017` (practice_runs trigger), `0019` (strategy_alerts.paused_at), `frontend/.../bot/main/state.ts`, and the frontend and mobile file sizes.

## Corrections to the area reports, plus one new finding

- **CCI, MFI, CMF, ROC and Williams r1 are already crosses.** They are `kind:"cross"` with `allowed_ops [">","<"]`, and `rules.ts:114` treats `kind==='cross'` as a crossing. They are not plain level comparisons, as the strategy-config report said. The same applies to Stochastic r2, MA/EMA r1 and r2, and MA Cross r1.
- **`RULE_VERSION` is still `'iqx-rules-3.0'`** (`backend/src/modules/quant/v2/types.ts:17`). Commit 526a4374 changed the rule shapes without bumping it. The new format needs a new string, for example `iqx-rules-4.0`, because "3.0" is already taken.
- **Bots may already be blocked in production (needs a DB check).** `readStoredConfig` (`strategy-config.service.ts:143-158`) passes every current-version revision through `normalizeStoredIndicators`. The Bot then compares `configHash(effective.config) !== effective.config_hash` (`bot.service.ts:689-691`; the same check is at `:2170`). Any revision saved before 526a4374 that the normaliser rewrites gets a different hash, so its Bot is blocked with "Revision hoặc hash cấu hình không khớp". The V3 append-revision migration fixes this as a side effect.

---

## 1. Inventory table (spec §0.4)

| Product / place | Form file | Where config is stored | Signal function | Shared with | Work needed |
|---|---|---|---|---|---|
| **Bot** | Web: `frontend/src/pages/demo-trading/bot/config/config-modal.tsx` (375 lines; shared param grid at `:231-291`, rows at `:293-336`), helpers `draft.ts`, `labels.ts`, `summary.ts`, `types.ts`, `use-bot-config.ts`; read-only views `bot/main/condition-cards.tsx`, `bot/main/state.ts`. Mobile: `mobile/src/features/strategy/config/{indicator-card.tsx,model.ts,library-screen.tsx,types.ts}` (Thư viện chỉ báo; shared inputs at `indicator-card.tsx:109-125`) | `shared_config_revisions` + `effective_config_sessions` (`migrations/0009`), append-only, one document per user. Written by `PATCH /api/v2/strategy/shared-config` (`SharedConfigService.save`, `strategy-config.service.ts:294-383`) | `sideSignalsWithEvidence` (`quant/v2/signals.ts:54-99`) → `evaluateRuleWithEvidence` / `evaluateRule` (`rules.ts`), called at `bot.service.ts:859`; `sessionSideSignal*` in `bot.shared-config.ts:309-357`. Job `bot.session-eod` at 19:00 ICT (`runtime.schedules.ts:131-136`) | Backtest and Strategy alerts (same document) | Per-row model (UI, types, validation), new evaluator, pause state + resume-on-save, overview state `paused`, evidence fallback (`bot.service.ts:825-851`, `bot.shared-config.ts:334-357`) |
| **Backtest** | Web: `frontend/src/pages/strategy/backtest/config-dialog.tsx` (289 lines; a JSX copy of the Bot modal, param grid at `:188-237`), read-only `conditions.tsx`, `results-model.ts`, `sides.ts`, `shared/evidence-table.tsx`. Mobile: `backtest-screen.tsx` only sends `shared_revision` (no form) | Same shared config, pinned by `shared_revision`. Results in `backtest_runs` (immutable trigger `0019:137-141`; FK → revisions ON DELETE CASCADE, `0011:27-28`) | `runBacktest` (`quant/v2/backtest.ts:108-111` validates, `:146-147` `sideSignals`); evidence via `strategy-backtests.evidence.ts:32-33`; research `advanced/research.ts` (`ParamPath {indicator,side,key}`), `advanced/system.ts:672-688` | Bot | New evaluator; `getRevision` rejects old format; `ParamPath` gets a row id; `ruleEvidenceSchema.op` enum (`strategy-backtests.schemas.ts:223`, already stale); old runs must keep rendering |
| **Luyện tập** | Server form descriptor `practiceForm()` (`backend/src/modules/practice/practice.config.ts:234-273`); web `frontend/src/pages/demo-trading/practice/practice-panel.tsx` (param grid at `:230-242`) + `practice-model.ts`. No mobile screen | `practice_progress.draft` (mutable) and `practice_runs.config` (locked; trigger `0017:170-187`). Kept separate from Bot (spec §0.2) | Its own loop `evaluateSide` (`practice.engine.ts:100-161`) over shared `calc` + `evaluateRuleWithEvidence` + `and3`; series computed once per side (`:202-206`); preview at `practice.service.ts:230-237` | Registry and rule primitives only | New config shape, use the shared side evaluator, per-row chart series, fix the `rules_enabled` drop (`practice.service.ts:98-102`), reset old drafts, handle old-shape `computing`/`failed` runs |
| **Flashback** | **Không áp dụng for conditions.** It has a display-param dialog only (`flashback-indicator-dialogs.tsx`) | `flashback_entries.indicator_params` (display params, `0028:65`) | **None.** `grep -nE "evaluateRule\|calc\(\|sideSignals\|and3\|allowed_ops\|rules_enabled" backend/src/modules/flashback/*.ts` returns nothing. Orders are manual (`flashback.controller.ts:37-42`). Chart overlays are client-side (`flashback-indicators.ts`) | Registry metadata only (`flashback.indicators.ts:9-10,103-203`) | Decouple the catalog from the registry shape. `FLASHBACK_INDICATORS = buildCatalog()` (`:221`) runs eagerly at import, so a registry reshape breaks app boot. Freeze today's params in a static table; behaviour stays unchanged |
| Nơi khác: **Strategy alerts** | `frontend/src/pages/strategy/alerts/alert-form.tsx` (pins a revision or a run; does not edit rules), `signal-history.tsx`; mobile `alerts/event-sheet.tsx` | `strategy_alert_versions.config` (immutable, `0019:62-68`); `strategy_alerts.paused_at` is mutable (`0019:27`) | `sideSignalsWithEvidence` (`strategy-alerts.evaluation.ts:191`); `validateConfig` gate (`strategy-alerts.evaluator.ts:170-179`); job `alerts.eod-evaluate` | Shared config, or `backtest_runs.snapshot.config` | Evidence per row (`indicator_params` at `evaluator.ts:258-262` is per indicator). Old pinned versions become `config_error` silently; owner decision (Q3) |
| Nơi khác: **API / contracts** | n/a | OpenAPI `backend/contracts/openapi-v2.json`, `backend/contracts/client/types.gen.ts`, `frontend/contracts/*`, `frontend/src/lib/generated/backend-v2.ts` | n/a | all | Regenerate. Registry response schema (`strategy-config.schemas.ts:179-225`), `sharedConfigSchema` (`:60-80`), the Practice schemas and `BotConditions.state` (`enrich-openapi.ts:1620-1645`) all change |
| Nơi khác: **jobs** | n/a | n/a | `bot.session-eod`, `alerts.eod-evaluate` (`domain-runtime.module.ts:128,142,310-317`), backtest worker (`strategy-backtests.jobs.ts:89-128`) | | Inherit the new evaluator; Bot adds a pause gate |
| Nơi khác: **tests / fixtures** | n/a | `test/unit/fixtures/bot-registry-spec-16.json`, `test/fixtures/bot-v2/engine.reference.cjs` (its own calc/evaluate/validate; `rule_version:'iqx-rules-2.0'` at line 51), `quant/v2/registry/shared-config.schema.json` (read only by `quant-v2-spec-parity.test.ts:165-215`) | Reference oracle | | Rewrite. List in §3.6 |
| Nơi khác: **dead code** | `frontend/src/lib/shared-config.ts` (183 lines, no importer per `grep -rln "lib/shared-config" frontend/src`) | | | | Delete |
| Nơi khác: **Legacy 38-factor engine** | **Không áp dụng.** `quant.controller.ts:27` `@Controller(['api/v2/backtest','api/v1/backtest'])`; `STRATEGY_TEMPLATES` (`quant/templates.ts:13-75`) are the only "mẫu chiến lược". No hand-written caller: `grep -rlE "backtest/(catalog\|run\|strategies)" frontend/src mobile/src` hits only `lib/generated/*` | `backtest_strategies` | `quant/conditions.ts` (own factor vocabulary, not the 15-indicator registry) | none | None (confirm scope, Q5) |
| Nơi khác: **Legacy market alerts / admin signals** | **Không áp dụng.** `alerts.catalog.ts:9-127` (`rsi_14 < 45`…), `admin/core/alerts-page.tsx` | `/alerts/rules` tables | `quant/conditions.js` `evaluateLatest` | none | None (Q5) |
| Nơi khác: **Academy** | **Không áp dụng.** `frontend/src/pages/academy/no-config-controls.test.ts` asserts Academy imports no shared config, registry or Switch | | | | None |
| Nơi khác: **Preset / clone / JSON import-export** | **Không áp dụng.** `grep -rniE "clone\|duplicate\|nhân bản\|preset\|import.*json\|export.*json"` over bots, strategy-config, strategy pages and the mobile strategy feature finds only `structuredClone`, `fee_preset` and registry `templateSide`. Bot routes are GET only (`bots.controller.ts`). 1 Bot per user (`uq_bot_instances_user_id`) | | | | The only inbound path is `PATCH shared-config`; make it reject the old format |
| Nơi khác: `apps/mobile/` | **Không áp dụng.** `git ls-files apps \| wc -l` = 0 (gitignored prebuild leftovers) | | | | None |

---

## 2. Gap analysis vs SPEC V3

### 2.1 Structural (applies to all 15)

| Spec | Current | Evidence |
|---|---|---|
| §1.1, §7.1.2: no shared param block | Params are side-level and shared by every row; three web renderers and one mobile renderer show a param grid | `types.ts` `SideConfig {enabled, params, rules}`; `signals.ts:23,71` one `calc(id, sideConfig.params)` per side; UI lines in table 1 |
| §1.2: own period / threshold / op per row, rows independent | Only `op` and `enabled` are editable. `validateRules` (`config.ts:133-175`) rejects any rule that differs from the template ("không được sửa operand của điều kiện"). Zod `compareRuleSchema` is strict | `config.ts`, `strategy-config.schemas.ts:32-64` |
| §1.4: stable row codes | `r1..r3`, positional | registry |
| §1.3: AND of enabled rows; NO_SIGNAL | Kleene `and3` (`rules.ts:223-227`). Zero enabled rows gives `false` (`signals.ts:22`, `:94`), not a distinct NO_SIGNAL. Consumers disagree on an active indicator with zero enabled rows: Bot `activeSideIndicators` (`bot.shared-config.ts:259-272`) drops it from the AND; Backtest `sideSignals` forces the side to false; Alerts return `null` for "no active" | Behaviour is equivalent where only `===true` triggers, but the multi-indicator result differs between Bot and Backtest (Q4) |
| §6.1.5: reject old format | The read path maps: `mapLegacyConfig` (`legacy-config.ts:104-183`) and `normalizeIndicatorSide` (`strategy-config.service.ts:74-117`, keeps the stored `op` by rule id). Legacy sides are blocked as `legacy_needs_review` (`bot.config-gate.ts:61-100`) | Must be replaced |

### 2.2 Per indicator (registry dump, verified). "Ranges" means current → V3

| # | Indicator (repo id) | Current | V3 delta |
|---|---|---|---|
| 1 | SMA (`ma`) | Shared `period, fast, slow, trend_period` (5-200, `options` [5..200]), cross_fields fast<slow. r1 cross close vs value; r2 cross fast vs slow; r3 `trend[t]` vs `trend[t-trend_period]`. Defaults on/off/on = T/F/F | Content and defaults already right. Move params into rows. Store the cross as an explicit `cross_up/cross_down`. **Enforce `options`** (not enforced anywhere today; `ma period 7` is accepted). fast<slow per row (r2). Trend N = the row's own period. Range 5-200 vs a preset list |
| 2 | EMA (`ema`) | Same as SMA; 5-200, no options | Per row; **2-200**; fast<slow per row |
| 3 | MA Cross (`ma_cross`) | Shared `fast/slow` 5-200 + options | Per row, options enforced, fast<slow |
| 4 | RSI | `period` 5-50 shared by r1 and r2; r1 `value vs level`; **r2 `value[t] vs value[t-1]`** | **r2 becomes trend `RSI_N[t] > RSI_N[t-N]`** with its own N. Period 2-200. Threshold integer 0-100 (OK) |
| 5 | MACD | `fast` 2-50, `slow` 5-100, `signal` 2-30 shared by r1-r3; r1 4 ops; r2 vs constant 0; r3 histogram vs previous bar | Per-row periods (r2 has no signal); all 2-200; fast<slow on every row |
| 6 | Stochastic | `k` 5-50, `d` 2-20, `smooth` 1-10, `level` shared; r1 `>/<`; r2 `kind:cross` with `>/<` | Per row; K 2-200; **D 1-20**; r2 explicit cross ops only |
| 7 | CCI | `period` 5-100; r1 cross vs level (-300..300) | Per row; period 2-200 |
| 8 | MFI | `period` 5-50; r1 cross | Per row; 2-200 |
| 9 | ROC | `period` 2-252; level -100..10000 step 0.1; % (`indicators.ts:438-442`) | Per row only (ranges, unit and formula match) |
| 10 | Williams %R | `period` 5-100; r1 cross; level -100..0 | Per row; 2-200 |
| 11 | Bollinger | `period` 10-100, `k` 1-3.5 shared by r1 and r3; r1 6 actions (match the spec table, `rules.ts:59-104`); r2 close vs close[-1]; r3 `value[t]` vs `value[t-1]`, where `value = 100·(U-L)/M` (scale-invariant vs spec BW; `null` when M=0) | Per row; period 2-200 |
| 12 | Donchian | `period` 5-252; r1 `close >/<`, **rhs fixed** (buy `upper`, sell `lower`); extremes exclude T (`indicators.ts:378-379`, `rolling(...,1)`) | **Band select (trên/dưới) is independent of op**; period 2-252; per row |
| 13 | DMI + ADX | `period` 5-50 shared by r1 (DI) and r2 (ADX); `level` step 0.1 | Separate N per row; 2-200 |
| 14 | OBV | `baseline` 5-100 (r1), `breakout_period` 2-252 (r2); `upper/lower = rolling(value,N,max/min,1)`, which excludes T | Per row; baseline 2-200 |
| 15 | CMF | `period` 5-100; level -1..1 step 0.01 | Per row; 2-200 |
| — | Volume (`volume`) | 2 rules with no `enabled` flag, params `lookback/mult` | Spec: "Không thay đổi" (Q1) |

Row counts per tab (3,3,1,2,3,2,1,1,1,1,3,1,2,2,1) and all numeric defaults, ops and row on/off flags already match V3. Registry side `enabled` defaults to `false`; the HTML uses `true`. The migration preserves user switches anyway.

### 2.3 Cross-cutting rules

- **§2 cross.** `rules.ts:112-125`: `now && prevL<=prevR` (up) or `prevL>=prevR` (down). Dynamic lines are read at i-1, a fixed threshold is a constant, and equality at T is not a cross. Missing previous gives `null`. This matches the spec. The gap is only the encoding: `kind:'cross'` plus `>/<` must become explicit `cross_up/cross_down`, and `>/<` must mean a plain comparison. The allowed sets must match §7.1.4 exactly.
- **§2 trend.** Only MA/EMA r3, via `offset_param` (`rules.ts:25-35`). It needs to be generic: N = the row's own period. Missing `X[t-N]` gives `null`, which is the NO_SIGNAL the spec wants.
- **§2 NO_SIGNAL.** Missing data gives `null`, which is correct. "No row / tab off / indicator off" gives `false`; this has to become an explicit `no_signal` status in the evaluator result (Q4 covers the strategy-level effect).
- **§4 validation.**
  - Server messages today look like `"rsi Mua: Chu kỳ RSI phải trong khoảng 5–50."`, with path `indicators.rsi.buy.params.period` (`config.ts:77-131`).
  - Missing: the row number, the `options` check, and per-row fast<slow (today side-level `cross_fields`; the web fallback covers only macd and ma_cross, `draft.ts:135-138`).
  - Required formats (from the HTML): `"{Mua|Bán} · dòng {i}: {label} phải từ {min} đến {max}{, số nguyên}."`, `"… {label} chỉ chọn 5, 10, 20, 50, 100, 200."` and `"… dòng {i}: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm."`.
  - Mobile skips a disabled side (`indicator-card.tsx:40`). The spec wants both tabs checked.
  - Mobile also has an existing error-mapping bug: the server path `rsi.buy.params.period` never matches the client key `rsi.buy.period`.
  - On iOS, `decimal-pad` has no minus key, so negative thresholds (CCI, Williams, CMF, ROC) cannot be typed (`indicator-card.tsx:119`).
- **§5 no look-ahead.** Structurally satisfied. Every `calc` window is causal, and registry `offset ≤ 0` is enforced (`technical-registry.ts:41`). Practice preview slices to `firstTest` (`practice.service.ts:230-236`). Flashback only sends revealed bars. The Bot requires `bars.at(-1).date === tradingDate`. Missing: a Practice-level prefix-invariance test and a cross-product test for "signal false at T".
- **§5 warm-up risk (flag only).** At V3 maxima, a trend row needs ≥2N+1 bars: RSI or EMA trend at N=200 needs 401, and MACD 200/200 histogram needs ~400. Bot warmup is 400 (`bot.shared-config.ts:34`) and Backtest is 300 (`strategy-backtests.service.ts:84`), so extreme settings give permanent or early NO_SIGNAL. The spec says to keep warm-up handling unchanged, so this is acceptable, but warmup could be raised to ≥450 (Q6).
- **§6.1 migration.** Nothing exists yet. No migration ever rewrote configs; V2 relied on the read-time normaliser. Constraints:
  - Revisions are append-only, `backtest_runs` cascades on revision delete, and `config_hash` is a TS `sha256(canonicalJson)` (`hash.ts:21-32`). A pure-SQL migration therefore cannot write valid revisions, and UPDATE or DELETE of revisions is forbidden.
  - The latest migration is `0031_flashback_hardening.sql`, so the next is **0032**. Runner: `scripts/migrate.ts` (checksum-locked, one transaction, `RAISE NOTICE` for logging).
- **§6.2 pause.**
  - There is no per-user Bot pause. `bot_accounts.status IN ('active','suspended')` (`0001:307,317`) is never written as `suspended` anywhere. It makes `runSession` skip the account (`bot.service.ts:498`) and `runAccountSession` throw (`:543`).
  - No HTTP field exposes it. `BotConditions.state` has 5 values, with no "Tạm dừng" (web `bot/main/state.ts:7-21`, mobile `bot/labels.ts:5-11`).
  - Saving config never touches Bot tables.
  - No notifications exist on any Bot path, so "no notify" is satisfied by default.
- **§6.3 history.** Backtest runs and alert events are immutable and presented verbatim; succeeded practice runs are immutable by trigger. Gaps:
  - Renderers relabel stored evidence using the current registry by rule id (`evidence-table.tsx:26-39`), so old `r1/r2` rows will show wrong labels.
  - There is no Backtest re-run feature (grep `rerun|chạy lại` returns nothing).
  - Old-shape Practice runs in `computing`/`failed` status hold frozen config that a V3 `compute()` cannot read.
- **§6.1.5 reject legacy.** Today the code maps instead of rejecting (see 2.1). `isLegacyConfig` keys on `iqx-rules-2.0` only.

---

## 3. Design proposal

### 3.1 One definition source: registry v4

- Replace `backend/src/modules/quant/v2/registry/technical-registry.json`. Keep the file name and loader, and bump the constants:
  - `SCHEMA_VERSION='3.0'`, `RULE_VERSION='iqx-rules-4.0'`.
  - Keep `iqx-rules-3.0` (V2) and `iqx-rules-2.0` (35 indicators) as `HISTORICAL_RULE_VERSIONS`. They are used only to detect "outdated", never to map.
  - `CALCULATION_VERSION` is unchanged, because the formulas do not change.
- Each of the 15 entries gets `model:"rows"`. Example:

```json
{ "id":"rsi", "name":"RSI", "chapter":4, "lesson_id":"...", "model":"rows",
  "rows":[
   { "id":"rsi.level", "sentence":["RSI ",{"f":"period"}," ",{"f":"op"}," ",{"f":"threshold"}],
     "fields":{ "period":{"type":"integer","min":2,"max":200,"step":1,"label":"Chu kỳ RSI"},
                "op":{"type":"enum","options":[{"value":">","label":">"},{"value":"<","label":"<"}],"label":"Dấu so sánh"},
                "threshold":{"type":"integer","min":0,"max":100,"step":1,"label":"Ngưỡng RSI"} },
     "constraints":[], "default_enabled":true,
     "buy":{"period":14,"op":"<","threshold":30}, "sell":{"period":14,"op":">","threshold":70} },
   { "id":"rsi.trend", "sentence":["RSI ",{"f":"period"}," xu hướng ",{"f":"dir"}],
     "fields":{ "period":{...2-200...}, "dir":{"type":"enum","options":[{"value":"up","label":"lên"},{"value":"down","label":"xuống"}]} },
     "default_enabled":true, "buy":{"period":14,"dir":"up"}, "sell":{"period":14,"dir":"down"} } ] }
```

- Enum tokens are stable codes; labels live in the registry:
  - `op`: `> < cross_up cross_down`. For SMA/EMA/MA Cross rows the labels are "lên/xuống", with "cắt" in the sentence text.
  - `dir`: `up|down` for trend, MACD histogram and Bollinger price; `widen|narrow` for Bollinger width.
  - `action`: the six existing Bollinger tokens; `break_high|break_low` for OBV.
  - `band`: `upper|lower`.
  - Preset fields carry `"options":[5,10,20,50,100,200]`.
  - `constraints:[{"left":"fast","op":"<","right":"slow"}]` sits on sma.ma_cross, ema.ma_cross, ma_cross, and macd rows 1-3.
- The 27 row ids use repo indicator ids: `ma.price_cross, ma.ma_cross, ma.trend, ema.price_cross, ema.ma_cross, ema.trend, ma_cross.cross, rsi.level, rsi.trend, macd.signal, macd.zero, macd.hist, stochastic.level, stochastic.kd_cross, cci.cross, mfi.cross, roc.cross, williams_r.cross, bollinger.price_action, bollinger.price_dir, bollinger.width, donchian.break, dmi.di, dmi.adx, obv.sma, obv.breakout, cmf.cross`. Labels, ranges and defaults come verbatim from the HTML extraction table.
- `volume` keeps `model:"legacy_params"` with its current `fields/params/rules` (Q1).
- Stored document per indicator:

```ts
{ master_enabled: boolean,
  buy:  { enabled: boolean, rules: Array<{ id: RowId; enabled: boolean } & RowValues> },
  sell: { ... } }
```

  There is no `params` key. Rows must appear in registry order with every field present, and unknown keys or enum values are rejected. Practice reuses the same `SideRows` type: `{buy, sell, hold_max_sessions}`.

### 3.2 One evaluator (new folder `backend/src/modules/quant/v2/conditions/`)

- **`series-cache.ts`:** `createSeriesCache(bars)` memoises `calc(indicatorId, fullParams, bars)` keyed by `id + canonicalJson(params)`. Formulas in `indicators.ts` are reused unchanged. Each row supplies a full param set: for example, `macd.zero` passes `signal` from the row default, and `dmi.adx` reads `calc('dmi',{period:N}).adx`.
- **`evaluate.ts`:**
  - `evaluateRow(indicatorId, row, cache, i): RowEvaluation`, where `RowEvaluation = {id, result: Tri, missing, lhs, rhs, previous_lhs?, previous_rhs?, values: RowValues}`.
  - It is built from primitives extracted out of `rules.ts`: `compare`, `cross`, `trend(x, N)`, `delta1`, `bollingerAction`, `breakout`.
  - `evaluateIndicatorSide(id, side, cache, i): {status:'ok'|'no_signal', reason?: 'side_off'|'no_rows'|'indicator_off', result: Tri, rows: RowEvaluation[]}`. `no_signal` gives `result:null`.
- **`validate.ts`:** `validateSideRows(entry, sideKey, side)` returns `{path:'indicators.rsi.buy.rules.1.period', side, row:2, message:'Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.'}`. It checks:
  - type, integer, min/max, step;
  - `options`;
  - constraints;
  - enum membership and exact row ids/count;
  - both tabs, including disabled rows.
- **`defaults.ts`, `format.ts`:** `defaultSide(entry, side)`, `defaultConfigV4()`, `isCurrentFormat(doc)` (by `rule_version` plus a structural check).
- **Callers:**
  - `signals.ts` (`indicatorSideSignals`, `sideSignals`, `sideSignalsWithEvidence`) becomes a thin wrapper over `evaluateIndicatorSide`. `TracedRuleEvaluation` gains `values` (the per-row params), which replaces `indicator_params`.
  - `practice.engine.ts evaluateSide` and `practice.service.ts` preview call the same function. The duplicated `and3` loop is deleted.
  - `rules.ts evaluateRule` stays for `volume` and `advanced/logic.ts` trees only.
  - `config.ts validateConfig` calls `validateSideRows` for row entries.
- **Display mirror.** Web and mobile do not re-implement rules. They render the `sentence`, `fields` and messages from `GET /api/v2/strategy/registry/technical`, and the Practice `form` embeds the same `rows`. Client validation is a TS port of `validate.ts` that uses the same registry metadata. Message formats are pinned by tests on both sides against the same golden strings.

### 3.3 Reader and writer semantics

- `readStoredConfig`:
  - A current document is returned as is.
  - Any other document (`iqx-rules-3.0` V2, `iqx-rules-2.0`, unknown) gives `defaultConfigV4()`, keeping only booleans `master_enabled`, `buy.enabled`, `sell.enabled` for current ids. `volume` is copied verbatim if valid.
  - It sets `outdated:true`.
  - Delete `normalizeIndicatorSide`, `normalizeStoredIndicators` and `NEW_DEFAULT_PARAM_KEYS`. Retire the use of `mapLegacyConfig` on the read path.
- `save`: the merge base is the read above. The PATCH zod schema accepts only the v4 shape.
- `getRevision` on an outdated revision:
  - throws 422 `CONFIG_FORMAT_OUTDATED` for Backtest create and Alert source;
  - returns `outdated:true` to the Bot (pins, history).
- Bot `resolveConfig`: if the effective revision is outdated, block both sides with reason `config_outdated`. This is the safety net between code deploy and the data script.

### 3.4 Migration and pause

**SQL `backend/migrations/0032_indicator_conditions_v3.sql`** (DDL plus backups, idempotent):
- `CREATE TABLE IF NOT EXISTS backup_v3_shared_config_revisions (LIKE shared_config_revisions INCLUDING DEFAULTS, PRIMARY KEY (id))` + `INSERT … SELECT … ON CONFLICT (id) DO NOTHING`.
- The same pattern for `effective_config_sessions` (PK `(user_id, revision)`), for `practice_progress` (only `user_id, indicator_id, set_version, draft, draft_revision`), and for `strategy_alerts (id, enabled, paused_at)`.
- `CREATE TABLE IF NOT EXISTS bot_config_pauses (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, reason varchar(48) NOT NULL CHECK (reason = 'indicator_conditions_v3'), paused_at timestamptz NOT NULL DEFAULT now(), paused_revision int, resume_revision int, resumed_at timestamptz)`.
- Do not use `bot_accounts.status`. This keeps admin suspension distinct and needs no CHECK change.
- `RAISE NOTICE` with the backup row counts.

**TS script `backend/scripts/indicator-conditions-v3-migrate.ts`** (precedent: `shop-reward-backfill.ts`; dry-run by default, `--apply` plus `INDICATOR_V3_MIGRATION_APPROVED=true`):
- Take an advisory lock. Refuse to run if any `bot_run_receipts.status='running'` exists, or if the time is 18:30-19:40 ICT.
- For each user with revisions (skip if a row with `idempotency_key='indicator-conditions-v3'` already exists):
  - Read the latest row as raw JSON (not through the reader).
  - Build `defaultConfigV4()` with the switches preserved. Master ON with both sides OFF becomes master OFF, per the existing rule.
  - Run `validateConfig` without grants.
  - Insert `revision=max+1`, `before_hash=prev.config_hash`, `patch={"migration":"indicator-conditions-v3"}`, `actor_id=user_id`, `rule_version/schema_version` new, `config_hash=configHash(config)`.
  - Insert `effective_config_sessions` via `nextEffectiveSession(now, tradingDayPredicate)`.
- Pause: if `bot_accounts.status='active'`, a `bot_instances` row exists, and the pre-migration effective config has any indicator with `master_enabled && side.enabled && some rule enabled`, then `INSERT bot_config_pauses … ON CONFLICT DO NOTHING`. Otherwise the Bot is "đang tắt sẵn" and nothing is inserted.
- Practice: `UPDATE practice_progress SET draft=<v4 defaults keeping buy/sell.enabled + hold_max_sessions>, draft_revision=draft_revision+1 WHERE draft is not v4-shaped`. `practice_runs` are never touched.
- Alerts: per Q3.
- Logs: configs migrated / already migrated / bots paused / bots already off / drafts reset / alerts affected. A second run reports zero new rows.

**Bot gate** (`bot.service.ts`):
- In `runAccountSession` (or the `runSession` owner query at `:498`), skip the session with no receipt, NAV or decision rows, the same way `suspended` works today, when a pause row exists AND (`resume_revision IS NULL` OR the effective revision for the trading date `< resume_revision`).
- Positions and cash stay untouched, and nothing is sold. The Bot uses `same_session_close` fills, so there are no pending orders to handle.

**Resume:**
- In `SharedConfigService.save`, inside the same transaction: `UPDATE bot_config_pauses SET resume_revision=$rev, resumed_at=now() WHERE user_id=$1 AND resume_revision IS NULL`. This is a new store method; the module boundary stays SQL-only.
- The Bot restarts when that revision becomes effective, i.e. the next session.

**Display:**
- `conditionState` returns `paused` while the pause is unresolved.
- Web `STATE_LABEL.paused = "Tạm dừng"`, tone `muted`. Mobile `CONFIG_STATE_LABEL.paused = 'Tạm dừng'`, neutral, the same as the alerts styling.
- After Save, show the existing "Cấu hình chờ hiệu lực" chip.
- No notification code anywhere.

**Rollback:**
1. Redeploy the previous release.
2. Run `scripts/indicator-conditions-v3-rollback.ts`. For each user it appends a revision copying the `before_hash` source config (old code reads it) with idempotency key `indicator-conditions-v3-rollback`, restores `practice_progress` from the backup table, and deletes `bot_config_pauses`.
3. Final fallback: restore from the `pg_dump` taken by the deploy script (`backups/pre-v3-<ts>.dump`).
4. Never delete V3 revisions: the FK cascade would delete backtests run on them.

### 3.5 Work slices, file ownership and order

| Slice | Owns (only these files) | Depends on |
|---|---|---|
| **A. Definitions + engine** | `backend/src/modules/quant/v2/{types.ts,config.ts,signals.ts,rules.ts,technical-registry.ts,backtest.ts,legacy-config.ts}`, new `quant/v2/conditions/*`, `registry/technical-registry.json`; delete or regenerate `registry/shared-config.schema.json`; `advanced/{research.ts,system.ts,logic.ts}` (`ParamPath` gets `rule`); tests `test/unit/quant-v2-*.test.ts`, `fixtures/bot-registry-spec-16.json` (replace with `registry-v4.golden.json`), `test/fixtures/bot-v2/*` (retire the reference engine for the 15); new `test/unit/indicator-conditions-v3.test.ts` covering every §7.2 case plus one test per row of the 15 | none (critical path; freeze the exported types first) |
| **B. Strategy-config** | `backend/src/modules/strategy-config/*` (schemas, service reader/save/resume hook, repository incl. the `bot_config_pauses` UPDATE, ports `outdated` flag); tests `strategy-config.test.ts`, `test/system/strategy-config-http.system.spec.ts` | A |
| **C. Bot backend** | `backend/src/modules/bots/*` (`bot.service.ts` gate/conditionState/fallbackEvidence, `bot.shared-config.ts`, `bot.config-gate.ts`, `bot.types.ts`), `src/platform/openapi/enrich-openapi.ts` (BotConditions enum), tests `bots-*.test.ts`, `test/system/bot-*.system.spec.ts` | A; pause table contract from F |
| **D. Practice backend** | `backend/src/modules/practice/*` (types, config, schemas, labels, chart per-row series, service toConfig fix + draft guard + old-run handling, engine uses the shared evaluator, `PRACTICE_ENGINE_VERSION='practice-engine-2'`), tests `practice-*.test.ts` (+ prefix-invariance test) | A |
| **E. Backtest + Alerts backend** | `backend/src/modules/strategy-backtests/*` (paramPath, evidence, `ruleEvidenceSchema.op`, 422 mapping), `backend/src/modules/alerts/strategy-alerts.*` (per-row evidence, outdated handling); tests `strategy-backtests.test.ts`, `strategy-alerts-*.test.ts`, `runtime.strategy-alerts.test.ts` | A, B (port shape) |
| **F. Migration** | `backend/migrations/0032_indicator_conditions_v3.sql`, `backend/scripts/indicator-conditions-v3-{migrate,rollback}.ts`, `test/system/indicator-conditions-v3-migration.system.spec.ts` (pattern: `team-lead-conversion.system.spec.ts`; seed V2 + legacy revisions and active/suspended/idle bots, run twice, assert counts) | A (defaults, hash), B (reader), C (gate semantics) |
| **G. Flashback decouple** | `backend/src/modules/flashback/flashback.indicators.ts` (static frozen catalog); `test/unit/flashback.service.test.ts` must pass unchanged | none (can start now) |
| **H. Contracts** | `backend/contracts/*`, `frontend/contracts/*`, `frontend/src/lib/generated/*` (generated only) | B, C, D, E |
| **I. Web shared renderer + Bot/Backtest** | new `frontend/src/pages/demo-trading/bot/config/condition-rows.tsx` (sentence renderer: inline Input/select, per-row Switch, dimmed off rows, "{n}/{m} điều kiện được bật"), `bot/config/{types,draft,labels,summary,config-modal,master}.ts(x)`, `strategy/backtest/{config-dialog,conditions,results-model,sides}.ts(x)`, `strategy/shared/evidence-table.tsx` (version-aware labels: old `r1` rows show raw/stored labels), `strategy/alerts/signal-history.tsx`, `bot/main/{state.ts,condition-cards.tsx}`, `bot-panel.tsx` legacy banner text, delete `lib/shared-config.ts`, tests + `bot/test-support.ts`, `strategy/test-support.ts` | H |
| **J. Web Practice** | `frontend/src/pages/demo-trading/practice/*` (model, panel uses `condition-rows.tsx` read-only import, api, controller, chart-geometry per-row keys, dialogs, fixtures) | H, I (renderer API) |
| **K. Mobile** | `mobile/src/features/strategy/config/*` (types, model, indicator-card with tabs + per-row inputs + `numbers-and-punctuation` keyboard, library-screen re-key and post-PATCH cache merge fix), `alerts/{types.ts,event-sheet.tsx}`, `bot/{types.ts,labels.ts}`, `__tests__`, README | A wire shape, C (paused state) |

Order: **A and G** in parallel, then **B, C, D, E** in parallel, then **F**, then **H**, then **I and K** in parallel, then **J**.

### 3.6 Commands

**Backend** (`cd /Users/danhtrongit/Projects/IQX/backend`):
- `npm run typecheck && npm run lint`
- `npx vitest run test/unit/quant-v2-*.test.ts test/unit/indicator-conditions-v3.test.ts test/unit/strategy-config.test.ts test/unit/strategy-backtests.test.ts test/unit/strategy-alerts-*.test.ts test/unit/runtime.strategy-alerts.test.ts test/unit/bots-*.test.ts test/unit/practice-*.test.ts test/unit/flashback.service.test.ts test/unit/strategy-routes-openapi.test.ts test/unit/contract-manifest.test.ts`
- `npm test`
- `npm run test:system` (Docker)
- `npm run contracts:generate` then `npm run contracts:check`
- `npm run build`
- `npm run verify`

**Frontend** (`cd /Users/danhtrongit/Projects/IQX/frontend`; run git from the repo root, since `frontend/.git` is a stale nested repo):
- `npm run contracts:generate`
- `npm run typecheck && npm run lint`
- `npx vitest run src/pages/demo-trading/bot src/pages/strategy src/pages/demo-trading/practice src/pages/demo-trading/flashback`
- `npm run contracts:check && npm run build`

**Mobile** (`cd /Users/danhtrongit/Projects/IQX/mobile`):
- `npx tsc --noEmit && npx expo lint && npx jest`
- Baseline: `src/features/strategy/config` passes 6/6 at HEAD.

---

## 4. Open questions and risks (owner decisions)

1. **Volume.** Proposed default: keep `volume` in its old params+rules shape inside the same document, untouched by the migration; the form keeps its param grid for Volume only. The alternative is converting it to rows with identical defaults, which changes its form.
2. **What counts as "Bot đang chạy".** Proposed: `bot_accounts.status='active'` and the effective config has an active indicator side with an enabled rule. Idle (`waiting_for_conditions`) Bots are "đang tắt sẵn" and get no pause. Paused sessions write no receipt and no NAV row, the same as `suspended` today, which leaves a NAV gap. The alternative is to write a NAV-only "paused" row.
3. **Strategy alerts** are not in the spec. After V3, their pinned old configs turn into `config_error` silently. Options: (a) set `paused_at` silently, mirroring the Bot (proposed); (b) append a version pinned to the migrated revision; (c) leave them.
4. **NO_SIGNAL across indicators.** Today an active indicator with zero enabled rows is dropped from the AND by the Bot but makes the whole side false in Backtest and Alerts. Proposed: no_signal blocks the side (Backtest semantics) and the Bot is aligned to that. The alternative is a save-time rule forbidding master+side ON with zero enabled rows.
5. **Scope confirmations:**
   - The legacy 38-factor engine, `STRATEGY_TEMPLATES` and legacy market alerts are treated as out of scope (no client caller).
   - "Đặt lại" today resets one tab; the HTML resets the whole indicator. Proposed: keep the current behaviour (spec §0.2).
   - Decimal step multiples (0.1 / 0.01): the server enforces them today, the HTML does not. Proposed: keep enforcing.
6. **Risks:**
   - Warm-up at V3 maxima (2N+1 bars for trend rows vs Bot 400 / Backtest 300) gives permanent NO_SIGNAL at extreme settings.
   - Old-shape Practice runs in `computing`/`failed` status must be failed with a clear error, because the trigger freezes their config.
   - Deploy order: back up, deploy the code (the outdated-config gate blocks Bots), migrate 0032, run the script, all outside 18:30-19:40 ICT.
   - The possible current production hash-drift Bot block (correction 3) should be checked on the DB before deploy.

Key files:
- `/Users/danhtrongit/Projects/IQX/backend/src/modules/quant/v2/{types.ts,config.ts,signals.ts,rules.ts,indicators.ts}`
- `/Users/danhtrongit/Projects/IQX/backend/src/modules/quant/v2/registry/technical-registry.json`
- `/Users/danhtrongit/Projects/IQX/backend/src/modules/strategy-config/strategy-config.service.ts`
- `/Users/danhtrongit/Projects/IQX/backend/src/modules/bots/bot.service.ts`
- `/Users/danhtrongit/Projects/IQX/backend/src/modules/practice/{practice.engine.ts,practice.service.ts,practice.config.ts}`
- `/Users/danhtrongit/Projects/IQX/backend/src/modules/flashback/flashback.indicators.ts`
- `/Users/danhtrongit/Projects/IQX/frontend/src/pages/demo-trading/bot/config/config-modal.tsx`
- `/Users/danhtrongit/Projects/IQX/frontend/src/pages/strategy/backtest/config-dialog.tsx`
- `/Users/danhtrongit/Projects/IQX/frontend/src/pages/demo-trading/practice/practice-panel.tsx`
- `/Users/danhtrongit/Projects/IQX/mobile/src/features/strategy/config/indicator-card.tsx`