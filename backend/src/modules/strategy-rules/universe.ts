/**
 * Basket resolution (§2.2) and Backtest date bounds (§2.3).
 */

import { STRATEGY_RULES } from './constants.js';
import { normalizeSymbols, UNIVERSE_EMPTY_MESSAGE } from './content.js';
import type { DateRangeCheck, StoreEligibility, StrategyUniverse } from './contracts.js';

export type ResolvedUniverse =
  | { ok: true; symbols: string[]; excluded: string[] }
  | { ok: false; code: 'UNIVERSE_EMPTY'; message: string; excluded: string[] };

/**
 * Backtest basket: VN30/VN100 = current store-eligible members (warning UNIVERSE_CURRENT_MEMBERS);
 * saved list = copied symbols ∩ store VN100, the rest excluded. The Bot passes the members at its
 * session instead of `eligibility` (same filter).
 */
export function resolveUniverse(
  universe: StrategyUniverse,
  eligibility: Pick<StoreEligibility, 'vn30' | 'vn100'>,
): ResolvedUniverse {
  let symbols: string[];
  let excluded: string[] = [];
  if (universe.type !== 'saved_list') {
    symbols = normalizeSymbols(universe.type === 'vn30' ? eligibility.vn30 : eligibility.vn100);
  } else {
    const store = new Set(normalizeSymbols(eligibility.vn100));
    const listed = normalizeSymbols(universe.symbols);
    symbols = listed.filter((symbol) => store.has(symbol));
    excluded = listed.filter((symbol) => !store.has(symbol));
  }
  if (symbols.length === 0) {
    return { ok: false, code: 'UNIVERSE_EMPTY', message: UNIVERSE_EMPTY_MESSAGE, excluded };
  }
  return { ok: true, symbols: symbols.slice(0, STRATEGY_RULES.max_basket_symbols), excluded };
}

/** `Bỏ {n} mã ngoài VN100 (không có trong kho dữ liệu): … Backtest và Bot chỉ dùng {m} mã còn lại.` */
export function excludedSymbolsNotice(excluded: readonly string[], kept: number): string | null {
  if (excluded.length === 0) return null;
  return `Bỏ ${excluded.length} mã ngoài VN100 (không có trong kho dữ liệu): ${excluded.join(', ')}. Backtest và Bot chỉ dùng ${kept} mã còn lại.`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function validIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Earliest `Từ ngày` = store session #451 (the first 450 warm the indicators up). */
export function earliestStart(calendar: readonly string[]): string | null {
  return calendar[STRATEGY_RULES.warmup_sessions] ?? null;
}

/** Default range: `Đến ngày` = data_as_of, `Từ ngày` two years earlier (clamped). */
export function defaultRange(calendar: readonly string[]): { start: string; end: string } | null {
  const end = calendar.at(-1);
  const earliest = earliestStart(calendar);
  if (!end || !earliest) return null;
  const twoYears = `${Number(end.slice(0, 4)) - 2}${end.slice(4)}`;
  const start = validIsoDate(twoYears) ? twoYears : `${Number(end.slice(0, 4)) - 2}-02-28`;
  return { start: start < earliest ? earliest : start, end };
}

/** §2.3: earliest <= Từ ngày < Đến ngày <= data_as_of, at most 3653 days apart. */
export function checkDateRange(
  calendar: readonly string[],
  start: string,
  end: string,
): DateRangeCheck {
  const invalid = (message: string): DateRangeCheck => ({
    ok: false,
    code: 'DATE_RANGE_INVALID',
    message,
  });
  const earliest = earliestStart(calendar);
  const latest = calendar.at(-1);
  if (!earliest || !latest) return invalid('Kho dữ liệu chưa đủ phiên để chạy Backtest.');
  if (!validIsoDate(start) || !validIsoDate(end)) return invalid('Ngày không hợp lệ.');
  if (end <= start) return invalid('Đến ngày phải sau Từ ngày.');
  if (start < earliest) return invalid(`Từ ngày sớm nhất là ${earliest}.`);
  if (end > latest) return invalid(`Đến ngày muộn nhất là ${latest}.`);
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS;
  if (days > STRATEGY_RULES.max_range_days) {
    return invalid(`Khoảng thời gian tối đa ${STRATEGY_RULES.max_range_days} ngày.`);
  }
  return { ok: true, start, end, earliest_start: earliest, latest_end: latest };
}
