# Home Trading Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-hand trading/analysis panel (sticky shared symbol header + 5 tabs) and a 64px icon rail to the home page `/`, reusing the existing trading/watchlist/news/patterns panels, so a user can act on one stock without leaving home.

**Architecture:** A new thin `HomeWorkspace` shell (under `src/features/home-workspace/`) wraps the page in a `SymbolProvider`, holds the active-tab in local state, and lays out a 3-column grid: existing `MarketDailyPage` (left) + new `HomeSidePanel` (360px: sticky `SymbolContextHeader` + tab body composed from the EXISTING `TradingPanel`/`WatchlistPanel`/`NewsFeedPanel`/`AIPatternPanel` + new `PhanTichLauncher`) + new `HomeIconRail` (64px). Below 1024px the panel+rail collapse into a right `Drawer` opened by a FAB. The `/bieu-do` terminal is untouched.

**Tech Stack:** React 19, Arco Design, Tailwind v4, react-router v7, TanStack Query, Vitest + React Testing Library. HTTP via the existing hooks (`usePrice`, `useSymbol`, `useWatchlist`, `useSymbolSearch`, trading hooks).

## Global Constraints

- **Keep the current framework** ("vẫn giữ bộ khung hiện tại"): use the existing Arco chrome (`Header`, `MarketBar`, `Footer` via `AppShell`) and **Arco theme CSS variables** (`--color-bg-*`, `--color-text-*`, `--color-border-*`, `--color-fill-2`, `text-up`/`text-down`/`text-reference`/`text-ceiling`/`text-floor`, `rgb(var(--primary-6))`). Do NOT introduce the mockup's raw hex palette. New UI must be legible in light AND dark mode.
- The mockup (`~/Downloads/iqx-homepage-mockup.html`) is a **layout/structure reference only**.
- Frontend hygiene: no `import React` in component files (test files may import React per repo convention); no unused imports; render narrative/text as plain text (no `dangerouslySetInnerHTML`). **Verify with `npm run build`** (`tsc -b`, noUnusedLocals), not just `tsc --noEmit`.
- Golden rule: every displayed number comes from real data (`usePrice`, account/portfolio hooks) — never fabricated.
- Prices from `PriceBoardData` are stored ×1000; multiply by 1000 before display (see `fmtPrice`).
- Index detection: import `isIndexSymbol` from `@/features/stock` (do not re-implement).
- The `/bieu-do` terminal (`DashboardPage` + `RightToolbar` + `RightSidebar`) must keep working unchanged — reused panels get OPTIONAL props that default to current behavior.
- Tooling: `npx vitest run <path>` for tests; `npm run build` for the type/build gate. Work in `/Users/danhtrongit/Projects/IQX/dashboard`.

## File Structure

New feature dir `dashboard/src/features/home-workspace/`:
- `useInitialSymbol.ts` — resolve + persist the initial context symbol.
- `SymbolContextHeader.tsx` — sticky shared symbol header (selector + picker, price, mini-stats).
- `HomeIconRail.tsx` — 64px rail, 5 tabs, index-aware disabling.
- `PhanTichLauncher.tsx` — Phân tích tab body (launcher → `/co-phieu/:symbol`).
- `HomeSidePanel.tsx` — composes the sticky header + active tab body.
- `HomeWorkspace.tsx` — route component: SymbolProvider + activeTab state + 3-col grid + responsive drawer.
- `types.ts` — shared `HomeTab` union + tab metadata.
- `index.ts` — barrel (`export { HomeWorkspace }`).
- Tests colocated: `*.test.ts(x)`.

Modified (minimal, additive):
- `src/features/trading/TradingPanel.tsx` — add optional `hideHeader?: boolean`.
- `src/features/watchlist/WatchlistPanel.tsx` — add optional `onRowSelect?: (symbol: string) => void`, threaded to `WatchlistTab` + `HoldingsTab`.
- `src/app/router.tsx` — `/` → `<HomeWorkspace />` (was `<MarketDailyPage />`).

Reused as-is: `NewsFeedPanel`, `AIPatternPanel`, `PremiumGate`, `MarketDailyPage`, `useSymbol`/`SymbolProvider`, `usePrice`, `useSymbolSearch`, `useWatchlist`.

---

### Task 1: `useInitialSymbol` hook (last-viewed → watchlist → VNINDEX)

**Files:**
- Create: `dashboard/src/features/home-workspace/useInitialSymbol.ts`
- Test: `dashboard/src/features/home-workspace/useInitialSymbol.test.ts`

**Interfaces:**
- Produces: `useInitialSymbol(): string` — returns the resolved initial symbol. `persistLastViewedSymbol(symbol: string): void` — writes a non-index symbol to localStorage under key `iqx:last-viewed-symbol`.
- Consumes: `useWatchlist()` from `@/features/watchlist` (returns `{ data?: { symbol: string }[] }`); `isIndexSymbol` from `@/features/stock`.

- [ ] **Step 1: Write the failing test**

```ts
// useInitialSymbol.test.ts
import { renderHook } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useInitialSymbol, persistLastViewedSymbol, LAST_VIEWED_KEY } from "./useInitialSymbol"

vi.mock("@/features/watchlist", () => ({ useWatchlist: vi.fn() }))
import { useWatchlist } from "@/features/watchlist"

describe("useInitialSymbol", () => {
  beforeEach(() => {
    localStorage.clear()
    ;(useWatchlist as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] })
  })

  it("returns the persisted last-viewed symbol when present", () => {
    localStorage.setItem(LAST_VIEWED_KEY, "HPG")
    const { result } = renderHook(() => useInitialSymbol())
    expect(result.current).toBe("HPG")
  })

  it("falls back to the first watchlist item when no last-viewed", () => {
    ;(useWatchlist as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: [{ symbol: "FPT" }, { symbol: "VCB" }] })
    const { result } = renderHook(() => useInitialSymbol())
    expect(result.current).toBe("FPT")
  })

  it("falls back to VNINDEX when nothing else is available", () => {
    const { result } = renderHook(() => useInitialSymbol())
    expect(result.current).toBe("VNINDEX")
  })

  it("persistLastViewedSymbol stores a stock but ignores an index", () => {
    persistLastViewedSymbol("HPG")
    expect(localStorage.getItem(LAST_VIEWED_KEY)).toBe("HPG")
    persistLastViewedSymbol("VNINDEX")
    expect(localStorage.getItem(LAST_VIEWED_KEY)).toBe("HPG") // unchanged
  })
})
```

- [ ] **Step 2: Run it (red)**

Run: `npx vitest run src/features/home-workspace/useInitialSymbol.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// useInitialSymbol.ts
import { useWatchlist } from "@/features/watchlist"
import { isIndexSymbol } from "@/features/stock"

export const LAST_VIEWED_KEY = "iqx:last-viewed-symbol"

/** Persist a non-index symbol as the user's last-viewed context. */
export function persistLastViewedSymbol(symbol: string): void {
  const s = symbol?.trim().toUpperCase()
  if (!s || isIndexSymbol(s)) return
  try {
    localStorage.setItem(LAST_VIEWED_KEY, s)
  } catch {
    /* ignore quota / unavailable storage */
  }
}

function readLastViewed(): string | null {
  try {
    return localStorage.getItem(LAST_VIEWED_KEY)
  } catch {
    return null
  }
}

/** Resolve the initial home-workspace context: last-viewed → first watchlist → VNINDEX. */
export function useInitialSymbol(): string {
  const { data } = useWatchlist()
  const lastViewed = readLastViewed()
  if (lastViewed) return lastViewed.toUpperCase()
  const first = data?.[0]?.symbol
  if (first) return first.toUpperCase()
  return "VNINDEX"
}
```

- [ ] **Step 4: Run it (green)**

Run: `npx vitest run src/features/home-workspace/useInitialSymbol.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/home-workspace/useInitialSymbol.ts src/features/home-workspace/useInitialSymbol.test.ts
git commit -m "feat(home-workspace): useInitialSymbol resolver (last-viewed → watchlist → VNINDEX)"
```

---

### Task 2: `types.ts` — tab model

**Files:**
- Create: `dashboard/src/features/home-workspace/types.ts`

**Interfaces:**
- Produces: `type HomeTab = "order" | "watchlist" | "news" | "phan-tich" | "patterns"`; `interface HomeTabMeta { id: HomeTab; label: string; indexDisabled?: boolean }`; `const HOME_TABS: HomeTabMeta[]`.

- [ ] **Step 1: Implement (no test — pure constants consumed by tested components)**

```ts
// types.ts
export type HomeTab = "order" | "watchlist" | "news" | "phan-tich" | "patterns"

export interface HomeTabMeta {
  id: HomeTab
  label: string
  /** When the context symbol is an index, this tab is disabled in the rail. */
  indexDisabled?: boolean
}

export const HOME_TABS: HomeTabMeta[] = [
  { id: "order", label: "Đặt lệnh", indexDisabled: true },
  { id: "watchlist", label: "Danh mục" },
  { id: "news", label: "Tin tức" },
  { id: "phan-tich", label: "Phân tích" },
  { id: "patterns", label: "Mẫu nến" },
]
```

- [ ] **Step 2: Commit**

```bash
git add src/features/home-workspace/types.ts
git commit -m "feat(home-workspace): HomeTab model + tab metadata"
```

---

### Task 3: `HomeIconRail` component

**Files:**
- Create: `dashboard/src/features/home-workspace/HomeIconRail.tsx`
- Test: `dashboard/src/features/home-workspace/HomeIconRail.test.tsx`

**Interfaces:**
- Consumes: `HomeTab`, `HOME_TABS` from `./types`.
- Produces: `HomeIconRail({ active, onSelect, isIndex }: { active: HomeTab; onSelect: (t: HomeTab) => void; isIndex: boolean })`. Renders 5 buttons (icon + 10px label). The active tab is highlighted with a left border. When `isIndex`, the `order` tab is disabled (greyed, `aria-disabled`, not clickable). Each button has `aria-label`.

Icons (reuse existing): `IconShoppingCart`, `IconNewspaper`, `IconCandlestick` from `@/features/dashboard/icons`; `IconBulb` from `@/shared/icons`; `IconEye` from `@arco-design/web-react/icon`. Map: order→IconShoppingCart, watchlist→IconEye, news→IconNewspaper, phan-tich→IconBulb, patterns→IconCandlestick.

- [ ] **Step 1: Write the failing test**

```tsx
// HomeIconRail.test.tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { HomeIconRail } from "./HomeIconRail"

describe("HomeIconRail", () => {
  it("renders the 5 tab labels and fires onSelect", () => {
    const onSelect = vi.fn()
    render(<HomeIconRail active="order" onSelect={onSelect} isIndex={false} />)
    for (const label of ["Đặt lệnh", "Danh mục", "Tin tức", "Phân tích", "Mẫu nến"]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole("button", { name: /Tin tức/ }))
    expect(onSelect).toHaveBeenCalledWith("news")
  })

  it("disables the Đặt lệnh tab when the context is an index", () => {
    const onSelect = vi.fn()
    render(<HomeIconRail active="watchlist" onSelect={onSelect} isIndex />)
    const orderBtn = screen.getByRole("button", { name: /Đặt lệnh/ })
    expect(orderBtn).toBeDisabled()
    fireEvent.click(orderBtn)
    expect(onSelect).not.toHaveBeenCalledWith("order")
  })
})
```

- [ ] **Step 2: Run it (red)**

Run: `npx vitest run src/features/home-workspace/HomeIconRail.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// HomeIconRail.tsx
import type { ComponentType } from "react"
import { IconEye } from "@arco-design/web-react/icon"
import { IconBulb } from "@/shared/icons"
import { IconShoppingCart, IconNewspaper, IconCandlestick } from "@/features/dashboard/icons"
import { cn } from "@/shared/lib/cn"
import { HOME_TABS, type HomeTab } from "./types"

const ICONS: Record<HomeTab, ComponentType<{ className?: string }>> = {
  order: IconShoppingCart,
  watchlist: IconEye,
  news: IconNewspaper,
  "phan-tich": IconBulb,
  patterns: IconCandlestick,
}

export function HomeIconRail({
  active,
  onSelect,
  isIndex,
}: {
  active: HomeTab
  onSelect: (t: HomeTab) => void
  isIndex: boolean
}) {
  return (
    <nav
      aria-label="Bảng công cụ mã CK"
      className="flex h-full w-16 flex-col items-center gap-0.5 border-l border-[var(--color-border-2)] bg-[var(--color-bg-2)] py-2"
    >
      {HOME_TABS.map((tab) => {
        const Icon = ICONS[tab.id]
        const disabled = isIndex && !!tab.indexDisabled
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            aria-current={isActive ? "true" : undefined}
            disabled={disabled}
            onClick={() => !disabled && onSelect(tab.id)}
            title={disabled ? "Chọn mã CK cụ thể để đặt lệnh" : tab.label}
            className={cn(
              "flex w-full flex-col items-center gap-0.5 border-l-2 px-1 py-2 transition-colors",
              disabled
                ? "cursor-not-allowed border-transparent text-[var(--color-text-4)] opacity-50"
                : isActive
                  ? "border-[rgb(var(--primary-6))] bg-[var(--color-primary-light-1)] text-[rgb(var(--primary-6))]"
                  : "border-transparent text-[var(--color-text-3)] hover:bg-[var(--color-fill-2)] hover:text-[var(--color-text-1)]",
            )}
          >
            <Icon className="text-[18px]" />
            <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: Run it (green)**

Run: `npx vitest run src/features/home-workspace/HomeIconRail.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/home-workspace/HomeIconRail.tsx src/features/home-workspace/HomeIconRail.test.tsx
git commit -m "feat(home-workspace): HomeIconRail (5 tabs, index-aware order disable)"
```

---

### Task 4: `SymbolContextHeader` component (sticky shared header)

**Files:**
- Create: `dashboard/src/features/home-workspace/SymbolContextHeader.tsx`
- Test: `dashboard/src/features/home-workspace/SymbolContextHeader.test.tsx`

**Interfaces:**
- Consumes: `useSymbol()` from `@/shared/contexts/symbol-context` (`{ symbol, setSymbol }`); `usePrice(symbol)` from `@/features/market-data` (`{ data: PriceBoardData | null, isLoading }`); `useSymbolSearch(query)` from `@/features/market-data` (`{ results: SymbolSearchResult[], isFetching }`).
- Produces: `SymbolContextHeader()` (no props — reads context). Renders: the 🎯 shared-context label; a symbol selector (exchange badge + symbol + "▾ Đổi mã") that opens an Arco `Select` picker calling `setSymbol`; a price line (price + signed change); a 3×2 mini-stats grid (Trần/TC/Sàn · KL/NN/GTGD). Skeleton (`Spin`) while loading a new symbol.

Note: the price formatters mirror `TradingPanel`'s (kept local to avoid refactoring the terminal; identical logic).

- [ ] **Step 1: Write the failing test**

```tsx
// SymbolContextHeader.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { SymbolContextHeader } from "./SymbolContextHeader"

vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "HPG", setSymbol: vi.fn() }),
}))
vi.mock("@/features/market-data", () => ({
  usePrice: () => ({
    data: {
      symbol: "HPG", exchange: "HOSE",
      ceilingPrice: 29.75, floorPrice: 25.85, referencePrice: 27.8,
      openPrice: 28, closePrice: 28.45, highestPrice: 28.6, lowestPrice: 27.9,
      priceChange: 0.65, percentChange: 2.34, hasTraded: true,
      totalVolume: 24_500_000, totalValue: 695_000_000_000,
      bid: [], ask: [], foreignBuy: 50_000_000_000, foreignSell: 10_800_000_000, foreignRoom: null,
    },
    isLoading: false,
  }),
  useSymbolSearch: () => ({ results: [], isFetching: false }),
}))

describe("SymbolContextHeader", () => {
  it("renders the shared-context label, symbol, price and change", () => {
    render(<SymbolContextHeader />)
    expect(screen.getByText(/DÙNG CHUNG CHO MỌI TAB/)).toBeInTheDocument()
    expect(screen.getByText("HPG")).toBeInTheDocument()
    expect(screen.getByText("28.450")).toBeInTheDocument() // closePrice ×1000
    expect(screen.getByText(/\+2[.,]34%/)).toBeInTheDocument()
  })

  it("shows the Trần / TC / Sàn mini-stat labels", () => {
    render(<SymbolContextHeader />)
    expect(screen.getByText("Trần")).toBeInTheDocument()
    expect(screen.getByText("TC")).toBeInTheDocument()
    expect(screen.getByText("Sàn")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it (red)**

Run: `npx vitest run src/features/home-workspace/SymbolContextHeader.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// SymbolContextHeader.tsx
import { useState } from "react"
import { Select, Spin, Tag } from "@arco-design/web-react"
import { IconSearch } from "@arco-design/web-react/icon"
import { usePrice, useSymbolSearch } from "@/features/market-data"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { StockLogo } from "@/features/navigation/StockLogo"
import { cn } from "@/shared/lib/cn"

const { Option } = Select

function fmtPrice(p: number): string {
  if (!p || p <= 0) return "—"
  return (p * 1000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })
}
function fmtCompact(v: number): string {
  if (!v) return "—"
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B"
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M"
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K"
  return String(v)
}
function priceColorClass(price: number, ref: number, ceil: number, floor: number): string {
  if (!price || !ref) return "text-[var(--color-text-1)]"
  if (price >= ceil) return "text-ceiling"
  if (price <= floor) return "text-floor"
  if (price > ref) return "text-up"
  if (price < ref) return "text-down"
  return "text-reference"
}

function SymbolPicker({ onPick }: { onPick: (s: string) => void }) {
  const [query, setQuery] = useState("")
  const { results, isFetching } = useSymbolSearch(query)
  return (
    <Select
      showSearch
      filterOption={false}
      allowClear
      value={undefined}
      inputValue={query}
      placeholder="Đổi mã — gõ để tìm…"
      loading={isFetching}
      prefix={<IconSearch />}
      arrowIcon={null}
      size="small"
      style={{ width: "100%" }}
      onSearch={setQuery}
      onChange={(v) => v && onPick(String(v).toUpperCase())}
      onInputValueChange={(v, reason) => reason === "manual" && setQuery(v)}
      notFoundContent={
        isFetching ? <div className="py-2 text-center"><Spin size={14} /></div> : null
      }
      dropdownMenuStyle={{ maxHeight: 320 }}
    >
      {results.map((s) => (
        <Option key={s.symbol} value={s.symbol}>
          <div className="flex items-center gap-2 py-0.5">
            <StockLogo symbol={s.symbol} size={22} />
            <span className="text-xs font-semibold">{s.symbol}</span>
            <span className="truncate text-[10px] text-[var(--color-text-3)]">{s.name || s.nameEn}</span>
          </div>
        </Option>
      ))}
    </Select>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--color-text-3)]">{label}</span>
      <span className={cn("font-medium tabular-nums text-[var(--color-text-1)]", className)}>{value}</span>
    </div>
  )
}

export function SymbolContextHeader() {
  const { symbol, setSymbol } = useSymbol()
  const { data, isLoading } = usePrice(symbol)
  const [picking, setPicking] = useState(false)

  const pick = (s: string) => {
    setSymbol(s)
    setPicking(false)
  }

  return (
    <div className="sticky top-0 z-10 border-b-2 border-[rgb(var(--primary-6))]/30 bg-gradient-to-b from-[var(--color-primary-light-1)] to-transparent px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[rgb(var(--primary-6))]">
        <span aria-hidden>🎯</span>
        <span>Mã đang xem — dùng chung cho mọi tab</span>
      </div>

      {picking ? (
        <SymbolPicker onPick={pick} />
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex w-full items-center gap-2 rounded-md border border-[var(--color-border-3)] bg-[var(--color-bg-1)] px-2.5 py-2 text-left transition-colors hover:border-[rgb(var(--primary-6))]"
        >
          {data?.exchange && <Tag size="small" bordered>{data.exchange}</Tag>}
          <span className="flex-1 text-base font-bold text-[var(--color-text-1)]">{symbol}</span>
          <span className="text-xs text-[var(--color-text-3)]">▾ Đổi mã</span>
        </button>
      )}

      {isLoading && !data ? (
        <div className="flex justify-center py-3"><Spin size={16} /></div>
      ) : data ? (
        <>
          <div className="mt-2.5 flex items-baseline justify-between">
            <span
              className={cn(
                "text-[22px] font-black tabular-nums tracking-tight",
                priceColorClass(data.closePrice, data.referencePrice, data.ceilingPrice, data.floorPrice),
              )}
            >
              {fmtPrice(data.closePrice)}
            </span>
            <span className={cn("text-xs font-semibold", data.priceChange >= 0 ? "text-up" : "text-down")}>
              {data.priceChange >= 0 ? "▲ +" : "▼ "}
              {fmtPrice(data.priceChange)} ({data.percentChange >= 0 ? "+" : ""}
              {data.percentChange?.toFixed(2)}%)
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-0.5 border-t border-[var(--color-border-2)] pt-2.5 text-[11px]">
            <Stat label="Trần" value={fmtPrice(data.ceilingPrice)} className="text-ceiling" />
            <Stat label="TC" value={fmtPrice(data.referencePrice)} className="text-reference" />
            <Stat label="Sàn" value={fmtPrice(data.floorPrice)} className="text-floor" />
            <Stat label="KL" value={fmtCompact(data.totalVolume)} />
            <Stat
              label="NN"
              value={`${data.foreignBuy - data.foreignSell >= 0 ? "+" : ""}${fmtCompact(data.foreignBuy - data.foreignSell)}`}
              className={data.foreignBuy - data.foreignSell >= 0 ? "text-up" : "text-down"}
            />
            <Stat label="GTGD" value={fmtCompact(data.totalValue)} />
          </div>
        </>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run it (green)**

Run: `npx vitest run src/features/home-workspace/SymbolContextHeader.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/home-workspace/SymbolContextHeader.tsx src/features/home-workspace/SymbolContextHeader.test.tsx
git commit -m "feat(home-workspace): SymbolContextHeader (sticky shared symbol + picker + mini-stats)"
```

---

### Task 5: `PhanTichLauncher` component

**Files:**
- Create: `dashboard/src/features/home-workspace/PhanTichLauncher.tsx`
- Test: `dashboard/src/features/home-workspace/PhanTichLauncher.test.tsx`

**Interfaces:**
- Consumes: `useSymbol()`; `isIndexSymbol` from `@/features/stock`; `useNavigate` from `react-router`.
- Produces: `PhanTichLauncher()`. For a stock: a compact card (symbol + "Phân tích bởi IQX AI" badge + a primary button "Mở phân tích chuyên sâu" → `navigate(\`/co-phieu/${symbol}\`)`). For an index: the empty state via the shared `SelectStockEmptyState`. Also exports `SelectStockEmptyState({ what }: { what?: string })` — the "📊 Hãy chọn mã CK…" empty state with an ↑ hint, reused by the Mẫu nến tab (spec §6.3).

- [ ] **Step 1: Write the failing test**

```tsx
// PhanTichLauncher.test.tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

const navigate = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigate }))
let mockSymbol = "HPG"
vi.mock("@/shared/contexts/symbol-context", () => ({ useSymbol: () => ({ symbol: mockSymbol, setSymbol: vi.fn() }) }))
vi.mock("@/features/stock", () => ({ isIndexSymbol: (s: string) => s === "VNINDEX" }))
import { PhanTichLauncher } from "./PhanTichLauncher"

describe("PhanTichLauncher", () => {
  it("navigates to the stock page for a stock symbol", () => {
    mockSymbol = "HPG"
    render(<PhanTichLauncher />)
    fireEvent.click(screen.getByRole("button", { name: /Mở phân tích/ }))
    expect(navigate).toHaveBeenCalledWith("/co-phieu/HPG")
  })

  it("shows the empty state for an index", () => {
    mockSymbol = "VNINDEX"
    render(<PhanTichLauncher />)
    expect(screen.getByText(/Hãy chọn mã CK/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Mở phân tích/ })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it (red)**

Run: `npx vitest run src/features/home-workspace/PhanTichLauncher.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// PhanTichLauncher.tsx
import { Button } from "@arco-design/web-react"
import { useNavigate } from "react-router"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { isIndexSymbol } from "@/features/stock"
import { IconBulb } from "@/shared/icons"

/** Shared "choose a stock" empty state (Phân tích + Mẫu nến tabs, spec §6.3). */
export function SelectStockEmptyState({ what = "phân tích" }: { what?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[var(--color-text-3)]">
      <span className="text-2xl" aria-hidden>↑</span>
      <p className="text-sm">📊 Hãy chọn mã CK ở header bên trên để bắt đầu {what}.</p>
    </div>
  )
}

export function PhanTichLauncher() {
  const { symbol } = useSymbol()
  const navigate = useNavigate()

  if (isIndexSymbol(symbol)) {
    return <SelectStockEmptyState what="phân tích" />
  }

  return (
    <div className="px-3 py-4">
      <div className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-1)] p-4">
        <div className="mb-1 inline-flex items-center gap-1.5 rounded bg-[var(--color-primary-light-1)] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--primary-6))]">
          <IconBulb /> Phân tích bởi IQX AI
        </div>
        <h4 className="mt-1 text-sm font-bold text-[var(--color-text-1)]">Phân tích chuyên sâu {symbol}</h4>
        <p className="mt-1 text-xs text-[var(--color-text-3)]">
          Xu hướng, vùng giá quan trọng, chỉ báo kỹ thuật và định giá — tổng hợp trên trang mã.
        </p>
        <Button
          type="primary"
          long
          className="mt-3"
          onClick={() => navigate(`/co-phieu/${symbol.toUpperCase()}`)}
        >
          Mở phân tích chuyên sâu
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run it (green)**

Run: `npx vitest run src/features/home-workspace/PhanTichLauncher.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/home-workspace/PhanTichLauncher.tsx src/features/home-workspace/PhanTichLauncher.test.tsx
git commit -m "feat(home-workspace): PhanTichLauncher (launch AI Insight; index empty-state)"
```

---

### Task 6: Adapt reused panels — `TradingPanel.hideHeader` + `WatchlistPanel.onRowSelect`

**Files:**
- Modify: `dashboard/src/features/trading/TradingPanel.tsx`
- Modify: `dashboard/src/features/watchlist/WatchlistPanel.tsx`
- Test: `dashboard/src/features/trading/TradingPanel.headerprop.test.tsx` (new, focused)

**Interfaces:**
- Produces: `TradingPanel({ hideHeader }?: { hideHeader?: boolean })` — when `hideHeader` is true, the internal `<StockHeader/>` is NOT rendered (default false → terminal unchanged). `WatchlistPanel({ onRowSelect }?: { onRowSelect?: (symbol: string) => void })` — when provided, clicking a watchlist/holding row calls `onRowSelect(symbol)` instead of navigating; when absent, current navigation behavior is unchanged.

- [ ] **Step 1: Write the failing test** (TradingPanel header prop — mock the data hooks so the panel renders deterministically)

```tsx
// TradingPanel.headerprop.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

vi.mock("@/shared/contexts/symbol-context", () => ({ useSymbol: () => ({ symbol: "HPG", setSymbol: vi.fn() }) }))
vi.mock("@/features/market-data", () => ({
  usePrice: () => ({ data: { symbol: "HPG", exchange: "HOSE", closePrice: 28.45, referencePrice: 27.8, ceilingPrice: 29.75, floorPrice: 25.85, priceChange: 0.65, percentChange: 2.34, totalVolume: 1, totalValue: 1, foreignBuy: 0, foreignSell: 0, bid: [], ask: [] }, isLoading: false }),
}))
vi.mock("./hooks", () => ({
  useAccount: () => ({ data: undefined }),
  usePortfolio: () => ({ data: { positions: [] } }),
  usePlaceOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useActivateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/features/auth", () => ({ useAuth: () => ({ isAuthenticated: false, setShowAuthModal: vi.fn() }) }))
vi.mock("@/features/premium", () => ({ usePremiumStatus: () => ({ isPremium: false, isLoading: false }) }))
vi.mock("@/features/watchlist", () => ({ useWatchlistToggle: () => ({ isWatched: () => false, toggle: vi.fn(), isPending: false }), useSymbolInfo: () => ({ data: undefined }) }))
import { TradingPanel } from "./TradingPanel"

describe("TradingPanel hideHeader", () => {
  it("omits the StockHeader symbol button when hideHeader is set", () => {
    const { rerender } = render(<TradingPanel />)
    // Default: StockHeader renders the symbol as a button
    expect(screen.getAllByText("HPG").length).toBeGreaterThan(0)
    rerender(<TradingPanel hideHeader />)
    // With hideHeader, the StockHeader's exchange Tag ("HOSE") is gone
    expect(screen.queryByText("HOSE")).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it (red)**

Run: `npx vitest run src/features/trading/TradingPanel.headerprop.test.tsx`
Expected: FAIL (`hideHeader` not a prop; HOSE still renders).

- [ ] **Step 3a: Implement `TradingPanel.hideHeader`** — change the signature and guard the header:

```tsx
// in TradingPanel.tsx — replace `export function TradingPanel() {`
export function TradingPanel({ hideHeader = false }: { hideHeader?: boolean } = {}) {
```
and replace the `<StockHeader symbol={symbol} data={data} isLoading={isLoading} />` line with:
```tsx
      {!hideHeader && <StockHeader symbol={symbol} data={data} isLoading={isLoading} />}
```

- [ ] **Step 3b: Implement `WatchlistPanel.onRowSelect`** — thread an optional callback to the two stock rows.

In `WatchlistPanel.tsx`:
1. Change `export function WatchlistPanel() {` → `export function WatchlistPanel({ onRowSelect }: { onRowSelect?: (symbol: string) => void } = {}) {` and pass `onRowSelect` into `<WatchlistTab onRowSelect={onRowSelect} />` and `<HoldingsTab onRowSelect={onRowSelect} />` (add the prop to whichever sub-tabs it renders).
2. In `WatchlistTab({ onRowSelect }: { onRowSelect?: (symbol: string) => void })`, define `const open = (s: string) => (onRowSelect ? onRowSelect(s) : navigate(\`/co-phieu/${s}\`))` and change the row's `onOpen={() => navigate(\`/co-phieu/${sym}\`)}` (≈line 205) to `onOpen={() => open(sym)}`.
3. In `HoldingsTab({ onRowSelect }: { onRowSelect?: (symbol: string) => void })`, define the same `open` helper and change the holding row `onClick={() => navigate(\`/co-phieu/${item.symbol}\`)}` (≈line 438) to `onClick={() => open(item.symbol)}`.
4. Leave `HistoryTab` unchanged (orders are not symbol-context rows).

(The `navigate` const already exists in both sub-tabs.)

- [ ] **Step 4: Run it (green) + the existing trading/watchlist suites**

Run: `npx vitest run src/features/trading src/features/watchlist`
Expected: PASS (new test + existing tests still green — default behavior unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/features/trading/TradingPanel.tsx src/features/trading/TradingPanel.headerprop.test.tsx src/features/watchlist/WatchlistPanel.tsx
git commit -m "feat(trading,watchlist): optional hideHeader + onRowSelect for workspace reuse"
```

---

### Task 7: `HomeSidePanel` — sticky header + tab body

**Files:**
- Create: `dashboard/src/features/home-workspace/HomeSidePanel.tsx`
- Test: `dashboard/src/features/home-workspace/HomeSidePanel.test.tsx`

**Interfaces:**
- Consumes: `SymbolContextHeader`, `PhanTichLauncher`, `HomeTab`; `TradingPanel` (with `hideHeader`), `WatchlistPanel` (with `onRowSelect`), `NewsFeedPanel` from `@/features/news`, `AIPatternPanel` from `@/features/patterns`, `PremiumGate` from `@/features/premium`; `useSymbol()`.
- Produces: `HomeSidePanel({ active }: { active: HomeTab })`. Renders the sticky `SymbolContextHeader` (always) + a scrollable body that switches on `active` (see code). Import paths and the `PremiumGate featureName`/`description` props are taken verbatim from `src/features/dashboard/components/RightSidebar.tsx` (same barrels: `@/features/{trading,watchlist,news,patterns,premium}`).

- [ ] **Step 1: Write the failing test** (mock the heavy panels to assert switching + header persistence)

```tsx
// HomeSidePanel.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

vi.mock("./SymbolContextHeader", () => ({ SymbolContextHeader: () => <div>SYMBOL_HEADER</div> }))
vi.mock("@/features/trading", () => ({ TradingPanel: () => <div>TRADING</div> }))
vi.mock("@/features/watchlist", () => ({ WatchlistPanel: () => <div>WATCHLIST</div> }))
vi.mock("@/features/news", () => ({ NewsFeedPanel: () => <div>NEWS</div> }))
vi.mock("@/features/patterns", () => ({ AIPatternPanel: () => <div>PATTERNS</div> }))
vi.mock("@/features/premium", () => ({ PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/features/stock", () => ({ isIndexSymbol: () => false }))
vi.mock("./PhanTichLauncher", () => ({ PhanTichLauncher: () => <div>PHANTICH</div>, SelectStockEmptyState: () => <div>EMPTY</div> }))
vi.mock("@/shared/contexts/symbol-context", () => ({ useSymbol: () => ({ symbol: "HPG", setSymbol: vi.fn() }) }))
import { HomeSidePanel } from "./HomeSidePanel"

describe("HomeSidePanel", () => {
  it("keeps the symbol header mounted and switches the tab body", () => {
    const { rerender } = render(<HomeSidePanel active="order" />)
    expect(screen.getByText("SYMBOL_HEADER")).toBeInTheDocument()
    expect(screen.getByText("TRADING")).toBeInTheDocument()
    rerender(<HomeSidePanel active="news" />)
    expect(screen.getByText("SYMBOL_HEADER")).toBeInTheDocument()
    expect(screen.getByText("NEWS")).toBeInTheDocument()
    expect(screen.queryByText("TRADING")).not.toBeInTheDocument()
  })
})
```
(Note: import React types in the test file is allowed per repo convention.)

- [ ] **Step 2: Run it (red)**

Run: `npx vitest run src/features/home-workspace/HomeSidePanel.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// HomeSidePanel.tsx
import { TradingPanel } from "@/features/trading"
import { WatchlistPanel } from "@/features/watchlist"
import { NewsFeedPanel } from "@/features/news"
import { AIPatternPanel } from "@/features/patterns"
import { PremiumGate } from "@/features/premium"
import { isIndexSymbol } from "@/features/stock"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { SymbolContextHeader } from "./SymbolContextHeader"
import { PhanTichLauncher, SelectStockEmptyState } from "./PhanTichLauncher"
import type { HomeTab } from "./types"

function TabBody({ active }: { active: HomeTab }) {
  const { symbol, setSymbol } = useSymbol()
  switch (active) {
    case "order":
      return <TradingPanel hideHeader />
    case "watchlist":
      return <WatchlistPanel onRowSelect={setSymbol} />
    case "news":
      return <NewsFeedPanel />
    case "phan-tich":
      return <PhanTichLauncher />
    case "patterns":
      if (isIndexSymbol(symbol)) return <SelectStockEmptyState what="nhận diện mẫu nến" />
      return (
        <PremiumGate
          featureName="AI Mẫu nến"
          description="Nhận diện mẫu nến tự động bằng AI cho mã đang xem."
        >
          <AIPatternPanel />
        </PremiumGate>
      )
  }
}

export function HomeSidePanel({ active }: { active: HomeTab }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-l border-[var(--color-border-2)] bg-[var(--color-bg-2)]">
      <SymbolContextHeader />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TabBody active={active} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run it (green)**

Run: `npx vitest run src/features/home-workspace/HomeSidePanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/home-workspace/HomeSidePanel.tsx src/features/home-workspace/HomeSidePanel.test.tsx
git commit -m "feat(home-workspace): HomeSidePanel — sticky header + tab body switch"
```

---

### Task 8: `HomeWorkspace` shell + responsive drawer + route swap

**Files:**
- Create: `dashboard/src/features/home-workspace/HomeWorkspace.tsx`
- Create: `dashboard/src/features/home-workspace/index.ts`
- Test: `dashboard/src/features/home-workspace/HomeWorkspace.test.tsx`
- Modify: `dashboard/src/app/router.tsx`

**Interfaces:**
- Consumes: `SymbolProvider` from `@/shared/contexts/symbol-context`, `useInitialSymbol`, `HomeSidePanel`, `HomeIconRail`, `MarketDailyPage` from `@/features/market-overview/daily/MarketDailyPage`, `isIndexSymbol` from `@/features/stock`, `HomeTab`.
- Produces: `HomeWorkspace()` — the `/` route component. Wraps everything in `<SymbolProvider symbol={useInitialSymbol()}>`, holds `activeTab` state (default `"order"`), and renders the layout. `index.ts` re-exports `HomeWorkspace`.

Layout: a root `div.h-full`. ≥1024px (`lg:`): a CSS grid `lg:grid lg:grid-cols-[1fr_360px_64px] xl:grid-cols-[1fr_360px_64px]` (use 320px at the `lg`–`xl` band, 360px at `xl`: `lg:grid-cols-[1fr_320px_64px] xl:grid-cols-[1fr_360px_64px]`), each column manages its own scroll: left = `<div class="overflow-y-auto"><MarketDailyPage/></div>`, middle = `<HomeSidePanel active={activeTab} />`, right = `<HomeIconRail .../>`. Below `lg`: render only the left market column full-width (its own scroll) + a fixed bottom-right FAB button that toggles a right `Drawer` (Arco `Drawer`, `placement="right"`, `width={Math.min(360, viewport)}`) whose body = `<HomeIconRail/>` (as a row tab bar inside) + `<HomeSidePanel/>`. Selecting a tab in the rail keeps the drawer open.

To split index-awareness: `const isIndex = isIndexSymbol(symbol)` must be computed INSIDE the provider (a small inner component reading `useSymbol()`), because `HomeWorkspace` itself is above the provider's value updates. Implement an inner `WorkspaceBody` that reads `useSymbol()` for `isIndex` and holds `activeTab`; `HomeWorkspace` only sets up the provider.

- [ ] **Step 1: Write the failing test**

```tsx
// HomeWorkspace.test.tsx
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, it, expect, vi } from "vitest"

vi.mock("./useInitialSymbol", () => ({ useInitialSymbol: () => "HPG", persistLastViewedSymbol: vi.fn() }))
vi.mock("@/features/market-overview/daily/MarketDailyPage", () => ({ MarketDailyPage: () => <div>MARKET_DAILY</div> }))
vi.mock("./HomeSidePanel", () => ({ HomeSidePanel: ({ active }: { active: string }) => <div>SIDE_{active}</div> }))
vi.mock("./HomeIconRail", () => ({ HomeIconRail: ({ active }: { active: string }) => <div>RAIL_{active}</div> }))
import { HomeWorkspace } from "./HomeWorkspace"

describe("HomeWorkspace", () => {
  it("renders the market content, side panel, and rail with the default tab", () => {
    render(<MemoryRouter><HomeWorkspace /></MemoryRouter>)
    expect(screen.getByText("MARKET_DAILY")).toBeInTheDocument()
    expect(screen.getByText("SIDE_order")).toBeInTheDocument()
    expect(screen.getByText("RAIL_order")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it (red)**

Run: `npx vitest run src/features/home-workspace/HomeWorkspace.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// HomeWorkspace.tsx
import { useState } from "react"
import { Button, Drawer } from "@arco-design/web-react"
import { IconApps } from "@arco-design/web-react/icon"
import { SymbolProvider, useSymbol } from "@/shared/contexts/symbol-context"
import { isIndexSymbol } from "@/features/stock"
import { MarketDailyPage } from "@/features/market-overview/daily/MarketDailyPage"
import { HomeSidePanel } from "./HomeSidePanel"
import { HomeIconRail } from "./HomeIconRail"
import { useInitialSymbol } from "./useInitialSymbol"
import type { HomeTab } from "./types"

function WorkspaceBody() {
  const { symbol } = useSymbol()
  const isIndex = isIndexSymbol(symbol)
  const [active, setActive] = useState<HomeTab>("order")
  const [drawerOpen, setDrawerOpen] = useState(false)

  const market = (
    <div className="min-h-0 overflow-y-auto">
      <MarketDailyPage />
    </div>
  )

  return (
    <div className="h-full">
      {/* Desktop / laptop: 3-column grid */}
      <div className="hidden h-full lg:grid lg:grid-cols-[1fr_320px_64px] xl:grid-cols-[1fr_360px_64px]">
        {market}
        <HomeSidePanel active={active} />
        <HomeIconRail active={active} onSelect={setActive} isIndex={isIndex} />
      </div>

      {/* Mobile / tablet: market full-width + FAB → drawer */}
      <div className="h-full lg:hidden">
        {market}
        <Button
          shape="circle"
          type="primary"
          size="large"
          aria-label="Mở bảng giao dịch"
          icon={<IconApps />}
          className="!fixed bottom-5 right-5 z-40 shadow-lg"
          onClick={() => setDrawerOpen(true)}
        />
        <Drawer
          visible={drawerOpen}
          placement="right"
          width={360}
          title={null}
          footer={null}
          onCancel={() => setDrawerOpen(false)}
          bodyStyle={{ padding: 0 }}
        >
          <div className="flex h-full">
            <div className="min-w-0 flex-1">
              <HomeSidePanel active={active} />
            </div>
            <HomeIconRail active={active} onSelect={setActive} isIndex={isIndex} />
          </div>
        </Drawer>
      </div>
    </div>
  )
}

export function HomeWorkspace() {
  const initial = useInitialSymbol()
  return (
    <SymbolProvider symbol={initial}>
      <WorkspaceBody />
    </SymbolProvider>
  )
}
```

```ts
// index.ts
export { HomeWorkspace } from "./HomeWorkspace"
```

- [ ] **Step 4: Run it (green)**

Run: `npx vitest run src/features/home-workspace/HomeWorkspace.test.tsx`
Expected: PASS.

- [ ] **Step 5: Swap the route** — in `src/app/router.tsx`:
1. Replace the `MarketDailyPage` lazy import with `HomeWorkspace`:
```tsx
const HomeWorkspace = lazy(() =>
  import("@/features/home-workspace").then((m) => ({ default: m.HomeWorkspace })),
)
```
2. Change the home route inside `<Route element={<AppShell />}>`:
```tsx
<Route path="/" element={<HomeWorkspace />} />
```
(Leave the `MarketDailyPage` lazy import only if still used elsewhere; otherwise remove it to avoid an unused binding — `npm run build` will flag it.)

- [ ] **Step 6: Update the router test** — `src/app/router.test.tsx` currently asserts `/` renders the market page. Update its mock/assertion: mock `@/features/home-workspace` → `{ HomeWorkspace: () => <div>home-workspace</div> }` and assert `/` renders it (mirror the existing pattern in that file).

- [ ] **Step 7: Full gate**

Run: `npx vitest run` and `npm run build`
Expected: all tests pass; build clean (no TS / unused-import errors).

- [ ] **Step 8: Commit**

```bash
git add src/features/home-workspace/HomeWorkspace.tsx src/features/home-workspace/index.ts src/features/home-workspace/HomeWorkspace.test.tsx src/app/router.tsx src/app/router.test.tsx
git commit -m "feat(home-workspace): HomeWorkspace shell + responsive drawer; / route swap"
```

---

### Task 9: Manual verification + polish pass

**Files:** none (verification).

- [ ] **Step 1:** `npx vitest run` (whole suite) + `npm run build` → all green.
- [ ] **Step 2: Manual** (`npm run dev`, log in as a premium user):
  - Home `/` shows the market article (left) + sticky symbol header + Đặt lệnh tab (right) + icon rail, in BOTH light and dark theme (toggle).
  - Click each of the 5 rail tabs → the tab body switches; the symbol header stays put.
  - "Đổi mã" → pick a stock → all tabs reflect the new symbol; the Đặt lệnh button reads `ĐẶT LỆNH MUA` for that symbol.
  - Set the context to VNINDEX → the Đặt lệnh rail item is disabled; Phân tích shows the empty state.
  - Click a holding in Danh mục → it becomes the context symbol (no navigation away).
  - Shrink the viewport < 1024px → the panel/rail collapse; the FAB opens the drawer; tabs work inside it.
  - `/bieu-do` terminal still works exactly as before (regression check).
- [ ] **Step 3:** Confirm no console errors; symbol header skeleton appears briefly on symbol change.

---

## Plan complete — the home page becomes a 3-column trading workspace: market nhận định (left) + sticky shared symbol header with 5 reused tabs (middle) + icon rail (right), responsive to a drawer on mobile, with `/bieu-do` untouched.
