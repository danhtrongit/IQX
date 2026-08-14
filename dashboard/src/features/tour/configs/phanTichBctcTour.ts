import type { TourConfig } from "../tourTypes"

/**
 * AI Phân tích BCTC tour (increment 2b, `docs/superpowers/plans/
 * 2026-07-27-feature-tours.md`'s Global Constraints) — spec `~/Downloads/
 * DEMO TRADING/TOUR vs BADGES/IQX-Tour-PhanTichBCTC.md` v1.0, GROUND-FIRST
 * adapted to `stock/bctc-dashboard/BctcDashboard.tsx` as it actually mounts
 * today:
 *
 *  - **Actual mount point**: NOT `/tai-chinh` or `/bctc` (spec §"Trang chạy
 *    tour" hedges on the real path) — the storytelling dashboard is inline
 *    on the HOME workspace's "Phân tích BCTC" tab
 *    (`home-workspace/FinancialAnalysisView.tsx`, via `HomeAnalysisRail`).
 *    That view's own `AnalysisEntryView` search box IS the spec's "ô tìm mã"
 *    — a real, ALWAYS-mounted element regardless of whether a symbol has
 *    been submitted yet.
 *  - **FREE tour** — unlike the Backtester/Cảnh báo/Portfolio Manager/AI Mẫu
 *    nến tours, the BCTC dashboard is NOT wrapped in an ambient
 *    `PremiumGate`: only ONE of its ten stops (KHỐI 01's AI-written story,
 *    `tour-bctc-block-01`) is itself behind a `PremiumGate` — the hero,
 *    scorecard, and KHỐI 02-07 (charts, metrics, narrative answers) are all
 *    plain free content, exactly like `/bang-gia` (T1). A free user who
 *    launches this tour simply sees KHỐI 01's step land on the SAME blurred
 *    lock overlay the page already shows them outside any tour — no special
 *    gating needed, the step's copy (below) doesn't assume premium.
 *  - **Step 1 departs from spec's literal §3 "Điểm 1 — Ô tìm mã" auto-fill
 *    VIC** (per spec §1/§5.1). Global Constraints rule out fragile
 *    auto-fill/auto-navigation for this increment. The launch button is
 *    mounted next to the rendered `BctcDashboard` (i.e. only appears once a
 *    symbol is ALREADY loaded), so the tour starts at the hero card (spec's
 *    Điểm 2) instead — copy tolerant of whichever symbol is actually
 *    showing (not hardcoded to "VIC").
 *  - **Last step reuses spec's own §5.5 "cách A"**: rather than inventing a
 *    no-target `centered` closer, it targets the SAME always-present search
 *    box from step none (`tour-bctc-search`, added to
 *    `AnalysisEntryView.tsx` via a `searchTourId` prop) — grounded, and the
 *    user naturally lands back on the input if they want to type a bank
 *    ticker next, matching the copy's own suggestion.
 *  - **Hero split in two**: `HeroCard.tsx` wraps ticker+price+one-line
 *    verdict in `tour-bctc-hero-top` and the nested `RadarScorecard` slot in
 *    `tour-bctc-scorecard` — two adjacent, non-overlapping wrappers so
 *    spec's Điểm 2 ("phần TRÊN của khối .hero") and Điểm 3 (scorecard) don't
 *    spotlight the same region.
 *  - **KHỐI 06 "Sức khỏe tài chính"** (3 sub-questions 6A/6B/6C) collapses
 *    into ONE stop (`tour-bctc-block-06`), per spec §7 "KHÔNG tour riêng
 *    cho từng phần con".
 *  - Copy is written for Template A (VIC — phi ngân hàng), per spec §1; the
 *    last step keeps spec's one-line hint about Template B (ngân hàng).
 *
 * Net: 10 stops — spec's 11 minus the dropped auto-fill step.
 */
export const phanTichBctcTour: TourConfig = {
  name: "phantichbctc",
  steps: [
    {
      targetId: "tour-bctc-hero-top",
      tang: "HERO",
      title: "Kết luận nhanh về mã",
      body: "Trên đầu trang là tóm tắt nhanh về mã: giá hiện tại, giá hợp lý ước tính, và kết luận một câu về tình trạng công ty. Đọc đoạn này là hiểu ngay công ty đang ở đâu.",
      placement: "below",
    },
    {
      targetId: "tour-bctc-scorecard",
      tang: "HERO",
      title: "Thẻ điểm sức khỏe 5 chiều",
      body: "Chấm công ty theo 5 mặt: Kinh doanh · Sinh lời · Dòng tiền · An toàn tài chính · Định giá. Biểu đồ radar cho hình dạng tổng thể — càng đều và càng to càng tốt. Bên phải là điểm chi tiết từng mặt kèm nhận xét.",
      placement: "below",
    },
    {
      targetId: "tour-bctc-block-01",
      tang: "8 KHỐI PHÂN TÍCH",
      title: "Câu chuyện doanh nghiệp",
      body: "Khối 01 là tóm tắt bằng chữ do AI viết — công ty làm gì, kiếm tiền thế nào, năm gần đây tăng trưởng ra sao. Bên dưới có 2 cột Điểm khỏe và Cần theo dõi — cách nhanh nhất để nắm được điểm mạnh và rủi ro.",
      placement: "below",
    },
    {
      targetId: "tour-bctc-block-02",
      tang: "8 KHỐI PHÂN TÍCH",
      title: "Giá đang đắt hay rẻ?",
      body: "Khối định giá: dùng nhiều phương pháp độc lập (DCF, RIM, P/E lịch sử, sàn sổ sách) để ước tính vùng giá hợp lý. Thanh ngang cho thấy giá hiện tại đang nằm ở đâu so với vùng giá trị.",
      placement: "below",
    },
    {
      targetId: "tour-bctc-block-03",
      tang: "8 KHỐI PHÂN TÍCH",
      title: "Bức tranh tài chính 5 năm",
      body: "Biểu đồ cột chồng 5 năm cho thấy công ty đang được cấu thành từ đâu — vốn chủ, nợ ngắn hạn, nợ dài hạn. Bên phải chỉ ra tăng trưởng gần đây đến từ nguồn nào — vốn hay nợ.",
      placement: "below",
    },
    {
      targetId: "tour-bctc-block-04",
      tang: "8 KHỐI PHÂN TÍCH",
      title: "Kinh doanh có ổn không?",
      body: "Khối này chấm mảng kinh doanh: doanh thu 5 năm (cột) và biên lợi nhuận gộp/ròng (đường). Xu hướng cùng đi lên là dấu hiệu tốt — bán được nhiều hơn mà vẫn giữ được biên lãi.",
      placement: "below",
    },
    {
      targetId: "tour-bctc-block-05",
      tang: "8 KHỐI PHÂN TÍCH",
      title: "Tiền có thật không?",
      body: "So sánh lợi nhuận ghi sổ với tiền mặt thật sự thu về. Nếu tiền mặt luôn cao hơn hoặc bằng lợi nhuận — công ty kiếm ra tiền thật. Nếu thấp hơn nhiều — lợi nhuận trên giấy nhưng chưa vào túi.",
      placement: "below",
    },
    {
      targetId: "tour-bctc-block-06",
      tang: "8 KHỐI PHÂN TÍCH",
      title: "Sức khỏe tài chính có vững không?",
      body: "Khối lớn nhất — chấm sức khỏe qua 3 mặt: Nợ (nhiều hay ít, có kiểm soát không) · Chống chịu (nếu khủng hoảng có sống nổi không) · Chất lượng sổ sách (số liệu có sạch, đáng tin không). Cả 3 xanh là công ty rất vững.",
      placement: "below",
    },
    {
      targetId: "tour-bctc-block-07",
      tang: "8 KHỐI PHÂN TÍCH",
      title: "Cổ đông nhận được gì?",
      body: "Khối cuối — chính sách cổ tức: 5 năm gần đây công ty chia cổ tức bao nhiêu, bằng tiền hay bằng cổ phiếu. Công ty đầu tư dài hạn thường tái đầu tư nhiều hơn trả cổ tức.",
      placement: "below",
    },
    {
      targetId: "tour-bctc-search",
      tang: "KẾT",
      title: "Tour hoàn thành ✓",
      body: "Đó là 8 khối phân tích BCTC. Bạn có thể gõ mã bất kỳ ở đây để xem báo cáo tương ứng. Riêng mã ngân hàng (VCB, TCB, BID, MBB…) sẽ có bố cục khác ở 4 khối giữa — thay Kinh doanh/Dòng tiền/Sức khỏe bằng Cách kiếm tiền · Hiệu quả vận hành · Chất lượng tài sản.",
      placement: "below",
    },
  ],
}
