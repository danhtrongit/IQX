import type { TourConfig } from "../tourTypes"

/**
 * AI Phân tích cổ phiếu tour (increment 2b, `docs/superpowers/plans/
 * 2026-07-27-feature-tours.md`'s Global Constraints) — spec `~/Downloads/
 * DEMO TRADING/TOUR vs BADGES/IQX-Tour-PhanTichCoPhieu.md` v1.0, GROUND-FIRST
 * adapted to `stock/ai-insight/AiInsightBriefing.tsx` as it actually renders
 * today:
 *
 *  - **PREMIUM tour.** `AiInsightBriefing` is always mounted behind a
 *    `<PremiumGate featureName="AI Insight">` at both real call sites
 *    (`stock/StockPage.tsx`'s modal, `home-workspace/StockAnalysisView.tsx`)
 *    — and `PremiumGate` still renders its children (blurred,
 *    `pointer-events-none`) behind the locked overlay for free users — so
 *    `AiInsightBriefing` gates its own "Xem hướng dẫn" launch button behind
 *    an explicit `usePremiumStatus()` check, same rationale as
 *    `mauNenTour.ts`/`backtesterTour.ts`.
 *  - **Step 1 departs from spec's literal §3 "Điểm 1 — Ô tìm mã"** (auto-fill
 *    `VCB` + trigger load, per spec §1/§5.1). Global Constraints for this
 *    increment rule out fragile auto-fill/auto-navigation. Since the launch
 *    button lives INSIDE `AiInsightBriefing` itself, it only renders once a
 *    symbol is already loaded (whichever surface: `/co-phieu/:symbol`'s
 *    modal, or the home "Phân tích cổ phiếu" tab after a real search
 *    submit) — there is no "empty ô tìm mã" state to spotlight at that
 *    point. The tour instead starts at the component's own first
 *    always-mounted block (`HeaderStrip`, spec's Điểm 2), copy tolerant of
 *    whichever symbol is actually showing (not hardcoded to "VCB") — the
 *    exact same departure `mauNenTour.ts` documents for its own step 1.
 *  - **Not shown on the public landing-page teaser** (`marketing/landing/
 *    DemoGate.tsx` renders the REAL `AiInsightBriefing` with `injected`
 *    sample data + `teaser` — only the briefing + L1 are visible there, so
 *    a 13-step tour walking L2-L5 would have nothing to ground onto).
 *    `AiInsightBriefing` hides the launch button whenever `injected` or
 *    `teaser` is set.
 *  - **Steps 9-13 (L1-L5)** each target the WHOLE `LayerCard` (header +
 *    fields + chart/news slot + diff footer), matching spec's "cả khối L1"
 *    wording — one `data-tour-id` per layer, keyed off `data.layerNum`
 *    (`tour-aiinsight-layer-l1`… `-l5`) so `LayerCard.tsx` needs only one
 *    small change to serve all 5 stops.
 *
 * Net: 13 stops — spec's 14 minus the dropped auto-fill step.
 */
export const phanTichCoPhieuTour: TourConfig = {
  name: "phantichcophieu",
  steps: [
    {
      targetId: "tour-aiinsight-header",
      tang: "HEADER MÃ",
      title: "Thông tin nhanh về mã",
      body: "Trên đầu là các số cơ bản của mã: giá hiện tại, % thay đổi phiên, cao/thấp trong ngày, khối lượng khớp. Chấm LIVE cho biết dữ liệu đang cập nhật realtime.",
      placement: "below",
    },
    {
      targetId: "tour-aiinsight-trend-row",
      tang: "BRIEFING TỔNG HỢP",
      title: "Chẩn đoán 3 dòng",
      body: "Ba dòng đầu tiên là chẩn đoán nhanh: mã đang có xu hướng gì, trạng thái thế nào, và khung phân tích áp dụng (ngắn hạn · trung hạn · dài hạn).",
      placement: "below",
    },
    {
      targetId: "tour-aiinsight-narrative",
      tang: "BRIEFING TỔNG HỢP",
      title: "Bản tóm tắt bằng chữ",
      body: "Đoạn văn bản tổng hợp diễn biến quan trọng của mã: khối ngoại đang làm gì, tin tức gì tác động, vùng giá nào đáng chú ý. Đọc đoạn này là hiểu được tổng thể tình hình mã.",
      placement: "below",
    },
    {
      targetId: "tour-aiinsight-diff",
      tang: "BRIEFING TỔNG HỢP",
      title: "So với phiên trước",
      body: "Ô so sánh nhanh: điều gì đã thay đổi so với phiên gần nhất — áp lực bán tăng hay giảm, khối ngoại chuyển hướng, tâm lý cải thiện… Giúp bạn biết tình hình đang xấu đi hay tốt lên.",
      placement: "below",
    },
    {
      targetId: "tour-aiinsight-observations",
      tang: "BRIEFING TỔNG HỢP",
      title: "Quan sát theo 5 góc",
      body: "Tóm tắt tình hình mã từ 5 góc nhìn: Thanh khoản · Dòng tiền · Nội bộ · Tin tức · Hỗ trợ & Kháng cự. Mỗi góc 1 dòng, tương ứng 5 lớp phân tích chi tiết ở phần dưới.",
      placement: "below",
    },
    {
      targetId: "tour-aiinsight-watch-levels",
      tang: "BRIEFING TỔNG HỢP",
      title: "Mốc theo dõi",
      body: "Các mốc giá quan trọng cần chú ý — hỗ trợ ở đâu, kháng cự ở đâu, và điều gì có thể xảy ra nếu giá vượt/thủng các mốc đó.",
      placement: "below",
    },
    {
      targetId: "tour-aiinsight-verdict",
      tang: "BRIEFING TỔNG HỢP",
      title: "Gợi ý hôm nay",
      body: "Kết luận cuối cùng của bản briefing: Mua · Bán · Nắm giữ · Quan sát thêm. Đây là gợi ý dựa trên tổng hợp 5 lớp phân tích — không phải khuyến nghị tài chính, chỉ là điểm khởi đầu để bạn cân nhắc.",
      placement: "below",
    },
    {
      targetId: "tour-aiinsight-divider",
      tang: "CHUYỂN TIẾP",
      title: "5 lớp phân tích chi tiết",
      body: "Bên dưới là 5 lớp phân tích chi tiết — bằng chứng số học đằng sau bản briefing ở trên. Mỗi lớp có thang đánh giá 5 mức, bảng số liệu, và biểu đồ minh họa.",
      placement: "below",
    },
    {
      targetId: "tour-aiinsight-layer-l1",
      tang: "5 LỚP CHI TIẾT",
      title: "L1 · Xu hướng",
      body: "Lớp 1: phân tích xu hướng giá — mã đang đi ngang, tăng hay giảm, hỗ trợ/kháng cự ở đâu, đà giá thế nào. Có biểu đồ giá và MA (đường trung bình) gần nhất.",
      placement: "right",
    },
    {
      targetId: "tour-aiinsight-layer-l2",
      tang: "5 LỚP CHI TIẾT",
      title: "L2 · Thanh khoản",
      body: "Lớp 2: khối lượng giao dịch — mã đang được mua bán nhiều hay ít, so với trung bình thế nào. Có biểu đồ thanh khoản các phiên gần nhất.",
      placement: "right",
    },
    {
      targetId: "tour-aiinsight-layer-l3",
      tang: "5 LỚP CHI TIẾT",
      title: "L3 · Dòng tiền",
      body: "Lớp 3: dòng tiền lớn — khối ngoại và tự doanh CTCK đang mua ròng hay bán ròng mã này. Có 2 biểu đồ song song để so sánh.",
      placement: "right",
    },
    {
      targetId: "tour-aiinsight-layer-l4",
      tang: "5 LỚP CHI TIẾT",
      title: "L4 · Nội bộ",
      body: "Lớp 4: giao dịch nội bộ — lãnh đạo, HĐQT, cổ đông lớn đang mua hay bán cổ phiếu công ty mình. Người trong nhà mua nhiều thường là tín hiệu tích cực.",
      placement: "right",
    },
    {
      targetId: "tour-aiinsight-layer-l5",
      tang: "5 LỚP CHI TIẾT",
      title: "L5 · Tin tức",
      body: "Lớp 5: tin tức liên quan mã — các tin quan trọng gần đây có thể tác động đến giá. Kết thúc — bạn có thể cuộn lên đọc lại bản briefing hoặc gõ mã khác để xem phân tích.",
      placement: "right",
    },
  ],
}
