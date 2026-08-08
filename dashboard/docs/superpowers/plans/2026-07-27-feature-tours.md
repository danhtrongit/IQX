# Feature Tours (Increment 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Ship on-demand product tours for the app's main features, reusing the tour engine (`dashboard/src/features/tour/`) already live. 7 tours: Bảng giá, Biểu đồ, Backtester, Cảnh báo, Người quản lý danh mục, AI Mẫu nến, Bài học.

**Architecture:** FE-only. A small shared **feature-tour harness** (on-demand launch via a "?/Xem hướng dẫn" affordance on each page + `localStorage` "seen" so a page can optionally auto-run once later; analytics = no-op stub matching engine convention). Each tour = a step config (`dashboard/src/features/tour/configs/` or per-feature folder) targeting real DOM via `data-tour-id`, launched by the harness button mounted on that feature's page. **No auto-pop on deploy** (avoid mass-interrupting existing users). No backend change.

**Tech Stack:** React 19 + Arco + Tailwind v4 + Vitest/RTL. Tour engine API: `useTour(config,{onComplete,onStepView,onStart,onSkip})` + `<TourOverlay config controller/>` + `TourStep`/`TourConfig` (read `features/tour/index.ts`).

## Global Constraints
- Reuse the engine — do NOT fork it. Tours are configs + `data-tour-id` attrs + a launch button.
- **On-demand only:** a small "?"/"Xem hướng dẫn" button on each feature page starts its tour. NO auto-run on first visit in this increment (keep it opt-in; harness may store a `seen` flag for future use).
- **Premium tours** (Backtester, Cảnh báo, Portfolio Manager, AI Mẫu nến): the tour walks the real (unlocked) UI, so only meaningful for premium users — mount the launch button only when the feature is actually usable (not behind the locked overlay). For free users on those pages, no tour button (they see the upgrade gate).
- Spotlight visual = engine default. Skip=complete. Counter `ĐIỂM x/N`.
- Ground every step to a REAL element (add `data-tour-id`); drop/adapt any spec point with no real target. Specs in `~/Downloads/DEMO TRADING/TOUR vs BADGES/IQX-Tour-*.md` — adapt to reality.
- Ngôn ngữ VN; số en-US. No auto-navigation across routes unless trivial+safe.

---

### Task T1: Feature-tour harness + Bảng giá tour (validate the pattern)
**Files:** Create `dashboard/src/features/tour/useFeatureTour.ts` (wraps `useTour`; opts `{storageKey}`; exposes `{start, controller, seen}`; localStorage seen), `dashboard/src/features/tour/TourLaunchButton.tsx` (small "Xem hướng dẫn" button), `dashboard/src/features/tour/configs/bangGiaTour.ts`. Modify `price-board/BangGiaPage.tsx` + its components (add `data-tour-id` + mount the launch button + `<TourOverlay>`). Test: `useFeatureTour.test.tsx`, a BangGiaPage tour wiring test.
- [ ] Failing tests → red → implement harness + Bảng giá tour (~8-10 steps grounded to BoardToolbar tabs/search, IndexStrip, price-table column groups Trần/Sàn/TC + bid/ask/khớp, ĐTNN; per IQX-Tour-BangGia.md, adapted). Launch button in the board toolbar.
- [ ] Green: `npx vitest run src/features/tour src/features/price-board` + `npx tsc --noEmit`.
- [ ] Commit `feat(fe): feature-tour harness + Bảng giá tour`.

### Task T2: Biểu đồ tour (/bieu-do)
Config `bieuDoTour.ts` (~8 steps: symbol search, MarketBar, chart [TV-native = rough outline], timeframe/indicators/drawing toolbar rough zones, drawing auto-save narrate, right rail). Add `data-tour-id` to IQX chrome (SymbolSearch already has one from cap0; MarketBar, RightToolbar). Mount launch button on DashboardPage. TV-native controls: outline the widget region, don't deep-link. Test + gates + commit `feat(fe): Biểu đồ tour`.

### Task T3: Backtester + Cảnh báo tours (/chien-luoc, both tabs, premium)
Configs `backtesterTour.ts` (~14 steps, preload template+run like BCTC autofill — or simpler: tour the config UI + note "chạy để xem kết quả" if preload too fragile) + `canhBaoTour.ts` (~9 steps, empty-tolerant). Add `data-tour-id` in `backtest/` + `alerts/` components. Mount launch buttons per tab (only for premium — inside the unlocked UI). Test + gates + commit.

### Task T4: Người quản lý danh mục tour (modal, premium)
Config `quanLyDanhMucTour.ts` (~12 steps). Inject the sample fixture (`portfolio-manager/__fixtures__/sample.ts`) via `<PortfolioReport injected=.../>` for a demo report, run tour inside the modal, `data-tour-id` on the report blocks. Launch button = a "Xem hướng dẫn" in the modal header / next to the "Phân tích danh mục" trigger. Test + gates + commit.

### Task T5: AI Mẫu nến (/co-phieu rail, premium) + Bài học (/bai-hoc)
`mauNenTour.ts` (~7 steps, run on /co-phieu with a stock so patterns populate; `data-tour-id` in patterns/AIPatternPanel) + `baiHocTour.ts` (~7 steps across catalog→course→episode; can be centered concept cards if cross-route nav is fragile — ground it). Launch buttons on the respective surfaces. Test + gates + commit.

### Task T6: Integration + full gates
Full `tsc + vitest + build` green. Confirm each launch button only shows where the feature is usable (premium gating). Confirm no auto-pop, no route leakage of `data-tour-id`/buttons. Update any snapshot/tests. Commit test updates.
