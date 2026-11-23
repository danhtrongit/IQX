/**
 * HNX Vietnam Index Futures calendar & KRX/Legacy contract code resolver.
 *
 * Supports:
 * - Legacy HNX codes: `VN30F2611`, `VN30F2612`, `VN100F2611`, ...
 * - Post-KRX 9-char VSDC codes:
 *     `41I1<Y><M>000` (VN30 futures)
 *     `41I2<Y><M>000` / `41B...<Y><M>...` (VN100 futures)
 *   where `<Y>` uses the 30-year VSDC alphabet (`0..9, A..W` excluding `I, O, U`;
 *   `F=2025, G=2026, H=2027, J=2028...`) and `<M>` is `1..9, A=10, B=11, C=12`.
 * - Fallback to explicit `expiryDate` metadata when present.
 * - Expiry date calculation: 3rd Thursday of expiry month, rolled back to the
 *   preceding trading day if it falls on a weekend or Vietnam market holiday.
 * - Remaining trading session counter (`0` on expiry day so UI renders `"hôm nay"`).
 */

import { thirdThursday, VN_HOLIDAYS } from '../../reports/market-calendar.js';

export type FuturesUnderlying = 'VN30' | 'VN100';

export type FuturesSlotCode =
  'VN30F1M' | 'VN30F2M' | 'VN30F1Q' | 'VN30F2Q' | 'VN100F1M' | 'VN100F2M' | 'VN100F1Q' | 'VN100F2Q';

export interface RawFuturesContractInput {
  code: string;
  underlying?: FuturesUnderlying | null;
  expiryDate?: string | null;
}

export interface ParsedFuturesContract {
  code: string;
  underlying: FuturesUnderlying;
  year: number;
  month: number;
  format: 'krx' | 'legacy' | 'metadata';
  explicitExpiryDate: string | null;
}

export interface ClassifiedFuturesSlot<
  T extends RawFuturesContractInput = RawFuturesContractInput,
> {
  slot: string;
  code: string;
  underlying: FuturesUnderlying;
  year: number;
  month: number;
  expiryDate: string;
  remainingSessions: number;
  raw: T;
}

export interface ClassifiedFuturesResult<
  T extends RawFuturesContractInput = RawFuturesContractInput,
> {
  vn30: ClassifiedFuturesSlot<T>[];
  vn100: ClassifiedFuturesSlot<T>[];
  all: ClassifiedFuturesSlot<T>[];
  bySlot: Record<string, ClassifiedFuturesSlot<T>>;
}

/**
 * VSDC / KRX 30-year expiration year alphabet starting at 2010 (`0`),
 * skipping confusing letters `I`, `O`, and `U`.
 *   F = 2025, G = 2026, H = 2027, J = 2028, K = 2029, L = 2030 ...
 */
export const KRX_YEAR_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTVW' as const;

export const KRX_MONTH_MAP: Readonly<Record<string, number>> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  A: 10,
  B: 11,
  C: 12,
};

export const DEFAULT_VN_HOLIDAYS: ReadonlySet<string> = new Set(VN_HOLIDAYS);

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const COMPACT_DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;
const DMY_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const LEGACY_FUTURES_RE = /^(VN30|VN100)F(\d{2})(\d{2})$/;
const KRX_VN30_RE = /^41I1([0-9A-HJ-NP-TV-W])([1-9ABC])[A-Z0-9]{3}$/;
const KRX_VN100_RE = /^41(?:I2|B[0-9A-Z])([0-9A-HJ-NP-TV-W])([1-9ABC])[A-Z0-9]{3}$/;
const SLOT_SUFFIXES = ['F1M', 'F2M', 'F1Q', 'F2Q'] as const;

function parseUtcDateStrict(dateStr: string): Date | null {
  const match = ISO_DATE_RE.exec(dateStr);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Normalizes a date string (`YYYY-MM-DD`, `YYYYMMDD`, or `DD/MM/YYYY`) into
 * strict `YYYY-MM-DD`, returning `null` if invalid.
 */
export function normalizeIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (ISO_DATE_RE.test(trimmed)) {
    return parseUtcDateStrict(trimmed) ? trimmed : null;
  }
  const compact = COMPACT_DATE_RE.exec(trimmed);
  if (compact) {
    const candidate = `${compact[1]}-${compact[2]}-${compact[3]}`;
    return parseUtcDateStrict(candidate) ? candidate : null;
  }
  const dmy = DMY_DATE_RE.exec(trimmed);
  if (dmy) {
    const candidate = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return parseUtcDateStrict(candidate) ? candidate : null;
  }
  return null;
}

/**
 * Decodes a single KRX year character into a 4-digit calendar year.
 * Anchors the 30-year cycle near `referenceYear` (defaults to 2026).
 */
export function decodeKrxYear(char: string, referenceYear = 2026): number | null {
  const index = KRX_YEAR_ALPHABET.indexOf(char.toUpperCase());
  if (index < 0) return null;

  // Base cycle starts at 2010 (`0` = 2010, `F` = 2025, `G` = 2026, ..., `W` = 2039).
  let year = 2010 + index;
  while (year < referenceYear - 10) year += 30;
  while (year > referenceYear + 19) year -= 30;
  return year;
}

/**
 * Decodes a single KRX month character (`1`-`9`, `A`=10, `B`=11, `C`=12).
 */
export function decodeKrxMonth(char: string): number | null {
  const month = KRX_MONTH_MAP[char.toUpperCase()];
  return month ?? null;
}

function inferUnderlyingFromCode(code: string): FuturesUnderlying | null {
  if (code.startsWith('VN100F') || code.startsWith('41I2') || code.startsWith('41B')) {
    return 'VN100';
  }
  if (code.startsWith('VN30F') || code.startsWith('41I1')) {
    return 'VN30';
  }
  return null;
}

/**
 * Parses a Vietnam index futures contract code (either KRX 9-character format
 * or legacy `VN30FYYMM`/`VN100FYYMM` format), with optional fallback to
 * explicit `expiryDate` metadata.
 */
export function parseFuturesContractCode(
  rawCode: string,
  options?: {
    referenceYear?: number;
    expiryDate?: string | null;
    underlying?: FuturesUnderlying | null;
  },
): ParsedFuturesContract | null {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;

  const explicitExpiryDate = normalizeIsoDate(options?.expiryDate);
  const referenceYear =
    options?.referenceYear ?? (explicitExpiryDate ? Number(explicitExpiryDate.slice(0, 4)) : 2026);

  const krxVn30 = KRX_VN30_RE.exec(code);
  if (krxVn30) {
    const year = decodeKrxYear(krxVn30[1]!, referenceYear);
    const month = decodeKrxMonth(krxVn30[2]!);
    if (year !== null && month !== null) {
      return {
        code,
        underlying: options?.underlying ?? 'VN30',
        year,
        month,
        format: 'krx',
        explicitExpiryDate,
      };
    }
  }

  const krxVn100 = KRX_VN100_RE.exec(code);
  if (krxVn100) {
    const year = decodeKrxYear(krxVn100[1]!, referenceYear);
    const month = decodeKrxMonth(krxVn100[2]!);
    if (year !== null && month !== null) {
      return {
        code,
        underlying: options?.underlying ?? 'VN100',
        year,
        month,
        format: 'krx',
        explicitExpiryDate,
      };
    }
  }

  const legacy = LEGACY_FUTURES_RE.exec(code);
  if (legacy) {
    const underlying = (legacy[1] as FuturesUnderlying) ?? options?.underlying ?? 'VN30';
    const yy = Number(legacy[2]);
    const month = Number(legacy[3]);
    if (month >= 1 && month <= 12) {
      const century = Math.floor(referenceYear / 100) * 100;
      let year = century + yy;
      if (year < referenceYear - 50) year += 100;
      if (year > referenceYear + 50) year -= 100;
      return {
        code,
        underlying,
        year,
        month,
        format: 'legacy',
        explicitExpiryDate,
      };
    }
  }

  // Fallback to expiryDate metadata when contract code is non-standard or alias.
  if (explicitExpiryDate) {
    const underlying = options?.underlying ?? inferUnderlyingFromCode(code);
    if (underlying) {
      return {
        code,
        underlying,
        year: Number(explicitExpiryDate.slice(0, 4)),
        month: Number(explicitExpiryDate.slice(5, 7)),
        format: 'metadata',
        explicitExpiryDate,
      };
    }
  }

  return null;
}

/**
 * Returns true if `date` (`YYYY-MM-DD`) is a Vietnam trading day (Mon–Fri and
 * not present in `holidays`).
 */
export function isVnTradingDay(
  date: string,
  holidays: ReadonlySet<string> = DEFAULT_VN_HOLIDAYS,
): boolean {
  const parsed = parseUtcDateStrict(date);
  if (!parsed) return false;
  const day = parsed.getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(date);
}

/**
 * Computes the HNX futures expiry date for `(year, month)`:
 * the 3rd Thursday of that month, rolled back to the immediately preceding
 * trading day if it falls on a holiday or weekend.
 */
export function computeExpiryDate(
  year: number,
  month: number,
  holidays: ReadonlySet<string> = DEFAULT_VN_HOLIDAYS,
): string {
  if (!Number.isInteger(year) || year < 1970 || year > 2200) {
    throw new Error(`Invalid year: ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }

  const base = thirdThursday(year, month);
  const cursor = parseUtcDateStrict(base);
  if (!cursor) throw new Error(`Invalid computed expiry date: ${base}`);

  // Roll back to prior trading day if 3rd Thursday is a holiday or weekend.
  for (let guard = 0; guard < 31; guard += 1) {
    const iso = formatUtcDate(cursor);
    if (isVnTradingDay(iso, holidays)) return iso;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  throw new Error(`Unable to resolve trading day before ${base}`);
}

/**
 * Counts remaining Vietnam trading sessions strictly after `todayIct` up to
 * and including `expiryDate`.
 *
 * Returns `0` on expiry day itself (`todayIct === expiryDate`) and for already
 * expired contracts (`expiryDate < todayIct`), matching the spec requirement to
 * render `"hôm nay"` on expiry day.
 */
export function countRemainingTradingSessions(
  todayIct: string,
  expiryDate: string,
  holidays: ReadonlySet<string> = DEFAULT_VN_HOLIDAYS,
): number {
  const start = parseUtcDateStrict(todayIct);
  const end = parseUtcDateStrict(expiryDate);
  if (!start || !end) {
    throw new Error(`Invalid date argument: todayIct=${todayIct}, expiryDate=${expiryDate}`);
  }
  if (expiryDate <= todayIct) return 0;

  let sessions = 0;
  const cursor = new Date(start.getTime());
  cursor.setUTCDate(cursor.getUTCDate() + 1);

  while (cursor.getTime() <= end.getTime()) {
    const iso = formatUtcDate(cursor);
    if (isVnTradingDay(iso, holidays)) {
      sessions += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return sessions;
}

function assignGroupSlots<T extends RawFuturesContractInput>(
  underlying: FuturesUnderlying,
  items: Array<{
    code: string;
    year: number;
    month: number;
    expiryDate: string;
    remainingSessions: number;
    raw: T;
  }>,
): ClassifiedFuturesSlot<T>[] {
  const sorted = [...items].sort(
    (a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.code.localeCompare(b.code),
  );

  return sorted.map((item, idx) => {
    const suffix = SLOT_SUFFIXES[idx];
    const slot = suffix ? `${underlying}${suffix}` : `${underlying}F${idx + 1}`;
    return {
      slot,
      code: item.code,
      underlying,
      year: item.year,
      month: item.month,
      expiryDate: item.expiryDate,
      remainingSessions: item.remainingSessions,
      raw: item.raw,
    };
  });
}

/**
 * Parses, filters out expired contracts (`expiryDate < todayIct`), sorts active
 * contracts by ascending expiry date, and assigns canonical HNX slots
 * (`VN30F1M`, `VN30F2M`, `VN30F1Q`, `VN30F2Q` and `VN100F1M`, `VN100F2M`, ...).
 */
export function classifyFuturesSlots<T extends RawFuturesContractInput = RawFuturesContractInput>(
  rawContracts: readonly (string | T)[],
  todayIct: string,
  holidays: ReadonlySet<string> = DEFAULT_VN_HOLIDAYS,
): ClassifiedFuturesResult<T> {
  const parsedToday = parseUtcDateStrict(todayIct);
  if (!parsedToday) {
    throw new Error(`Invalid todayIct date: ${todayIct}`);
  }
  const referenceYear = parsedToday.getUTCFullYear();

  const seen = new Set<string>();
  const vn30Raw: Array<{
    code: string;
    year: number;
    month: number;
    expiryDate: string;
    remainingSessions: number;
    raw: T;
  }> = [];
  const vn100Raw: Array<{
    code: string;
    year: number;
    month: number;
    expiryDate: string;
    remainingSessions: number;
    raw: T;
  }> = [];

  for (const entry of rawContracts) {
    const rawObj = (typeof entry === 'string' ? { code: entry } : entry) as T;
    const parsed = parseFuturesContractCode(rawObj.code, {
      referenceYear,
      expiryDate: rawObj.expiryDate,
      underlying: rawObj.underlying,
    });
    if (!parsed) continue;
    if (seen.has(parsed.code)) continue;
    seen.add(parsed.code);

    const expiryDate =
      parsed.explicitExpiryDate ?? computeExpiryDate(parsed.year, parsed.month, holidays);

    // Exclude contracts already expired before todayIct; keep expiry-day contracts (remaining = 0).
    if (expiryDate < todayIct) continue;

    const remainingSessions = countRemainingTradingSessions(todayIct, expiryDate, holidays);
    const record = {
      code: parsed.code,
      year: parsed.year,
      month: parsed.month,
      expiryDate,
      remainingSessions,
      raw: rawObj,
    };

    if (parsed.underlying === 'VN30') vn30Raw.push(record);
    else vn100Raw.push(record);
  }

  const vn30 = assignGroupSlots('VN30', vn30Raw);
  const vn100 = assignGroupSlots('VN100', vn100Raw);
  const all = [...vn30, ...vn100];
  const bySlot: Record<string, ClassifiedFuturesSlot<T>> = {};
  for (const item of all) {
    bySlot[item.slot] = item;
  }

  return { vn30, vn100, all, bySlot };
}
