# Home Trading Workspace — right side panel + icon rail on the home page

- **Date:** 2026-06-30
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Source:** `~/Downloads/iqx-homepage-spec.md` (v1.0) + `~/Downloads/iqx-homepage-mockup.html`
- **Constraint (verbatim from user):** "vẫn giữ bộ khung hiện tại" — keep the current framework. The mockup is a **layout/structure reference only**; we keep the existing Arco Design chrome, theme tokens (light + dark), `Header`, `MarketBar`, and `Footer`. We do **not** adopt the mockup's raw GitHub-dark palette.

---

## 1. Goal

Add a right-hand **trading + analysis panel** to the home page `/` so a user can act on one stock (place orders, view holdings, read news, analyse, see candlestick patterns) **without leaving the home page**. The stock is a **shared context**: the user changes the symbol once in a sticky header and all tabs update.

The home page currently renders only the daily market "nhận định" (`MarketDailyPage`, inside `AppShell`, single scroll). It becomes a 3-column workspace: market article (left) + side panel (360px) + icon rail (64px).

## 2. Key realization — most of this already exists

The `/bieu-do` chart terminal already implements this exact pattern (a `RightToolbar` icon rail + a `RightSidebar` panel driven by a shared `useSymbol()` context). The spec's five tabs already exist as real components, and **the spec's TopBar (§3) is the existing `Header`; the TickerBar (§4) is the existing `MarketBar`/`MarketTicker`** — both already provided by `AppShell`. So we do NOT rebuild the top bar or ticker; the new work is the side panel + icon rail arranged inside AppShell's `<main>`.

| Spec tab | Existing component (path under `dashboard/src/`) | Reuse |
|---|---|---|
| Đặt lệnh | `features/trading/TradingPanel.tsx` (StockHeader + OrderBook + AccountStrip + GatedOrderEntry: LO/MP, MUA/BÁN, price/qty steppers, % buttons) | as-is + one optional prop |
| Danh mục | `features/watchlist/WatchlistPanel.tsx` (Theo dõi / **Nắm giữ** + `PortfolioAnalysisButton` / Lịch sử) | as-is + context-aware row click |
| Tin tức | `features/news/components/NewsFeedPanel.tsx` (per-symbol, filters, pagination) | as-is |
| Mẫu nến | `features/patterns/AIPatternPanel.tsx` (candles/charts switcher, premium-gated) | as-is |
| Phân tích | *(none — currently only a modal that navigates to `/co-phieu/:symbol`)* | **new launcher** |

## 3. Architecture

**Chosen approach:** a new thin `HomeWorkspace` shell that **composes the existing panel content components**, rather than reusing the terminal's `RightToolbar`/`RightSidebar` (which are coupled to the fixed-viewport `/bieu-do` layout via `position:fixed` + the global `SidebarProvider`). This reuses all the valuable panel logic, leaves `/bieu-do` untouched, and lets us add the spec's shared sticky header cleanly.

**Route change:** `/` → `<HomeWorkspace/>` inside `AppShell` (Header + MarketBar + Footer unchanged). `HomeWorkspace` renders the existing `MarketDailyPage` content in the left column.

**Layout** — CSS grid, fills the available height of AppShell's `<main>`; the **page does not scroll**, each column manages its own overflow (mirrors the mockup `.main{overflow-y:auto}` + `.tab-content{overflow-y:auto}`):

```
grid-template-columns: 1fr 360px 64px   (≥1280px)
┌───────────────────────────┬───────────────┬──────┐
│ MAIN (MarketDailyPage)     │ SIDE PANEL    │ RAIL │
│ overflow-y:auto            │ ┌───────────┐ │ 🛒   │
│                            │ │ Symbol    │ │ 👁   │
│                            │ │ Context   │ │ 📰   │
│                            │ │ Header    │ │ 💡   │
│                            │ │ (sticky)  │ │ 🕯   │
│                            │ ├───────────┤ │      │
│                            │ │ Tab body  │ │      │
│                            │ │ overflow  │ │      │
│                            │ └───────────┘ │      │
└───────────────────────────┴───────────────┴──────┘
```

**State & data flow:**
- One `SymbolProvider` wraps the whole workspace. Initial symbol from `useInitialSymbol()` (see §6). All tabs read `useSymbol()` → changing the symbol once updates every tab.
- The active tab is **local React state** in `HomeWorkspace` (isolated from the terminal's global `SidebarProvider`), since the home tab set differs (adds the Phân tích launcher).
- The sticky `SymbolContextHeader` never unmounts on tab switch.

## 4. New components (all under `dashboard/src/features/home-workspace/`)

- **`HomeWorkspace.tsx`** — the route component. Wraps `SymbolProvider` (initial from `useInitialSymbol`) + holds `activeTab` state + renders the 3-column grid (or the responsive drawer, §7). Left column = `<MarketDailyPage/>` content.
- **`SymbolContextHeader.tsx`** — sticky shared header. Renders: the 🎯 "MÃ ĐANG XEM — DÙNG CHUNG CHO MỌI TAB" label; a symbol selector (sàn badge + `name` + "▾ Đổi mã") that opens the existing `SymbolSearch` as a picker; a price line (price + signed change); a mini-stats grid (Trần/TC/Sàn · KL/NN/GTGD). Reads `useSymbol()` + `usePrice(symbol)`. Shows a skeleton (~200ms) while a new symbol loads; flashes up/down on realtime price change. **Arco theme tokens only** (legible in light + dark). Trần=ceil token, TC=reference, Sàn=floor per existing trading colors.
- **`HomeIconRail.tsx`** — 64px column, 5 items (icon + 10px label): Đặt lệnh / Danh mục / Tin tức / Phân tích / Mẫu nến. Active item highlighted + left border. **Đặt lệnh is disabled (greyed, with a hint) when the context symbol is an index** (VNINDEX/VN30/HNX/HNX30/UPCOM). Keyboard navigable (up/down), `aria-label` on each.
- **`HomeSidePanel.tsx`** — composes `SymbolContextHeader` (sticky) + the active tab body. Tab body switches on `activeTab`: `order`→`TradingPanel`, `watchlist`→`WatchlistPanel`, `news`→`NewsFeedPanel`, `phan-tich`→`PhanTichLauncher`, `patterns`→`AIPatternPanel` (premium-gated). ~150ms fade on switch.
- **`PhanTichLauncher.tsx`** — Phân tích tab body. A compact card (symbol + one-line hook + a small "Phân tích bởi IQX AI" badge per spec §6 Tab 4) + a primary button that **navigates to `/co-phieu/:symbol`** (the stock page that hosts the shipped AI Insight v2 briefing) for the current context symbol — no symbol picker needed since the symbol is already the shared context. Empty state when the context is an index: "📊 Hãy chọn mã CK ở header bên trên để bắt đầu phân tích." with an ↑ arrow to the selector.
- **`useInitialSymbol.ts`** — resolves the initial context symbol: **last-viewed (localStorage) → first watchlist item → `VNINDEX`**. Persists the last-viewed symbol to localStorage whenever the context symbol changes to a non-index stock.

## 5. Reused components — minimal adaptations

- **`TradingPanel`** — add an optional prop `hideHeader?: boolean`. When true (the workspace passes it), it omits its internal `StockHeader` (the shared `SymbolContextHeader` covers symbol/price/stats) and renders OrderBook + AccountStrip + order entry only. Default false → `/bieu-do` terminal unchanged.
- **`WatchlistPanel`** — when rendered in the workspace, clicking a holding/watch row sets the shared context (`setSymbol(row.symbol)`) instead of navigating away. Implement via an optional `onRowSelect?: (symbol: string) => void` prop; when provided, rows call it; when absent, current navigation behavior is unchanged.
- **`NewsFeedPanel`**, **`AIPatternPanel`** — drop-in (already read `useSymbol()`; patterns stays premium-gated via `PremiumGate`).
- **`SymbolSearch`** (`features/navigation/SymbolSearch.tsx`) — reused as the "Đổi mã" picker (search + results). On select → `setSymbol(picked)`.
- **`MarketDailyPage`** — reused as the left-column content. If it is currently a full-page component with its own outer container/padding, extract its inner content (the article + charts) into a `MarketDailyContent` so it composes inside the grid column without duplicated page chrome; the standalone page (if still routed anywhere) keeps wrapping it. (Implementer confirms during the task.)

## 6. Default symbol & index handling (spec §11)

- Initial symbol: `useInitialSymbol()` → last-viewed → first watchlist → `VNINDEX`.
- When the context symbol is an **index**: the Đặt lệnh tab is disabled in the rail (hint: "Chọn mã CK cụ thể để đặt lệnh"); Phân tích & Mẫu nến show the empty state. Danh mục, Tin tức still work.
- Loading: `SymbolContextHeader` shows a skeleton while a new symbol's price loads; the tab body shows its own loading state.
- Realtime: price updates via the existing realtime/`usePrice` mechanism; on change, the header flashes green/red (~300ms).

## 7. Responsive (spec §10)

| Breakpoint | Behavior |
|---|---|
| ≥ 1280px | full 3-col grid: `1fr 360px 64px` |
| 1024–1279px | side panel narrows to 320px (`1fr 320px 64px`) |
| < 1024px | side panel + rail collapse into a right slide-in **drawer**, opened by a FAB at bottom-right; the rail becomes the drawer's tab bar; the left market content takes the full width |

## 8. Theme & styling

- All new components use the **existing Arco theme CSS variables** (`--color-bg-*`, `--color-text-*`, `--color-border-*`, the trading up/down/reference/ceil/floor tokens already used by `MarketBar`/`TradingPanel`), so the workspace is correct in both light and dark mode.
- The mockup's hex values are mapped to the nearest existing tokens; we do not introduce a parallel palette.
- Spacing/structure follow the mockup (sticky header with a subtle top-border accent, 360px panel, 64px rail).

## 9. Testing (Vitest + RTL; match existing feature test conventions)

- `HomeWorkspace`: renders the 3 columns at ≥1280px (market content + side panel + rail).
- `HomeIconRail`: clicking a tab switches the tab body while the `SymbolContextHeader` stays mounted; the Đặt lệnh item is disabled when the symbol is an index.
- `SymbolContextHeader`: renders symbol, price, and change from a mocked `usePrice`; opens the picker on "Đổi mã".
- `useInitialSymbol`: returns last-viewed when present, else first watchlist item, else `VNINDEX`.
- `PhanTichLauncher`: shows the launcher for a stock and the empty state for an index; the button triggers the AI Insight flow.
- Build must pass `npm run build` (`tsc -b`, noUnusedLocals).

## 10. Out of scope (spec phase-2 / deferred)

- URL state `?symbol=HPG&panel=phan-tich` (spec §9.3) — local state only for now.
- A new in-panel technical-analysis view (RSI/MACD/MA/valuation cards) — Phân tích is a **launcher** that navigates to the existing per-stock AI Insight page, not a new analysis surface (spec §6 Tab 4 reinterpreted per the approved decision).
- Pinned multi-symbol tabs in the selector (spec §14 Q2).
- News source filtering beyond what `NewsFeedPanel` already provides (spec §14 Q3).
- Changes to the `/bieu-do` terminal (it keeps its own `RightToolbar`/`RightSidebar`).

## 11. Acceptance criteria (from spec §12, scoped to this design)

- [ ] 3-column layout renders on ≥1280px; collapses to a drawer < 1024px.
- [ ] Symbol Context Header is sticky while the tab body scrolls.
- [ ] Clicking the 5 rail tabs switches the tab body; the Symbol Header stays put.
- [ ] Changing the symbol (selector / watchlist row / header search) updates all tabs.
- [ ] Đặt lệnh button names the symbol (`MUA HPG`) — inherited from `TradingPanel`.
- [ ] Đặt lệnh disabled when the context is an index.
- [ ] Phân tích / Mẫu nến show the empty state when no specific stock is chosen.
- [ ] New components render correctly in both light and dark themes.
