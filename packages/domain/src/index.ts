export type Side = "BUY" | "SELL"
export * from './openapi';
export type OrderStatus = "PENDING" | "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED"
export interface Device { id: string; name?: string; platform: "ios" | "android" | "web" | string; appVersion?: string; lastSeenAt?: string; createdAt?: string }
export interface PaymentMethod { id: string; type: "card" | "bank_transfer" | "apple_pay" | "google_pay" | string; brand?: string; last4?: string; isDefault?: boolean }
export interface PaymentIntent { id: string; status: "requires_payment_method" | "requires_action" | "processing" | "succeeded" | "failed" | string; amount: number; currency: string; clientSecret?: string }
export interface AccountDeletionRequest { confirmation: "DELETE"; reason?: string; password?: string }
export interface AccountDeletionResult { scheduled: boolean; effectiveAt?: string; deletedAt?: string }
export interface RouteParams {
  symbol?: string;
  orderId?: string;
  accountId?: string;
  view?: string;
  tab?: string;
  tool?: string;
  tour?: string;
  milestone?: string;
  journey?: string;
}
export type DeepLink = { path: string; params?: RouteParams }
export const routes = {
  home: "/",
  markets: "/thi-truong",
  stocks: "/co-phieu",
  stock: (symbol: string) => `/co-phieu/${encodeURIComponent(symbol)}`,
  priceBoard: "/bang-gia",
  chart: "/bieu-do",
  demoTrading: "/demo-trading",
  strategy: "/chien-luoc",
  learning: "/bai-hoc",
  knowledge: "/kien-thuc",
  account: "/tai-khoan",
  order: (id: string) => `/demo-trading/orders/${encodeURIComponent(id)}`,
  settings: "/cai-dat",
} as const
export const queryKeys = { account: (id?: string) => ["account", id] as const, devices: (id?: string) => ["devices", id] as const, payments: (id?: string) => ["payments", id] as const, orders: (accountId?: string, filters?: unknown) => ["orders", accountId, filters] as const, quote: (symbol: string) => ["quote", symbol] as const }
export function buildDeepLink(path: string, params: RouteParams = {}): string {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return query ? `${path}?${query}` : path;
}
export function roundMoney(value: number, decimals = 2): number { const p = 10 ** decimals; return Math.round((value + Number.EPSILON) * p) / p }
export function formatMoney(value: number, currency = "VND", locale = "vi-VN"): string { return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: currency === "VND" ? 0 : 2 }).format(value) }
export function calculateOrderValue(quantity: number, price: number, feeRate = 0): number { return roundMoney(quantity * price * (1 + feeRate)) }
export function calculatePnl(entryPrice: number, exitPrice: number, quantity: number, side: Side, feeRate = 0): number { const gross = (exitPrice - entryPrice) * quantity * (side === "BUY" ? 1 : -1); return roundMoney(gross - Math.abs(entryPrice * quantity) * feeRate - Math.abs(exitPrice * quantity) * feeRate) }
