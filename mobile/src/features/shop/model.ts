/** Pure Shop rules: card state, formatting, Vietnamese messages and the purchase outcome logic. No network, no React. */
import type { CatalogEntry, LedgerItem, PurchaseBody, PurchaseResult, PurchaseStatus, ShopState } from './api';
import { classifyPurchaseError } from './api';

export const SHOP_COPY = {
  title: 'Cửa hàng',
  buy: 'Mua',
  short: 'Chưa đủ xu',
  use: 'Sử dụng',
  wearing: 'Đang sử dụng',
  owned: 'Đã sở hữu',
  unavailable: 'Chưa sẵn sàng',
  loadFailed: 'Chưa tải được dữ liệu Shop. Số dư xu và linh thú sẽ hiển thị khi tải lại thành công.',
  history: 'Lịch sử xu',
  alreadyOwnedNoCharge: 'Đã sở hữu. Không trừ thêm xu.',
} as const;

export type CardState = 'buy' | 'short' | 'owned' | 'active' | 'unavailable';

export function isOwned(state: Pick<ShopState, 'owned'>, mascotId: string): boolean {
  return state.owned.some((o) => o.mascot_id === mascotId);
}

export function deriveCardState(entry: CatalogEntry, state: ShopState): CardState {
  if (isOwned(state, entry.mascot_id)) return state.active.mascot_id === entry.mascot_id ? 'active' : 'owned';
  if (!entry.for_sale) return 'unavailable';
  return state.wallet.balance >= entry.price_xu ? 'buy' : 'short';
}

export function sortedCatalog(state: Pick<ShopState, 'catalog'>): CatalogEntry[] {
  return [...state.catalog].sort((a, b) => a.sort_order - b.sort_order);
}

const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
export const formatXu = (v: number): string => nf.format(v);
export function formatSignedXu(delta: number): string {
  if (delta === 0) return '0';
  return `${delta > 0 ? '+' : '−'}${formatXu(Math.abs(delta))}`;
}

export function ledgerRowLabel(item: LedgerItem): string {
  switch (item.kind) {
    case 'lesson_first_completion':
      return 'Hoàn thành bài học';
    case 'mascot_purchase':
      return item.label.mascot_name ? `Mua ${item.label.mascot_name}` : 'Mua linh thú';
    default:
      return 'Điều chỉnh xu';
  }
}

/** v4-style uuid; Math.random is enough because the server scopes keys per user. */
export function uuidV4(rand: () => number = Math.random): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(rand() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
export const newIdempotencyKey = (): string => `shop-${uuidV4()}`;

export function priceChangedMessage(current: number | null): string {
  return current == null
    ? 'Giá linh thú đã thay đổi. Đã cập nhật, vui lòng xác nhận lại.'
    : `Giá linh thú đã thay đổi, hiện là ${formatXu(current)} xu. Đã cập nhật, vui lòng xác nhận lại.`;
}
export const CATALOG_CHANGED_MESSAGE = 'Danh mục linh thú đã thay đổi. Đã cập nhật, vui lòng xác nhận lại.';
export function insufficientMessage(balance: number | null, price: number | null): string {
  if (balance == null || price == null) return 'Chưa đủ xu để mua linh thú này.';
  return `Chưa đủ xu: bạn có ${formatXu(balance)} xu, cần ${formatXu(price)} xu.`;
}
export const UNVERIFIED_MESSAGE = 'Chưa xác định được giao dịch đã được ghi nhận hay chưa. Hãy kiểm tra lại trước khi thử mua lần nữa.';
export const RETRY_MESSAGE = 'Giao dịch chưa được ghi nhận và chưa trừ xu. Bạn có thể thử lại.';

export function activateErrorMessage(kind: 'revision_conflict' | 'not_owned' | 'other', name: string, fallback = ''): string {
  if (kind === 'revision_conflict') return 'Linh thú đang sử dụng đã được thay đổi ở nơi khác. Đã tải lại trạng thái mới; hãy chọn lại nếu cần.';
  if (kind === 'not_owned') return `Bạn chưa sở hữu ${name}. Đã tải lại danh sách linh thú.`;
  return fallback || 'Chưa đổi được linh thú.';
}

export type PurchaseOutcome =
  | { kind: 'done'; status: 'purchased' | 'already_owned'; balanceAfter: number }
  | { kind: 'notice'; message: string; refresh: boolean; newKey?: boolean }
  | { kind: 'blocked'; message: string; canLearn: boolean }
  | { kind: 'retry' }
  | { kind: 'unverified' };

export type PurchaseDeps = {
  post: (body: PurchaseBody) => Promise<PurchaseResult>;
  status: (key: string) => Promise<PurchaseStatus>;
};

/** Ask the server whether a purchase with this key went through (unknown-outcome recovery). */
export async function verifyPurchase(key: string, deps: Pick<PurchaseDeps, 'status'>): Promise<PurchaseOutcome> {
  try {
    const s = await deps.status(key);
    return s.status === 'completed' ? { kind: 'done', status: 'purchased', balanceAfter: s.wallet.balance } : { kind: 'retry' };
  } catch {
    return { kind: 'unverified' };
  }
}

/**
 * One purchase attempt. A timeout/5xx is "outcome unknown", never "failed": the key is then looked up
 * (GET /shop/purchases/{key}) before the user is told anything.
 */
export async function runPurchase(
  entry: CatalogEntry,
  state: Pick<ShopState, 'catalog_version' | 'wallet'>,
  key: string,
  deps: PurchaseDeps,
): Promise<PurchaseOutcome> {
  try {
    const result = await deps.post({ mascot_id: entry.mascot_id, catalog_version: state.catalog_version, expected_price_xu: entry.price_xu, idempotency_key: key });
    return { kind: 'done', status: result.status, balanceAfter: result.wallet.balance };
  } catch (error) {
    const f = classifyPurchaseError(error);
    switch (f.kind) {
      case 'unknown_outcome':
        return verifyPurchase(key, deps);
      case 'insufficient':
        return { kind: 'blocked', message: insufficientMessage(f.balance ?? state.wallet.balance, f.price ?? entry.price_xu), canLearn: true };
      case 'price_changed':
        return { kind: 'notice', message: priceChangedMessage(f.currentPrice), refresh: true };
      case 'catalog_changed':
        return { kind: 'notice', message: CATALOG_CHANGED_MESSAGE, refresh: true };
      case 'not_for_sale':
        return { kind: 'blocked', message: `${entry.name} hiện không bán.`, canLearn: false };
      case 'key_reused':
        return { kind: 'notice', message: 'Yêu cầu trước chưa hoàn tất. Vui lòng xác nhận lại.', refresh: false, newKey: true };
      default:
        return { kind: 'notice', message: f.message, refresh: true };
    }
  }
}
