# Dòng tiền Flow Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Dòng tiền" section to the MarketOverviewModal with a shared `FlowCard` component that renders Khối ngoại and Tự doanh CTCK cards, each with summary cells, a 12-bar streak strip, and two top-ticker columns with optional anomaly badges.

**Architecture:** A single `FlowCard.tsx` provides the reusable shell (summary, streak bars, top columns, anomaly badge). `ForeignFlowCard.tsx` and `PropFlowCard.tsx` are thin wrappers that format their specific labels/data and delegate to `FlowCard`. `MarketOverviewModal.tsx` gains a new `{charts && ...}` block after the existing Cấu trúc phiên block.

**Tech Stack:** React 18, TypeScript, Tailwind v4 (utility classes), Arco Design CSS tokens (`var(--color-*)`), Vitest + @testing-library/react (same test infra as BreadthChart.test.tsx).

## Global Constraints

- Branch: `feat/market-charts-v14` — all commits go here
- CSS tokens only: `var(--color-bg-2)`, `var(--color-border-1)`, `var(--color-border-2)`, `var(--color-text-1)`, `var(--color-text-2)`, `var(--color-text-4)`, `var(--color-fill-2)`, `rgb(var(--primary-6))`. Hard-coded hex is allowed only for green `#10b981` / `#15824F` and red `#ef4444` / `#b0303d` (same as BreadthChart.tsx)
- Copy verbatim from spec: "Phiên thứ {N} {bán|mua} ròng · 5 ngày {X} tỷ" for foreign streak; "Net {X} tỷ · {cùng/ngược} chiều khối ngoại" for prop streak
- Vietnamese: "BẤT THƯỜNG" (all-caps) badge on anomaly rows
- `npm run build` and `npm test` must pass before commit
- No new dependencies

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/features/market-overview/daily/charts/FlowCard.tsx` | **Create** | Reusable flow card shell: summary cells, streak bar strip, two top-ticker columns, anomaly badge |
| `src/features/market-overview/daily/charts/ForeignFlowCard.tsx` | **Create** | Thin wrapper: formats foreign_detail into FlowCard props |
| `src/features/market-overview/daily/charts/PropFlowCard.tsx` | **Create** | Thin wrapper: formats prop_detail into FlowCard props |
| `src/features/market-overview/daily/charts/FlowCard.test.tsx` | **Create** | Tests: renders summary values, streak bars, top tickers, anomaly badge |
| `src/features/market-overview/daily/MarketOverviewModal.tsx` | **Modify** | Add "Dòng tiền" TierLabel + grid-2 with Foreign + Prop cards after Cấu trúc phiên |

---

### Task 1: FlowCard core component

**Files:**
- Create: `src/features/market-overview/daily/charts/FlowCard.tsx`

**Interfaces:**
- Consumes: `ChartCard` from `./ChartCard`; CSS tokens from Arco Design
- Produces:
  ```ts
  export interface FlowTopItem {
    ticker: string
    value: number        // tỷ VND, signed (negative = sell, positive = buy)
    anomaly?: boolean
  }

  export interface FlowCardProps {
    title: string
    buyLabel?: string        // default "Mua ròng"
    sellLabel?: string       // default "Bán ròng"
    buyValue: number         // tỷ VND, positive
    sellValue: number        // tỷ VND, positive (absolute, displayed with − prefix)
    streakBars: number[]     // up to 12 daily net values, signed; last element = today
    streakLabel: React.ReactNode
    topSell: FlowTopItem[]   // values are negative
    topBuy: FlowTopItem[]    // values are positive; may have anomaly flag
    topSellHeading?: string  // default "▼ TOP BÁN"
    topBuyHeading?: string   // default "▲ TOP MUA"
  }

  export function FlowCard(props: FlowCardProps): JSX.Element
  ```

- [ ] **Step 1.1: Create the file with full implementation**

Create `/Users/danhtrongit/Projects/IQX/dashboard/src/features/market-overview/daily/charts/FlowCard.tsx`:

```tsx
// ─── FlowCard ──────────────────────────────────────────────────────────────
// Reusable "dòng tiền" card shell matching terminal `.flow-*` markup.
// Used by ForeignFlowCard and PropFlowCard — do not put data-fetching here.

import type { ReactNode } from "react"
import { ChartCard } from "./ChartCard"

// ── Types ─────────────────────────────────────────────────────────────────

export interface FlowTopItem {
  ticker: string
  value: number        // tỷ VND, signed (negative = sell, positive = buy)
  anomaly?: boolean
}

export interface FlowCardProps {
  title: string
  buyLabel?: string        // default "Mua ròng"
  sellLabel?: string       // default "Bán ròng"
  buyValue: number         // tỷ VND, positive
  sellValue: number        // tỷ VND, positive (absolute), shown with − prefix
  streakBars: number[]     // up to 12 daily net values, signed; last = today
  streakLabel: ReactNode
  topSell: FlowTopItem[]   // values negative
  topBuy: FlowTopItem[]    // values positive; may have anomaly
  topSellHeading?: string  // default "▼ TOP BÁN"
  topBuyHeading?: string   // default "▲ TOP MUA"
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtBillion(val: number): string {
  return val.toLocaleString("vi-VN", { maximumFractionDigits: 0 })
}

function StreakBars({ bars }: { bars: number[] }) {
  if (bars.length === 0) return null
  const maxAbs = Math.max(...bars.map(Math.abs), 1)
  return (
    <div
      style={{
        display: "flex",
        gap: 1.5,
        alignItems: "flex-end",
        height: 22,
        flex: 1,
      }}
    >
      {bars.map((v, i) => {
        const isToday = i === bars.length - 1
        const heightPct = Math.max((Math.abs(v) / maxAbs) * 100, 8)
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${heightPct}%`,
              background: v >= 0 ? "#10b981" : "#ef4444",
              opacity: isToday ? 1 : 0.5,
              borderRadius: "1px 1px 0 0",
            }}
          />
        )
      })}
    </div>
  )
}

function TopList({
  items,
  isPositive,
}: {
  items: FlowTopItem[]
  isPositive: boolean
}) {
  const maxAbs = Math.max(...items.map((it) => Math.abs(it.value)), 1)
  return (
    <div>
      {items.map((item) => {
        const widthPct = (Math.abs(item.value) / maxAbs) * 100
        const color = isPositive ? "#10b981" : "#ef4444"
        return (
          <div
            key={item.ticker}
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr 56px",
              alignItems: "center",
              gap: 6,
              padding: item.anomaly ? "4px 6px" : "4px 0",
              fontSize: 11,
              borderRadius: item.anomaly ? 4 : 0,
              background: item.anomaly ? "var(--color-warning-light-1, rgba(255,179,71,0.13))" : undefined,
              margin: item.anomaly ? "2px -6px" : undefined,
              position: "relative",
            }}
          >
            {/* Ticker */}
            <span style={{ fontWeight: 700, fontSize: 11, color: "var(--color-text-1)" }}>
              {item.ticker}
            </span>

            {/* Bar track */}
            <div
              style={{
                display: "flex",
                flexDirection: isPositive ? "row" : "row-reverse",
              }}
            >
              <div
                style={{
                  height: 4,
                  flex: 1,
                  background: "var(--color-fill-2)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${widthPct}%`,
                    height: "100%",
                    background: color,
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>

            {/* Value */}
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                textAlign: "right",
                fontWeight: 600,
                color,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {isPositive ? "+" : ""}
              {fmtBillion(item.value)} tỷ
            </div>

            {/* Anomaly badge */}
            {item.anomaly && (
              <span
                style={{
                  position: "absolute",
                  right: 56,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 8,
                  color: "#FFB347",
                  background: "var(--color-bg-1, var(--color-bg-2))",
                  padding: "1px 4px",
                  borderRadius: 3,
                  letterSpacing: "0.04em",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                BẤT THƯỜNG
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function FlowCard({
  title,
  buyLabel = "Mua ròng",
  sellLabel = "Bán ròng",
  buyValue,
  sellValue,
  streakBars,
  streakLabel,
  topSell,
  topBuy,
  topSellHeading = "▼ TOP BÁN",
  topBuyHeading = "▲ TOP MUA",
}: FlowCardProps) {
  return (
    <ChartCard title={title}>
      {/* Summary cells — bleed to card edges by negative margin */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1,
          background: "var(--color-border-1)",
          margin: "-16px -16px 12px",
        }}
      >
        <div
          style={{
            background: "var(--color-bg-2)",
            padding: "11px 12px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: "var(--color-text-2)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
              fontWeight: 600,
            }}
          >
            {buyLabel}
          </div>
          <div
            className="font-mono font-semibold"
            style={{ fontSize: 16, color: "#10b981", fontVariantNumeric: "tabular-nums" }}
          >
            +{fmtBillion(buyValue)} tỷ
          </div>
        </div>
        <div
          style={{
            background: "var(--color-bg-2)",
            padding: "11px 12px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: "var(--color-text-2)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
              fontWeight: 600,
            }}
          >
            {sellLabel}
          </div>
          <div
            className="font-mono font-semibold"
            style={{ fontSize: 16, color: "#ef4444", fontVariantNumeric: "tabular-nums" }}
          >
            −{fmtBillion(sellValue)} tỷ
          </div>
        </div>
      </div>

      {/* Streak row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: "var(--color-fill-1, var(--color-fill-2))",
          borderRadius: 6,
          marginBottom: 12,
          fontSize: 11,
        }}
      >
        <StreakBars bars={streakBars} />
        <div
          style={{
            fontSize: 10,
            color: "var(--color-text-3, var(--color-text-2))",
            whiteSpace: "nowrap",
          }}
        >
          {streakLabel}
        </div>
      </div>

      {/* Two-column top lists */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
      >
        {/* Left: TOP BÁN */}
        <div>
          <div
            style={{
              fontSize: 9,
              color: "var(--color-text-2)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
              paddingBottom: 6,
              borderBottom: "1px solid var(--color-border-1)",
              fontWeight: 600,
            }}
          >
            {topSellHeading}
          </div>
          <TopList items={topSell} isPositive={false} />
        </div>
        {/* Right: TOP MUA */}
        <div>
          <div
            style={{
              fontSize: 9,
              color: "var(--color-text-2)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
              paddingBottom: 6,
              borderBottom: "1px solid var(--color-border-1)",
              fontWeight: 600,
            }}
          >
            {topBuyHeading}
          </div>
          <TopList items={topBuy} isPositive />
        </div>
      </div>
    </ChartCard>
  )
}
```

- [ ] **Step 1.2: Verify TypeScript compiles**

```bash
cd /Users/danhtrongit/Projects/IQX/dashboard && npx tsc --noEmit 2>&1 | head -40
```

Expected: zero errors (or only pre-existing errors unrelated to FlowCard.tsx).

---

### Task 2: ForeignFlowCard and PropFlowCard wrappers

**Files:**
- Create: `src/features/market-overview/daily/charts/ForeignFlowCard.tsx`
- Create: `src/features/market-overview/daily/charts/PropFlowCard.tsx`

**Interfaces:**
- Consumes: `FlowCard`, `FlowCardProps`, `FlowTopItem` from `./FlowCard`; `MarketCharts` from `../types`
- Produces:
  ```ts
  // ForeignFlowCard
  export function ForeignFlowCard(props: { data: MarketCharts["foreign_detail"] }): JSX.Element

  // PropFlowCard
  export function PropFlowCard(props: { data: MarketCharts["prop_detail"] }): JSX.Element
  ```

- [ ] **Step 2.1: Create ForeignFlowCard.tsx**

Create `/Users/danhtrongit/Projects/IQX/dashboard/src/features/market-overview/daily/charts/ForeignFlowCard.tsx`:

```tsx
// ─── ForeignFlowCard ────────────────────────────────────────────────────────
// Wraps FlowCard with foreign_detail data.
// Streak label: "Phiên thứ N bán/mua ròng · 5 ngày X tỷ"

import type { MarketCharts } from "../types"
import { FlowCard } from "./FlowCard"

interface ForeignFlowCardProps {
  data: MarketCharts["foreign_detail"]
}

export function ForeignFlowCard({ data }: ForeignFlowCardProps) {
  const { streak } = data
  const dirLabel = streak.direction === "sell" ? "bán" : "mua"
  const cumColor = streak.last_5d_cumulative >= 0 ? "#10b981" : "#ef4444"
  const cumSign = streak.last_5d_cumulative >= 0 ? "+" : ""

  const streakLabel = (
    <>
      Phiên{" "}
      <strong style={{ color: streak.direction === "sell" ? "#ef4444" : "#10b981" }}>
        thứ {streak.count}
      </strong>{" "}
      {dirLabel} ròng
      <br />
      <span style={{ color: "var(--color-text-3, var(--color-text-2))", fontSize: 10 }}>
        5 ngày:{" "}
        <span style={{ color: cumColor }}>
          {cumSign}
          {streak.last_5d_cumulative.toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ
        </span>
      </span>
    </>
  )

  return (
    <FlowCard
      title="Khối ngoại"
      buyValue={data.total_buy_vnd_billion}
      sellValue={Math.abs(data.total_sell_vnd_billion)}
      streakBars={data.last_12_sessions}
      streakLabel={streakLabel}
      topSell={data.top_sell}
      topBuy={data.top_buy}
    />
  )
}
```

- [ ] **Step 2.2: Create PropFlowCard.tsx**

Create `/Users/danhtrongit/Projects/IQX/dashboard/src/features/market-overview/daily/charts/PropFlowCard.tsx`:

```tsx
// ─── PropFlowCard ───────────────────────────────────────────────────────────
// Wraps FlowCard with prop_detail data.
// Streak label: "Net X tỷ · cùng/ngược chiều khối ngoại"
// Anomaly flag on top_buy items passed through to FlowCard.

import type { MarketCharts } from "../types"
import { FlowCard } from "./FlowCard"

interface PropFlowCardProps {
  data: MarketCharts["prop_detail"]
  foreignNet?: number   // optional: foreign net to determine cùng/ngược direction
}

export function PropFlowCard({ data, foreignNet }: PropFlowCardProps) {
  const net = data.net_vnd_billion
  const netColor = net >= 0 ? "#10b981" : "#ef4444"
  const netSign = net >= 0 ? "+" : ""

  // Determine cùng/ngược based on signs of prop net and foreign net (if provided)
  let directionLabel = "cùng chiều khối ngoại"
  if (foreignNet !== undefined) {
    const propBuy = net >= 0
    const foreignBuy = foreignNet >= 0
    directionLabel = propBuy === foreignBuy
      ? "cùng chiều khối ngoại"
      : "ngược chiều khối ngoại"
  }

  const streakLabel = (
    <>
      Net:{" "}
      <strong style={{ color: netColor }}>
        {netSign}
        {net.toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ
      </strong>
      <br />
      <span style={{ color: "var(--color-text-3, var(--color-text-2))", fontSize: 10 }}>
        {directionLabel}
      </span>
    </>
  )

  return (
    <FlowCard
      title="Tự doanh CTCK"
      buyValue={data.total_buy_vnd_billion}
      sellValue={Math.abs(data.total_sell_vnd_billion)}
      streakBars={data.last_12_sessions}
      streakLabel={streakLabel}
      topSell={data.top_sell}
      topBuy={data.top_buy}        // anomaly?: boolean passes through automatically
      topSellHeading="▼ TOP BÁN"
      topBuyHeading="▲ TOP MUA"
    />
  )
}
```

- [ ] **Step 2.3: TypeScript check**

```bash
cd /Users/danhtrongit/Projects/IQX/dashboard && npx tsc --noEmit 2>&1 | head -40
```

Expected: zero new errors.

---

### Task 3: Tests for FlowCard

**Files:**
- Create: `src/features/market-overview/daily/charts/FlowCard.test.tsx`

**Interfaces:**
- Consumes: `FlowCard`, `FlowTopItem`, `FlowCardProps` from `./FlowCard`
- Produces: Vitest test suite (no exports)

- [ ] **Step 3.1: Write the test file**

Create `/Users/danhtrongit/Projects/IQX/dashboard/src/features/market-overview/daily/charts/FlowCard.test.tsx`:

```tsx
import React from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { FlowCard } from "./FlowCard"
import type { FlowTopItem } from "./FlowCard"

const topSell: FlowTopItem[] = [
  { ticker: "VIC", value: -320 },
  { ticker: "VHM", value: -198 },
]

const topBuy: FlowTopItem[] = [
  { ticker: "VCB", value: 186 },
  { ticker: "BID", value: 92 },
]

const streakBars = [-200, 50, -80, 120, -300, 90, -150, 200, -60, 30, -100, -239]

describe("FlowCard", () => {
  it("renders the card title", () => {
    render(
      <FlowCard
        title="Khối ngoại"
        buyValue={186}
        sellValue={1868}
        streakBars={streakBars}
        streakLabel="streak"
        topSell={topSell}
        topBuy={topBuy}
      />
    )
    expect(screen.getByText("Khối ngoại")).toBeInTheDocument()
  })

  it("renders buy and sell summary values", () => {
    const { container } = render(
      <FlowCard
        title="Test"
        buyValue={598}
        sellValue={837}
        streakBars={[10, -20]}
        streakLabel="label"
        topSell={[]}
        topBuy={[]}
      />
    )
    expect(container.textContent).toContain("598")
    expect(container.textContent).toContain("837")
  })

  it("renders top sell and top buy tickers", () => {
    render(
      <FlowCard
        title="Test"
        buyValue={100}
        sellValue={200}
        streakBars={[1, -2]}
        streakLabel="x"
        topSell={topSell}
        topBuy={topBuy}
      />
    )
    expect(screen.getByText("VIC")).toBeInTheDocument()
    expect(screen.getByText("VHM")).toBeInTheDocument()
    expect(screen.getByText("VCB")).toBeInTheDocument()
    expect(screen.getByText("BID")).toBeInTheDocument()
  })

  it("renders custom column headings", () => {
    render(
      <FlowCard
        title="Test"
        buyValue={100}
        sellValue={200}
        streakBars={[]}
        streakLabel="x"
        topSell={[]}
        topBuy={[]}
        topSellHeading="▼ BÁN"
        topBuyHeading="▲ MUA"
      />
    )
    expect(screen.getByText("▼ BÁN")).toBeInTheDocument()
    expect(screen.getByText("▲ MUA")).toBeInTheDocument()
  })

  it("does NOT render BẤT THƯỜNG badge when anomaly is false", () => {
    render(
      <FlowCard
        title="Test"
        buyValue={100}
        sellValue={200}
        streakBars={[1]}
        streakLabel="x"
        topSell={[]}
        topBuy={[{ ticker: "SSI", value: 45 }]}
      />
    )
    expect(screen.queryByText("BẤT THƯỜNG")).not.toBeInTheDocument()
  })

  it("renders BẤT THƯỜNG badge for anomaly top_buy item", () => {
    render(
      <FlowCard
        title="Test"
        buyValue={100}
        sellValue={200}
        streakBars={[1]}
        streakLabel="x"
        topSell={[]}
        topBuy={[{ ticker: "SSI", value: 45, anomaly: true }]}
      />
    )
    expect(screen.getByText("BẤT THƯỜNG")).toBeInTheDocument()
  })

  it("renders correct number of streak bars", () => {
    const bars = [10, -5, 8, -3, 12, -7, 4, -9, 6, -2, 11, -1]
    const { container } = render(
      <FlowCard
        title="Test"
        buyValue={100}
        sellValue={200}
        streakBars={bars}
        streakLabel="x"
        topSell={[]}
        topBuy={[]}
      />
    )
    // Each bar is a div inside the StreakBars container — count children
    // The bars container has flex+gap styling; count divs with border-radius style
    const streakContainer = container.querySelector('[style*="flex-end"]')
    expect(streakContainer?.children.length).toBe(12)
  })

  it("renders default column headings when not specified", () => {
    render(
      <FlowCard
        title="Test"
        buyValue={100}
        sellValue={200}
        streakBars={[]}
        streakLabel="x"
        topSell={[]}
        topBuy={[]}
      />
    )
    expect(screen.getByText("▼ TOP BÁN")).toBeInTheDocument()
    expect(screen.getByText("▲ TOP MUA")).toBeInTheDocument()
  })
})
```

- [ ] **Step 3.2: Run tests — verify they pass**

```bash
cd /Users/danhtrongit/Projects/IQX/dashboard && npm test -- --run src/features/market-overview/daily/charts/FlowCard.test.tsx 2>&1
```

Expected: all 8 tests pass.

---

### Task 4: Wire into MarketOverviewModal

**Files:**
- Modify: `src/features/market-overview/daily/MarketOverviewModal.tsx` (lines 1–55 currently)

**Interfaces:**
- Consumes: `ForeignFlowCard` from `./charts/ForeignFlowCard`; `PropFlowCard` from `./charts/PropFlowCard`; `TierLabel` from `./charts/TierLabel`; `charts.foreign_detail`, `charts.prop_detail` from `useDailyMarketAnalysis()`

- [ ] **Step 4.1: Add imports to MarketOverviewModal.tsx**

In `/Users/danhtrongit/Projects/IQX/dashboard/src/features/market-overview/daily/MarketOverviewModal.tsx`, add after the existing chart imports:

```tsx
import { ForeignFlowCard } from "./charts/ForeignFlowCard"
import { PropFlowCard } from "./charts/PropFlowCard"
```

- [ ] **Step 4.2: Add Dòng tiền section to ModalBody**

After the closing `</div>` of the Cấu trúc phiên block (which contains `TierLabel label="Cấu trúc phiên"` + `BreadthChart` + `ContributionChart`), add:

```tsx
{/* ── Dòng tiền (Foreign + Prop flow cards) ── */}
{charts && charts.foreign_detail && charts.prop_detail && (
  <div>
    <TierLabel label="Dòng tiền" />
    <div className="grid grid-cols-2 gap-3.5">
      <ForeignFlowCard data={charts.foreign_detail} />
      <PropFlowCard
        data={charts.prop_detail}
        foreignNet={
          charts.foreign_detail.total_buy_vnd_billion -
          charts.foreign_detail.total_sell_vnd_billion
        }
      />
    </div>
  </div>
)}
```

- [ ] **Step 4.3: TypeScript check**

```bash
cd /Users/danhtrongit/Projects/IQX/dashboard && npx tsc --noEmit 2>&1 | head -40
```

Expected: zero new errors.

---

### Task 5: Full build + test + commit

**Files:** all of the above

- [ ] **Step 5.1: Run full test suite**

```bash
cd /Users/danhtrongit/Projects/IQX/dashboard && npm test -- --run 2>&1 | tail -30
```

Expected: all tests pass (BreadthChart suite + new FlowCard suite).

- [ ] **Step 5.2: Run build**

```bash
cd /Users/danhtrongit/Projects/IQX/dashboard && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 5.3: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX/dashboard && git add \
  src/features/market-overview/daily/charts/FlowCard.tsx \
  src/features/market-overview/daily/charts/FlowCard.test.tsx \
  src/features/market-overview/daily/charts/ForeignFlowCard.tsx \
  src/features/market-overview/daily/charts/PropFlowCard.tsx \
  src/features/market-overview/daily/MarketOverviewModal.tsx \
  docs/superpowers/plans/2026-06-20-dong-tien-flow-cards.md

git commit -m "$(cat <<'EOF'
feat(market): Dòng tiền flow cards (khối ngoại + tự doanh + anomaly) per terminal

- FlowCard: reusable shell with summary cells, 12-bar streak strip, two
  top-ticker columns (bar ∝ |value|/max), BẤT THƯỜNG anomaly badge
- ForeignFlowCard: formats foreign_detail streak label (phiên thứ N bán/mua ròng)
- PropFlowCard: formats prop_detail streak label (Net X tỷ · cùng/ngược chiều)
- MarketOverviewModal: Dòng tiền TierLabel + grid-2 after Cấu trúc phiên

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds on branch `feat/market-charts-v14`.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered in |
|-----------------|-----------|
| `flow-summary` two cells (Mua ròng green / Bán ròng red) | Task 1 FlowCard — summary grid |
| 12-bar streak strip, today opacity 1, prior 0.5, green/red by sign | Task 1 `StreakBars` component |
| Streak label for foreign: "Phiên thứ N bán/mua ròng · 5 ngày X tỷ" | Task 2 ForeignFlowCard.tsx |
| Two columns TOP BÁN / TOP MUA with proportional bar | Task 1 `TopList` component |
| BẤT THƯỜNG badge + neutral-soft bg on anomaly rows | Task 1 `TopList` anomaly branch |
| Prop card streak label: "Net X tỷ · cùng/ngược chiều khối ngoại" | Task 2 PropFlowCard.tsx |
| Wire into MarketOverviewModal after Cấu trúc phiên | Task 4 |
| Guard by `charts &&` | Task 4 — double-guard `charts.foreign_detail && charts.prop_detail` |
| Anomaly badge render test | Task 3 FlowCard.test.tsx |
| `npm run build && npm test` | Task 5 |
| Commit message per spec | Task 5 step 5.3 |
| Report to `.superpowers/sdd/charts-fe2-report.md` | (Executor must do this after commit) |

**Placeholder scan:** No TBDs, no "similar to" references, all code is complete.

**Type consistency:** `FlowTopItem`, `FlowCardProps` defined in Task 1, consumed by Tasks 2–4 via named imports. `anomaly?: boolean` defined in `types.ts` `prop_detail.top_buy` and passes through `FlowTopItem` without transformation.
