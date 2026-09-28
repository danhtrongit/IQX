/**
 * Khu vực quản trị gói Premium / thuê bao / thanh toán / IPN.
 *
 * Main đăng ký route và điều hướng; module này chỉ xuất các trang:
 *   - `PlansPage`             → /admin/plans
 *   - `SubscriptionsPage`     → /admin/subscriptions
 *   - `SubscriptionDetailPage`→ /admin/subscriptions/:subId
 *   - `PaymentsPage`          → /admin/payments
 *   - `PaymentDetailPage`     → /admin/payments/:paymentId
 *   - `IpnLogsPage`           → /admin/ipn
 */
export { PlansPage } from "./plans-page"
export { SubscriptionsPage } from "./subscriptions-page"
export { SubscriptionDetailPage } from "./subscription-detail-page"
export { PaymentsPage } from "./payments-page"
export { PaymentDetailPage } from "./payment-detail-page"
export { IpnLogsPage } from "./ipn-logs-page"
