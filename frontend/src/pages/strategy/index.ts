/**
 * Trang Chiến lược (`/chien-luoc`) — export duy nhất cho router của shell.
 *
 * Gồm: tab Cảnh báo (Telegram, tín hiệu, cảnh báo của tôi, lịch sử tín hiệu) và
 * tab Backtest (thư viện chỉ tiêu, cấu hình, rủi ro, kết quả). Mọi dữ liệu đến
 * từ backend-v2 qua shared API boundary; cả hai tab đều premium-gated ở server.
 */
export { StrategyPage } from "./strategy-page"
