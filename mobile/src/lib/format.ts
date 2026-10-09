/**
 * vi-VN formatters implemented without relying on Intl (Hermes' Intl coverage varies).
 * Thousands separator "." and decimal separator ",".
 */

export type PriceRole = 'up' | 'down' | 'ref' | 'ceiling' | 'floor';

const EMPTY = '—';

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Format a number with fixed decimals using vi-VN separators. */
function fixed(value: number, decimals: number, minDecimals = decimals): string {
  const neg = value < 0;
  const abs = Math.abs(value);
  // toFixed is fine for display; avoid exponent notation for huge values.
  let s = abs >= 1e21 ? String(abs) : abs.toFixed(decimals);
  let [int, frac = ''] = s.split('.');
  while (frac.length > minDecimals && frac.endsWith('0')) frac = frac.slice(0, -1);
  const body = group(int) + (frac ? `,${frac}` : '');
  const isZero = /^[0.,]*$/.test(body);
  return (neg && !isZero ? '-' : '') + body;
}

export function formatNumber(value: number | null | undefined, maxDecimals = 2): string {
  if (!isNum(value)) return EMPTY;
  return fixed(value, maxDecimals, 0);
}

/** VND amount without currency symbol, e.g. 57600 -> "57.600". Accepts numeric strings. */
export function formatVnd(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!isNum(n)) return EMPTY;
  return fixed(Math.round(n), 0);
}

/** Signed percentage with 2 decimals, e.g. 1.234 -> "+1,23%". `value` is already in percent. */
export function formatPct(value: number | null | undefined, decimals = 2): string {
  if (!isNum(value)) return EMPTY;
  const s = fixed(value, decimals);
  const isZero = /^0(,0*)?$/.test(s);
  return `${value > 0 && !isZero ? '+' : ''}${s}%`;
}

/** Compact number: 1.234.567 -> "1,23 Tr", 2.5e9 -> "2,5 Tỷ", 12.300 -> "12,3 N". */
export function formatCompact(value: number | null | undefined): string {
  if (!isNum(value)) return EMPTY;
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e12, 'Nghìn tỷ'],
    [1e9, 'Tỷ'],
    [1e6, 'Tr'],
    [1e3, 'N'],
  ];
  for (const [limit, label] of units) {
    if (abs >= limit) return `${fixed(value / limit, 2, 0)} ${label}`;
  }
  return fixed(value, 2, 0);
}

function toDate(input: Date | string | number | null | undefined): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

const VN_OFFSET_MS = 7 * 3600_000; // Asia/Ho_Chi_Minh has no DST (UTC+7)

function vnParts(d: Date) {
  const t = new Date(d.getTime() + VN_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    min: t.getUTCMinutes(),
  };
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** dd/MM/yyyy in Asia/Ho_Chi_Minh. Plain "YYYY-MM-DD" strings are formatted as-is (no tz shift). */
export function formatDate(input: Date | string | number | null | undefined): string {
  if (typeof input === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = toDate(input);
  if (!d) return EMPTY;
  const v = vnParts(d);
  return `${p2(v.d)}/${p2(v.m)}/${v.y}`;
}

/** dd/MM/yyyy HH:mm in Asia/Ho_Chi_Minh. */
export function formatDateTime(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return EMPTY;
  const v = vnParts(d);
  return `${p2(v.d)}/${p2(v.m)}/${v.y} ${p2(v.h)}:${p2(v.min)}`;
}

/** Today's date in Asia/Ho_Chi_Minh as YYYY-MM-DD. */
export function todayVN(now: Date = new Date()): string {
  const v = vnParts(now);
  return `${v.y}-${p2(v.m)}-${p2(v.d)}`;
}

/** Pick the semantic price colour role (VN market: ceiling/floor take precedence). */
export function priceColorRole(
  price: number | null | undefined,
  ref: number | null | undefined,
  ceiling?: number | null,
  floor?: number | null,
): PriceRole {
  if (!isNum(price) || !isNum(ref) || price <= 0) return 'ref';
  if (isNum(ceiling) && ceiling > 0 && price >= ceiling) return 'ceiling';
  if (isNum(floor) && floor > 0 && price <= floor) return 'floor';
  if (price > ref) return 'up';
  if (price < ref) return 'down';
  return 'ref';
}
