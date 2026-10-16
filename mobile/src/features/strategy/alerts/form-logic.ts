import { ApiError } from '@/lib/api';
import { sameSet } from './symbols';
import type { AlertScopeInput, AlertSide, AlertSourceInput, SidesDetail, StrategyAlert } from './types';

export const SIDES: AlertSide[] = ['buy', 'sell'];

/** A side is selectable only when the previewed source pins a valid condition for it. */
export function sideValid(detail: SidesDetail | undefined | null, side: AlertSide): boolean {
  return detail?.[side]?.valid === true;
}

export function resolveSides(
  detail: SidesDetail | undefined | null,
  choice: Partial<Record<AlertSide, boolean>>,
  currentSides?: readonly AlertSide[],
): AlertSide[] {
  return SIDES.filter((side) => sideValid(detail, side) && (choice[side] ?? (currentSides ? currentSides.includes(side) : true)));
}

export type FormSnapshot = {
  name: string;
  enabled: boolean;
  /** Present only when the user chose a new source (not "keep"). */
  source: AlertSourceInput | null;
  /** Present only for symbol-scope alerts. */
  scope: AlertScopeInput | null;
  sides: AlertSide[];
};

/** PATCH body with only the changed fields; expected_version added when source/scope/sides change. */
export function buildUpdateBody(alert: StrategyAlert, next: FormSnapshot): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (next.name !== alert.name) body.name = next.name;
  if (next.enabled !== alert.enabled) body.enabled = next.enabled;
  if (next.source) body.source = next.source;
  if (next.scope && !(alert.version.scope.kind === 'symbols' && sameSet(next.scope.symbols, alert.version.symbols))) body.scope = next.scope;
  if (!sameSet(next.sides, alert.version.sides)) body.sides = next.sides;
  if (body.source || body.scope || body.sides) body.expected_version = alert.current_version;
  return body;
}

export type FieldErrors = { name?: string; symbols?: string; sides?: string; source?: string; form?: string };

/** Map API validation details [{path,message}] (and SYMBOL_INVALID [{symbol}]) to form fields. */
export function mapApiErrors(error: unknown, fallback: string): FieldErrors {
  const out: FieldErrors = {};
  if (!(error instanceof ApiError)) return { form: fallback };
  if (error.status === 409) return { form: 'Cảnh báo đã được thay đổi ở nơi khác. Hãy tải lại màn hình rồi thử lại.' };
  const list = Array.isArray(error.details) ? error.details : error.details && typeof error.details === 'object' ? [error.details] : [];
  const items = list.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
  if (error.code === 'SYMBOL_INVALID') {
    const syms = items.map((i) => i.symbol).filter((s): s is string => typeof s === 'string');
    out.symbols = syms.length ? `Mã không thuộc danh mục mã đang hoạt động: ${syms.join(', ')}.` : error.message;
    return out;
  }
  for (const item of items) {
    const message = typeof item.message === 'string' ? item.message : undefined;
    if (!message) continue;
    const path = Array.isArray(item.path) ? item.path.map(String) : typeof item.path === 'string' ? item.path.split('.') : [];
    const root = path[0];
    if (root === 'name') out.name = message;
    else if (root === 'scope') out.symbols = message;
    else if (root === 'sides') out.sides = message;
    else if (root === 'source') out.source = message;
    else out.form = out.form ? `${out.form} ${message}` : message;
  }
  if (Object.keys(out).length === 0) out.form = error.message || fallback;
  return out;
}

export function isFeatureDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.code === 'FEATURE_DISABLED';
}

export function newKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
