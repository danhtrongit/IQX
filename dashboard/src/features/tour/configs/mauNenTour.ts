import type { TourConfig } from "../tourTypes"

/**
 * AI Mẫu nến tour (T5, `docs/superpowers/plans/2026-07-27-feature-tours.md`)
 * — spec `~/Downloads/DEMO TRADING/TOUR vs BADGES/IQX-Tour-MauNen.md` v1.0,
 * GROUND-FIRST adapted to `patterns/AIPatternPanel.tsx` as it actually
 * renders today:
 *
 *  - **PREMIUM tour.** `RightSidebar.tsx` already wraps `<AIPatternPanel>` in
 *    a `<PremiumGate featureName="AI Mẫu nến">` — but `PremiumGate` still
 *    renders its children (blurred, `pointer-events-none`) behind the locked
 *    overlay for free users (same as `canhBaoTour.ts`/`quanLyDanhMucTour.ts`)
 *    — so `AIPatternPanel` gates its own "Xem hướng dẫn" launch button
 *    behind an explicit `usePremiumStatus()` check of its own.
 *  - **Mounted ON the panel itself** (not the rail icon/`RightToolbar`), per
 *    the plan's own instruction — the panel is reachable from `/bieu-do`,
 *    `/co-phieu/:symbol`, and `/dau-truong` alike, so the launch button and
 *    tour travel with it wherever it's shown for a real stock symbol.
 *  - **Step 1 departs from spec's literal point 1** ("Icon AI Mẫu nến (rail
 *    phải) → mở panel"): since the launch button lives INSIDE the
 *    already-open panel, there's no rail-icon click to spotlight or panel to
 *    auto-open — the tour starts with the panel already visible. Step 1
 *    instead targets the panel's own header bar (`tour-maunen-header`,
 *    always mounted regardless of symbol/pattern state) with equivalent
 *    intro copy. This keeps every step GROUNDED to a real element — no
 *    `centered` fallback was needed anywhere in this tour (unlike
 *    `quanLyDanhMucTour`'s modal-open race, there's no such race here).
 *  - **Step 3 "AI đang quét"** targets `AIAnalyzingOverlay`'s own root
 *    (`tour-maunen-scanning`) — a REAL element, but one that only mounts for
 *    ~750-900ms after a kind/pattern switch (`AIPatternPanel`'s `analyzing`
 *    state) or while the initial fetch is in flight. On a typical manual
 *    tour walkthrough this target usually won't be in the DOM when the step
 *    is reached — that's fine, per the plan's own note: the engine's
 *    target-not-found→centered fallback (`TourOverlay.resolveTarget`) handles
 *    the absence gracefully, and the copy is written to read fine either way
 *    ("mỗi lần đổi mã/mẫu... hiệu ứng NÀY" rather than "hiệu ứng hiện đang
 *    chạy").
 *  - **Steps 4-7 (hero/illustration/meaning+action/all-patterns list)** only
 *    exist in the DOM once a pattern is actually loaded for the symbol
 *    (`active` truthy in `AIPatternPanel`) — same target-not-found→centered
 *    fallback covers the "Chưa có pattern cho {mã}" empty state (e.g. running
 *    the tour on a symbol with no detected patterns, or on VN-Index where
 *    the plan explicitly says NOT to run this tour).
 *  - **Meaning + Hành động đề xuất grouped into ONE stop** (spec point 6) —
 *    a single wrapper `data-tour-id="tour-maunen-meaning-action"` added
 *    around both cards in `AIPatternPanel.tsx`, mirroring
 *    `quanLyDanhMucTour.ts`'s own grouping technique (e.g. its
 *    `tour-pm-quality-behavior`/`tour-pm-pillars-actions` stops).
 *
 * Net: 7 stops — spec's exact count, all grounded to real targets.
 */
export const mauNenTour: TourConfig = {
  name: "maunen",
  steps: [
    {
      targetId: "tour-maunen-header",
      tang: "GIỚI THIỆU",
      title: "Panel AI Mẫu nến",
      body: "Panel này để AI tự nhận diện mẫu nến / mẫu giá cho mã bạn đang xem — góc trên bên phải luôn hiện đúng mã đang xem.",
      placement: "left",
    },
    {
      targetId: "tour-maunen-kind-switch",
      tang: "GIỚI THIỆU",
      title: "Chuyển \"AI Mẫu nến\" / \"AI Mẫu giá\"",
      body: "Hai chế độ: 'Mẫu nến' (mẫu hình nến ngắn hạn) và 'Mẫu giá' (mô hình giá kinh điển như tam giác, vai-đầu-vai).",
      placement: "left",
    },
    {
      targetId: "tour-maunen-scanning",
      tang: "GIỚI THIỆU",
      title: "AI đang quét",
      body: "Mỗi lần đổi mã hoặc đổi chế độ, AI quét lại giá và nhận diện lại — hiệu ứng này cho biết mô hình đang chạy.",
      placement: "left",
    },
    {
      targetId: "tour-maunen-hero",
      tang: "KẾT QUẢ",
      title: "Tên mẫu + tín hiệu",
      body: "Tên mẫu hình nhận diện được, kèm 'Tín hiệu' (Tăng/Giảm/Trung tính) và mức độ tin cậy (mẫu nến) hoặc trạng thái phá vỡ (mẫu giá).",
      placement: "left",
    },
    {
      targetId: "tour-maunen-illustration",
      tang: "KẾT QUẢ",
      title: "Hình minh họa",
      body: "Sơ đồ minh họa chính mẫu hình đó — với mẫu giá còn vẽ sẵn đường cổ/hỗ trợ/kháng cự để bạn hình dung.",
      placement: "left",
    },
    {
      targetId: "tour-maunen-meaning-action",
      tang: "KẾT QUẢ",
      title: "Ý nghĩa + Hành động đề xuất",
      body: "Hai thẻ: 'Ý nghĩa' giải thích mẫu này hàm ý gì, và 'Hành động đề xuất' — gợi ý AI đưa ra theo mẫu (chỉ tham khảo, không phải khuyến nghị đầu tư).",
      placement: "left",
    },
    {
      targetId: "tour-maunen-list",
      tang: "KẾT QUẢ",
      title: "Danh sách tất cả pattern",
      body: "Bên dưới là mọi mẫu khác nhận diện được cho mã này — bấm để xem lần lượt, không cần rời panel. Kết thúc.",
      placement: "left",
    },
  ],
}
