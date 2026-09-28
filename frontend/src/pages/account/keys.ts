/**
 * Query key cho khu vực tài khoản (/cai-dat, /nang-cap, kết quả thanh toán).
 *
 * - `premiumStatus` nằm dưới tiền tố `["premium"]` giống AuthProvider
 *   (`["premium", user.id]`) nhưng KHÔNG dùng chung khoá: AuthProvider chỉ đọc
 *   `{ is_premium }`, còn trang tài khoản cần nguyên `SubscriptionResponse`
 *   (gói hiện tại, kỳ hạn, trial). Hai hình dạng khác nhau trên cùng một khoá sẽ
 *   ghi đè lẫn nhau, nên tách khoá và invalidate theo tiền tố `["premium"]`.
 * - Mọi khoá dữ liệu riêng tư đều kèm `user.id` để không rò rỉ giữa các tài khoản.
 */
export const accountKeys = {
  profile: (userId: string | null) => ["settings", "profile", userId] as const,
  premiumStatus: (userId: string | null) => ["premium", "me", userId] as const,
  premiumOrders: (userId: string | null) => ["premium", "orders", userId] as const,
  plans: ["premium", "plans"] as const,
} as const

/** Tiền tố bao trùm khoá premium của AuthProvider + trang tài khoản. */
export const PREMIUM_KEY_PREFIX = ["premium"] as const
