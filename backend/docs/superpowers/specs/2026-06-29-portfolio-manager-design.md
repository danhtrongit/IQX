# Portfolio Manager ("Người quản lý danh mục") — Integration Design

- **Date:** 2026-06-29
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Canonical product spec:** `IQX-Danh-Muc-Spec.md` (v1.0) — provided by user; this document does **not** restate it, only maps it onto IQX.
- **LLM system prompt:** `IQX-Danh-Muc-SystemPrompt.md` (v1.0) — used verbatim as the `system` message.
- **Design reference (golden fixture):** `bao-cao-danh-muc-day-du.html` — full static template with sample data.

This is an **integration design**: it records how the provided product spec is realized inside the existing IQX codebase, the decisions locked during brainstorming, and the data-reality gaps that require deliberate handling.

---

## 1. Decisions locked (brainstorming)

| Decision | Choice |
|---|---|
| Delivery scope | **Full vertical slice** at v1 depth — all 8 quant layers, 5-pillar score, data-confidence gate, DeepSeek narrative, day-cache, cross-period snapshot, full editorial frontend |
| Presentation | **Modal** launched from the virtual-trading panel (mirrors AI Insight UX) — not a dedicated route |
| Trigger / cache | **On-demand + day-cache** by `(account_id, trading_date)`. A "kỳ" = each generated report; "previous period" = the user's last saved snapshot |
| Performance method | **Simple since-inception return** (TWR deferred) |
| Insight library | **6 starter templates** (full 10+ library deferred) |
| Deferred (explicitly out of scope) | TWR, Brinson attribution, remaining 4 insight templates, any per-user scheduled generation |

---

## 2. Architecture — reuse the production two-tier pattern

The spec's §0 two-tier split (deterministic quant tier + AI interpretation tier) maps 1:1 onto the **existing** market-analysis pipeline (`app/services/ai/market_analysis/`). We mirror it.

```
POST /portfolio-manager/analyze            (auth + premium gate, acts on current user)
  → resolve user's VirtualTradingAccount
  → day-cache lookup (account_id, trading_date)
        hit  → return stored report
        miss → continue
  ── QUANT TIER (deterministic, no AI) ──────────────────────────────
  → inputs.load()              holdings, cash, trades, OHLCV, fundamentals,
                               VN-Index, sector weights, previous snapshot
  → data_confidence per ticker → excluded_from_risk flags
  → layers 01–08               → Analysis JSON sections (§8 contract)
  → scoring                    → 5 pillars + overall
  → insights                   → selected_insights (≤2, ≥1 positive when eligible)
  → mode resolution            first | full_changed | light_unchanged
  ── INTERP TIER (AI) ───────────────────────────────────────────────
  → chat_completion(SYSTEM_PROMPT, Analysis JSON as user msg, temp=0.5)
  → parse JSON (strip fences) → QA validator (§10) → retry ≤3 with error list
  ── PERSIST ─────────────────────────────────────────────────────────
  → store report + snapshot fields (drives next period's "So với kỳ trước")
  → return { analysis_json, narrative_json, meta }
```

**Golden rule enforcement:** every number rendered comes from the Analysis JSON. The LLM may only restate numbers present in its input. This is enforced by the QA validator (§7 below), exactly as the market-analysis `validate_output` enforces its 12 rules.

LLM plumbing already exists: `app/services/ai/proxy_client.py::chat_completion(system_prompt, user_content, temperature) → (text, model)` → DeepSeek v4 via `AI_PROXY_*` env vars. No new client.

---

## 3. Backend module layout

New package `app/services/ai/portfolio_manager/`, structured like its market-analysis sibling:

| File | Responsibility (spec ref) |
|---|---|
| `__init__.py` | package exports |
| `config.py` | §12 constants: `RISK_LOOKBACK_DAYS=120`, `DATA_CONF_MIN_HISTORY=120`, `DATA_CONF_MIN_AVG_VALUE_VND=2e9`, `SECTOR_BENCH_THRESHOLD=0.25`, `CHANGED_WEIGHT_THRESHOLD=0.03`, `HIDDEN_CORR_MIN=0.75`, `PROFIT_CONCENTRATION_MIN=0.60`, `SECTOR_TILT_RATIO_MIN=3.0`, `CASH_DRY_MAX=0.05`, `LLM_TEMPERATURE=0.5`, `ANNUALIZE_FACTOR=252` |
| `inputs.py` | Load & shape all §1 inputs (see §4) into an internal `PortfolioInputs` dataclass |
| `data_confidence.py` | §4 per-ticker gate → returns confidence + reason; feeds `excluded_from_risk` |
| `layers.py` | §2 layers 01–08, each a pure function `input → dict` (one Analysis JSON section each) |
| `scoring.py` | §3 five-pillar scoring + `overall_score` (rounded to 1 decimal). **Note:** an unrelated `app/services/ai/scoring.py` already exists — this is a *package-local* module, no collision |
| `insights.py` | §5 template library + severity scoring + selection (≤2, prefer ≥1 positive). **6 starter templates:** `hidden_corr`, `profit_concentration`, `sector_tilt`, `holding_losers`, `cash_dry`, `healthy_focus` (positive). Built to accept the remaining 4 (`fake_cheap`, `momentum_fade`, `beta_win`, `over_fragmented`) later without refactor |
| `analysis.py` | Orchestrates quant tier → assembles **Analysis JSON (§8 contract)** including `mode` |
| `prompts.py` | `SYSTEM_PROMPT` (from `IQX-Danh-Muc-SystemPrompt.md`, verbatim) + `build_user_prompt(analysis_json)` |
| `validator.py` | §10 QA asserts on Narrative JSON → `list[str]` of errors |
| `generator.py` | Full pipeline (structural clone of `market_analysis/generator.py`): analysis → LLM → parse → validate → retry → return result dict; persists snapshot when `db` provided |

### Why this split
Each module has one purpose, a typed interface, and is independently testable. `layers.py` functions are pure (data in, dict out) so the quant engine can be TDD'd against the golden fixture without DB or network.

---

## 4. Inputs — mapping the spec's §1 onto IQX data

`inputs.py` produces a single `PortfolioInputs` object from these sources:

| Spec input | IQX source | Notes |
|---|---|---|
| §1.1 holdings + cash | `VirtualTradingAccount` (`cash_available_vnd`), `VirtualPosition` (`symbol`, `quantity_total`, `avg_cost_vnd`) | one account per user |
| §1.2 transaction history | `VirtualTrade` (`symbol`, `side`, `quantity`, `price_vnd`, `traded_at`, fees) | drives behavior, holding days, inception date |
| §1.3 daily OHLCV per symbol | `vietcap.fetch_ohlcv(symbol, ...interval="1D")` | ≥120 sessions target; powers risk/corr/beta |
| §1.4 VN-Index series | `vietcap_market_overview.fetch_market_index()` | benchmark for performance + beta |
| §1.4 sector indices | derived index (cap-weighted mean of sector members) | only when a sector index isn't directly available |
| §1.5 fundamentals | VCI normalized fields (`pe`, `pb`, `roe`, `dividend_yield`, sector) | for Layer 07 |
| §1.6 VN-Index sector weights | `fetch_sectors_allocation()` (ICB) | for Layer 03 active weight |
| §1.7 previous snapshot | `PortfolioReport` row (prev `session_date`) | for progress / mode |

### Data-gap resolutions (the real risk surface)

These are deliberate decisions, approved in brainstorming:

1. **No `current_price` on positions** → use the **latest daily close** from `fetch_ohlcv`. Keeps the report deterministic and consistent with the day-cache (one report per EOD close).
2. **No `sector` on positions** → derive per symbol from VCI/symbol metadata (ICB). **Taxonomy risk:** the portfolio sector labels must match the VN-Index sector-weight labels for Layer 03. Build a normalization map; if a sector cannot be matched, **drop it from the active-weight comparison** rather than display a wrong number.
3. **VN-Index sector weights unavailable** → Layer 03 degrades to "your allocation" only (no benchmark marker), never fabricates a benchmark.
4. **Performance window** → simple since-inception: from earliest `VirtualTrade.traded_at` to `as_of`; benchmark = VN-Index over the same window. Record `"method":"simple_inception"` in the Analysis JSON.
5. **Tiny/empty portfolio** → fewer than 2 positions, or no trade history ⇒ return a graceful `insufficient_data` state (Vietnamese "chưa đủ dữ liệu để phân tích"), no LLM call, no broken charts.

---

## 5. Persistence

New model `app/models/portfolio_report.py` (+ Alembic migration following the existing async convention):

```
PortfolioReport (UUIDMixin, TimestampMixin)
  account_id          FK virtual_trading_accounts (CASCADE), indexed
  session_date        Date          # trading date the report is keyed to
  period_number       Integer       # "kỳ N" — count of prior reports + 1
  mode                String(20)    # first | full_changed | light_unchanged
  analysis_json       JSON          # full §8 Analysis JSON
  narrative_json      JSON          # full §9 Narrative JSON
  scores              JSON          # {overall, pillars{...}} — denormalized for fast prev lookup
  recommended_actions JSON          # [{id, text, status}] — for cross-period progress
  watch_conditions    JSON          # [{id, desc}]
  holdings_snapshot   JSON          # {ticker: weight} — for §7 holdings_changed()
  model_used          String(50)
  generation_time_ms  Integer
  valid               Boolean
  UNIQUE(account_id, session_date)
```

Day-cache = a row existing for `(account_id, today_trading_date)`. Weekend/holiday → folds onto the most recent trading session's row (same rule as the spec §7 and the market calendar already in the codebase).

`mode` resolution (spec §7): no previous row → `first`; `holdings_changed(cur, prev)` true → `full_changed`; else `light_unchanged`. `holdings_changed` = ticker set differs **or** any weight moved > `CHANGED_WEIGHT_THRESHOLD` (3 pts).

Cross-period progress: on generation, compare the previous row's `recommended_actions` against the current holdings to mark each `done`/`open`, and feed that into the Analysis JSON `progress` block for the LLM.

---

## 6. API

New router `app/api/v1/endpoints/portfolio_manager.py`, registered under `/api/v1`:

- `POST /portfolio-manager/analyze` — auth required, premium-gated dependency. Resolves the current user's account, runs the day-cache-or-generate flow, returns `{ analysis, narrative, meta }`. Long timeout (LLM).
- `GET /portfolio-manager/report` *(optional convenience)* — returns the latest cached report for the current user without triggering generation; 404 if none.

Premium gate uses the existing subscription dependency (same one guarding other premium endpoints).

---

## 7. AI tier — prompt & QA validation

- **System prompt:** `IQX-Danh-Muc-SystemPrompt.md` content, verbatim, as the `system` message.
- **User message:** the Analysis JSON (§8) wrapped per the prompt's INPUT convention.
- **Temperature:** 0.5 (spec §11), JSON output forced.
- **Parse:** reuse the fence-stripping `_parse_json` approach from the market-analysis generator.

`validator.py` enforces the spec §10 QA checklist on the Narrative JSON (errors fed back on retry, ≤3 attempts):

1. Exactly one "ghi nhận tốt → nói thẳng" mirror pair present.
2. ≥1 labeled insight when `selected_insights` non-empty; the fixed fallback sentence when empty.
3. ≤3 `actions`, **each `detail` contains a number/threshold** (regex check).
4. `progress_text` present when `mode != "first"`, empty when `first`.
5. `closing` ends on a direction/positive note (no terminal worry).
6. No "khuyến nghị mua/bán"; no "chắc chắn tăng/giảm".
7. Decimal-comma formatting where numbers appear ("13,0%" not "13.0%").
8. `low_data_note` present iff `risk.excluded` non-empty.

---

## 8. Frontend — modal, mirrors AI Insight

New feature `src/features/portfolio-manager/`:

```
index.ts            barrel
api.ts              portfolioManagerApi.analyze()  (Ky client, unwrap)
hooks.ts            useAnalyzePortfolio()  (useMutation — lazy, like AI Insight)
keys.ts             portfolioManagerKeys
types.ts            AnalysisJSON + NarrativeJSON TS shapes (match §8/§9)
PortfolioReport.tsx report assembler (analysis + narrative → sections)
components/         Masthead, HeroScore, Lede, ProgressCompare, HoldingsTable,
                    PerfStats, AllocationBars, StressTest, CorrelationHeatmap,
                    RevealInsight, Attribution, Quality+SectorBench,
                    Behavior+LowData, HealthPillars, Actions, Watch, Closing, Signoff
portfolio-manager.css   warm "paper" editorial theme, scoped, dark/light aware
```

- **Launch:** button in the virtual-trading panel → Arco `Modal` → `<PremiumGate featureName="Phân tích danh mục">` → `<PortfolioReport>`. Lazy `analyze()` mutation on open; spinner + shimmer while pending; graceful `insufficient_data` and error states.
- **Port the HTML reference** section-for-section. Charts: allocation bars, attribution bars, correlation heatmap (hand-rolled SVG), health-pillar dots — built with the codebase's existing approach (Recharts where it fits, SVG for the heatmap).
- **Stress-test stays client-side** (`expected_loss_pct = d × beta`, `expected_loss_vnd = nav × pct/100`) — ported from the reference `<script>`. No server round-trip.
- **Font adaptation:** the reference loads 3 Google Fonts; the codebase deliberately dropped Google Fonts for AI Insight in favor of the project font + theme tokens. **Match that convention** (project font, dark/light theme tokens, CSP-safe). The warm "paper" palette is preserved via scoped CSS variables, theme-adaptive like `aiInsight.css`.

---

## 9. Test strategy (TDD)

The HTML reference is a **golden fixture** — the sample portfolio (HPG/TCB/MBB/FPT/DGC/VND/APG) has known expected outputs (weights, overall 3,5, beta 1,25, TCB–MBB corr 0,82, HPG attribution ~63%, allocation bars, etc.).

- **Quant engine** (`layers.py`, `scoring.py`, `data_confidence.py`, `insights.py`): TDD against those expected values, layer by layer, with a synthetic OHLCV/holdings fixture reproducing the sample.
- **Generator/validator**: test the §10 QA asserts with a stubbed `chat_completion` — both passing narrative and deliberately-broken narratives (missing number in action, "khuyến nghị", "." decimals) to prove the validator + retry loop.
- **API**: integration test of cache-hit vs generate, premium gate, `insufficient_data`.
- **Frontend**: render `<PortfolioReport>` from a fixture analysis+narrative JSON; assert sections + stress-test interaction.

---

## 10. Implementation order (suggested for the plan)

1. `config.py` + `inputs.py` (+ data-source adapters) — get real data shaped.
2. `data_confidence.py`, `layers.py`, `scoring.py`, `insights.py` — TDD against golden fixture → Analysis JSON.
3. DB model + migration; `analysis.py` mode/snapshot logic.
4. `prompts.py`, `validator.py`, `generator.py` — wire DeepSeek + QA loop.
5. API route + premium gate + day-cache.
6. Frontend feature: types → api/hooks → `PortfolioReport` + components + CSS → modal launch + PremiumGate.
7. End-to-end verification against a seeded paper portfolio.

---

## 11. Open risks / things to watch

- **Sector taxonomy match** (portfolio ICB vs VN-Index sector-weight buckets) — highest-risk integration point; degrade rather than fabricate.
- **OHLCV depth** for newly-listed/thin tickers — the §4 confidence gate is the guard; verify it excludes correctly.
- **`fetch_sectors_allocation()` shape** — confirm it returns VN-Index-level sector weights, not just a single stock's classification.
- **Account resolution** — confirm one virtual account per user (UniqueConstraint suggests yes).
