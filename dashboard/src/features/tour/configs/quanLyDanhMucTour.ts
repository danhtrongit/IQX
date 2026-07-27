import type { TourConfig } from "../tourTypes"

/**
 * Người quản lý danh mục tour (T4, `docs/superpowers/plans/
 * 2026-07-27-feature-tours.md`) — spec `~/Downloads/DEMO TRADING/TOUR vs
 * BADGES/IQX-Tour-QuanLyDanhMuc.md` v1.0, GROUND-FIRST adapted to
 * `PortfolioReport.tsx` as it actually renders today:
 *
 *  - **PREMIUM tour** — `PortfolioAnalysisButton` gates its own "Xem hướng
 *    dẫn" launch button behind `usePremiumStatus()`, same rationale as
 *    `backtesterTour.ts`/`canhBaoTour.ts`.
 *  - **Demo data, not the real report**: the real report needs ≥2 holdings +
 *    a network call, so the launch button opens the modal in a TOUR MODE that
 *    renders `<PortfolioReport injected={{analysis: sampleAnalysis,
 *    narrative: sampleNarrative, meta: {valid: true, cached: false}}} />` (the
 *    fixture `portfolio-manager/__fixtures__/sample.ts`, same pattern
 *    `PortfolioReport.test.tsx` uses) — every block renders regardless of the
 *    signed-in user's real portfolio. The REAL "Phân tích danh mục" button is
 *    untouched — it still calls the real `analyze()` mutation.
 *  - **Step 1 is `centered` (no real DOM target) — a deliberate departure
 *    from the spec's literal §3 step 1** ("Target: nút 'Phân tích danh mục'
 *    trên đầu panel"). Reasoning: our launch button opens the modal AND
 *    starts the tour in the same click (so the injected report is guaranteed
 *    mounted before step 2 needs it — no preload race). By the time step 1
 *    paints, the modal (Arco `Modal`, z-index 1050) is already open over the
 *    trigger button; spotlighting an element the modal's own mask now sits
 *    on top of would look broken (the "hole" would reveal Arco's mask, not
 *    the button). A centered intro card sidesteps that entirely and is
 *    equally honest about what just happened ("mình đang cho xem một danh
 *    mục MẪU"). Steps 2-12 all target real wrapper `data-tour-id`s added
 *    around the report's blocks in `PortfolioReport.tsx` — mounted in the
 *    SAME commit as step 1 (Modal `visible` + `PortfolioReport injected`
 *    render synchronously off one click handler), so there is no
 *    target-not-yet-mounted race for any of them either.
 *  - **Grouping mirrors the spec's own §3/§4** exactly (spec already pairs
 *    Masthead+HeroScore+lede as its point 2, HoldingsTable+StatGrid as point
 *    4, QualitySector+BehaviorLowData as point 11, HealthPillars+
 *    ActionsWatchClosing as point 12) — one `data-tour-id` wrapper per group,
 *    added in `PortfolioReport.tsx` around the composed blocks (the blocks'
 *    own component files are untouched).
 *  - **FAITHFULNESS**: `narrative.layers.risk` (the 8th narrative layer) is
 *    never passed to `CorrelationHeatmap` — no component renders it. Step 8's
 *    copy (`tour-pm-correlation`) describes only what the heatmap actually
 *    shows (matrix + the highlighted top pair) and does NOT claim a
 *    "người quản lý" quote of its own; that risk narrative lives in the
 *    RevealInsight block instead (step 9), per spec §5.
 *
 * Net: 12 stops — spec's exact count (1 centered intro + 11 grounded blocks).
 */
export const quanLyDanhMucTour: TourConfig = {
  name: "quan-ly-danh-muc",
  steps: [
    {
      centered: true,
      tang: "MỞ BÁO CÁO",
      title: "Người quản lý danh mục",
      body: "Đây là báo cáo phân tích toàn danh mục — IQX chấm điểm và viết nhận xét như một người quản lý quỹ. Để bạn xem đủ mọi phần ngay, mình đang hiển thị một danh mục MẪU (không phải danh mục thật của bạn).",
    },
    {
      targetId: "tour-pm-overview",
      tang: "TỔNG QUAN",
      title: "Sức khỏe & Kết luận",
      body: "Trên đầu: điểm Sức khỏe /5 (kèm mũi tên so kỳ trước) và Kết luận một câu do người quản lý viết — đọc đoạn này là nắm ngay danh mục đang khỏe hay yếu.",
      placement: "below",
    },
    {
      targetId: "tour-pm-progress",
      tang: "TỔNG QUAN",
      title: "So với kỳ trước",
      body: "So điểm kỳ này với kỳ trước, và bao nhiêu việc kỳ trước đề xuất bạn đã làm. Báo cáo đầu tiên của bạn sẽ chưa có mục này.",
      placement: "below",
    },
    {
      targetId: "tour-pm-holdings",
      tang: "TỔNG QUAN",
      title: "Danh mục & tổng quan",
      body: "Bảng các mã đang nắm (ngành, tỷ trọng, lãi/lỗ) và ô tổng quan: NAV, số mã, lợi nhuận, thời gian nắm giữ, mức vượt chuẩn. Phần chữ nghiêng viền vàng bên dưới là nhận xét của người quản lý — sẽ lặp lại ở nhiều khối phía dưới.",
      placement: "below",
    },
    {
      targetId: "tour-pm-performance",
      tang: "HIỆU SUẤT & RỦI RO",
      title: "Hiệu suất vs chuẩn",
      body: "Lợi nhuận danh mục so với VN-Index, phần vượt chuẩn, và mức lỗ sâu nhất từng gánh.",
      placement: "below",
    },
    {
      targetId: "tour-pm-allocation",
      tang: "HIỆU SUẤT & RỦI RO",
      title: "Phân bổ ngành",
      body: "Tỷ trọng theo ngành của bạn (thanh màu) so với VN-Index (vạch chuẩn) — thấy ngay bạn đang lệch về ngành nào.",
      placement: "below",
    },
    {
      targetId: "tour-pm-stress",
      tang: "HIỆU SUẤT & RỦI RO",
      title: "Bài kiểm tra sức chịu đựng",
      body: "Bấm −5% / −10% / −15% để mô phỏng: nếu thị trường giảm bấy nhiêu, danh mục của bạn ước tính mất khoảng bao nhiêu (theo độ nhạy beta + các mã lớn nhất).",
      placement: "below",
    },
    {
      targetId: "tour-pm-correlation",
      tang: "HIỆU SUẤT & RỦI RO",
      title: "Tương quan",
      body: "Ma trận tương quan giữa các mã lớn nhất trong danh mục. Hai mã tương quan cao nghĩa là cùng lên cùng xuống — cầm cả hai không thực sự phân tán rủi ro. Cặp đáng chú ý được tô đậm bên dưới.",
      placement: "below",
    },
    {
      targetId: "tour-pm-insight",
      tang: "HIỆU SUẤT & RỦI RO",
      title: "Điều bạn có thể chưa để ý",
      body: "Một phát hiện AI chọn ra là đáng chú ý nhất cho danh mục của bạn — thường nối tiếp cảnh báo tương quan ở khối phía trên.",
      placement: "below",
    },
    {
      targetId: "tour-pm-attribution",
      tang: "SOI KỸ",
      title: "Lãi/lỗ theo mã",
      body: "Mã nào kéo danh mục lên, mã nào ghì xuống trong kỳ — quy lãi/lỗ về từng vị thế.",
      placement: "below",
    },
    {
      targetId: "tour-pm-quality-behavior",
      tang: "SOI KỸ",
      title: "Chất lượng & Kỷ luật",
      body: "Chất lượng cơ bản (P/E, P/B, ROE, cổ tức) so với trung bình ngành; và thói quen của bạn — giữ lệnh bao lâu, có ôm lỗ quá lâu không. Mã mới ít dữ liệu được ghi chú riêng.",
      placement: "below",
    },
    {
      targetId: "tour-pm-pillars-actions",
      tang: "ĐIỂM & HÀNH ĐỘNG",
      title: "5 trụ điểm & Việc cần làm",
      body: "Điểm tách theo 5 trụ (Hiệu suất · Rủi ro · Phân tán · Chất lượng · Kỷ luật), rồi các việc cần làm cụ thể + điều cần theo dõi tới kỳ sau, kết bằng lời ký của người quản lý. Kết thúc — giờ bấm 'Phân tích danh mục' để xem báo cáo thật của bạn.",
      placement: "below",
    },
  ],
}
