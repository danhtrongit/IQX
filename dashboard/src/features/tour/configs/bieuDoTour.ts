import type { TourConfig } from "../tourTypes"

/**
 * Biểu đồ tour (T2, `docs/superpowers/plans/2026-07-27-feature-tours.md`) —
 * spec `~/Downloads/DEMO TRADING/TOUR vs BADGES/IQX-Tour-BieuDo.md` v1.0,
 * GROUND-FIRST adapted to `/bieu-do` (`dashboard/DashboardPage.tsx`, the
 * TradingView terminal, default symbol VNINDEX) as it actually renders today:
 *
 *  - Spec point 1 "Ô tìm mã (Header)" → `navigation/SymbolSearch.tsx`'s
 *    existing `data-tour-id="cap0-tour-symbol-search"` (added for the Cấp 0
 *    onboarding tour, `cap0/tours/bangDienTour.ts`) — it's the SAME DOM
 *    element (Header is shared chrome across `/dau-truong` and `/bieu-do`),
 *    only one tour is ever `active` at a time, so reusing the id is safe and
 *    avoids a redundant second attribute on the same node.
 *  - Spec point 2 "Dải chỉ số chạy" → the auto-scrolling `MarketTicker`
 *    marquee inside `navigation/MarketBar.tsx` — new
 *    `data-tour-id="tour-bieudo-market-ticker"` added directly on that
 *    marquee's own container (not the whole `MarketBar` row, which also
 *    conditionally renders an active-stock summary block on other pages).
 *  - Spec points 3-6 "Biểu đồ TradingView / Khung thời gian / Chỉ báo (fx) /
 *    Thanh công cụ vẽ" are all INSIDE the TradingView iframe/canvas — per
 *    spec §4 "KHÔNG cố deep-link vào nút con trong iframe", these 4 stops
 *    all target the SAME rough region: `CenterPanel.tsx`'s existing
 *    `data-tour-id="cap0-tour-chart"` wrapper around `<TVChart>` (already
 *    present for the Cấp 0 tour, reused here same as point 1's rationale).
 *    The spotlight hole stays fixed across these 4 steps; only the copy
 *    changes (overview → timeframe → indicators → drawing toolbar), same
 *    "narrate over a steady rough outline" approach spec §4 prescribes.
 *  - Spec point 7 "Bản vẽ tự lưu, đồng bộ thiết bị" has NO real UI (it's
 *    invisible behaviour — `getDrawingPersistence()` in
 *    `chart/drawing-persistence.ts` debounce-saves `widget.save()` output to
 *    localStorage, plus the backend `chart-drawings/:symbol` API when signed
 *    in) — a `centered: true` concept-card step, no spotlight hole.
 *  - Spec point 8 "Rail công cụ bên phải" → `components/RightToolbar.tsx`'s
 *    `<aside>`, new `data-tour-id="tour-bieudo-right-toolbar"`.
 *  - `/bieu-do` is free — no premium gating on the launch button (unlike the
 *    Backtester/Cảnh báo/Portfolio Manager/AI Mẫu nến tours, T3-T5); the
 *    "AI Mẫu nến" rail item itself is Premium-gated inside `RightSidebar`,
 *    out of scope for this tour per spec's own "NGOÀI PHẠM VI" §6.
 *
 * Net: 8 stops — spec's exact count, `~7-8` step budget.
 */
export const bieuDoTour: TourConfig = {
  name: "bieudo",
  steps: [
    {
      targetId: "cap0-tour-symbol-search",
      tang: "TOÀN CẢNH THỊ TRƯỜNG",
      title: "Ô tìm mã",
      body: "Gõ mã ở đây để xem biểu đồ và phân tích mã đó. Trang Biểu đồ này mặc định hiển thị VN-Index — bức tranh toàn thị trường.",
      placement: "below",
    },
    {
      targetId: "tour-bieudo-market-ticker",
      tang: "TOÀN CẢNH THỊ TRƯỜNG",
      title: "Dải chỉ số chạy",
      body: "Dải chỉ số VN-Index, VN30, HNX, UPCOM chạy ngang, dừng khi bạn rê chuột vào — liếc nhanh sức khỏe thị trường.",
      placement: "below",
    },
    {
      targetId: "cap0-tour-chart",
      tang: "BIỂU ĐỒ TRADINGVIEW",
      title: "Biểu đồ TradingView",
      body: "Trung tâm trang: biểu đồ TradingView chuyên nghiệp chạy trên dữ liệu IQX. Kéo-thả, phóng to, xem giá theo thời gian.",
      placement: "right",
    },
    {
      targetId: "cap0-tour-chart",
      tang: "BIỂU ĐỒ TRADINGVIEW",
      title: "Khung thời gian",
      body: "Đổi khung thời gian (ngày/tuần/tháng…) ở thanh công cụ phía trên biểu đồ.",
      placement: "right",
    },
    {
      targetId: "cap0-tour-chart",
      tang: "BIỂU ĐỒ TRADINGVIEW",
      title: "Chỉ báo (fx)",
      body: "Nút 'Chỉ báo' mở kho chỉ báo kỹ thuật của TradingView — thêm MA, RSI, MACD… tùy ý.",
      placement: "right",
    },
    {
      targetId: "cap0-tour-chart",
      tang: "BIỂU ĐỒ TRADINGVIEW",
      title: "Thanh công cụ vẽ",
      body: "Cạnh trái biểu đồ là bộ công cụ vẽ: đường xu hướng, Fibonacci, hình, chữ… để đánh dấu ý tưởng của bạn.",
      placement: "right",
    },
    {
      centered: true,
      tang: "ĐIỂM HAY CỦA IQX",
      title: "Bản vẽ tự lưu, đồng bộ thiết bị",
      body: "Mọi bản vẽ tự lưu — không có nút Save. Đăng nhập thì bản vẽ đồng bộ qua mọi thiết bị; chưa đăng nhập vẫn lưu trên máy này. Lần sau mở lại, bản vẽ còn nguyên.",
    },
    {
      targetId: "tour-bieudo-right-toolbar",
      tang: "TOÀN CẢNH THỊ TRƯỜNG",
      title: "Rail công cụ bên phải",
      body: "Biểu đồ không đứng một mình: rail này mở nhanh Đặt lệnh, Danh mục, Tin tức, AI Phân tích và AI Mẫu nến ngay cạnh biểu đồ. Kết thúc.",
      placement: "left",
    },
  ],
}
