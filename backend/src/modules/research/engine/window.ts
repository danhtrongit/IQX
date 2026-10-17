// 30-day research window (spec §8). Pure ISO-date arithmetic in UTC, so there is no timezone drift.
import { REPORT_WINDOW_DAYS } from '../research.types.js';

const DAY_MS = 86_400_000;

function toUtcMs(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's calendar date (YYYY-MM-DD) in Asia/Ho_Chi_Minh. */
export function vnToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The oldest date still inside the window: today − days. */
export function windowStart(today: string, days: number = REPORT_WINDOW_DAYS): string {
  return fromUtcMs(toUtcMs(today) - days * DAY_MS);
}

/** Active iff today − date ≤ days: exactly 30 days old is active, 31 is expired. Future dates are active. */
export function isWithinWindow(
  date: string,
  today: string,
  days: number = REPORT_WINDOW_DAYS,
): boolean {
  return Math.round((toUtcMs(today) - toUtcMs(date)) / DAY_MS) <= days;
}
