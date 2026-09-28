/**
 * Khu vực tài khoản người dùng — mọi export dùng ở đây đều có tên (named export),
 * Main đăng ký route:
 *
 * - `/cai-dat`                → `SettingsPage`
 * - `/nang-cap`               → `PremiumPage`
 * - `/quen-mat-khau`          → `ForgotPasswordPage`
 * - `/reset-password?token=…` → `ResetPasswordPage`
 * - `/payment/success|error|cancel` (và alias `/thanh-toan/thanh-cong|that-bai|huy`)
 *                             → `PaymentResultPage` với `type` tương ứng
 */
export { SettingsPage } from "./settings-page"
export { PremiumPage } from "./premium-page"
export { PaymentResultPage } from "./payment-result-page"
export { ForgotPasswordPage } from "./forgot-password-page"
export { ResetPasswordPage } from "./reset-password-page"
export { PremiumStatusPanel, UpgradeButton } from "./premium-status-panel"
export { accountKeys, PREMIUM_KEY_PREFIX } from "./keys"
export {
  useAccountProfile,
  useUpdateAccountProfile,
  usePremiumSubscription,
  usePremiumPlans,
  usePremiumOrders,
  useCreateCheckout,
  usePaymentCheck,
  usePremiumRefreshOnPaid,
  useRequestPasswordReset,
  useResetPassword,
} from "./hooks"
export {
  fetchAccountProfile,
  saveAccountProfile,
  fetchPremiumPlans,
  fetchPremiumSubscription,
  fetchPremiumOrders,
  createPremiumCheckout,
  openSepayCheckout,
  requestPasswordReset,
  resetPassword,
  passwordViolation,
  passwordChecks,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "./api"
export type {
  AccountProfile,
  ProfilePatch,
  PremiumPlan,
  PremiumSubscription,
  PremiumOrder,
  PremiumOrderStatus,
  CheckoutSession,
} from "./api"
export type { PaymentCheck } from "./hooks"
export type { PaymentResultType } from "./payment-result-page"
