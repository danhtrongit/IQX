import type { TourConfig } from "../tourTypes"

/**
 * Backtester tour (T3, `docs/superpowers/plans/2026-07-27-feature-tours.md`)
 * — spec `~/Downloads/DEMO TRADING/TOUR vs BADGES/IQX-Tour-Backtester.md`
 * v1.0, GROUND-FIRST adapted to the Backtest tab of `/chien-luoc`
 * (`backtest/BacktestLab.tsx`) as it actually renders today:
 *
 *  - **PREMIUM tour**, same rationale as `canhBaoTour.ts` — `BacktestLab`
 *    gates its own launch button behind `usePremiumStatus()`, not just the
 *    shared `PremiumGate` on `/chien-luoc`.
 *  - **Step 1** targets `strategy/StrategyPage.tsx`'s shared tab bar
 *    (`data-tour-id="tour-strategy-tabs"`) — the ONE element outside
 *    `BacktestLab` itself this tour references, since spec point 1 is
 *    literally "Tab Cảnh báo / Backtest".
 *  - **NO preload/auto-run** (plan explicitly rules this out — "preload is
 *    fragile"). Unlike the spec's §1 ("tự Tải mẫu → tự Chạy backtest"), steps
 *    2-9 narrate the REAL, always-present build UI as-is (nothing is
 *    triggered programmatically), and steps 10-13 ("Đọc kết quả") target
 *    `ResultsView`'s real sub-elements with copy that tells the user to run a
 *    backtest to see them ("Chạy backtest để xem…") — faithful regardless of
 *    whether `run.data` exists yet:
 *      - If the user hasn't run anything this session, `ResultsView` isn't
 *        mounted at all (`{run.data && <ResultsView .../>}` in
 *        `BacktestLab.tsx`) — the engine's EXISTING "target not found →
 *        centered tooltip" fallback (`TourOverlay.tsx`'s `resolveTarget` +
 *        poll-then-give-up path, already exercised by
 *        `TourOverlay.test.tsx`'s panel-switch-race test) degrades these 4
 *        steps to a centered card automatically — no `centered: true` needed
 *        in the config itself.
 *      - If the user already ran a backtest earlier in this session (state
 *        persists in `BacktestLab`), the real elements DO exist and the tour
 *        grounds onto them for real — a strict improvement over always-
 *        centered, at the cost of a bounded (~30-frame) poll before falling
 *        back when they don't. Accepted trade-off (see T3 report).
 *  - **Faithful to the real UI**: step 11's copy lists exactly the 6 KPI
 *    tiles `ResultsView.tsx`'s `KpiGrid` renders — NO "sụt giảm sâu nhất" /
 *    max-drawdown tile, even though the backend `Kpis.max_drawdown` field
 *    exists (spec §5 calls this out explicitly).
 *
 * Net: 14 stops — spec's exact count, within the ~12-14 budget.
 */
export const backtesterTour: TourConfig = {
  name: "backtester",
  steps: [
    {
      targetId: "tour-strategy-tabs",
      tang: "DỰNG CHIẾN LƯỢC",
      title: "Tab Cảnh báo / Backtest",
      body: "Trang Chiến lược có 2 phần: Cảnh báo tín hiệu và Backtest. Bạn đang ở tab Backtest — kiểm chứng một chiến lược trên dữ liệu quá khứ trước khi dùng tiền thật.",
      placement: "below",
    },
    {
      targetId: "tour-backtester-load-template",
      tang: "DỰNG CHIẾN LƯỢC",
      title: "Nạp chiến lược mẫu",
      body: "Chưa biết bắt đầu từ đâu? 'Tải mẫu' có sẵn vài chiến lược kinh điển (vd. Giao cắt động lượng: RSI quá bán + MACD cắt lên) — nạp thử một mẫu để xem cách cấu hình.",
      placement: "below",
    },
    {
      targetId: "tour-backtester-factor-library",
      tang: "DỰNG CHIẾN LƯỢC",
      title: "Factor Library",
      body: "Kho chỉ báo: tách nhóm ▲ tín hiệu MUA / ▼ tín hiệu BÁN, có tìm kiếm. Bấm một chỉ báo để thêm vào chiến lược. Mỗi cái có ⓘ giải thích.",
      placement: "right",
    },
    {
      targetId: "tour-backtester-config-bar",
      tang: "DỰNG CHIẾN LƯỢC",
      title: "Cổ phiếu / ngày / vốn",
      body: "Chọn mã, khoảng thời gian và vốn ban đầu để mô phỏng. Mặc định: FPT, từ 2020 tới nay, 100,000,000 đ.",
      placement: "below",
    },
    {
      targetId: "tour-backtester-symbol-info",
      tang: "DỰNG CHIẾN LƯỢC",
      title: "Thanh thông tin mã",
      body: "Tên công ty, sàn, ngành và giá hiện tại của mã đang backtest.",
      placement: "below",
    },
    {
      targetId: "tour-backtester-buy",
      tang: "DỰNG CHIẾN LƯỢC",
      title: "Nhóm tín hiệu MUA",
      body: "▲ ĐIỀU KIỆN MUA — các tín hiệu để VÀO lệnh. Chỉnh ngưỡng từng chỉ báo và chọn logic VÀ/HOẶC. Cần ít nhất 1 tín hiệu mua mới chạy được.",
      placement: "below",
    },
    {
      targetId: "tour-backtester-sell",
      tang: "DỰNG CHIẾN LƯỢC",
      title: "Nhóm tín hiệu BÁN",
      body: "▼ ĐIỀU KIỆN BÁN — các tín hiệu để THOÁT lệnh. Không bắt buộc — nếu bỏ trống, hệ chỉ thoát theo quản trị rủi ro bên dưới.",
      placement: "below",
    },
    {
      targetId: "tour-backtester-risk",
      tang: "DỰNG CHIẾN LƯỢC",
      title: "Thiết lập quản trị rủi ro",
      body: "Cắt lỗ, chốt lời, thời gian giữ tối đa, vốn mỗi lệnh, phí. Phí, thuế và quy định T+2.5 được tính tự động cho sát thực tế.",
      placement: "below",
    },
    {
      targetId: "tour-backtester-run",
      tang: "DỰNG CHIẾN LƯỢC",
      title: "Nút Chạy backtest",
      body: "Bấm để mô phỏng chiến lược trên toàn bộ khoảng thời gian đã chọn. Sau vài giây, kết quả sẽ hiện ngay bên dưới.",
      placement: "below",
    },
    {
      targetId: "tour-backtester-results-header",
      tang: "ĐỌC KẾT QUẢ",
      title: "Header kết quả",
      body: "Chạy backtest để xem kết quả ở đây: mã, khoảng thời gian và số phiên đã mô phỏng.",
      placement: "below",
    },
    {
      targetId: "tour-backtester-kpi-grid",
      tang: "ĐỌC KẾT QUẢ",
      title: "Lưới 6 chỉ số",
      body: "Chạy backtest để xem 6 con số cốt lõi: lãi trung bình mỗi năm, tổng lãi sau phí + thuế, lãi nếu chỉ mua-giữ, Sharpe (hiệu quả/rủi ro — có ⓘ giải thích), tỷ lệ lệnh có lãi, và số phiên giữ trung bình.",
      placement: "below",
    },
    {
      targetId: "tour-backtester-equity-chart",
      tang: "ĐỌC KẾT QUẢ",
      title: "Biểu đồ đường vốn",
      body: "Chạy backtest để xem biểu đồ so sánh chiến lược của bạn, mua-giữ mã này, và VN-Index. Chiến lược tốt là đường nằm trên hai đường còn lại.",
      placement: "below",
    },
    {
      targetId: "tour-backtester-trades-table",
      tang: "ĐỌC KẾT QUẢ",
      title: "Bảng lịch sử giao dịch",
      body: "Chạy backtest để xem từng lệnh mô phỏng: ngày/giá mua, ngày/giá bán, số phiên giữ, lãi/lỗ.",
      placement: "below",
    },
    {
      targetId: "tour-backtester-save-alert",
      tang: "LƯU & DÙNG TIẾP",
      title: "Lưu strategy + Tạo cảnh báo",
      body: "Ưng chiến lược? 'Lưu strategy' để dùng lại, hoặc 'Tạo cảnh báo' để biến tổ hợp tín hiệu MUA này thành cảnh báo Telegram trên watchlist của bạn. Kết thúc — chúc bạn kiểm chứng vui.",
      placement: "left",
    },
  ],
}
