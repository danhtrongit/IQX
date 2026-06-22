# Cấu Trúc Phiên Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Cấu trúc phiên" chart section in the IQX market modal, comprising a Breadth Chart (5-row bar chart) and a Contribution Chart (diverging bar chart), wired to live data from `useDailyMarketAnalysis().charts`.

**Architecture:** Two pure presentational components (`BreadthChart`, `ContributionChart`) in a new `daily/charts/` subdirectory receive typed props; a thin `ChartCard`/`TierLabel` helper handles shared card shell and section heading. The modal's `ModalBody` reads `charts` from `useDailyMarketAnalysis()` and renders the section between `MarketTakeaway` and the modal's bottom edge, guarded with `charts &&`.

**Tech Stack:** React 18, TypeScript, Tailwind v4 (utility classes only, no preflight conflict), Arco Design (Skeleton only), Vitest + Testing Library, no SVG (pure CSS div bars per terminal reference).

## Global Constraints

- Branch: `feat/market-charts-v14` (must be checked out before any work)
- Build command: `cd /Users/danhtrongit/Projects/IQX/dashboard && npm run build` — must pass with 0 errors
- Test command: `cd /Users/danhtrongit/Projects/IQX/dashboard && npm test` — must pass with 0 failures
- All new files live under `src/features/market-overview/daily/charts/`
- Token mapping (project tokens → terminal tokens):
  - Ceiling color: `#15824F` (hardcoded hex, as in MarketTakeaway.tsx)
  - Up color: `#10b981` = `var(--color-up)` (see article.css `--am-up`)  
  - Flat color: `var(--color-text-4)` (Arco token, maps to terminal `--text-4`)
  - Down color: `#ef4444` = `var(--color-down)` (see article.css `--am-down`)
  - Floor color: `#b0303d` (hardcoded hex, terminal `--down-deep`)
  - Card background: `var(--color-bg-2)` (maps to terminal `--surface-0`)
  - Bar background: `var(--color-fill-2)` (maps to terminal `--surface-2`)
  - Border: `var(--color-border-2)` (maps to terminal `--border`)
  - Text primary: `var(--color-text-1)` (maps to terminal `--text-1`)
  - Text secondary: `var(--color-text-2)` (maps to terminal `--text-2`)
  - Accent: `rgb(var(--primary-6))` (maps to terminal `--accent`, purple bar)
- No external fonts referenced (project uses system font stack via `--font-sans`)
- No SVG — all charts are CSS div-based (matches terminal exactly)
- Vietnamese strings are literal UTF-8, not escaped
- `sanitizeInline` is NOT needed here — all data is numbers/strings, not HTML
- Commit message format: `feat(market): <description>` with Co-Authored-By trailer

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/features/market-overview/daily/types.ts` | Add `MarketCharts` interface + `charts?` field to `DailyAnalysis` |
| Create | `src/features/market-overview/daily/charts/TierLabel.tsx` | "CẤU TRÚC PHIÊN" heading with left accent bar |
| Create | `src/features/market-overview/daily/charts/ChartCard.tsx` | Card shell (border, bg, title accent) used by both charts |
| Create | `src/features/market-overview/daily/charts/BreadthChart.tsx` | 5-row bar chart (Độ rộng thị trường HOSE) |
| Create | `src/features/market-overview/daily/charts/ContributionChart.tsx` | Diverging bar chart (Top mã đóng góp ±) |
| Create | `src/features/market-overview/daily/charts/BreadthChart.test.tsx` | Vitest render tests for BreadthChart |
| Modify | `src/features/market-overview/daily/MarketOverviewModal.tsx` | Wire section after MarketTakeaway |

---

### Task 1: Add `MarketCharts` type + `charts?` to `DailyAnalysis`

**Files:**
- Modify: `src/features/market-overview/daily/types.ts`

**Interfaces:**
- Produces: `MarketCharts`, `DailyAnalysis.charts` — used by Tasks 2–5

- [ ] **Step 1: Open the types file and read it**

  File: `/Users/danhtrongit/Projects/IQX/dashboard/src/features/market-overview/daily/types.ts`

  Current content (for reference):
  ```ts
  export type Direction = "up" | "down" | "flat" | "anomaly"

  export interface DailyAnalysis {
    id: string
    session_date: string
    // ... (existing fields)
    unexplained: string | null
  }
  ```

- [ ] **Step 2: Write the updated types.ts**

  Replace the entire file with:

  ```ts
  // ─── Daily market analysis types (v1.4 contract) ────────

  export type Direction = "up" | "down" | "flat" | "anomaly"

  // ─── Chart data shapes (v1.5 addition) ──────────────────

  export interface TickerValue {
    ticker: string
    value: number
  }

  export interface TickerPoints {
    ticker: string
    points: number
  }

  export interface MarketCharts {
    breadth: {
      ceiling: number
      up: number
      flat: number
      down: number
      floor: number
      ratio_up_down: string
      classification: string
      pct_above_ma20: number
    }
    contribution: {
      top_negative: TickerPoints[]   // points already signed (negative)
      top_positive: TickerPoints[]   // points already signed (positive)
    }
    foreign_detail: {
      total_buy_vnd_billion: number
      total_sell_vnd_billion: number
      streak: {
        count: number
        direction: "buy" | "sell" | "mixed"
        last_5d_cumulative: number
      }
      last_12_sessions: number[]
      top_sell: TickerValue[]
      top_buy: TickerValue[]
    }
    prop_detail: {
      total_buy_vnd_billion: number
      total_sell_vnd_billion: number
      net_vnd_billion: number
      last_12_sessions: number[]
      top_buy: (TickerValue & { anomaly?: boolean })[]
      top_sell: TickerValue[]
    }
    market_health_detail: {
      pct_above_ma20: number
      pct_above_ma20_change: number
      pct_above_ma50: number
      pct_above_ma200: number
      trend_20d: number[]
      callout: {
        type: "positive" | "negative" | "neutral"
        text: string
      }
    }
    sector_rotation: {
      sectors_today: { name: string; pct: number }[]
    }
  }

  // ─── Main analysis shape ─────────────────────────────────

  export interface DailyAnalysis {
    id: string
    session_date: string
    session_type: string
    session_type_display: string | null
    headline: string
    tagline: {
      direction: Direction
      marker: string
      text: string
    }
    paragraphs: {
      structure: string
      smart_money: string
      market_health: string
      historical_pattern?: string | null
    }
    scenarios: {
      direction: "up" | "down"
      condition_html: string
      outcome_html: string
    }[]
    watchlist: {
      ticker: string
      alert: boolean
      reason_html: string
    }[]
    unexplained: string | null
    charts?: MarketCharts
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: 0 errors (or only pre-existing errors unrelated to types.ts).

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard
  git add src/features/market-overview/daily/types.ts
  git commit -m "$(cat <<'EOF'
  feat(market): add MarketCharts type + charts? to DailyAnalysis (v1.5)

  Covers breadth, contribution, foreign_detail, prop_detail,
  market_health_detail, sector_rotation for future chart tasks.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 2: Create `TierLabel` and `ChartCard` shared helpers

**Files:**
- Create: `src/features/market-overview/daily/charts/TierLabel.tsx`
- Create: `src/features/market-overview/daily/charts/ChartCard.tsx`

**Interfaces:**
- Produces:
  - `TierLabel` — `({ label }: { label: string }) => JSX.Element`
  - `ChartCard` — `({ title, children }: { title: string; children: React.ReactNode }) => JSX.Element`
- Consumed by: Tasks 3, 4, 5

- [ ] **Step 1: Create `TierLabel.tsx`**

  Create file `/Users/danhtrongit/Projects/IQX/dashboard/src/features/market-overview/daily/charts/TierLabel.tsx`:

  ```tsx
  // ─── TierLabel ─────────────────────────────────────────────────────────────
  // Section heading with left accent bar, matching terminal `.tier-label`.
  // Usage: <TierLabel label="Cấu trúc phiên" />

  interface TierLabelProps {
    label: string
  }

  export function TierLabel({ label }: TierLabelProps) {
    return (
      <div className="flex items-center gap-3 mt-8 mb-4">
        {/* Accent bar — 4 px wide, 24 px tall, purple */}
        <span
          aria-hidden
          style={{
            width: 4,
            height: 24,
            background: "rgb(var(--primary-6))",
            borderRadius: 2,
            flexShrink: 0,
            display: "inline-block",
          }}
        />
        <span
          className="font-bold text-[var(--color-text-1)] tracking-tight"
          style={{ fontSize: 18, letterSpacing: "-0.02em" }}
        >
          {label}
        </span>
      </div>
    )
  }
  ```

- [ ] **Step 2: Create `ChartCard.tsx`**

  Create file `/Users/danhtrongit/Projects/IQX/dashboard/src/features/market-overview/daily/charts/ChartCard.tsx`:

  ```tsx
  // ─── ChartCard ─────────────────────────────────────────────────────────────
  // Card shell matching terminal `.card` + `.card-head` + `.card-body`.
  // Usage: <ChartCard title="Độ rộng thị trường HOSE">...</ChartCard>

  import type { ReactNode } from "react"

  interface ChartCardProps {
    title: string
    children: ReactNode
  }

  export function ChartCard({ title, children }: ChartCardProps) {
    return (
      <div
        className="flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border-2)]"
        style={{ background: "var(--color-bg-2)" }}
      >
        {/* Card header */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border-1)]"
        >
          {/* Title accent bar — 3 px wide, 16 px tall, purple */}
          <span
            aria-hidden
            style={{
              width: 3,
              height: 16,
              background: "rgb(var(--primary-6))",
              borderRadius: 1,
              flexShrink: 0,
              display: "inline-block",
            }}
          />
          <span
            className="font-bold text-[var(--color-text-1)] text-[13px]"
            style={{ letterSpacing: "-0.01em" }}
          >
            {title}
          </span>
        </div>

        {/* Card body */}
        <div className="p-4 flex-1">
          {children}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: 0 errors.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard
  git add src/features/market-overview/daily/charts/
  git commit -m "$(cat <<'EOF'
  feat(market): add TierLabel + ChartCard shared helpers for chart section

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 3: Build `BreadthChart` component + tests

**Files:**
- Create: `src/features/market-overview/daily/charts/BreadthChart.tsx`
- Create: `src/features/market-overview/daily/charts/BreadthChart.test.tsx`

**Interfaces:**
- Consumes: `MarketCharts["breadth"]` from Task 1; `ChartCard` from Task 2
- Produces: `BreadthChart` — `({ data }: { data: MarketCharts["breadth"] }) => JSX.Element`

**Visual spec (from terminal HTML):**
- 5 rows: Tăng trần / Tăng / Đứng giá / Giảm / Giảm sàn
- Each row: `[label with dot] [bar-bg > bar-fill] [count]`
- Grid columns: `100px 1fr 50px` with 10px gap
- Bar width = `(count / total) * 100` as a % (where total = sum of all 5)
- Color dots + bar fills: ceiling=`#15824F`, up=`#10b981`, flat=`var(--color-text-4)`, down=`#ef4444`, floor=`#b0303d`
- Count text colors: ceiling/up → `#10b981`, flat → `var(--color-text-2)`, down/floor → `#ef4444`
- Below rows: 3-stat summary (Tỷ lệ T/G, Phân loại, % > MA20), separated by top border
- "Phân loại" value always `var(--color-text-2)` at `font-size: 11px`; "Tỷ lệ T/G" and "% > MA20" colored down=red if ratio starts with "1 :" or pct < 50

- [ ] **Step 1: Write the failing test first**

  Create file `/Users/danhtrongit/Projects/IQX/dashboard/src/features/market-overview/daily/charts/BreadthChart.test.tsx`:

  ```tsx
  import React from "react"
  import { describe, it, expect } from "vitest"
  import { render, screen } from "@testing-library/react"
  import { BreadthChart } from "./BreadthChart"
  import type { MarketCharts } from "../types"

  const fixture: MarketCharts["breadth"] = {
    ceiling: 18,
    up: 81,
    flat: 62,
    down: 203,
    floor: 23,
    ratio_up_down: "1 : 2,5",
    classification: "Phân hóa tiêu cực",
    pct_above_ma20: 36.5,
  }

  describe("BreadthChart", () => {
    it("renders all 5 row labels", () => {
      render(<BreadthChart data={fixture} />)
      expect(screen.getByText("Tăng trần")).toBeInTheDocument()
      expect(screen.getByText("Tăng")).toBeInTheDocument()
      expect(screen.getByText("Đứng giá")).toBeInTheDocument()
      expect(screen.getByText("Giảm")).toBeInTheDocument()
      expect(screen.getByText("Giảm sàn")).toBeInTheDocument()
    })

    it("renders all 5 counts", () => {
      const { container } = render(<BreadthChart data={fixture} />)
      expect(container.textContent).toContain("18")
      expect(container.textContent).toContain("81")
      expect(container.textContent).toContain("62")
      expect(container.textContent).toContain("203")
      expect(container.textContent).toContain("23")
    })

    it("renders the 3 summary stats", () => {
      render(<BreadthChart data={fixture} />)
      expect(screen.getByText(/Tỷ lệ T\/G/i)).toBeInTheDocument()
      expect(screen.getByText(/Phân loại/i)).toBeInTheDocument()
      expect(screen.getByText(/%\s*>\s*MA20/i)).toBeInTheDocument()
    })

    it("renders ratio_up_down value", () => {
      const { container } = render(<BreadthChart data={fixture} />)
      expect(container.textContent).toContain("1 : 2,5")
    })

    it("renders classification value", () => {
      const { container } = render(<BreadthChart data={fixture} />)
      expect(container.textContent).toContain("Phân hóa tiêu cực")
    })

    it("renders pct_above_ma20 formatted", () => {
      const { container } = render(<BreadthChart data={fixture} />)
      expect(container.textContent).toContain("36,5%")
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails (BreadthChart not found)**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard && npx vitest run src/features/market-overview/daily/charts/BreadthChart.test.tsx 2>&1 | tail -20
  ```

  Expected: FAIL — `Cannot find module './BreadthChart'`

- [ ] **Step 3: Create `BreadthChart.tsx`**

  Create file `/Users/danhtrongit/Projects/IQX/dashboard/src/features/market-overview/daily/charts/BreadthChart.tsx`:

  ```tsx
  // ─── BreadthChart ──────────────────────────────────────────────────────────
  // "Độ rộng thị trường HOSE" — 5-row horizontal bar chart.
  // Mirrors terminal's `.breadth-rows` + `.breadth-summary` layout.
  // Pure presentational — no hook inside.

  import type { MarketCharts } from "../types"
  import { ChartCard } from "./ChartCard"

  // ── Color config ──────────────────────────────────────────────────────────

  const ROWS = [
    {
      key: "ceiling" as const,
      label: "Tăng trần",
      dotColor: "#15824F",
      barColor: "#15824F",
      countColor: "#10b981",
    },
    {
      key: "up" as const,
      label: "Tăng",
      dotColor: "#10b981",
      barColor: "#10b981",
      countColor: "#10b981",
    },
    {
      key: "flat" as const,
      label: "Đứng giá",
      dotColor: "var(--color-text-4)",
      barColor: "var(--color-text-4)",
      countColor: "var(--color-text-2)",
    },
    {
      key: "down" as const,
      label: "Giảm",
      dotColor: "#ef4444",
      barColor: "#ef4444",
      countColor: "#ef4444",
    },
    {
      key: "floor" as const,
      label: "Giảm sàn",
      dotColor: "#b0303d",
      barColor: "#b0303d",
      countColor: "#ef4444",
    },
  ] as const

  // ── Props ─────────────────────────────────────────────────────────────────

  interface BreadthChartProps {
    data: MarketCharts["breadth"]
  }

  // ── Component ─────────────────────────────────────────────────────────────

  export function BreadthChart({ data }: BreadthChartProps) {
    const total = data.ceiling + data.up + data.flat + data.down + data.floor
    const pctAboveMa20Colored = data.pct_above_ma20 < 50 ? "#ef4444" : "#10b981"
    const ratioColored = data.ratio_up_down.startsWith("1 :") ? "#ef4444" : "#10b981"

    return (
      <ChartCard title="Độ rộng thị trường HOSE">
        {/* 5 rows */}
        <div className="flex flex-col mb-3.5" style={{ gap: 10 }}>
          {ROWS.map((row) => {
            const count = data[row.key]
            const widthPct = total > 0 ? (count / total) * 100 : 0
            return (
              <div
                key={row.key}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "100px 1fr 50px",
                  gap: 10,
                  fontSize: 11.5,
                }}
              >
                {/* Label + dot */}
                <div
                  className="flex items-center"
                  style={{ gap: 6, color: "var(--color-text-2)" }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: row.dotColor,
                      flexShrink: 0,
                      display: "inline-block",
                    }}
                  />
                  <span>{row.label}</span>
                </div>

                {/* Bar track + fill */}
                <div
                  style={{
                    height: 16,
                    background: "var(--color-fill-2)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${widthPct}%`,
                      height: "100%",
                      background: row.barColor,
                      borderRadius: 3,
                    }}
                  />
                </div>

                {/* Count */}
                <div
                  className="text-right font-bold font-mono"
                  style={{ color: row.countColor, fontVariantNumeric: "tabular-nums" }}
                >
                  {count}
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary stats */}
        <div
          className="grid pt-3 border-t border-[var(--color-border-1)]"
          style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}
        >
          {/* Tỷ lệ T/G */}
          <div>
            <div
              className="uppercase font-bold mb-1"
              style={{
                fontSize: 9,
                letterSpacing: "0.06em",
                color: "var(--color-text-2)",
              }}
            >
              Tỷ lệ T/G
            </div>
            <div
              className="font-mono font-semibold"
              style={{ fontSize: 13, color: ratioColored }}
            >
              {data.ratio_up_down}
            </div>
          </div>

          {/* Phân loại */}
          <div>
            <div
              className="uppercase font-bold mb-1"
              style={{
                fontSize: 9,
                letterSpacing: "0.06em",
                color: "var(--color-text-2)",
              }}
            >
              Phân loại
            </div>
            <div
              className="font-semibold"
              style={{ fontSize: 11, color: "var(--color-text-2)", lineHeight: 1.35 }}
            >
              {data.classification}
            </div>
          </div>

          {/* % > MA20 */}
          <div>
            <div
              className="uppercase font-bold mb-1"
              style={{
                fontSize: 9,
                letterSpacing: "0.06em",
                color: "var(--color-text-2)",
              }}
            >
              {"% > MA20"}
            </div>
            <div
              className="font-mono font-semibold"
              style={{ fontSize: 13, color: pctAboveMa20Colored }}
            >
              {data.pct_above_ma20.toLocaleString("vi-VN", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
              %
            </div>
          </div>
        </div>
      </ChartCard>
    )
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard && npx vitest run src/features/market-overview/daily/charts/BreadthChart.test.tsx 2>&1 | tail -25
  ```

  Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard
  git add src/features/market-overview/daily/charts/
  git commit -m "$(cat <<'EOF'
  feat(market): add BreadthChart component + tests (Độ rộng HOSE)

  5-row horizontal bar chart matching terminal spec. Pure CSS bars.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 4: Build `ContributionChart` component

**Files:**
- Create: `src/features/market-overview/daily/charts/ContributionChart.tsx`

**Interfaces:**
- Consumes: `MarketCharts["contribution"]` from Task 1; `ChartCard` from Task 2
- Produces: `ContributionChart` — `({ data }: { data: MarketCharts["contribution"] }) => JSX.Element`

**Visual spec (from terminal HTML):**
- 2-column diverging bar: negative tickers left (bars grow rightward from left edge of bar zone), positive tickers right (bars grow leftward from right edge of bar zone)
- Grid per row: `1fr 0 1fr` (no center column — rows are paired by index)
- Bar widths: proportional to absolute value, max = max absolute value in the full list
- Negative bar: `background #ef4444`; text inside (ticker left, value right) color `#FFE0E3`
- Positive bar: `background #10b981`; text inside (ticker left, value right) color `#DFFCE9`
- Bar height: 20px
- Bar zone height: 20px, background `var(--color-fill-1)`, overflow hidden
- Negative zone: `justify-content: flex-end` (bar anchors to right of zone)
- Positive zone: `justify-content: flex-start` (bar anchors to left of zone)
- Ticker and value text: `font-size 10px, font-weight 700 (ticker) / 600 (value), font-family monospace`
- Text absolutely positioned inside bar (ticker at left 4px, value at right 4px), vertically centered
- Values: format with `toFixed(2)` + sign (negative already signed, positive prepend "+")
- Rows: zip top_negative[i] and top_positive[i] together; up to 8 pairs (uneven arrays: show blank side if one is shorter)
- NO "KÉO INDEX" text anywhere

- [ ] **Step 1: Create `ContributionChart.tsx`**

  Create file `/Users/danhtrongit/Projects/IQX/dashboard/src/features/market-overview/daily/charts/ContributionChart.tsx`:

  ```tsx
  // ─── ContributionChart ─────────────────────────────────────────────────────
  // "Top mã đóng góp ±" — 2-way diverging bar chart.
  // Negative tickers anchor to the left zone (bars grow from right of zone),
  // positive tickers anchor to the right zone (bars grow from left of zone).
  // Ticker + value are printed INSIDE the bar. No "KÉO INDEX" text.
  // Pure presentational — no hook inside.

  import type { MarketCharts } from "../types"
  import { ChartCard } from "./ChartCard"

  // ── Props ─────────────────────────────────────────────────────────────────

  interface ContributionChartProps {
    data: MarketCharts["contribution"]
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function formatPoints(points: number, isPositive: boolean): string {
    const abs = Math.abs(points).toFixed(2)
    return isPositive ? `+${abs}` : `-${abs}`
  }

  // ── Component ─────────────────────────────────────────────────────────────

  export function ContributionChart({ data }: ContributionChartProps) {
    const { top_negative, top_positive } = data

    // Determine scale: max absolute value across all tickers
    const allAbs = [
      ...top_negative.map((d) => Math.abs(d.points)),
      ...top_positive.map((d) => Math.abs(d.points)),
    ]
    const maxAbs = allAbs.length > 0 ? Math.max(...allAbs) : 1

    const rowCount = Math.max(top_negative.length, top_positive.length)
    const rows = Array.from({ length: rowCount }, (_, i) => ({
      neg: top_negative[i] ?? null,
      pos: top_positive[i] ?? null,
    }))

    return (
      <ChartCard title="Top mã đóng góp ±">
        <div className="flex flex-col" style={{ gap: 5 }}>
          {rows.map((row, i) => (
            <div
              key={i}
              className="grid items-center"
              style={{ gridTemplateColumns: "1fr 1fr", gap: 6 }}
            >
              {/* ── Negative side (left) — bar grows from right ── */}
              <div
                style={{
                  height: 20,
                  background: "var(--color-fill-1)",
                  borderRadius: 2,
                  overflow: "hidden",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                {row.neg && (
                  <div
                    style={{
                      width: `${(Math.abs(row.neg.points) / maxAbs) * 100}%`,
                      height: "100%",
                      background: "#ef4444",
                      borderRadius: 2,
                      position: "relative",
                      flexShrink: 0,
                    }}
                  >
                    {/* Ticker — left inside bar */}
                    <span
                      style={{
                        position: "absolute",
                        left: 4,
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#FFE0E3",
                        fontFamily: "monospace",
                        zIndex: 2,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.neg.ticker}
                    </span>
                    {/* Value — right inside bar */}
                    <span
                      style={{
                        position: "absolute",
                        right: 4,
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#FFE0E3",
                        fontFamily: "monospace",
                        zIndex: 2,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatPoints(row.neg.points, false)}
                    </span>
                  </div>
                )}
              </div>

              {/* ── Positive side (right) — bar grows from left ── */}
              <div
                style={{
                  height: 20,
                  background: "var(--color-fill-1)",
                  borderRadius: 2,
                  overflow: "hidden",
                  display: "flex",
                  justifyContent: "flex-start",
                }}
              >
                {row.pos && (
                  <div
                    style={{
                      width: `${(Math.abs(row.pos.points) / maxAbs) * 100}%`,
                      height: "100%",
                      background: "#10b981",
                      borderRadius: 2,
                      position: "relative",
                      flexShrink: 0,
                    }}
                  >
                    {/* Ticker — left inside bar */}
                    <span
                      style={{
                        position: "absolute",
                        left: 4,
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#DFFCE9",
                        fontFamily: "monospace",
                        zIndex: 2,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.pos.ticker}
                    </span>
                    {/* Value — right inside bar */}
                    <span
                      style={{
                        position: "absolute",
                        right: 4,
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#DFFCE9",
                        fontFamily: "monospace",
                        zIndex: 2,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatPoints(row.pos.points, true)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ChartCard>
    )
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: 0 errors.

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard
  git add src/features/market-overview/daily/charts/ContributionChart.tsx
  git commit -m "$(cat <<'EOF'
  feat(market): add ContributionChart component (Top mã đóng góp ±)

  Diverging bars with ticker+value inside each bar. No KÉO INDEX text.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 5: Wire charts section into `MarketOverviewModal`

**Files:**
- Modify: `src/features/market-overview/daily/MarketOverviewModal.tsx`

**Interfaces:**
- Consumes: `BreadthChart` (Task 3), `ContributionChart` (Task 4), `TierLabel` (Task 2), `useDailyMarketAnalysis` (existing hook), `MarketCharts` (Task 1)
- Produces: Nothing new — the modal body now renders the charts section

**Spec:**
- After `<MarketTakeaway />`, add a "Cấu trúc phiên" section
- `TierLabel` with `label="Cấu trúc phiên"`
- `<div className="grid grid-cols-2 gap-3.5">` (2 equal columns)
- Left: `<BreadthChart data={charts.breadth} />`
- Right: `<ContributionChart data={charts.contribution} />`
- Guard: render the section ONLY when `charts` is defined (`data?.charts`)
- `useDailyMarketAnalysis()` is already available in `ModalBody` scope (hook is mounted-once pattern per existing `MarketTakeaway` — but `MarketTakeaway` calls the hook internally; the modal should call the hook ONCE at the ModalBody level and pass data down... BUT to stay consistent with existing pattern where each component calls the hook independently via React Query deduplication, call the hook in ModalBody just for charts access)

- [ ] **Step 1: Read the current modal file**

  File path: `/Users/danhtrongit/Projects/IQX/dashboard/src/features/market-overview/daily/MarketOverviewModal.tsx`

  Current `ModalBody`:
  ```tsx
  function ModalBody() {
    return (
      <div style={{ maxHeight: "82vh", overflowY: "auto" }} className="px-1 py-2">
        <MarketAnalysisArticle />
        <div className="mt-3.5"><MarketPulseBar /></div>
        <MarketTakeaway />
      </div>
    )
  }
  ```

- [ ] **Step 2: Write the updated `MarketOverviewModal.tsx`**

  Replace the entire file:

  ```tsx
  // ─── MarketOverviewModal ───────────────────────────────────────────────────────
  // Market modal (v1.5 layout):
  //   MarketAnalysisArticle + MarketPulseBar + MarketTakeaway + Cấu trúc phiên charts.
  // Gate: the body is mounted only when isOpen.

  import { Modal } from "@arco-design/web-react"
  import { useMarketModal } from "@/shared/contexts/market-modal-context"
  import { MarketAnalysisArticle } from "./MarketAnalysisArticle"
  import { MarketPulseBar } from "./MarketPulseBar"
  import { MarketTakeaway } from "./MarketTakeaway"
  import { useDailyMarketAnalysis } from "./useDailyMarketAnalysis"
  import { TierLabel } from "./charts/TierLabel"
  import { BreadthChart } from "./charts/BreadthChart"
  import { ContributionChart } from "./charts/ContributionChart"

  // ─── Modal body (mounted only when open) ─────────────────────────────────────

  function ModalBody() {
    const { data } = useDailyMarketAnalysis()
    const charts = data?.charts

    return (
      <div
        style={{ maxHeight: "82vh", overflowY: "auto" }}
        className="px-1 py-2"
      >
        {/* ── AI nhận định ── */}
        <MarketAnalysisArticle />

        {/* ── Pulse summary bar ── */}
        <div className="mt-3.5">
          <MarketPulseBar />
        </div>

        {/* ── Takeaway (kịch bản + đáng quan sát) ── */}
        <MarketTakeaway />

        {/* ── Cấu trúc phiên (Breadth + Contribution charts) ── */}
        {charts && (
          <div>
            <TierLabel label="Cấu trúc phiên" />
            <div className="grid grid-cols-2 gap-3.5">
              <BreadthChart data={charts.breadth} />
              <ContributionChart data={charts.contribution} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Public component ─────────────────────────────────────────────────────────

  export function MarketOverviewModal() {
    const { isOpen, closeMarketModal } = useMarketModal()

    return (
      <Modal
        visible={isOpen}
        onCancel={closeMarketModal}
        footer={null}
        title={null}
        style={{ width: "92vw", maxWidth: 1280 }}
        autoFocus={false}
      >
        {isOpen && <ModalBody />}
      </Modal>
    )
  }
  ```

- [ ] **Step 3: Run full build**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard && npm run build 2>&1 | tail -30
  ```

  Expected: build succeeds with 0 errors.

- [ ] **Step 4: Run full test suite**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard && npm test 2>&1 | tail -30
  ```

  Expected: all tests pass (6 new BreadthChart tests + all pre-existing tests).

- [ ] **Step 5: Commit all remaining changes**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard
  git add src/features/market-overview/daily/MarketOverviewModal.tsx
  git commit -m "$(cat <<'EOF'
  feat(market): Cấu trúc phiên charts (breadth + contribution) per terminal

  Wire BreadthChart + ContributionChart into MarketOverviewModal after
  MarketTakeaway. Section renders only when charts data is present.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 6: Write report to `.superpowers/sdd/charts-fe1-report.md`

**Files:**
- Create: `/Users/danhtrongit/Projects/IQX/.superpowers/sdd/charts-fe1-report.md`

**Interfaces:**
- Consumes: results from all previous tasks (commit hash, build result, test result)

- [ ] **Step 1: Verify build and test outputs one final time**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard && npm run build 2>&1 | tail -5 && npm test 2>&1 | tail -10
  ```

  Note the exact pass/fail counts.

- [ ] **Step 2: Get the final commit hash**

  ```bash
  cd /Users/danhtrongit/Projects/IQX/dashboard && git log --oneline -6
  ```

- [ ] **Step 3: Write the report file**

  Create `/Users/danhtrongit/Projects/IQX/.superpowers/sdd/charts-fe1-report.md` with content:

  ```markdown
  # charts-fe1 Report

  **Status:** DONE
  **Commit:** <paste commit hash of "feat(market): Cấu trúc phiên charts...">
  **Build:** PASS (npm run build — 0 errors)
  **Tests:** PASS (<N> tests, 6 new BreadthChart tests)

  **Files created:**
  - `src/features/market-overview/daily/types.ts` (modified — added MarketCharts + charts?)
  - `src/features/market-overview/daily/charts/TierLabel.tsx`
  - `src/features/market-overview/daily/charts/ChartCard.tsx`
  - `src/features/market-overview/daily/charts/BreadthChart.tsx`
  - `src/features/market-overview/daily/charts/BreadthChart.test.tsx`
  - `src/features/market-overview/daily/charts/ContributionChart.tsx`
  - `src/features/market-overview/daily/MarketOverviewModal.tsx` (modified — wired section)

  **Concerns:**
  - `var(--color-fill-2)` used for bar track background (maps to terminal `--surface-2`); verify dark mode looks correct in browser.
  - ContributionChart: no test written (pure layout, no branch logic). Add if desired.
  - `charts` is `undefined` until backend ships the field — section silently absent until then.
  ```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| `MarketCharts` interface with full shape | Task 1 |
| `charts?` on `DailyAnalysis` | Task 1 |
| `BreadthChart.tsx` pure presentational | Task 3 |
| `ContributionChart.tsx` pure presentational | Task 4 |
| TierLabel with accent bar | Task 2 |
| ChartCard with card title accent | Task 2 |
| 5 rows: ceiling/up/flat/down/floor with correct colors | Task 3 |
| 3 summary stats (ratio, classification, ma20%) | Task 3 |
| Color mapping: `#15824F` ceiling, `var(--color-text-4)` flat, `#b0303d` floor | Task 3 |
| Diverging bars negative left / positive right | Task 4 |
| Ticker + value INSIDE bars | Task 4 |
| NO "KÉO INDEX" text | Task 4 |
| Wire into modal after MarketTakeaway | Task 5 |
| Guard `charts` undefined | Task 5 |
| `npm run build` pass | Task 5 |
| `npm test` pass | Task 5 |
| Commit message `feat(market): Cấu trúc phiên charts...` | Task 5 |
| Report to `.superpowers/sdd/charts-fe1-report.md` | Task 6 |
| BreadthChart render test (fixture → counts render) | Task 3 |
| Branch `feat/market-charts-v14` | Pre-condition (not in a task — add as step 0) |

**Branch pre-condition — add as Step 0 before Task 1:**

```bash
cd /Users/danhtrongit/Projects/IQX/dashboard
git checkout feat/market-charts-v14 2>/dev/null || git checkout -b feat/market-charts-v14
```

**Placeholder scan:** No TBD/TODO/placeholder found. All code blocks complete.

**Type consistency check:**
- `MarketCharts["breadth"]` used in BreadthChart ✓
- `MarketCharts["contribution"]` used in ContributionChart ✓
- `TickerPoints` defined in types.ts, used in contribution arrays ✓
- `ChartCard` exported from `ChartCard.tsx`, imported correctly in both chart components ✓
- `TierLabel` exported from `TierLabel.tsx`, imported in modal ✓
