/**
 * Shop data layer (learning coins "xu" + mascot catalog). Mirrors frontend/src/pages/demo-trading/shop/shop-api.ts.
 * Numbers only ever come from the server; a purchase sends the confirmed price only so the server can detect a change.
 */
import { ApiError, apiRequest } from '@/lib/api';

export type CatalogEntry = {
  mascot_id: string;
  name: string;
  price_xu: number;
  for_sale: boolean;
  is_default: boolean;
  sort_order: number;
  asset_root: string;
};
export type OwnedEntry = { mascot_id: string; source?: string | null; acquired_at?: string | null };
export type Wallet = { balance: number; last_seq: number };
export type ActiveMascot = { mascot_id: string; revision: number };
export type ShopState = {
  catalog_version: string;
  catalog: CatalogEntry[];
  wallet: Wallet;
  owned: OwnedEntry[];
  active: ActiveMascot;
  owned_count: number;
  total_count: number;
};
export type LedgerItem = {
  id: string;
  delta: number;
  balance_after: number;
  created_at: string;
  kind: string;
  label: { lesson_key?: string | null; lesson_id?: string | null; mascot_id?: string | null; mascot_name?: string | null };
};
export type LedgerPage = { items: LedgerItem[]; next_cursor: string | null };
export type PurchaseResult = { status: 'purchased' | 'already_owned'; wallet: Wallet; owned: OwnedEntry[]; active: ActiveMascot };
export type PurchaseStatus = { status: 'completed' | 'not_found'; wallet: Wallet };
export type PurchaseBody = { mascot_id: string; catalog_version: string; expected_price_xu: number; idempotency_key: string };

export const shopKeys = {
  root: ['shop'] as const,
  state: ['shop', 'state'] as const,
  ledger: ['shop', 'ledger'] as const,
};

export const LEDGER_PAGE_SIZE = 20;
export const PURCHASE_TIMEOUT_MS = 20_000;
const STATUS_TIMEOUT_MS = 10_000;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function invalid(what: string): never {
  throw new ApiError(`Phản hồi ${what} không hợp lệ`, 502, { code: 'INVALID_RESPONSE' });
}

function parseWallet(v: unknown, what: string): Wallet {
  if (!isRec(v) || !isCount(v.balance) || !isCount(v.last_seq)) invalid(what);
  return { balance: v.balance, last_seq: v.last_seq };
}
function parseActive(v: unknown, what: string): ActiveMascot {
  if (!isRec(v) || !isText(v.mascot_id) || !isInt(v.revision) || v.revision < 1) invalid(what);
  return { mascot_id: v.mascot_id, revision: v.revision };
}
function parseOwned(v: unknown, what: string): OwnedEntry[] {
  if (!Array.isArray(v)) invalid(what);
  for (const item of v) if (!isRec(item) || !isText(item.mascot_id)) invalid(what);
  return v as OwnedEntry[];
}

export function parseShopState(raw: unknown): ShopState {
  if (!isRec(raw) || !isText(raw.catalog_version) || !Array.isArray(raw.catalog)) invalid('Shop');
  for (const e of raw.catalog) {
    if (
      !isRec(e) || !isText(e.mascot_id) || !isText(e.name) || !isCount(e.price_xu) || typeof e.for_sale !== 'boolean' ||
      typeof e.is_default !== 'boolean' || !isInt(e.sort_order)
    )
      invalid('Shop');
  }
  return {
    catalog_version: raw.catalog_version,
    catalog: raw.catalog as CatalogEntry[],
    wallet: parseWallet(raw.wallet, 'Shop'),
    owned: parseOwned(raw.owned, 'Shop'),
    active: parseActive(raw.active, 'Shop'),
    owned_count: isCount(raw.owned_count) ? raw.owned_count : 0,
    total_count: isCount(raw.total_count) ? raw.total_count : raw.catalog.length,
  };
}

export function parseLedgerPage(raw: unknown): LedgerPage {
  if (!isRec(raw) || !Array.isArray(raw.items)) invalid('lịch sử xu');
  for (const i of raw.items) {
    if (!isRec(i) || !isText(i.id) || !isInt(i.delta) || !isCount(i.balance_after) || !isText(i.created_at) || !isText(i.kind) || !isRec(i.label)) invalid('lịch sử xu');
  }
  const next = raw.next_cursor;
  return { items: raw.items as LedgerItem[], next_cursor: isText(next) ? next : null };
}

export function parsePurchaseResult(raw: unknown): PurchaseResult {
  if (!isRec(raw) || (raw.status !== 'purchased' && raw.status !== 'already_owned')) invalid('giao dịch mua');
  return { status: raw.status, wallet: parseWallet(raw.wallet, 'giao dịch mua'), owned: parseOwned(raw.owned, 'giao dịch mua'), active: parseActive(raw.active, 'giao dịch mua') };
}

export function parsePurchaseStatus(raw: unknown): PurchaseStatus {
  if (!isRec(raw) || (raw.status !== 'completed' && raw.status !== 'not_found')) invalid('trạng thái giao dịch');
  return { status: raw.status, wallet: parseWallet(raw.wallet, 'trạng thái giao dịch') };
}

export async function fetchShopState(signal?: AbortSignal): Promise<ShopState> {
  return parseShopState(await apiRequest<unknown>('/shop', { signal }));
}

export async function fetchLedgerPage(cursor: string | undefined, signal?: AbortSignal): Promise<LedgerPage> {
  return parseLedgerPage(await apiRequest<unknown>('/shop/coin-ledger', { query: { limit: LEDGER_PAGE_SIZE, cursor }, signal }));
}

export async function postPurchase(body: PurchaseBody): Promise<PurchaseResult> {
  return parsePurchaseResult(await apiRequest<unknown>('/shop/purchases', { method: 'POST', body, timeoutMs: PURCHASE_TIMEOUT_MS }));
}

export async function fetchPurchaseStatus(key: string): Promise<PurchaseStatus> {
  return parsePurchaseStatus(await apiRequest<unknown>(`/shop/purchases/${encodeURIComponent(key)}`, { timeoutMs: STATUS_TIMEOUT_MS }));
}

export async function putActiveMascot(mascotId: string, expectedRevision: number): Promise<{ changed: boolean; active: ActiveMascot }> {
  const raw = await apiRequest<unknown>('/shop/active-mascot', { method: 'PUT', body: { mascot_id: mascotId, expected_revision: expectedRevision } });
  if (!isRec(raw) || typeof raw.changed !== 'boolean') invalid('linh thú đang sử dụng');
  return { changed: raw.changed, active: parseActive(raw.active, 'linh thú đang sử dụng') };
}

/* ── error classification ─────────────────────────────────────────────── */

function firstDetail(error: ApiError): Rec | null {
  const d = error.details;
  return Array.isArray(d) && isRec(d[0]) ? d[0] : null;
}
function detailCount(detail: Rec | null, key: string): number | null {
  const v = detail?.[key];
  return isCount(v) ? v : null;
}

export type PurchaseFailure =
  | { kind: 'insufficient'; balance: number | null; price: number | null }
  | { kind: 'price_changed'; currentPrice: number | null }
  | { kind: 'catalog_changed' }
  | { kind: 'not_for_sale' }
  | { kind: 'key_reused' }
  | { kind: 'unknown_outcome' }
  | { kind: 'rejected'; message: string };

export function classifyPurchaseError(error: unknown): PurchaseFailure {
  if (!(error instanceof ApiError)) return { kind: 'unknown_outcome' };
  if (error.status >= 500 || error.status === 408 || error.status === 0) return { kind: 'unknown_outcome' };
  const detail = firstDetail(error);
  switch (error.code) {
    case 'INSUFFICIENT_XU':
      return { kind: 'insufficient', balance: detailCount(detail, 'balance_xu'), price: detailCount(detail, 'price_xu') };
    case 'PRICE_CHANGED':
      return { kind: 'price_changed', currentPrice: detailCount(detail, 'current_price_xu') };
    case 'CATALOG_CHANGED':
      return { kind: 'catalog_changed' };
    case 'MASCOT_NOT_FOR_SALE':
      return { kind: 'not_for_sale' };
    case 'IDEMPOTENCY_KEY_REUSED':
      return { kind: 'key_reused' };
    default:
      return { kind: 'rejected', message: error.message };
  }
}

export type ActivateFailure = { kind: 'revision_conflict' } | { kind: 'not_owned' } | { kind: 'other'; message: string };

export function classifyActivateError(error: unknown): ActivateFailure {
  if (error instanceof ApiError) {
    if (error.code === 'REVISION_CONFLICT') return { kind: 'revision_conflict' };
    if (error.code === 'MASCOT_NOT_OWNED') return { kind: 'not_owned' };
    return { kind: 'other', message: error.message };
  }
  return { kind: 'other', message: error instanceof Error ? error.message : 'Chưa đổi được linh thú.' };
}
