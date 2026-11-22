/**
 * Trading calendar of the rules (§2.1, §3.2, D1). Past sessions are the store's VNINDEX dates;
 * sessions after the last stored date can be predicted with weekdays minus holidays (Phiên tới,
 * due dates). Holidays and weekends are never sessions; a suspended symbol's day still counts (Q21)
 * because counting uses the market calendar, never the symbol's own bars.
 */

import type { SessionCalendarLike } from './contracts.js';

const DAY_MS = 86_400_000;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** First index with `dates[i] > value` (dates ascending). */
function upperBound(dates: readonly string[], value: string): number {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (dates[mid]! <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index with `dates[i] >= value`. */
function lowerBound(dates: readonly string[], value: string): number {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (dates[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type SessionCalendarOptions = {
  /**
   * Predict sessions after the last stored date (weekdays minus these holidays). Omitted = no
   * prediction: `addSessions` returns null beyond the stored range.
   */
  holidays?: Iterable<string>;
};

export class SessionCalendar implements SessionCalendarLike {
  readonly dates: readonly string[];
  private readonly index = new Map<string, number>();
  private readonly holidays: ReadonlySet<string> | null;

  constructor(dates: readonly string[], options: SessionCalendarOptions = {}) {
    const sorted = [...new Set(dates)].sort();
    this.dates = sorted;
    sorted.forEach((date, i) => this.index.set(date, i));
    this.holidays = options.holidays ? new Set(options.holidays) : null;
  }

  get first(): string | null {
    return this.dates[0] ?? null;
  }

  get last(): string | null {
    return this.dates.at(-1) ?? null;
  }

  get length(): number {
    return this.dates.length;
  }

  has(date: string): boolean {
    return this.index.has(date);
  }

  indexOf(date: string): number {
    return this.index.get(date) ?? -1;
  }

  /** Index of the first stored session >= date (length when none). */
  indexAtOrAfter(date: string): number {
    return lowerBound(this.dates, date);
  }

  /** Index of the last stored session <= date (-1 when none). */
  indexAtOrBefore(date: string): number {
    return upperBound(this.dates, date) - 1;
  }

  /** Is `date` a predicted (future) session: after the stored range, a weekday, not a holiday. */
  isPredictedSession(date: string): boolean {
    if (!this.holidays) return false;
    const last = this.last;
    if (last !== null && date <= last) return false;
    return !isWeekend(date) && !this.holidays.has(date);
  }

  /**
   * Sessions s with `from < s <= to`: stored ones plus, past the stored range, predicted ones.
   * Holding count: the buy session is 0, the next session is 1 (§3.2).
   */
  countSessions(from: string, to: string): number {
    if (to <= from) return 0;
    let count = upperBound(this.dates, to) - upperBound(this.dates, from);
    const last = this.last;
    if (this.holidays && last !== null && to > last) {
      let day = addDays(from > last ? from : last, 1);
      while (day <= to) {
        if (this.isPredictedSession(day)) count += 1;
        day = addDays(day, 1);
      }
    }
    return count;
  }

  /** The n-th session strictly after `date` (n >= 1); predicted past the stored range. */
  addSessions(date: string, n: number): string | null {
    if (!Number.isInteger(n) || n < 1) throw new Error('addSessions requires n >= 1');
    const start = upperBound(this.dates, date);
    const target = start + n - 1;
    if (target < this.dates.length) return this.dates[target]!;
    if (!this.holidays) return null;
    let remaining = target - this.dates.length + 1;
    const last = this.last;
    let day = last !== null && last > date ? last : date;
    for (let guard = 0; guard < 3_660; guard += 1) {
      day = addDays(day, 1);
      if (this.isPredictedSession(day)) {
        remaining -= 1;
        if (remaining === 0) return day;
      }
    }
    return null;
  }

  /** Next session strictly after `date`. */
  nextSession(date: string): string | null {
    return this.addSessions(date, 1);
  }

  /** The next `count` predicted sessions after the stored range (or after `from`). */
  predictFuture(count: number, from?: string): string[] {
    const out: string[] = [];
    let cursor = from ?? this.last;
    if (cursor === null) return out;
    for (let i = 0; i < count; i += 1) {
      const next = this.addSessions(cursor, 1);
      if (next === null) break;
      out.push(next);
      cursor = next;
    }
    return out;
  }

  /** Stored sessions in [start, end]. */
  sessionsBetween(start: string, end: string): string[] {
    if (end < start) return [];
    return this.dates.slice(lowerBound(this.dates, start), upperBound(this.dates, end));
  }
}
