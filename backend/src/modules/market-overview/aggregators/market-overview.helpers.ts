/**
 * Shared pure helpers for market-overview widget aggregators:
 * Vietnam ICT session timing, unit conversions, safe upstream parsing,
 * and columnar daily-bar unpacking.
 */

import { DEFAULT_VN_HOLIDAYS, isVnTradingDay } from './derivatives-calendar.js';
import type { DailyCloseBar } from './rrg-math.js';

export const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const TOTAL_VN_SESSION_MINUTES = 255; // 09:00-11:30 (150m) + 13:00-14:45 (105m)

export interface StoredDailyBarsColumns {
  d: string[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'bigint') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toNumberOrZero(value: unknown): number {
  return toFiniteNumber(value) ?? 0;
}

export function isRecordObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecordObject);
}

export function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

export function normalizeExchange(raw: unknown): 'HOSE' | 'HNX' | 'UPCOM' {
  const upper = asString(raw).toUpperCase();
  if (upper === 'HSX' || upper === 'HOSE' || upper === 'VNINDEX') return 'HOSE';
  if (upper === 'HNX' || upper === 'HNXINDEX') return 'HNX';
  if (upper === 'UPCOM' || upper === 'UPM' || upper === 'HNXUPCOMINDEX') return 'UPCOM';
  return 'HOSE';
}

/**
 * Converts VCI raw VND stock price (e.g. 92500) to thousands of VND (92.5).
 * Preserves 0 for unmatched prices.
 */
export function vciPriceToThousands(rawVnd: number): number {
  if (!Number.isFinite(rawVnd) || rawVnd <= 0) return 0;
  return roundTo(rawVnd / 1_000, 2);
}

/** Formats a Date into `YYYY-MM-DD` in Vietnam ICT (UTC+7). */
export function formatIctDate(date: Date): string {
  return new Date(date.getTime() + ICT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Formats a Date into `HH:mm` in Vietnam ICT (UTC+7). */
export function formatIctTime(date: Date): string {
  return new Date(date.getTime() + ICT_OFFSET_MS).toISOString().slice(11, 16);
}

/** Converts a unix timestamp (seconds or milliseconds) or ISO string to Date. */
export function parseUpstreamTimestamp(raw: unknown): Date | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw > 1e11 ? raw : raw * 1_000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      const ms = n > 1e11 ? n : n * 1_000;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const ms = Date.parse(trimmed);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  return null;
}

/** Adds signed calendar days to a `YYYY-MM-DD` date string. */
export function addCalendarDays(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return isoDate;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Returns the previous Vietnam trading day strictly before `isoDate`. */
export function previousVnTradingDay(
  isoDate: string,
  holidays: ReadonlySet<string> = DEFAULT_VN_HOLIDAYS,
): string {
  let cursor = addCalendarDays(isoDate, -1);
  for (let guard = 0; guard < 31; guard += 1) {
    if (isVnTradingDay(cursor, holidays)) return cursor;
    cursor = addCalendarDays(cursor, -1);
  }
  return cursor;
}

/** Returns current Vietnam ICT minutes since midnight (0..1439). */
export function getIctMinutesOfDay(now: Date): number {
  const ict = new Date(now.getTime() + ICT_OFFSET_MS);
  return ict.getUTCHours() * 60 + ict.getUTCMinutes();
}

/**
 * True during Vietnam market trading hours on trading days (Mon-Fri, non-holiday):
 * 08:45-15:00 ICT (covering derivatives pre-open 08:45 and HNX/HOSE close 15:00).
 */
export function isVnMarketOpen(
  now: Date = new Date(),
  holidays: ReadonlySet<string> = DEFAULT_VN_HOLIDAYS,
): boolean {
  const dateStr = formatIctDate(now);
  if (!isVnTradingDay(dateStr, holidays)) return false;
  const mins = getIctMinutesOfDay(now);
  return mins >= 8 * 60 + 45 && mins <= 15 * 60;
}

/**
 * Resolves the active or most recently completed Vietnam trading session date (`YYYY-MM-DD`).
 * Before 08:45 ICT on a trading day, returns the previous trading session.
 */
export function resolveSessionDate(
  now: Date = new Date(),
  holidays: ReadonlySet<string> = DEFAULT_VN_HOLIDAYS,
): string {
  const today = formatIctDate(now);
  if (!isVnTradingDay(today, holidays)) {
    return previousVnTradingDay(today, holidays);
  }
  const mins = getIctMinutesOfDay(now);
  if (mins < 8 * 60 + 45) {
    return previousVnTradingDay(today, holidays);
  }
  return today;
}

/**
 * Fraction (0.05..1.0) of the regular Vietnam equity trading session elapsed as of `now`.
 * Outside trading hours (closed / weekend / before open), returns `1.0` so EOD figures
 * compare cleanly against full-session 20D averages.
 */
export function intradayElapsedFraction(
  now: Date = new Date(),
  holidays: ReadonlySet<string> = DEFAULT_VN_HOLIDAYS,
): number {
  const today = formatIctDate(now);
  if (!isVnTradingDay(today, holidays)) return 1;
  const mins = getIctMinutesOfDay(now);
  const openMins = 9 * 60;
  const lunchStart = 11 * 60 + 30;
  const lunchEnd = 13 * 60;
  const closeMins = 14 * 60 + 45;

  if (mins < openMins || mins >= closeMins) return 1;
  let elapsed: number;
  if (mins <= lunchStart) {
    elapsed = mins - openMins;
  } else if (mins < lunchEnd) {
    elapsed = 150;
  } else {
    elapsed = 150 + (mins - lunchEnd);
  }
  return Math.max(0.05, Math.min(1, elapsed / TOTAL_VN_SESSION_MINUTES));
}

/**
 * Standard U-shaped cumulative intraday liquidity curve for Vietnam equity sessions
 * given an ICT `HH:mm` timestamp. Returns fraction in `[0, 1]`.
 */
export function standardIntradayLiquidityFraction(hhmm: string): number {
  const parts = hhmm.split(':');
  if (parts.length !== 2) return 0;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  const mins = h * 60 + m;

  const openMins = 9 * 60;
  const lunchStart = 11 * 60 + 30;
  const lunchEnd = 13 * 60;
  const closeMins = 14 * 60 + 45;

  if (mins <= openMins) return 0.02;
  if (mins >= closeMins) return 1;

  let activeElapsed: number;
  if (mins <= lunchStart) {
    activeElapsed = mins - openMins;
  } else if (mins < lunchEnd) {
    activeElapsed = 150;
  } else {
    activeElapsed = 150 + (mins - lunchEnd);
  }

  const u = Math.max(0, Math.min(1, activeElapsed / TOTAL_VN_SESSION_MINUTES));
  // Mild U-shape density: heavier near open & ATC close, flatter midday.
  const shaped = 0.85 * u + 0.15 * (0.5 - 0.5 * Math.cos(Math.PI * u));
  return Math.max(0.02, Math.min(1, shaped));
}

/** True if `HH:mm` lies inside the Vietnam lunch break (11:31..12:59). */
export function isVietnamLunchMinute(hhmm: string): boolean {
  return hhmm > '11:30' && hhmm < '13:00';
}

/** Formats a positive integer using Vietnamese dot thousands separators (e.g. `1500` -> `'1.500'`). */
export function formatVietnameseInteger(value: number): string {
  const rounded = Math.round(value);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Unpacks columnar JSONB `market_daily_bars.bars` safely. */
export function parseStoredDailyBars(raw: unknown): StoredDailyBarsColumns | null {
  if (!isRecordObject(raw)) return null;
  const d = Array.isArray(raw.d) ? raw.d : null;
  const c = Array.isArray(raw.c) ? raw.c : null;
  const v = Array.isArray(raw.v) ? raw.v : null;
  if (!d || !c || !v) return null;
  const len = Math.min(d.length, c.length, v.length);
  if (len === 0) return null;

  const o = Array.isArray(raw.o) ? raw.o : c;
  const h = Array.isArray(raw.h) ? raw.h : c;
  const l = Array.isArray(raw.l) ? raw.l : c;

  const dates: string[] = [];
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const volumes: number[] = [];

  for (let i = 0; i < len; i += 1) {
    const dateVal = typeof d[i] === 'string' ? (d[i] as string).slice(0, 10) : '';
    const closeVal = toFiniteNumber(c[i]);
    const volVal = toFiniteNumber(v[i]);
    if (!dateVal || closeVal === null || volVal === null) continue;
    dates.push(dateVal);
    opens.push(toFiniteNumber(o[i]) ?? closeVal);
    highs.push(toFiniteNumber(h[i]) ?? closeVal);
    lows.push(toFiniteNumber(l[i]) ?? closeVal);
    closes.push(closeVal);
    volumes.push(volVal);
  }
  if (dates.length === 0) return null;
  return { d: dates, o: opens, h: highs, l: lows, c: closes, v: volumes };
}

/** Extracts `DailyCloseBar[]` from columnar stored daily bars. */
export function toDailyCloseBars(columns: StoredDailyBarsColumns): DailyCloseBar[] {
  const result: DailyCloseBar[] = [];
  for (let i = 0; i < columns.d.length; i += 1) {
    const date = columns.d[i]!;
    const close = columns.c[i]!;
    if (close > 0) {
      result.push({ d: date, c: close });
    }
  }
  return result;
}

/** Checks if a ticker code looks like a Vietnam non-equity (ETF, CW, bond). */
export function isLikelyNonEquityTicker(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  if (!s) return true;
  if (s.length !== 3) return true;
  return false;
}

/** Returns Unix seconds `daysAgo` before `now`. */
export function unixSecondsDaysAgo(now: Date, daysAgo: number): number {
  return Math.floor((now.getTime() - daysAgo * DAY_MS) / 1_000);
}
