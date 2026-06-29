# Portfolio Manager — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the portfolio analysis report as an editorial modal launched from the "Danh mục" panel — porting `bao-cao-danh-muc-day-du.html` into themed React components driven by the backend's `{ analysis, narrative, meta }` JSON, behind a premium gate, with a client-side interactive stress-test.

**Architecture:** A new feature folder `dashboard/src/features/portfolio-manager/` following the established convention (`api.ts`/`hooks.ts`/`keys.ts`/`types.ts`/components/scoped CSS). It mirrors the in-production AI Insight feature (`features/stock/ai-insight/`): a `useMutation` lazy-fetch triggered once on modal open, a single orchestrator component that maps response fields onto section sub-components, and a scoped CSS file that remaps the app's Arco theme tokens (dark/light adaptive). Numbers/charts come from `analysis`; prose comes from `narrative`. Launched from a button in `WatchlistPanel`'s "Nắm giữ" tab inside an Arco `Modal` wrapped by `<PremiumGate>`.

**Tech Stack:** React 19, TypeScript, Arco Design (`Modal`, `Button`, `Spin`), Tailwind v4 utilities (no Preflight) + scoped CSS, TanStack Query v5 (`useMutation`), Ky HTTP client, Recharts ^3.8.0 (bars), hand-rolled SVG (correlation heatmap), Vitest + React Testing Library.

## Global Constraints

- **Numbers from `analysis`, prose from `narrative`.** Never compute financial figures in the frontend except the stress-test (`loss = d × beta`, which the spec assigns to the client). Format raw numbers with the shared `format.ts` helpers.
- **Vietnamese number format:** decimal **comma**, thousands **dot**, VND suffix `₫`; change/excess numbers carry an explicit `+`/`−` sign; "điểm %" for differences of two rates. (Spec §6.)
- **Theme-adaptive, CSP-safe:** scope all styles under `.portfolio-manager`; remap editorial tokens onto Arco `--color-*` vars (dark default + `body[arco-theme='light']` override), exactly like `aiInsight.css`. **No Google Fonts** — use the project font (`var(--font-sans)`, Tahoma) with a serif display stack for headings; embed nothing external.
- **API base** is `/api/v1` via the Ky `api` instance; call paths have **no leading slash**. The backend response is a plain FastAPI body `{analysis, narrative, meta}` (NOT the market-data `{data,meta}` envelope) — read it directly, do **not** call `unwrap`.
- **Premium gate** wraps the report (`<PremiumGate featureName="Phân tích danh mục" ...>`); the lazy `analyze()` runs on mount, so only mount the report when the modal is open.
- **Run tests:** `npm test` (= `vitest run`) or `npx vitest run <path>` from `dashboard/`.
- **Markup reference:** `bao-cao-danh-muc-day-du.html` is the exact layout/CSS spec. Port its structure + class styles; ignore its placeholder Vietnamese text (all copy comes from `narrative`).
- **⚠️ Dependency:** obtain the clean original `bao-cao-danh-muc-day-du.html` (the chat copy is encoding-mangled). Its CSS/structure is ASCII and faithful; only ignore the mangled body text.

## The shared API contract (PRODUCED by the backend plan; CONSUMED here)

`POST /api/v1/portfolio-manager/analyze` → `{ analysis: AnalysisJSON, narrative: NarrativeJSON | null, meta: { valid, cached, insufficient?, ... } }`. `analysis` may be `{ insufficient_data: true, reason }`. `AnalysisJSON` is the §8 shape (see Task 1); `NarrativeJSON` is the §9 shape.

## File Structure

`dashboard/src/features/portfolio-manager/`:
- `types.ts` — `AnalysisJSON`, `NarrativeJSON`, `AnalyzeResponse` interfaces.
- `keys.ts` — `portfolioManagerKeys`.
- `api.ts` — `portfolioManagerApi.analyze()`.
- `hooks.ts` — `useAnalyzePortfolio()` (mutation).
- `format.ts` — VN number/percent/VND/points formatters.
- `PortfolioReport.tsx` — orchestrator (loading/error/insufficient + section assembly).
- `components/` — `Masthead.tsx`, `HeroScore.tsx`, `ProgressCompare.tsx`, `HoldingsTable.tsx`, `StatGrid.tsx`, `AllocationBars.tsx`, `StressTest.tsx`, `CorrelationHeatmap.tsx`, `RevealInsight.tsx`, `Attribution.tsx`, `QualitySector.tsx`, `BehaviorLowData.tsx`, `HealthPillars.tsx`, `ActionsWatchClosing.tsx`.
- `portfolio-manager.css` — scoped editorial theme.
- `index.ts` — barrel (`export { PortfolioReport }`).

Modified: `dashboard/src/features/watchlist/WatchlistPanel.tsx` (launch button + modal).

---

### Task 0: Obtain the HTML markup reference (HARD GATE for Tasks 4–11)

The golden-fixture `bao-cao-danh-muc-day-du.html` arrived encoding-mangled and is not in the repo. Tasks 4 (CSS port) and 5–11 (component porting) depend on its faithful layout/CSS.

- [ ] **Step 1:** Obtain the clean original `bao-cao-danh-muc-day-du.html` from the user.
- [ ] **Step 2:** Save it for reference at `dashboard/docs/portfolio-manager-reference.html` (it is a design reference, not shipped code).
- [ ] **Step 3:** Confirm it opens in a browser and renders the warm editorial layout (masthead → hero → holdings → allocation → stress → heatmap → reveal → attribution → quality → behavior → pillars → actions → closing). Its CSS/structure is ASCII and faithful even where body text is mangled — use it for layout/classes; all copy comes from the `narrative` JSON.
- [ ] **Step 4: Commit**

```bash
git add dashboard/docs/portfolio-manager-reference.html
git commit -m "docs(portfolio-manager): commit clean HTML layout reference"
```

(Tasks 1–3 — types/format/api — have no dependency on the HTML and may proceed in parallel with obtaining it.)

---

### Task 1: Types + barrel

**Files:**
- Create: `dashboard/src/features/portfolio-manager/types.ts`
- Create: `dashboard/src/features/portfolio-manager/index.ts`
- Test: `dashboard/src/features/portfolio-manager/types.test.ts` (type-only compile check via a tiny fixture)

**Interfaces:**
- Produces TS interfaces mirroring the backend §8/§9 contract. Key shapes below.

- [ ] **Step 1: Write the failing test** (a fixture typed as the contract; fails to compile until types exist)

```ts
// dashboard/src/features/portfolio-manager/types.test.ts
import { describe, it, expect } from "vitest"
import type { AnalysisJSON, NarrativeJSON } from "./types"

const analysis: AnalysisJSON = {
  meta: { portfolio_id: "A-0412", date: "2026-06-23", mode: "full_changed", period: "kỳ 3", period_number: 3 },
  overview: { nav: 534000000, cash_pct: 0.092, n_positions: 7, total_return: 0.107, total_pnl: 52000000,
    holding_months: 7, positions: [{ ticker: "HPG", sector: "Thép", weight: 0.16, pnl: 38000000, low_confidence: false }] },
  performance: { portfolio_return: 0.107, benchmark_return: 0.072, excess_return: 0.035, max_drawdown: -0.09, method: "simple_inception" },
  allocation: [{ sector: "Ngân hàng", weight: 0.344, benchmark: 0.38, active: -0.036 }],
  concentration: { top1: 0.187, top3: 0.504, effective_n: 5.8, largest_sector: 0.344 },
  risk: { beta: 1.25, volatility: 0.21, tracking_error: 0.08, correlation: [{ a: "TCB", b: "MBB", value: 0.82 }], excluded: [{ ticker: "APG", reason: "low_liquidity_short_history" }] },
  attribution: [{ ticker: "HPG", pnl: 38000000, pct: 0.63 }],
  quality: { pe: 11.4, pb: 1.6, roe: 0.18, dividend: 0.02, sector_benchmark: null },
  behavior: { avg_holding_days: 48, losing_count: 3, disposition_flag: true, worst_loser: { ticker: "VND", pnl_pct: -0.15, periods_held: 3 } },
  scores: { overall: 3.5, prev_overall: 3.2, pillars: { performance: 4, risk: 3, diversification: 3, quality: 4, discipline: 2 } },
  selected_insights: [{ id: "sector_tilt", data: { sector: "Thép", ratio: 3.2, weight: 0.16 } }],
  progress: { prev_actions: [{ id: "trim_hpg", done: true, detail: "giảm 25%→16%" }] },
}

const narrative: NarrativeJSON = {
  title: "x", verdict: "y", lede: "z", progress_text: "",
  layers: { overview: "", performance: "", allocation: "", stress: "", risk: "", attribution: "", quality: "", behavior: "" },
  insight: { label: "l", text: "t" }, low_data_note: "",
  actions: [{ title: "a", detail: "Đưa tiền mặt lên 15,0%." }], watch: "w", closing: "c",
}

describe("contract types", () => {
  it("accepts the sample shapes", () => {
    expect(analysis.scores.overall).toBe(3.5)
    expect(narrative.actions[0].detail).toContain("15,0%")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/portfolio-manager/types.test.ts`
Expected: FAIL (cannot find module "./types")

- [ ] **Step 3: Implement `types.ts` + `index.ts`**

```ts
// dashboard/src/features/portfolio-manager/types.ts
export interface PositionRow { ticker: string; sector: string; weight: number; pnl: number; low_confidence: boolean }
export interface AllocationRow { sector: string; weight: number; benchmark: number | null; active: number | null }
export interface CorrelationPair { a: string; b: string; value: number }
export interface ExcludedTicker { ticker: string; reason: string }
export interface AttributionRow { ticker: string; pnl: number; pct: number | null }
export interface WorstLoser { ticker: string; pnl_pct: number | null; periods_held: number }
export interface PrevAction { id: string; done: boolean; detail: string }

export interface AnalysisJSON {
  insufficient_data?: boolean
  reason?: string
  meta: { portfolio_id: string; date: string; mode: "first" | "full_changed" | "light_unchanged"; period: string; period_number: number }
  overview: { nav: number; cash_pct: number; n_positions: number; total_return: number; total_pnl: number; holding_months: number; positions: PositionRow[] }
  performance: { portfolio_return: number; benchmark_return: number; excess_return: number; max_drawdown: number; method: string }
  allocation: AllocationRow[]
  concentration: { top1: number; top3: number; effective_n: number; largest_sector: number }
  risk: { beta: number; volatility: number; tracking_error: number; correlation: CorrelationPair[]; excluded: ExcludedTicker[] }
  attribution: AttributionRow[]
  quality: { pe: number | null; pb: number | null; roe: number | null; dividend: number | null; sector_benchmark: { sector: string; your_return: number; industry_return: number; gap: number } | null }
  behavior: { avg_holding_days: number; losing_count: number; disposition_flag: boolean; worst_loser: WorstLoser | null }
  scores: { overall: number; prev_overall: number | null; pillars: { performance: number; risk: number; diversification: number; quality: number; discipline: number } }
  selected_insights: { id: string; data: Record<string, unknown> }[]
  progress: { prev_actions: PrevAction[] }
}

export interface NarrativeJSON {
  // Backend validator guarantees title/verdict/lede/layers(all 8)/actions/watch/closing.
  // progress_text is "" on the first report; insight/low_data_note may be absent/empty.
  title: string; verdict: string; lede: string; progress_text: string
  layers: { overview: string; performance: string; allocation: string; stress: string; risk: string; attribution: string; quality: string; behavior: string }
  insight?: { label: string; text: string }
  low_data_note?: string
  actions: { title: string; detail: string }[]
  watch: string; closing: string
}

export interface AnalyzeResponse {
  // NOTE: this top-level meta is the generator's meta, NOT analysis.meta.
  // period_number lives in analysis.meta.period_number — read it from there.
  analysis: AnalysisJSON
  narrative: NarrativeJSON | null
  meta: { valid: boolean; cached: boolean; insufficient?: boolean; model?: string }
}
```

```ts
// dashboard/src/features/portfolio-manager/index.ts
export { PortfolioReport } from "./PortfolioReport"
```
(The `index.ts` export will fail to resolve until Task 12 creates `PortfolioReport.tsx`; create `index.ts` now with the export line — Vitest only compiles `types.test.ts` here, which doesn't import the barrel.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/portfolio-manager/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/portfolio-manager/types.ts src/features/portfolio-manager/index.ts src/features/portfolio-manager/types.test.ts
git commit -m "feat(portfolio-manager): API contract types"
```

---

### Task 2: Formatting helpers (`format.ts`)

**Files:**
- Create: `dashboard/src/features/portfolio-manager/format.ts`
- Test: `dashboard/src/features/portfolio-manager/format.test.ts`

**Interfaces:**
- Produces (all pure):
  - `pct(n: number, digits = 1) -> string` — `0.107 → "10,7%"` (no sign).
  - `signedPct(n, digits = 1) -> string` — `0.107 → "+10,7%"`, `-0.09 → "−9,0%"` (real minus `−`).
  - `points(n, digits = 1) -> string` — `0.035 → "+3,5 điểm %"`.
  - `vnd(n) -> string` — `534000000 → "534.000.000 ₫"`.
  - `vndShort(n) -> string` — `38000000 → "+38tr"`, `-7000000 → "−7tr"` (millions, sign).
  - `num(n, digits = 2) -> string` — `1.25 → "1,25"` (plain number, comma decimal).
  - `score(n) -> string` — `3.5 → "3,5"`.

- [ ] **Step 1: Write the failing test**

```ts
// dashboard/src/features/portfolio-manager/format.test.ts
import { describe, it, expect } from "vitest"
import { pct, signedPct, points, vnd, vndShort, num, score } from "./format"

describe("format", () => {
  it("pct uses comma decimal, no sign", () => { expect(pct(0.107)).toBe("10,7%") })
  it("signedPct adds + and real minus", () => {
    expect(signedPct(0.107)).toBe("+10,7%")
    expect(signedPct(-0.09)).toBe("−9,0%")
  })
  it("points formats difference of rates", () => { expect(points(0.035)).toBe("+3,5 điểm %") })
  it("vnd groups thousands with dots", () => { expect(vnd(534000000)).toBe("534.000.000 ₫") })
  it("vndShort renders millions with sign", () => {
    expect(vndShort(38000000)).toBe("+38tr")
    expect(vndShort(-7000000)).toBe("−7tr")
  })
  it("num uses comma decimal", () => { expect(num(1.25)).toBe("1,25") })
  it("score 1dp", () => { expect(score(3.5)).toBe("3,5") })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/portfolio-manager/format.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement**

```ts
// dashboard/src/features/portfolio-manager/format.ts
const MINUS = "−" // U+2212

function comma(n: number, digits: number): string {
  return n.toFixed(digits).replace(".", ",")
}

export function pct(n: number, digits = 1): string {
  return `${comma(n * 100, digits)}%`
}

export function signedPct(n: number, digits = 1): string {
  const v = n * 100
  const sign = v >= 0 ? "+" : MINUS
  return `${sign}${comma(Math.abs(v), digits)}%`
}

export function points(n: number, digits = 1): string {
  const v = n * 100
  const sign = v >= 0 ? "+" : MINUS
  return `${sign}${comma(Math.abs(v), digits)} điểm %`
}

export function vnd(n: number): string {
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`
}

export function vndShort(n: number): string {
  const sign = n >= 0 ? "+" : MINUS
  const millions = Math.round(Math.abs(n) / 1_000_000)
  return `${sign}${millions}tr`
}

export function num(n: number, digits = 2): string {
  return comma(n, digits)
}

export function score(n: number): string {
  return comma(n, 1)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/portfolio-manager/format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/portfolio-manager/format.ts src/features/portfolio-manager/format.test.ts
git commit -m "feat(portfolio-manager): VN number formatting helpers"
```

---

### Task 3: API + keys + hook

**Files:**
- Create: `dashboard/src/features/portfolio-manager/keys.ts`
- Create: `dashboard/src/features/portfolio-manager/api.ts`
- Create: `dashboard/src/features/portfolio-manager/hooks.ts`
- Test: `dashboard/src/features/portfolio-manager/api.test.ts`

**Interfaces:**
- Consumes: `api` from `@/shared/http/client`.
- Produces:
  - `portfolioManagerKeys = { all: ["portfolio-manager"], analyze: ["portfolio-manager","analyze"] }`.
  - `portfolioManagerApi.analyze(): Promise<AnalyzeResponse>` — `api.post("portfolio-manager/analyze", { timeout: 120_000 }).json<AnalyzeResponse>()`. No body (acts on current user via auth). No `unwrap`.
  - `useAnalyzePortfolio()` → `{ report, analyze, analyzeAsync, isPending, isError, error, reset }` (hand-built like `useStockAiInsight`).

- [ ] **Step 1: Write the failing test** (mock the `api` module)

```ts
// dashboard/src/features/portfolio-manager/api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const post = vi.fn()
vi.mock("@/shared/http/client", () => ({ api: { post: (...a: unknown[]) => post(...a) } }))

import { portfolioManagerApi } from "./api"

describe("portfolioManagerApi.analyze", () => {
  beforeEach(() => post.mockReset())
  it("POSTs to portfolio-manager/analyze with a long timeout and returns the body", async () => {
    const body = { analysis: { meta: {} }, narrative: { title: "x" }, meta: { valid: true, cached: false } }
    post.mockReturnValue({ json: () => Promise.resolve(body) })
    const res = await portfolioManagerApi.analyze()
    expect(post).toHaveBeenCalledWith("portfolio-manager/analyze", { timeout: 120_000 })
    expect(res).toEqual(body)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/portfolio-manager/api.test.ts`
Expected: FAIL (cannot find module ./api)

- [ ] **Step 3: Implement keys/api/hooks**

```ts
// dashboard/src/features/portfolio-manager/keys.ts
export const portfolioManagerKeys = {
  all: ["portfolio-manager"] as const,
  analyze: ["portfolio-manager", "analyze"] as const,
} as const
```

```ts
// dashboard/src/features/portfolio-manager/api.ts
import { api } from "@/shared/http/client"
import type { AnalyzeResponse } from "./types"

export const portfolioManagerApi = {
  analyze: async (): Promise<AnalyzeResponse> => {
    return api.post("portfolio-manager/analyze", { timeout: 120_000 }).json<AnalyzeResponse>()
  },
}
```

```ts
// dashboard/src/features/portfolio-manager/hooks.ts
import { useMutation } from "@tanstack/react-query"
import { portfolioManagerApi } from "./api"
import { portfolioManagerKeys } from "./keys"
import type { AnalyzeResponse } from "./types"

export function useAnalyzePortfolio() {
  const mutation = useMutation<AnalyzeResponse, Error>({
    mutationKey: portfolioManagerKeys.analyze,
    mutationFn: () => portfolioManagerApi.analyze(),
  })
  return {
    report: mutation.data ?? null,
    analyze: mutation.mutate,
    analyzeAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/portfolio-manager/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/portfolio-manager/keys.ts src/features/portfolio-manager/api.ts src/features/portfolio-manager/hooks.ts src/features/portfolio-manager/api.test.ts
git commit -m "feat(portfolio-manager): api client + analyze mutation hook"
```

---

### Task 4: Scoped editorial theme (`portfolio-manager.css`)

**Files:**
- Create: `dashboard/src/features/portfolio-manager/portfolio-manager.css`

**Interfaces:**
- Produces a stylesheet scoped under `.portfolio-manager` that (a) declares editorial tokens remapped onto Arco `--color-*` vars (dark default), (b) overrides warm "paper" surface + gold accent under `body[arco-theme='light'] .portfolio-manager`, (c) styles every class used by the components (ported from `bao-cao-danh-muc-day-du.html`).

- [ ] **Step 1: Create the file — token block first (mirror `aiInsight.css`)**

```css
/* dashboard/src/features/portfolio-manager/portfolio-manager.css */
.portfolio-manager {
  --paper: var(--color-bg-2);
  --card: var(--color-bg-1);
  --ink: var(--color-text-1);
  --ink-2: var(--color-text-2);
  --ink-3: var(--color-text-3);
  --line: var(--color-border-1);
  --line-2: var(--color-border-2);
  --saffron: #d4a574;
  --saffron-deep: #c8923f;
  --up: var(--color-up);
  --up-soft: color-mix(in srgb, var(--color-up) 14%, transparent);
  --down: var(--color-down);
  --down-soft: color-mix(in srgb, var(--color-down) 14%, transparent);
  --neutral: var(--color-text-3);
  --serif: Georgia, "Times New Roman", var(--font-sans, "Tahoma"), serif;

  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-sans, "Tahoma"), sans-serif;
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

body[arco-theme='light'] .portfolio-manager {
  --paper: #f6f2eb;          /* warm paper, light mode only */
  --card: #fffdf8;
  --ink: #1f1c17;
  --ink-2: #544e44;
  --ink-3: #8a8276;
  --line: #e6e0d4;
  --line-2: #d6cdbd;
  --saffron-deep: #b8860b;
}

.pm-mono { font-family: "JetBrains Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.pm-serif { font-family: var(--serif); }
.pm-pos { color: var(--up); }
.pm-neg { color: var(--down); }
```

- [ ] **Step 2: Port the section styles**

Port the remaining rules from `bao-cao-danh-muc-day-du.html` `<style>` for these blocks, renaming the bare selectors to `.portfolio-manager <selector>` (keep class names): `.head/.title/.sub`, `.hero/.hero-score/.hero-verdict`, `.lede`, `.layer/h2.sec/.lno`, `.fig`, `.mgr`, `.compare`, `table.hold`, `.stat-grid/.stat`, `.wbar`, `.stress` (+ `.seg`, `.stress-num`, `.stress-bar`), `.heat`, `.sig-call`, `.reveal`, `.attr`, `.sectorbench`, `.chips`, `.health/.dots/.dot5`, `.actions/.action`, `.watch`, `.closing`, `.signoff`, `.foot`. Replace the reference's hardcoded hex colors with the token vars declared in Step 1 (e.g. `background:var(--card)`, `color:var(--ink-2)`). Drop the `@import` of Google Fonts entirely. Keep the `@media(max-width:600px)` responsive block, scoped.

- [ ] **Step 3: Verify it compiles (imported by a component later)** — no test here; visual verification happens in Task 13. Run a typecheck/build to ensure no CSS import errors:

Run: `npx vitest run src/features/portfolio-manager/format.test.ts` (sanity that the project still builds)
Expected: PASS (CSS not yet imported anywhere; this just confirms nothing broke)

- [ ] **Step 4: Commit**

```bash
git add src/features/portfolio-manager/portfolio-manager.css
git commit -m "feat(portfolio-manager): scoped editorial theme (theme-adaptive, no external fonts)"
```

---

### Tasks 5–11: Section components (port HTML → React)

Each task: create one component file under `components/`, port the matching HTML section's markup + classes, map the typed `analysis`/`narrative` fields, format numbers via `format.ts`, and add a focused render test from a fixture. All components take typed props (slices of `AnalysisJSON`/`NarrativeJSON`) — no data fetching inside.

**Shared fixture** for component tests — create once at `dashboard/src/features/portfolio-manager/__fixtures__/sample.ts` exporting `sampleAnalysis: AnalysisJSON` and `sampleNarrative: NarrativeJSON` (copy the objects from Task 1's `types.test.ts`, expanded to 7 positions to match the reference). Each component test imports the slice it needs.

- [ ] **Task 5 — Masthead + HeroScore + ProgressCompare**
  - Files: `components/Masthead.tsx` (title from `narrative.title`, sub-line from `analysis.meta` + `overview.nav` via `vnd`, date from `meta.date`), `components/HeroScore.tsx` (`scores.overall` via `score`, trend `scores.prev_overall → overall`, `verdict` from `narrative.verdict`), `components/ProgressCompare.tsx` (rendered only when `meta.mode !== "first"`; uses `narrative.progress_text` + `progress.prev_actions` done/open). Port `.head/.title/.sub`, `.hero/.hero-score/.hero-verdict`, `.lede`, `.compare`.
  - Test `components/Masthead.test.tsx`: render with `sampleNarrative`/`sampleAnalysis`, assert title text + score "3,5" appear.
  - Commit: `feat(portfolio-manager): masthead, hero score, progress-compare`

- [ ] **Task 6 — HoldingsTable + StatGrid**
  - Files: `components/HoldingsTable.tsx` (maps `overview.positions` → `table.hold` rows: ticker, sector, `pct(weight)`, `vndShort(pnl)` with pos/neg class, `low_confidence` → "mới · ít dữ liệu" flag; cash row from `1 - Σweight` or `overview.cash_pct`), `components/StatGrid.tsx` (reusable 4-cell grid; used for overview stats `total_return`/`cash_pct`/`n_positions`/`holding_months` and performance stats). Port `table.hold`, `.stat-grid/.stat`, `.flag`, `.mgr` (manager-voice inline = `narrative.layers.overview`).
  - Test `components/HoldingsTable.test.tsx`: assert 7 ticker rows + a cash row render; HPG weight shows "16,0%".
  - Commit: `feat(portfolio-manager): holdings table + stat grid`

- [ ] **Task 7 — Performance stats + AllocationBars**
  - Files: reuse `StatGrid` for performance (`portfolio_return`/`benchmark_return` via `pct`, `excess_return` via `points`, `max_drawdown` via `signedPct`); `components/AllocationBars.tsx` (maps `allocation[]` → `.wbar` rows: label=sector, fill width=`weight` scaled, benchmark marker at `benchmark` when non-null — **omit the marker entirely when `benchmark === null`**, `pct(weight)` label). Manager voice = `narrative.layers.performance` / `narrative.layers.allocation`. Port `.wbar/.track/.fill/.bench/.legend`.
  - Test `components/AllocationBars.test.tsx`: row with `benchmark: null` renders no `.bench` element; row with benchmark renders one.
  - Commit: `feat(portfolio-manager): performance stats + allocation bars`

- [ ] **Task 8 — StressTest (interactive, client-side)**
  - File: `components/StressTest.tsx`. Port the `.stress` block AND the reference `<script>` logic as React state: three buttons `d ∈ {5,10,15}`; on select compute `loss = d × analysis.risk.beta`, `vnd = analysis.overview.nav × loss/100`; render `signedPct(-loss/100)`, `vnd(-vndAmount)`, bar width `min(loss*4,100)%`, and a scenario sentence. Manager voice = `narrative.layers.stress`. Default selection `d=10` (matches reference).
  - Test `components/StressTest.test.tsx`: render with `risk.beta=1.25`, `nav=534000000`; default shows "−12,5%"; click the "−5,0%" button → shows "−6,3%" (5×1.25=6.25). Use `@testing-library/user-event`.
  - Commit: `feat(portfolio-manager): interactive client-side stress test`

- [ ] **Task 9 — CorrelationHeatmap + RevealInsight**
  - Files: `components/CorrelationHeatmap.tsx` (build an N×N grid from `risk.correlation[]` for the top holdings by weight, diagonal=1,0; color cells by value via a saffron→red scale; `num(value)` labels; the high-pair call-out uses the max pair), `components/RevealInsight.tsx` (label `narrative.insight.label`, text `narrative.insight.text`; render only when text non-empty). Port `.heat/.cell/.self`, `.sig-call/.badge`, `.reveal`.
  - Test `components/CorrelationHeatmap.test.tsx`: assert the "0,82" badge renders for the TCB–MBB pair.
  - Commit: `feat(portfolio-manager): correlation heatmap + reveal insight`

- [ ] **Task 10 — Attribution + QualitySector + BehaviorLowData**
  - Files: `components/Attribution.tsx` (maps `attribution[]` → `.attr` rows, positive fills left / negative fills right, `vndShort(pnl)`; manager voice `narrative.layers.attribution`); `components/QualitySector.tsx` (`.chips` from `quality.pe/pb/roe/dividend` via `num`/`pct`; `.sectorbench` only when `quality.sector_benchmark !== null`; manager voice `narrative.layers.quality`); `components/BehaviorLowData.tsx` (`.stat-grid` from `behavior` fields; `.lowdata` from `narrative.low_data_note` rendered only when non-empty; manager voice `narrative.layers.behavior`). Port `.attr`, `.chips`, `.sectorbench`, `.lowdata`.
  - Test `components/QualitySector.test.tsx`: `sector_benchmark: null` → no `.sectorbench`; non-null → renders gap.
  - Commit: `feat(portfolio-manager): attribution, quality+sector, behavior+low-data`

- [ ] **Task 11 — HealthPillars + ActionsWatchClosing**
  - Files: `components/HealthPillars.tsx` (maps `scores.pillars` → `.health` table rows with `.dots` filled to the pillar score, low scores get `.lo`; the "một dòng" column can use short fixed labels per pillar); `components/ActionsWatchClosing.tsx` (`narrative.actions[]` → numbered `.action` rows with title+detail; `.watch` from `narrative.watch`; `.closing` from `narrative.closing`; `.signoff` static; `.foot` static disclaimer). Port `.health/.dots/.dot5`, `.actions/.action`, `.watch`, `.closing`, `.signoff`, `.foot`.
  - Test `components/ActionsWatchClosing.test.tsx`: render 3 actions; assert each action detail text appears and closing renders.
  - Commit: `feat(portfolio-manager): health pillars + actions/watch/closing`

---

### Task 12: `PortfolioReport.tsx` orchestrator

**Files:**
- Create: `dashboard/src/features/portfolio-manager/PortfolioReport.tsx`
- Test: `dashboard/src/features/portfolio-manager/PortfolioReport.test.tsx`

**Interfaces:**
- Consumes: `useAnalyzePortfolio` (Task 3), all section components (Tasks 5–11), `portfolio-manager.css`.
- Produces: `PortfolioReport({ injected }: { injected?: AnalyzeResponse })`. Mirrors `AiInsightBriefing`:
  - `useEffect(() => { if (!injected) analyze() }, [])` — one-shot on mount.
  - Loading: `<LoadingState />` (Spin + "AI đang phân tích danh mục của bạn…" + shimmer) while pending/pre-first.
  - Error: alert "Không thể tải phân tích — vui lòng thử lại sau."
  - Insufficient: when `report.analysis.insufficient_data`, render a friendly empty state with `analysis.reason` (no sections).
  - Success: `<div className="portfolio-manager">` assembling the section components in reference order, passing the typed slices of `analysis`/`narrative`.

- [ ] **Step 1: Write the failing test** (inject a full fixture; assert key sections render; assert insufficient state)

```tsx
// dashboard/src/features/portfolio-manager/PortfolioReport.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PortfolioReport } from "./PortfolioReport"
import { sampleAnalysis, sampleNarrative } from "./__fixtures__/sample"

describe("PortfolioReport", () => {
  it("renders the report from injected data", () => {
    render(<PortfolioReport injected={{ analysis: sampleAnalysis, narrative: sampleNarrative, meta: { valid: true, cached: false } }} />)
    expect(screen.getByText(sampleNarrative.title)).toBeInTheDocument()
    expect(screen.getByText("3,5")).toBeInTheDocument()           // hero score
    expect(screen.getByText(/Ngân hàng/)).toBeInTheDocument()      // allocation
  })

  it("renders insufficient-data state", () => {
    render(<PortfolioReport injected={{ analysis: { insufficient_data: true, reason: "Chưa đủ dữ liệu." } as never, narrative: null, meta: { valid: false, cached: false, insufficient: true } }} />)
    expect(screen.getByText("Chưa đủ dữ liệu.")).toBeInTheDocument()
    expect(screen.queryByText("3,5")).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/portfolio-manager/PortfolioReport.test.tsx`
Expected: FAIL (cannot find module ./PortfolioReport)

- [ ] **Step 3: Implement `PortfolioReport.tsx`**

Build the orchestrator: import `"./portfolio-manager.css"`, the hook, and all section components. Handle `injected ?? report` source; the four states (loading/error/insufficient/success); assemble sections in order (Masthead → HeroScore → Lede → ProgressCompare → HoldingsTable+StatGrid → PerfStats → AllocationBars → StressTest → CorrelationHeatmap+RevealInsight → Attribution → QualitySector → BehaviorLowData → HealthPillars → ActionsWatchClosing). Pass `narrative.layers.<section>` strings to each section's manager-voice slot. Reference `AiInsightBriefing.tsx` for the exact loading/error gating idiom.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/portfolio-manager/PortfolioReport.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the whole feature's tests**

Run: `npx vitest run src/features/portfolio-manager`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/portfolio-manager/PortfolioReport.tsx src/features/portfolio-manager/__fixtures__/sample.ts src/features/portfolio-manager/PortfolioReport.test.tsx
git commit -m "feat(portfolio-manager): report orchestrator + states"
```

---

### Task 13: Launch from the "Danh mục" panel (modal + premium gate)

To keep the launch unit-testable in isolation (mounting the full `WatchlistPanel` needs many providers), extract a small self-contained `PortfolioAnalysisButton` component (button + modal + gate) and wire it into `HoldingsTab`.

**Files:**
- Create: `dashboard/src/features/portfolio-manager/PortfolioAnalysisButton.tsx`
- Test: `dashboard/src/features/portfolio-manager/PortfolioAnalysisButton.test.tsx`
- Modify: `dashboard/src/features/watchlist/WatchlistPanel.tsx` (render `<PortfolioAnalysisButton />` in `HoldingsTab`)
- Modify: `dashboard/src/features/portfolio-manager/index.ts` (export `PortfolioAnalysisButton`)

**Interfaces:**
- Produces: `PortfolioAnalysisButton()` — a "Phân tích danh mục" Arco `<Button type="primary" size="small">` that toggles a local `reportOpen` state and renders an Arco `Modal` (`footer={null}`, `title={null}`, `style={{ width: "min(760px, 96vw)", top: 20 }}`, `autoFocus={false}`) with an inner scroll `<div style={{ maxHeight: "86vh", overflowY: "auto" }}>` wrapping `<PremiumGate featureName="Phân tích danh mục" description="Báo cáo phân tích danh mục theo giọng người quản lý quỹ." onAuthRequested={() => setReportOpen(false)}><PortfolioReport /></PremiumGate>`. The modal mounts `PortfolioReport` only when `reportOpen` (so the one-shot `analyze()` fires on open). The button alone (closed modal) renders without TanStack Query, so it unit-tests with no provider wrapper.

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/features/portfolio-manager/PortfolioAnalysisButton.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PortfolioAnalysisButton } from "./PortfolioAnalysisButton"

describe("PortfolioAnalysisButton", () => {
  it("renders the launch button (modal closed → no providers needed)", () => {
    render(<PortfolioAnalysisButton />)
    expect(screen.getByRole("button", { name: /Phân tích danh mục/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/portfolio-manager/PortfolioAnalysisButton.test.tsx`
Expected: FAIL (cannot find module ./PortfolioAnalysisButton)

- [ ] **Step 3: Implement the button + wire it in**

Create `PortfolioAnalysisButton.tsx` per the Interfaces block (`useState` + Arco `Modal`/`Button` + `PremiumGate` from `@/features/premium` + `PortfolioReport` from `./PortfolioReport`; icon e.g. `IconFile`). Export it from `index.ts`. Then in `WatchlistPanel.tsx`'s `HoldingsTab`, render `<PortfolioAnalysisButton />` near the account-summary block. Because the button renders the modal lazily (and mounts `PortfolioReport` only when open), the closed-state test needs no `QueryClientProvider`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/portfolio-manager/PortfolioAnalysisButton.test.tsx`
Expected: PASS

- [ ] **Step 5: Verify the build + full feature suite**

Run: `npx vitest run src/features/portfolio-manager`
Expected: all PASS
Run: `npm run build` (or `npx tsc --noEmit` if a typecheck script exists)
Expected: builds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/portfolio-manager/PortfolioAnalysisButton.tsx src/features/portfolio-manager/PortfolioAnalysisButton.test.tsx src/features/portfolio-manager/index.ts src/features/watchlist/WatchlistPanel.tsx
git commit -m "feat(portfolio-manager): launch report modal from Danh mục panel (premium-gated)"
```

---

### Task 14: Manual visual verification (light + dark)

**Files:** none (manual).

- [ ] **Step 1:** Run the dashboard (`npm run dev` in `dashboard/`), log in as the premium test user (memory [IQX local backend]), open the "Danh mục" sidebar → "Nắm giữ" → "Phân tích danh mục".
- [ ] **Step 2:** Confirm against `bao-cao-danh-muc-day-du.html`: masthead, hero score, holdings table, allocation bars, **interactive stress-test** (toggle −5/−10/−15% and watch the number + bar update), correlation heatmap, reveal insight, attribution, quality+sector, behavior+low-data, health pillars, actions, watch, closing.
- [ ] **Step 3:** Toggle theme (Arco light/dark) — confirm the report stays legible in both (warm paper in light, dark surfaces + gold accent in dark), no external-font flashes, no horizontal overflow on mobile width.
- [ ] **Step 4:** Confirm the day-cache: close and re-open the modal → the second open returns instantly (`meta.cached`), no second LLM spinner delay.

---

## Frontend plan — done

The "Danh mục → Phân tích danh mục" modal renders the full editorial report from the backend's `{analysis, narrative}` contract, premium-gated, theme-adaptive, with a client-side stress-test — matching `bao-cao-danh-muc-day-du.html`.
