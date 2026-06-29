# Home/Chart Nav Swap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily market "nhận định" the home page (`/`, inside AppShell); move the TradingView trading terminal to a standalone **"Biểu đồ"** tab (`/bieu-do`) keeping its full chrome; remove the "Thị trường" modal entirely.

**Architecture:** Frontend-only (React Router v7 + Arco). The current `MarketOverviewModal`'s body becomes a routed page `MarketDailyPage` served under `AppShell` (shared header/marketbar/scroll/footer). `DashboardPage` (the terminal) simply changes route from `/` to `/bieu-do`. The market-modal context + component are deleted and all consumers (Header, providers, RightToolbar, Header.test) updated.

**Tech Stack:** React 19, react-router v7, Arco Design, Tailwind v4, Vitest + RTL, TanStack Query (`useDailyMarketAnalysis`).

## Global Constraints

- No `import React` in component files (React 19 automatic JSX runtime + `noUnusedLocals`); test files MAY import React.
- No unused imports (the production build is `tsc -b && vite build` — stricter than `tsc --noEmit`). **Verify with `npm run build`, not just `tsc --noEmit`.**
- Run a single test: `npx vitest run <path>`. Run typecheck/build: `npm run build`.
- The terminal (`DashboardPage`) stays **standalone** (own full-viewport chrome); the market page goes **inside AppShell** (scrollable). Do not put the terminal inside AppShell.
- No content removed from either experience — the market page renders the exact same children the modal did; the terminal is unchanged.

## File Structure

- Create: `src/features/market-overview/daily/MarketDailyPage.tsx` — the routed market home page (moved from the modal body).
- Modify: `src/app/router.tsx` — route table (`/` → MarketDailyPage in AppShell; `/bieu-do` + `/dashboard` → DashboardPage standalone).
- Modify: `src/features/navigation/Header.tsx` — NAV_ITEMS swap, remove modal branches + `useMarketModal`.
- Modify: `src/features/navigation/Header.test.tsx` — drop the market-modal mock/assertions; assert the "Biểu đồ" nav item.
- Modify: `src/app/providers.tsx` — remove `MarketModalProvider` + `MarketOverviewModal`.
- Modify: `src/features/dashboard/components/RightToolbar.tsx` — remove the "Thị trường" toolbar item + `useMarketModal`.
- Delete: `src/features/market-overview/daily/MarketOverviewModal.tsx`, `src/shared/contexts/market-modal-context.tsx`.
- Create: `src/features/market-overview/daily/MarketDailyPage.test.tsx`.

Export note: add `MarketDailyPage` to the market-overview daily barrel if one exists (check `src/features/market-overview/index.ts` / `daily/index.ts`); otherwise import it directly in router.tsx.

---

### Task 1: `MarketDailyPage` (move the modal body into a routed page)

**Files:**
- Create: `src/features/market-overview/daily/MarketDailyPage.tsx`
- Create: `src/features/market-overview/daily/MarketDailyPage.test.tsx`

**Interfaces:**
- Consumes: `useDailyMarketAnalysis()` (returns a TanStack Query result `{ data, isLoading, isError }` where `data: DailyAnalysis` with optional `data.charts`), and the existing children `MarketAnalysisArticle`, `MarketPulseBar`, `MarketTakeaway`, `TierLabel`, `BreadthChart`, `ContributionChart`, `ForeignFlowCard`, `PropFlowCard`, `HealthLineChart`, `RotationChart` (all in `src/features/market-overview/daily/` + `daily/charts/`).
- Produces: `export function MarketDailyPage()` — a routed page component (no props).

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/market-overview/daily/MarketDailyPage.test.tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

// Stub the data hook + heavy children so the page renders in isolation.
vi.mock("./useDailyMarketAnalysis", () => ({
  useDailyMarketAnalysis: () => ({ data: { charts: null }, isLoading: false, isError: false }),
}))
vi.mock("./MarketAnalysisArticle", () => ({ MarketAnalysisArticle: () => <div>ARTICLE</div> }))
vi.mock("./MarketPulseBar", () => ({ MarketPulseBar: () => <div>PULSE</div> }))
vi.mock("./MarketTakeaway", () => ({ MarketTakeaway: () => <div>TAKEAWAY</div> }))

import { MarketDailyPage } from "./MarketDailyPage"

describe("MarketDailyPage", () => {
  it("renders the daily analysis content as a page", () => {
    render(<MarketDailyPage />)
    expect(screen.getByText("ARTICLE")).toBeInTheDocument()
    expect(screen.getByText("PULSE")).toBeInTheDocument()
    expect(screen.getByText("TAKEAWAY")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/market-overview/daily/MarketDailyPage.test.tsx`
Expected: FAIL (cannot find module ./MarketDailyPage)

- [ ] **Step 3: Implement `MarketDailyPage`** (move the modal's `ModalBody` JSX verbatim; swap the `maxHeight/overflow` wrapper for a centered page container; add loading/empty states)

```tsx
// src/features/market-overview/daily/MarketDailyPage.tsx
import { Spin } from "@arco-design/web-react"
import { MarketAnalysisArticle } from "./MarketAnalysisArticle"
import { MarketPulseBar } from "./MarketPulseBar"
import { MarketTakeaway } from "./MarketTakeaway"
import { useDailyMarketAnalysis } from "./useDailyMarketAnalysis"
import { TierLabel } from "./charts/TierLabel"
import { BreadthChart } from "./charts/BreadthChart"
import { ContributionChart } from "./charts/ContributionChart"
import { ForeignFlowCard } from "./charts/ForeignFlowCard"
import { PropFlowCard } from "./charts/PropFlowCard"
import { HealthLineChart } from "./charts/HealthLineChart"
import { RotationChart } from "./charts/RotationChart"

export function MarketDailyPage() {
  const { data, isLoading, isError } = useDailyMarketAnalysis()
  const charts = data?.charts

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spin tip="Đang tải nhận định thị trường…" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 text-center text-[var(--color-text-3)]">
        Chưa có nhận định thị trường — vui lòng quay lại sau.
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-2 py-3 md:px-4">
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
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <BreadthChart data={charts.breadth} />
            <ContributionChart data={charts.contribution} />
          </div>
        </div>
      )}

      {/* ── Dòng tiền (Foreign + Prop flow cards) ── */}
      {charts && charts.foreign_detail && charts.prop_detail && (
        <div>
          <TierLabel label="Dòng tiền" />
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
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

      {/* ── Sức khỏe thị trường (health line + rotation) ── */}
      {charts && charts.market_health_detail && charts.sector_rotation && (
        <div>
          <TierLabel label="Sức khỏe thị trường" />
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <HealthLineChart
              data={charts.market_health_detail}
              classification={charts.breadth.classification}
            />
            <RotationChart data={charts.sector_rotation} />
          </div>
        </div>
      )}
    </div>
  )
}
```

(The JSX inside is copied 1:1 from `MarketOverviewModal.tsx`'s `ModalBody`. If any child requires props this plan didn't list, copy them verbatim from the modal too.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/market-overview/daily/MarketDailyPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/market-overview/daily/MarketDailyPage.tsx src/features/market-overview/daily/MarketDailyPage.test.tsx
git commit -m "feat(market): MarketDailyPage — daily nhận định as a routed page"
```

---

### Task 2: Route the market page to "/" and move the terminal to "/bieu-do"

**Files:**
- Modify: `src/app/router.tsx`

**Interfaces:**
- Consumes: `MarketDailyPage` (Task 1), existing `DashboardPage`, `AppShell`.

- [ ] **Step 1: Add the lazy import + reroute** — edit `src/app/router.tsx`:

Add the lazy import alongside the others (after the `DashboardPage` lazy import, lines 8-10):
```tsx
const MarketDailyPage = lazy(() =>
  import("@/features/market-overview/daily/MarketDailyPage").then((m) => ({ default: m.MarketDailyPage })),
)
```

Replace the two standalone DashboardPage routes (current lines 66-67):
```tsx
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
```
with the terminal at `/bieu-do` (+ `/dashboard` redirect):
```tsx
        <Route path="/bieu-do" element={<DashboardPage />} />
        <Route path="/dashboard" element={<Navigate to="/bieu-do" replace />} />
```

Inside the `<Route element={<AppShell />}>` block (after line 74), add the home route as the FIRST AppShell child:
```tsx
          <Route path="/" element={<MarketDailyPage />} />
```

(`Navigate` is already imported on line 2.)

- [ ] **Step 2: Verify the build + a route test**

Add to a new `src/app/router.test.tsx` (or extend an existing router test if present):
```tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"

// Stub the lazy page modules to avoid pulling the whole feature trees.
vi.mock("@/features/market-overview/daily/MarketDailyPage", () => ({ MarketDailyPage: () => <div>MARKET_HOME</div> }))
vi.mock("@/features/dashboard", () => ({ DashboardPage: () => <div>TERMINAL</div> }))

import { AppRouter } from "./router"

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRouter /></MemoryRouter>)
}

describe("AppRouter swap", () => {
  it("renders the market page at /", async () => {
    renderAt("/")
    expect(await screen.findByText("MARKET_HOME")).toBeInTheDocument()
  })
  it("renders the terminal at /bieu-do", async () => {
    renderAt("/bieu-do")
    expect(await screen.findByText("TERMINAL")).toBeInTheDocument()
  })
})
```
Run: `npx vitest run src/app/router.test.tsx`
Expected: PASS. (If AppShell pulls heavy providers and the "/" test flakes, also `vi.mock("./shell/AppShell", () => ({ AppShell: () => { const { Outlet } = require("react-router"); return <Outlet /> } }))` — but try without first.)

- [ ] **Step 3: Commit**

```bash
git add src/app/router.tsx src/app/router.test.tsx
git commit -m "feat(nav): / → market daily page (AppShell); terminal → /bieu-do"
```

---

### Task 3: Header nav — replace "Thị trường" with "Biểu đồ", drop the modal trigger

**Files:**
- Modify: `src/features/navigation/Header.tsx`
- Modify: `src/features/navigation/Header.test.tsx`

**Interfaces:**
- Produces: `NAV_ITEMS` (exported) no longer has a `modal` entry; all entries are `{ label, href }`.

- [ ] **Step 1: Update Header.tsx**

Change `NAV_ITEMS` (lines 29-37) — replace the modal entry with a Biểu đồ route entry, and simplify the `NavItem` type:
```tsx
type NavItem = { label: string; href: string }

export const NAV_ITEMS: NavItem[] = [
  { label: "Trang chủ", href: "/" },
  { label: "Biểu đồ", href: "/bieu-do" },
  { label: "Bảng giá", href: "/bang-gia" },
  { label: "Cổ phiếu", href: "/co-phieu" },
  { label: "Chiến lược", href: "/chien-luoc" },
  { label: "Kiến thức", href: "/bai-hoc" },
  { label: "Giới thiệu", href: "/gioi-thieu" },
]
```

Remove the `useMarketModal` import (line 21) and its usage (line 66: `const { isOpen: isMarketOpen, openMarketModal } = useMarketModal()`).

Simplify the **mobile nav** `onClickMenuItem` + items (lines 100-115) — remove the `__market` special case:
```tsx
            <Menu
              onClickMenuItem={(key) => navigate(key)}
              selectedKeys={[pathname]}
            >
              {NAV_ITEMS.map((item) => (
                <Menu.Item key={item.href}>{item.label}</Menu.Item>
              ))}
            </Menu>
```

Simplify the **desktop nav** map (lines 125-160) — remove the `if (item.modal)` branch; keep only the route button:
```tsx
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => navigate(item.href)}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              style={
                active
                  ? { background: "var(--color-primary-light-1)", color: "rgb(var(--primary-6))" }
                  : { color: "var(--color-text-2)" }
              }
            >
              {item.label}
            </button>
          )
        })}
```

(The brand logo `onClick={() => navigate("/")}` on line 78 stays — `/` is now the market home, which is the intended destination.)

- [ ] **Step 2: Update Header.test.tsx**

Open `src/features/navigation/Header.test.tsx`; remove any `vi.mock(".../market-modal-context")` / `useMarketModal` stub and any assertion about the "Thị trường" modal button. Add/adjust an assertion that the nav renders "Biểu đồ" and no "Thị trường":
```tsx
// after rendering <Header/> within its required providers:
expect(screen.getByText("Biểu đồ")).toBeInTheDocument()
expect(screen.queryByText("Thị trường")).not.toBeInTheDocument()
```
(Match the file's existing render/provider setup — only swap the market-modal bits.)

- [ ] **Step 3: Run Header tests**

Run: `npx vitest run src/features/navigation/Header.test.tsx`
Expected: PASS (no reference to market-modal-context remains in Header or its test).

- [ ] **Step 4: Commit**

```bash
git add src/features/navigation/Header.tsx src/features/navigation/Header.test.tsx
git commit -m "feat(nav): Header — 'Biểu đồ' (/bieu-do) replaces the 'Thị trường' modal item"
```

---

### Task 4: Remove the market-modal infrastructure (atomic)

**Files:**
- Modify: `src/app/providers.tsx`
- Modify: `src/features/dashboard/components/RightToolbar.tsx`
- Delete: `src/features/market-overview/daily/MarketOverviewModal.tsx`
- Delete: `src/shared/contexts/market-modal-context.tsx`

**Interfaces:** after this task, NO file imports `market-modal-context` (Header was already cleared in Task 3).

- [ ] **Step 1: providers.tsx** — remove the modal provider + component (lines 10-11 imports; 32-35 usage). New inner stack:
```tsx
// remove these two imports:
//   import { MarketModalProvider } from "@/shared/contexts/market-modal-context"
//   import { MarketOverviewModal } from "@/features/market-overview/daily/MarketOverviewModal"
...
            <MarketDataProvider>
              <SidebarProvider defaultPanel="news">
                {children}
              </SidebarProvider>
            </MarketDataProvider>
```

- [ ] **Step 2: RightToolbar.tsx** — remove the `useMarketModal` import (line 4), the `const { openMarketModal } = useMarketModal()` (line 59), and the `{ ... label: "Thị trường", id: "market", onClick: () => openMarketModal() }` item (line 82). Also remove the now-unused `IconStorage` import if it's only used by that item (check; drop it if unused). The remaining toolbar items (order/watchlist/news/ai-insight/patterns) are unchanged.

- [ ] **Step 3: Delete the dead files**
```bash
git rm src/features/market-overview/daily/MarketOverviewModal.tsx src/shared/contexts/market-modal-context.tsx
```

- [ ] **Step 4: Verify no dangling references + production build**

Run: `grep -rn "market-modal-context\|useMarketModal\|MarketOverviewModal\|MarketModalProvider\|openMarketModal" src` → expected: **no matches**.
Run: `npm run build`
Expected: build succeeds (no TS errors, no missing-import errors). This is the real gate — it catches any leftover import or unused symbol.

- [ ] **Step 5: Commit**

```bash
git add src/app/providers.tsx src/features/dashboard/components/RightToolbar.tsx
git commit -m "refactor(market): remove the Thị trường modal infra (now the home page)"
```

---

### Task 5: Full-suite verification + manual smoke

**Files:** none (verification).

- [ ] **Step 1:** Run the whole frontend test suite + build:
```
npm test        # vitest run — all green
npm run build   # tsc -b && vite build — no errors
```
Expected: all pass. Fix any test that referenced the old modal/home routing.

- [ ] **Step 2: Manual smoke** (`npm run dev`):
  - `/` shows the daily nhận định page (article + pulse + scenarios + 6 charts), inside the shared header/marketbar/footer, scrollable.
  - Nav "Biểu đồ" → `/bieu-do` shows the full trading terminal (chart + RightToolbar + RightSidebar) exactly as before.
  - `/dashboard` redirects to `/bieu-do`.
  - Header active-tab highlight: "Trang chủ" on `/`, "Biểu đồ" on `/bieu-do`. Mobile nav dropdown navigates correctly. No "Thị trường" item anywhere; the RightToolbar no longer has a "Thị trường" button.

- [ ] **Step 3:** No commit (verification only). If fixes were needed, commit them with a clear message.

---

## Plan A — done. The market daily page is the home; the terminal lives at `/bieu-do`; the modal is gone.
