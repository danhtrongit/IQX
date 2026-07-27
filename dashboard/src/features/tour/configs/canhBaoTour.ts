import type { TourConfig } from "../tourTypes"

/**
 * Cảnh báo tour (T3, `docs/superpowers/plans/2026-07-27-feature-tours.md`) —
 * spec `~/Downloads/DEMO TRADING/TOUR vs BADGES/IQX-Tour-CanhBao.md` v1.0,
 * GROUND-FIRST adapted to the Cảnh báo tab of `/chien-luoc`
 * (`alerts/AlertsPage.tsx`'s `AlertsInner`) as it actually renders today:
 *
 *  - **PREMIUM tour.** `/chien-luoc` wraps BOTH tabs in one shared
 *    `PremiumGate` (`strategy/StrategyPage.tsx`) — but `PremiumGate` still
 *    renders its children (blurred, `pointer-events-none`) behind the locked
 *    overlay for free users (see `premium/components/PremiumGate.tsx`), so
 *    `AlertsInner` gates the launch button behind an explicit
 *    `usePremiumStatus()` check of its own rather than relying on the
 *    ambient gate.
 *  - **Empty-tolerant** (spec §4): steps 5/6 ("Cảnh báo của tôi" + its
 *    on/off switch) and step 9 ("Lịch sử tín hiệu") spotlight
 *    `RulesList`/`EventsList` regardless of whether the user has any
 *    rules/events yet — both components render an `<Empty>` state carrying
 *    the SAME `data-tour-id` as their populated state, so the tour never
 *    blocks on missing per-user data (copy: "khi bạn theo dõi, chúng hiện ở
 *    đây").
 *  - Step 4 ("Nút Theo dõi trên một thẻ") targets the FIRST signal card's
 *    toggle button specifically (`tour-canhbao-signal-toggle`) — safe
 *    because `SignalsList` is a static catalog of 10 built-in signals,
 *    always populated (unlike Rules/Events, which are per-user and may be
 *    empty).
 *  - Step 6 ("Công tắc bật/tắt") reuses step 5's target
 *    (`tour-canhbao-rules`) rather than a new per-row selector — per spec
 *    §4's own note ("Switch ở một dòng (hoặc mô tả nếu rỗng)"), only the copy
 *    changes, same "narrate over a steady target" technique T2's
 *    `bieuDoTour` used for the TV-native chart region.
 *  - Steps 7 ("Tạo cảnh báo từ Backtest") and 8 ("Quét trong phiên ~10
 *    phút/lần") are `centered: true` concept cards — spec §4 explicitly
 *    recommends NOT switching tabs mid-tour for step 7 (option "(b)"), and
 *    step 8 (the background scan cadence) has no UI at all.
 *
 * Net: 9 stops — spec's exact count.
 */
export const canhBaoTour: TourConfig = {
  name: "canhbao",
  steps: [
    {
      targetId: "tour-canhbao-header",
      tang: "THIẾT LẬP",
      title: "Tổng quan Cảnh báo",
      body: "IQX quét watchlist của bạn theo 10 tín hiệu kỹ thuật và báo ngay qua Telegram khi tín hiệu xuất hiện trong phiên.",
      placement: "below",
    },
    {
      targetId: "tour-canhbao-telegram",
      tang: "THIẾT LẬP",
      title: "Kết nối kênh Telegram",
      body: "Bước đầu: kết nối Telegram. Bấm nút → mở @IQX_Alert_BOT → bấm Start. Xong, thẻ chuyển 'Đã kết nối'. (Chưa kết nối vẫn theo dõi được tín hiệu — chỉ là không nhận được tin nhắn.)",
      placement: "below",
    },
    {
      targetId: "tour-canhbao-signals",
      tang: "CHỌN TÍN HIỆU",
      title: "10 tín hiệu",
      body: "10 tín hiệu dựng sẵn — 5 tín hiệu MUA, 5 tín hiệu BÁN (vượt đỉnh, hồi phục, quá mua, gãy xu hướng…). Mỗi thẻ có nhãn MUA/BÁN và mô tả ngắn.",
      placement: "below",
    },
    {
      targetId: "tour-canhbao-signal-toggle",
      tang: "CHỌN TÍN HIỆU",
      title: "Nút \"Theo dõi\"",
      body: "Bấm 'Theo dõi' để nhận cảnh báo khi tín hiệu này xuất hiện. Bấm lại là 'Bỏ theo dõi'. Tín hiệu đã theo dõi rơi xuống mục 'Cảnh báo của tôi' bên dưới.",
      placement: "below",
    },
    {
      targetId: "tour-canhbao-rules",
      tang: "QUẢN LÝ & LỊCH SỬ",
      title: "Danh sách cảnh báo",
      body: "Danh sách cảnh báo đang bật của bạn. Mỗi dòng có công tắc bật/tắt, nhãn MUA/BÁN, tên, và số điều kiện. Chưa có? Theo dõi một tín hiệu ở trên — khi bạn theo dõi, chúng sẽ hiện ở đây.",
      placement: "below",
    },
    {
      targetId: "tour-canhbao-rules",
      tang: "QUẢN LÝ & LỊCH SỬ",
      title: "Công tắc bật/tắt",
      body: "Tạm tắt cảnh báo mà không xóa — gạt công tắc. Muốn bỏ hẳn thì bấm thùng rác.",
      placement: "below",
    },
    {
      centered: true,
      tang: "QUẢN LÝ & LỊCH SỬ",
      title: "Tạo cảnh báo từ Backtest",
      body: "Người dùng nâng cao: sang tab Backtest, dựng tổ hợp tín hiệu MUA riêng rồi bấm 'Tạo cảnh báo' — biến chiến lược của bạn thành cảnh báo tùy chỉnh.",
    },
    {
      centered: true,
      tang: "QUẢN LÝ & LỊCH SỬ",
      title: "Quét trong phiên",
      body: "IQX tự quét watchlist mỗi khoảng 10 phút trong giờ giao dịch (sáng 9:00-11:30, chiều 13:00-15:00). Khớp tín hiệu là bắn cảnh báo ngay.",
    },
    {
      targetId: "tour-canhbao-events",
      tang: "QUẢN LÝ & LỊCH SỬ",
      title: "Nhật ký tín hiệu",
      body: "Nhật ký các tín hiệu đã bắn: thời gian, mã, tín hiệu, giá, và đã gửi Telegram chưa. Kết thúc — theo dõi vài tín hiệu để bắt đầu nhận cảnh báo.",
      placement: "left",
    },
  ],
}
