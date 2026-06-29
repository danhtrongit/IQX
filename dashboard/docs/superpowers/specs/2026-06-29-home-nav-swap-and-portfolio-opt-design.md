# Home/Chart nav swap + Portfolio Manager optimization — Design

- **Date:** 2026-06-29
- **Status:** Approved (brainstorming) → ready for implementation plan(s)
- **Scope:** Two independent workstreams. **Part A** = navigation/IA swap (market overview → home page; trading terminal → its own "Biểu đồ" tab; remove the "Thị trường" modal). **Part B** = quality/data/visual optimization of the just-shipped Portfolio Manager (stays a modal).

These ship as **two separate implementation plans** — they share no code and can land independently.

---

## Current state (verified)

- `"/"` and `/dashboard` → `DashboardPage` (`src/features/dashboard/DashboardPage.tsx`) → `DashboardTerminal`: a standalone full-viewport Bloomberg layout (own `Header` 44px + `MarketBar` 32px + `CenterPanel`[`TVChart`] + `RightSidebar` 280px + `RightToolbar` 48px + `Footer` 24px), wrapped in `SymbolProvider symbol="VNINDEX"`. NOT scrollable; NOT in AppShell.
- **"Thị trường" is a modal** (`src/features/market-overview/daily/MarketOverviewModal.tsx`), opened via `openMarketModal()` from (a) the Header nav item `{ label:"Thị trường", modal:true }` and (b) the RightToolbar item `{ label:"Thị trường", id:"market", onClick: openMarketModal }`. The modal is mounted globally in `providers.tsx` inside `<MarketModalProvider>` (`src/shared/contexts/market-modal-context.tsx`).
- The modal body (`ModalBody`) renders, via `useDailyMarketAnalysis()`: `MarketAnalysisArticle` + `MarketPulseBar` + `MarketTakeaway` + 6 charts grouped as **Cấu trúc phiên** (`BreadthChart`, `ContributionChart`), **Dòng tiền** (`ForeignFlowCard`, `PropFlowCard`), **Sức khỏe thị trường** (`HealthLineChart`, `RotationChart`) with `TierLabel` headers. (This is the daily "nhận định phiên" feature whose backend we just fixed.)
- `NAV_ITEMS` (`src/features/navigation/Header.tsx`): Trang chủ `/` · **Thị trường** (modal) · Bảng giá · Cổ phiếu · Chiến lược · Kiến thức · Giới thiệu.
- `AppShell` (`src/app/shell/AppShell.tsx`) provides the shared Header + MarketBar + scrollable `<main>` + Footer (+ MarketDataProvider + SymbolProvider="VNINDEX") for content routes.
- A separate, **unused** `MarketOverviewPage` (`src/features/market-overview/MarketOverviewPage.tsx`, a 14-panel Arco grid) exists but is not routed — **left untouched, out of scope.**
- Portfolio Manager: `src/features/portfolio-manager/` — `PortfolioReport.tsx` orchestrator + 14 section components, launched as a modal from `PortfolioAnalysisButton` in WatchlistPanel's "Nắm giữ" tab. Stays a modal.

---

## Part A — Navigation swap

**Decisions:** home `/` becomes the market daily-nhận-định page (the modal's content, unwrapped); the trading terminal moves to a new **"Biểu đồ"** nav tab at `/bieu-do` and keeps its full chrome (chart + RightToolbar + RightSidebar); the "Thị trường" modal is removed.

### A1. Routes — `src/app/router.tsx`
- `"/"` → `<MarketDailyPage />` **inside AppShell** (scrollable editorial page using the shared chrome).
- `"/bieu-do"` → `<DashboardPage />` **standalone** (unchanged terminal; it owns its chrome and is fixed-viewport, so it must not go inside AppShell's scroll container).
- `/dashboard` → redirect to `/bieu-do` (back-compat).

### A2. Header nav — `src/features/navigation/Header.tsx`
- Replace `{ label:"Thị trường", modal:true }` with `{ label:"Biểu đồ", href:"/bieu-do" }`. "Trang chủ" `/` now resolves to the market page.
- Remove the `if (item.modal)` branch (the `openMarketModal` button) for both desktop + mobile nav, and drop the `useMarketModal` import. Active-tab highlight works by `href` match (`/` → Trang chủ, `/bieu-do` → Biểu đồ).

### A3. Remove the modal
- `src/app/providers.tsx`: remove `<MarketModalProvider>` wrapper + the global `<MarketOverviewModal />`.
- Delete `src/features/market-overview/daily/MarketOverviewModal.tsx` and `src/shared/contexts/market-modal-context.tsx`.
- `src/features/dashboard/components/RightToolbar.tsx`: remove the `{ id:"market", label:"Thị trường", onClick: openMarketModal }` item and the `openMarketModal` usage/import.
- Grep for any other `openMarketModal` / `useMarketModal` references and remove.

### A4. `MarketDailyPage` — `src/features/market-overview/daily/MarketDailyPage.tsx` (new)
- Move the modal's `ModalBody` JSX directly into this page component (the modal is the only consumer and is being deleted, so no shared sub-component is needed). It composes the same children + `useDailyMarketAnalysis()`; no content removed.
- Layout: a centered `max-w-[1280px] mx-auto` container with page padding; relies on AppShell's `<main>` for scrolling (drop the modal's `maxHeight:82vh; overflowY:auto`).
- States: page-level loading (skeleton/spinner), empty ("chưa có nhận định"), and error, derived from `useDailyMarketAnalysis()`.
- Delete `MarketOverviewModal.tsx` once its body has moved here (A3).

### A5. Audit
- Replace any `navigate("/")` that meant "go to the chart" with `/bieu-do` (the TVChart symbol-change navigates to `/co-phieu/:symbol`, unaffected; logo/Trang-chủ → `/` = market, intended).
- Confirm Header active-state + mobile nav dropdown handle the new `Biểu đồ` href (no leftover `__market` special-case).

### A6. Tests
- Router: `/` renders MarketDailyPage; `/bieu-do` renders the terminal; `/dashboard` redirects.
- Header: nav shows "Biểu đồ" (not "Thị trường"), no modal trigger remains.
- MarketDailyPage: renders the article + pulse + charts from a fixture; shows loading/empty states.

---

## Part B — Portfolio Manager optimization (modal unchanged in placement)

### B1. Quality polish (frontend)
- **StressTest scenario → data-driven** (`components/StressTest.tsx`): replace the generic attribution sentence with the portfolio's real largest holdings (top weights from `analysis.overview.positions`) and the highest-`beta` contributor, so the sentence is accurate per portfolio (no hardcoded tickers).
- **Sign-aware tone sweep:** audit every section component that renders a return/P&L; ensure none shows green-on-loss (extend the fix already applied to `total_return`/`portfolio_return` to attribution values, benchmark cells, etc.).
- `managerVoice` rendered only when non-empty (null-guard in the components that take it).
- `format.vnd()` uses U+2212 `−` for negatives (consistent with `signedPct`); `HoldingsTable` cash P&L `"0"` → `"—"`.

### B2. Data / accuracy (backend)
- **Live data-join verification** (deferred Task-4 Step-4a): confirm `vietcap.fetch_financial_report(report_type="ratio")` row keys actually populate `pe/pb/roe` (reorder `_pick` candidates if the real keys differ — else fundamentals + the quality pillar are silently null); confirm `fetch_ohlcv("VNINDEX")` returns bars; confirm `_load_sector_weights()` ICB join is non-empty. Fix any mismatch + add a regression assertion.
- **Implement Layer-07 conditional sector benchmark** (`layers.layer_quality` / `analysis.build_analysis`): when a sector weight ≥ `SECTOR_BENCH_THRESHOLD` (0.25), compute `your_return` (the portfolio's holdings in that sector) vs `industry_return` (sector index/return) and populate `quality.sector_benchmark`; the frontend `QualitySector` already renders it when non-null.
- **Deferred (stay out):** TWR, Brinson attribution.

### B3. Visual / editorial refinement (frontend CSS)
- Add a warm-parchment `--chip` token in `portfolio-manager.css` (dark: a subtle `--color-fill-2`; light: `#f3ece0`-family) and apply to `.fig`, `.wbar .track`, `.sectorbench`, `.lowdata`, `.heat .self` so light mode keeps its editorial warmth (they currently flatten to `--card`).
- Tighten spacing/responsiveness; verify dark-mode legibility of the report.

### B4. Tests
- StressTest: scenario text references real fixture holdings (not hardcoded HPG/banks).
- Backend: a test asserting fundamentals populate from a realistic ratio row; a sector-benchmark test (your_return/industry_return/gap) when a sector exceeds the threshold.

---

## Out of scope
- The unused 14-panel `MarketOverviewPage` (not adopted; the home uses the daily-nhận-định content per the locked decision).
- Portfolio report as a routed page (the user kept it a modal).
- TWR / Brinson attribution (still deferred).
