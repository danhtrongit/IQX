/**
 * Pure logic of the daily price store (PLAN-bot-strategy D2–D4): vendor rows → integer VND bars,
 * series hash, and the refresh decision (append / replace on adjustment / unchanged). No database.
 */

import { createHash } from 'node:crypto';

import { normalizeVendorRows } from '../flashback/flashback-dataset.logic.js';
import {
  FLASHBACK_PRICE_MAX_VND,
  FLASHBACK_PRICE_MIN_VND,
  flashbarDate,
} from '../flashback/flashback.market-data.js';

/** One stored bar. Stocks: integer VND. VNINDEX: price columns = points × 100, `close_idx` = points. */
export type StoreBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  value_vnd: number;
  close_idx: number | null;
};

export const STOCK_SOURCE = 'DNSE:x1000:adjusted' as const;
export const INDEX_SOURCE = 'DNSE:VNINDEX' as const;
/** DNSE prices are in thousand VND: × 1000 (the Flashback store's conversion, D2). */
export const DNSE_STOCK_SCALE = 1_000;

const validPrice = (value: number): boolean => Number.isFinite(value) && value > 0;

function median(values: readonly number[]): number {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
}

export class PriceUnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PriceUnitError';
  }
}

/**
 * DNSE stock rows → integer VND bars before `beforeDate` (today's unfinished session excluded).
 * Invalid bars (missing/non-positive prices, negative volume, high < low) are dropped: the store
 * never invents a price. The median close must lie in 1.000–1.000.000 đ, else the vendor changed
 * its unit and the refresh fails for that symbol.
 */
export function normalizeStockRows(rows: readonly unknown[], beforeDate: string): StoreBar[] {
  const normalized = normalizeVendorRows(rows, DNSE_STOCK_SCALE, beforeDate);
  const bars: StoreBar[] = [];
  for (const row of normalized) {
    if (![row.open, row.high, row.low, row.close].every(validPrice)) continue;
    if (!Number.isFinite(row.volume) || row.volume < 0) continue;
    if (row.high < row.low) continue;
    bars.push({
      date: row.date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      value_vnd: row.close * row.volume,
      close_idx: null,
    });
  }
  const center = median(bars.map((bar) => bar.close));
  if (bars.length && (center < FLASHBACK_PRICE_MIN_VND || center > FLASHBACK_PRICE_MAX_VND)) {
    throw new PriceUnitError(
      `Giá DNSE sau quy đổi có trung vị ${center}đ, ngoài 1.000đ–1.000.000đ`,
    );
  }
  return bars;
}

const num = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return Number.NaN;
  if (typeof value !== 'number' && typeof value !== 'string') return Number.NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

/** DNSE index rows → bars (points kept with 2 decimals in `close_idx`, × 100 in price columns). */
export function normalizeIndexRows(rows: readonly unknown[], beforeDate: string): StoreBar[] {
  const byDate = new Map<string, StoreBar>();
  for (const raw of rows) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const date = flashbarDate(row.time);
    if (!date || date >= beforeDate) continue;
    const [open, high, low, close] = [row.open, row.high, row.low, row.close].map(num) as [
      number,
      number,
      number,
      number,
    ];
    if (![open, high, low, close].every(validPrice)) continue;
    const volume = num(row.volume);
    byDate.set(date, {
      date,
      open: Math.round(open * 100),
      high: Math.round(high * 100),
      low: Math.round(low * 100),
      close: Math.round(close * 100),
      volume: Number.isFinite(volume) && volume >= 0 ? Math.round(volume) : 0,
      value_vnd: 0,
      close_idx: Math.round(close * 100) / 100,
    });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

const barKey = (bar: StoreBar): string =>
  `${bar.date},${bar.open},${bar.high},${bar.low},${bar.close},${bar.volume}`;

/** sha256 of the canonical text of a series (date-ordered). */
export function seriesHash(bars: readonly StoreBar[]): string {
  const hash = createHash('sha256');
  for (const bar of [...bars].sort((a, b) => (a.date < b.date ? -1 : 1)))
    hash.update(`${barKey(bar)}\n`);
  return hash.digest('hex');
}

export type RefreshPlan = {
  /** Bars to insert or update (new dates + changed ones). */
  upserts: StoreBar[];
  /** An already stored bar changed (price adjustment): bump series_rev. */
  adjusted: boolean;
  changed_dates: number;
  new_dates: number;
  /** Stored ∪ fetched series after the write (stored-only dates are kept, never deleted). */
  merged: StoreBar[];
};

/**
 * Compares the fetched full series with the stored one. New dates are appended; a stored date
 * whose bar differs means the vendor re-adjusted the history: those bars are rewritten and the
 * revision bumped (D3). Dates stored but absent from the fetch are kept (bars are never deleted).
 */
export function planRefresh(
  stored: readonly StoreBar[],
  fetched: readonly StoreBar[],
): RefreshPlan {
  const byDate = new Map(stored.map((bar) => [bar.date, bar]));
  const upserts: StoreBar[] = [];
  let changed = 0;
  let added = 0;
  for (const bar of fetched) {
    const previous = byDate.get(bar.date);
    if (!previous) {
      added += 1;
      upserts.push(bar);
    } else if (barKey(previous) !== barKey(bar) || previous.close_idx !== bar.close_idx) {
      changed += 1;
      upserts.push(bar);
    }
  }
  const merged = new Map(byDate);
  for (const bar of upserts) merged.set(bar.date, bar);
  return {
    upserts,
    adjusted: changed > 0,
    changed_dates: changed,
    new_dates: added,
    merged: [...merged.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

const VN_OFFSET_MS = 7 * 3_600_000;
/** DNSE daily bars of session D are final after 15:15 ICT. */
export const STORE_READY_MINUTES = 15 * 60 + 15;

/** Vietnam calendar date and minutes of `now`. */
export function vietnamClock(now: Date): { date: string; minutes: number } {
  const shifted = new Date(now.getTime() + VN_OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** Bars dated before this are final: today counts only from 15:15 ICT. */
export function finalBeforeDate(now: Date): string {
  const clock = vietnamClock(now);
  if (clock.minutes < STORE_READY_MINUTES) return clock.date;
  return new Date(Date.parse(`${clock.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** 15:15 ICT of `date` as an instant (a symbol refreshed after it holds that session's final bar). */
export function readyInstant(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) + STORE_READY_MINUTES * 60_000 - VN_OFFSET_MS);
}

/** Store-eligible members: membership ∩ symbols with bars (D4). */
export function eligibleMembers(members: readonly string[], stored: ReadonlySet<string>): string[] {
  return [...new Set(members.map((symbol) => symbol.trim().toUpperCase()))]
    .filter((symbol) => stored.has(symbol))
    .sort();
}
