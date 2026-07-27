import type { TourConfig } from "@/features/tour"
import type { SidebarPanel } from "@/shared/contexts/sidebar-context"

/**
 * Bảng điện tour (nhiệm vụ ②, Chặng 2) — spec `IQX-Tour-BangDien.md` v1.0
 * ("Tài liệu bàn giao dev · v1.0 · 07/2026"), GROUND-FIRST adapted to what
 * actually exists on `/dau-truong` today (T2,
 * `docs/superpowers/plans/2026-07-27-cap0-tours.md`):
 *
 *  - Spec point 2 "Bảng giá" (a price-board LIST beside the chart) has no
 *    real target — `/dau-truong`'s `CenterPanel` is chart-only, there is no
 *    price-board list surface in this app. Replaced with the header's
 *    `SymbolSearch` — the actual "muốn xem mã khác" affordance that exists.
 *  - Spec point 5 "MUA/BÁN + Số dư" targets only the MUA/BÁN tabs — Số dư
 *    (in `AccountStrip`) and the tabs (in `OrderEntry`) aren't adjacent DOM
 *    siblings without restructuring `TradingPanel` more than a delta-only
 *    change should; Số dư is covered in the body copy instead of the hole.
 *  - Points 6/7 each spotlight TWO adjacent existing blocks (Khối lượng +
 *    Phí; Kế hoạch + nút Đặt lệnh) merged under one wrapping
 *    `data-tour-id` div — real siblings already in `OrderEntry`, no
 *    invented elements.
 *  - Point 8 (tabs Nắm giữ/Theo dõi/Lịch sử) lives in `WatchlistPanel`, a
 *    DIFFERENT sidebar panel than points 1/4/5/6/7 (`TradingPanel`,
 *    panel "trading") — `RightSidebar` only ever renders ONE panel at a
 *    time. `bangDienTourStepPanels` (parallel array, 1:1 with
 *    `bangDienTour.steps`) tells `Cap0TradingPage`'s `onStepView` wiring
 *    which `SidebarPanel` needs to be active for that step's target to
 *    exist in the DOM. `undefined` = no requirement (leave whatever panel
 *    is already active).
 *
 * Copy is condensed from the spec's 8 points (§3) — one-way product intro,
 * no concept teaching (Trần/Sàn math, LO/MP, chart reading — all deferred to
 * Cấp 1-5, per spec §7 "NGOÀI PHẠM VI").
 */
export const bangDienTour: TourConfig = {
  name: "bangdien",
  steps: [
    {
      targetId: "cap0-tour-stock-header",
      tang: "XEM MỘT MÃ",
      title: "Thanh mã & giá hiện tại",
      body: "Đây là mã bạn đang xem, kèm giá hiện tại và mức thay đổi hôm nay. Ngôi sao ★ là nút cho mã vào danh sách theo dõi.",
      placement: "below",
    },
    {
      targetId: "cap0-tour-symbol-search",
      tang: "XEM MỘT MÃ",
      title: "Tìm mã khác",
      body: "Muốn xem mã khác? Gõ vào ô tìm kiếm này — panel bên phải sẽ đổi theo mã bạn chọn.",
      placement: "below",
    },
    {
      targetId: "cap0-tour-chart",
      tang: "XEM MỘT MÃ",
      title: "Biểu đồ giá",
      body: "Biểu đồ cho thấy giá đã đi thế nào theo thời gian. Cách đọc chi tiết bạn sẽ học dần ở các cấp sau.",
      placement: "right",
    },
    {
      targetId: "cap0-tour-price-bands",
      tang: "XEM MỘT MÃ",
      title: "Trần · TC · Sàn",
      body: "Mỗi ngày giá chỉ chạy trong khoảng Trần–Sàn, quanh giá Tham chiếu (TC) hôm qua. Đây là luật sàn Việt Nam — không mua/bán ngoài khoảng này được.",
      placement: "below",
    },
    {
      targetId: "cap0-tour-buysell-balance",
      tang: "ĐẶT LỆNH & DANH MỤC",
      title: "MUA / BÁN + Số dư",
      body: "Đặt lệnh mua hay bán chọn ở đây. Số dư ngay phía trên là tiền demo của bạn để tập — không phải tiền thật.",
      placement: "below",
    },
    {
      targetId: "cap0-tour-volume-fee",
      tang: "ĐẶT LỆNH & DANH MỤC",
      title: "Khối lượng + Phí",
      body: "Nhập số cổ phiếu muốn mua. Mỗi lệnh có phí — hệ thống tính sẵn để bạn quen với chi phí thật.",
      placement: "below",
    },
    {
      targetId: "cap0-tour-plan-submit",
      tang: "ĐẶT LỆNH & DANH MỤC",
      title: "Kế hoạch + nút Đặt lệnh",
      body: "Trước khi mua, chọn một lý do vì sao bạn chọn mã này — rồi bấm ĐẶT LỆNH. Ở Cấp 1, phần lý do này sẽ nâng lên thành 5 góc phân tích thật.",
      placement: "below",
    },
    {
      targetId: "cap0-tour-portfolio-tabs",
      tang: "ĐẶT LỆNH & DANH MỤC",
      title: "Tab Nắm giữ / Theo dõi / Lịch sử",
      body: "Sau khi mua: Nắm giữ là cổ phiếu đang có, Theo dõi là mã bạn đánh dấu ★, Lịch sử là các lệnh đã xong. Kết thúc — giờ bạn đã đọc được bảng điện.",
      placement: "below",
    },
  ],
}

/**
 * Sidebar panel each `bangDienTour` step needs active (1:1 indexed) so its
 * `data-tour-id` target actually exists — see this file's docstring.
 * `undefined` entries need no panel switch (their target isn't inside the
 * sidebar's panel switch at all, e.g. the header search / the chart).
 */
export const bangDienTourStepPanels: (SidebarPanel | undefined)[] = [
  "trading",
  undefined,
  undefined,
  "trading",
  "trading",
  "trading",
  "trading",
  "watchlist",
]
