# Home "3-view switch" — Layout Redesign v2 (Design Doc)

**Ngày:** 2026-07-07 · **Nguồn:** IQX-DASHBOARD-SPEC.md v1.0 + 3 mockup (homepage-clean / stock-analysis / financial-analysis, PO Huy Lê)
**Phạm vi:** Reshape shell trang chủ `/` về đúng spec gốc. KHÔNG đụng shell app (Header/MarketBar), KHÔNG đụng `/co-phieu`, `/bieu-do`, hay trang khác.

## Quyết định đã chốt (user 2026-07-07)

1. **Layout thuần mockup:** rail phải **3 tab** (Phân tích thị trường / cổ phiếu / BCTC); **BỎ side panel** (đặt lệnh/watchlist/tin/mẫu nến) khỏi trang chủ. Đảo quyết định 04/07 (giữ side panel).
2. **Submit mã ở tab Cổ phiếu/BCTC → điều hướng** sang `/co-phieu/:symbol` (KHÔNG nhúng inline).

**An toàn đã verify:** 4 panel bị bỏ vẫn sống trong `features/dashboard/components/RightSidebar.tsx` (dùng ở `/bieu-do` + `/co-phieu`) → không mất lối vào, đúng spec §1.1 ("đặt lệnh/tin ở tab Demo Trading riêng").

## Kiến trúc mới

`HomeWorkspace` bỏ grid 3 cột (`1fr 320px 64px`) + side panel + `SymbolProvider` (không child nào của home còn dùng `useSymbol` sau khi bỏ side panel — verify bằng grep trong plan). Thay bằng:

```
Desktop (≥1024): grid  [ 1fr | 88px ]
  ┌─────────────────────────────┬──────┐
  │  CONTENT (max-w-980, center)│ RAIL │  rail 88px, border-left, sticky
  │  = view của tab đang chọn   │ 📊📈📋│  3 tab dọc
  └─────────────────────────────┴──────┘
Mobile (<1024): content full-width + rail thành BOTTOM BAR (fixed, 3 tab ngang)
```

**State:** `type HomeView = "market" | "stock" | "financial"`, default `"market"`, mount-once (không persist — spec: mỗi lần vào lại về mặc định). Click rail → đổi view + `window.scrollTo({top:0})`.

**Nội dung mỗi view:**
- `market` → `<HomeMarketView />` **giữ nguyên** (session-tabs Trước/Giữa/Cuối đã ship — nó tự có container max-w-980 + SessionMeta + tabs).
- `stock` → `<AnalysisEntryView>` icon 📈, title "Phân tích cổ phiếu", subtitle "6 lớp dữ liệu · Cập nhật theo phiên giao dịch", placeholder "Nhập mã cổ phiếu...", empty-desc (mockup verbatim), submit → `navigate('/co-phieu/{SYMBOL}')`.
- `financial` → `<AnalysisEntryView>` icon 📋, title "Phân tích BCTC", subtitle "Báo cáo tài chính · Theo quý và cả năm", empty-desc (mockup verbatim), submit → `navigate('/co-phieu/{SYMBOL}?tab=financials')`.

## Component mới (home-workspace/)

- `AnalysisEntryView.tsx` — DRY cho stock + financial: props `{icon, title, subtitle, placeholder, emptyIcon, emptyTitle, emptyDesc, onSubmit(symbol)}`. Render: view-header (icon 44px brand-soft + title Space Grotesk 22px + subtitle) + border-bottom; search-block (input uppercase + nút "Phân tích"); empty-state (icon mờ + title + desc). Submit: Enter hoặc click nút; trim + uppercase; bỏ qua nếu rỗng. Token app (brand `rgb(var(--primary-6))`, `var(--color-*)`) cho dark+light.
- `StockAnalysisView.tsx` / `FinancialAnalysisView.tsx` — wrapper mỏng gọi `AnalysisEntryView` + `useNavigate`.
- `HomeAnalysisRail.tsx` — 3 tab `{market,stock,financial}` icon (Arco: IconDashboard/IconRise/IconFile hoặc tương đương) + label 2 dòng 10px/700 uppercase; active = brand + brand-soft bg + border-brand; prop `variant: "side" | "bottom"` (side = cột dọc 88px border-left; bottom = thanh ngang fixed border-top). `role="tablist"`, mỗi nút `role="tab"` + `aria-selected`.
- Rewrite `HomeWorkspace.tsx`: `useState<HomeView>`, `useMediaQuery("(min-width:1024px)")`, desktop grid `[1fr_88px]` / mobile content + bottom rail. Bỏ import SymbolProvider/HomeSidePanel/HomeIconRail/useInitialSymbol.

## Xoá (dead sau rewrite — verify 0 ref ngoài home trước khi xoá)

`HomeSidePanel.tsx`, `HomeIconRail.tsx`, `PhanTichLauncher.tsx` (+BctcLauncher), `types.ts` (HomeTab), `useMediaQuery` GIỮ (rail dùng lại), `useInitialSymbol`/`persistLastViewedSymbol` GIỮ nếu còn ref ngoài home (grep; nếu chỉ home dùng → xoá). Các file test tương ứng xoá theo. `SymbolProvider` KHÔNG xoá (dùng ở StockPage) — chỉ bỏ khỏi home.

## Không làm (v1)

- Không nhúng phân tích 6-lớp/BCTC inline (đã chốt: điều hướng).
- Không suggested-chips "MÃ GỢI Ý" (body mockup không có; CSS thừa) — trừ khi cần; bỏ cho gọn.
- Không đổi backend, không đổi shell/Header/MarketBar, không đổi `/co-phieu` (đã nhận `?tab=` từ cycle trước).
- Không System State Bar (spec §9.3 tương lai) — chừa chỗ trên content.

## Test

- `AnalysisEntryView`: render header/subtitle/empty-desc; Enter + click nút → onSubmit(SYMBOL uppercase); input rỗng → không submit.
- Stock/Financial view: submit → navigate URL đúng (`/co-phieu/FPT`, `/co-phieu/FPT?tab=financials`).
- `HomeAnalysisRail`: 3 tab, aria-selected, click → onSelect; variant side/bottom class đúng.
- `HomeWorkspace`: default market view; click rail → đổi view (mock direct children — bài học time-of-day flake); desktop vs mobile branch render rail đúng variant.
- Grep gate: 0 ref `useSymbol` trong cây home sau rewrite; 0 ref tới file đã xoá.
- Full: vitest + tsc + build.

## Rủi ro

- Bỏ side panel = thay đổi lớn với người dùng quen bản 04/07 — nhưng đúng spec + panel còn ở /bieu-do. Chấp nhận (user chốt).
- Mobile bottom-bar chồng lên nội dung cuối trang → content padding-bottom đủ (pb-20) để không che.
