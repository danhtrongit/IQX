/**
 * Pure Vietnam timezone (UTC+7, Asia/Ho_Chi_Minh) calendar, cutoff, workday,
 * tenure, and diacritic-insensitive search helpers for Khu Văn phòng.
 */
import { VN_HOLIDAYS } from '../reports/market-calendar.js';

export const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const HHMM_RE = /^(\d{2}):(\d{2})$/;

export interface IctNowParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  /** 0 = Sunday .. 6 = Saturday */
  readonly weekday: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  /** YYYY-MM-DD */
  readonly date: string;
  /** YYYY-MM */
  readonly monthKey: string;
  /** HH:MM */
  readonly hhmm: string;
  readonly minutesOfDay: number;
}

export interface TenureParts {
  readonly years: number;
  readonly months: number;
  readonly days: number;
  readonly label: string;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

export function ictNowParts(now: Date = new Date()): IctNowParts {
  const shifted = new Date(now.getTime() + ICT_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const weekday = shifted.getUTCDay();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const second = shifted.getUTCSeconds();
  const date = `${year}-${pad2(month)}-${pad2(day)}`;
  const monthKey = `${year}-${pad2(month)}`;
  const hhmm = `${pad2(hour)}:${pad2(minute)}`;
  return {
    year,
    month,
    day,
    weekday,
    hour,
    minute,
    second,
    date,
    monthKey,
    hhmm,
    minutesOfDay: hour * 60 + minute,
  };
}

export function ictDateString(now: Date = new Date()): string {
  return ictNowParts(now).date;
}

export function ictMonthString(now: Date = new Date()): string {
  return ictNowParts(now).monthKey;
}

export function parseDateYmd(dateStr: string): { year: number; month: number; day: number } | null {
  const match = DATE_RE.exec(dateStr);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function parseMonthYm(monthStr: string): { year: number; month: number } | null {
  const match = MONTH_RE.exec(monthStr);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function ictMonthEndDate(periodMonth: string): string {
  const parsed = parseMonthYm(periodMonth);
  if (!parsed) throw new Error(`Invalid period month: ${periodMonth}`);
  const lastDay = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  return `${parsed.year}-${pad2(parsed.month)}-${pad2(lastDay)}`;
}

export function ictNextMonthReset(periodMonth: string): {
  readonly date: string;
  readonly label: string;
} {
  const parsed = parseMonthYm(periodMonth);
  if (!parsed) throw new Error(`Invalid period month: ${periodMonth}`);
  const nextYear = parsed.month === 12 ? parsed.year + 1 : parsed.year;
  const nextMonth = parsed.month === 12 ? 1 : parsed.month + 1;
  return {
    date: `${nextYear}-${pad2(nextMonth)}-01`,
    label: `01/${pad2(nextMonth)}`,
  };
}

export function ictPreviousDate(dateStr: string): string {
  const parsed = parseDateYmd(dateStr);
  if (!parsed) throw new Error(`Invalid date: ${dateStr}`);
  const prev = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day - 1));
  return `${prev.getUTCFullYear()}-${pad2(prev.getUTCMonth() + 1)}-${pad2(prev.getUTCDate())}`;
}

export function ictPreviousMonth(periodMonth: string): string {
  const parsed = parseMonthYm(periodMonth);
  if (!parsed) throw new Error(`Invalid period month: ${periodMonth}`);
  const prevYear = parsed.month === 1 ? parsed.year - 1 : parsed.year;
  const prevMonth = parsed.month === 1 ? 12 : parsed.month - 1;
  return `${prevYear}-${pad2(prevMonth)}`;
}

export function parseCutoffMinutes(hhmm: string, fallbackMinutes: number): number {
  const match = HHMM_RE.exec(hhmm.trim());
  if (!match) return fallbackMinutes;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallbackMinutes;
  return hour * 60 + minute;
}

export function isWeekendIct(dateStr: string): boolean {
  const parsed = parseDateYmd(dateStr);
  if (!parsed) return false;
  const day = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  return day === 0 || day === 6;
}

export function isWorkdayIct(
  dateStr: string,
  holidays: ReadonlySet<string> = VN_HOLIDAYS,
): boolean {
  const parsed = parseDateYmd(dateStr);
  if (!parsed) return false;
  const day = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(dateStr);
}

/**
 * Counts workdays (Mon–Fri excluding holidays) within `periodMonth` up to and
 * including `upToDate`. When `fromDate` is provided (e.g. a mid-month `joinDate`),
 * counting starts at `max(monthStart, fromDate)` so new hires are not marked absent
 * for days prior to joining.
 */
export function countWorkdaysInMonthUpTo(
  periodMonth: string,
  upToDate: string,
  holidays: ReadonlySet<string> = VN_HOLIDAYS,
  fromDate?: string,
): number {
  const ym = parseMonthYm(periodMonth);
  const upTo = parseDateYmd(upToDate);
  if (!ym || !upTo) return 0;
  const monthStart = `${ym.year}-${pad2(ym.month)}-01`;
  const monthEnd = ictMonthEndDate(periodMonth);
  if (upToDate < monthStart) return 0;
  const effectiveStart =
    fromDate && parseDateYmd(fromDate) && fromDate > monthStart ? fromDate : monthStart;
  const effectiveEnd = upToDate < monthEnd ? upToDate : monthEnd;
  if (effectiveStart > effectiveEnd) return 0;
  const startParts = parseDateYmd(effectiveStart)!;
  const endParts = parseDateYmd(effectiveEnd)!;
  let count = 0;
  for (let d = startParts.day; d <= endParts.day; d += 1) {
    const candidate = `${ym.year}-${pad2(ym.month)}-${pad2(d)}`;
    if (isWorkdayIct(candidate, holidays)) count += 1;
  }
  return count;
}

/**
 * Computes exact calendar tenure from integer Y/M/D without UTC timezone drift.
 * Uses clamped calendar month anchoring (so month-end dates like Jan 31 -> Mar 02 never yield
 * negative days) and omits zero units (e.g. "2 tháng 9 ngày"); returns "0 ngày" if same/future.
 */
export function computeTenureParts(joinDate: string, todayDate: string): TenureParts {
  const start = parseDateYmd(joinDate);
  const end = parseDateYmd(todayDate);
  if (!start || !end || joinDate >= todayDate) {
    return { years: 0, months: 0, days: 0, label: '0 ngày' };
  }

  const endUtcMs = Date.UTC(end.year, end.month - 1, end.day);
  const anchorUtcMs = (addMonths: number): number => {
    const totalMonths = start.year * 12 + (start.month - 1) + addMonths;
    const y = Math.floor(totalMonths / 12);
    const m = (totalMonths % 12) + 1;
    const maxDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Date.UTC(y, m - 1, Math.min(start.day, maxDay));
  };

  let totalMonths = (end.year - start.year) * 12 + (end.month - start.month);
  if (anchorUtcMs(totalMonths) > endUtcMs) {
    totalMonths -= 1;
  }
  totalMonths = Math.max(0, totalMonths);

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const days = Math.max(0, Math.round((endUtcMs - anchorUtcMs(totalMonths)) / 86_400_000));

  const chunks: string[] = [];
  if (years > 0) chunks.push(`${years} năm`);
  if (months > 0) chunks.push(`${months} tháng`);
  if (days > 0) chunks.push(`${days} ngày`);

  return {
    years,
    months,
    days,
    label: chunks.length > 0 ? chunks.join(' ') : '0 ngày',
  };
}

/** Formats an ISO timestamp or Date to HH:MM in Vietnam timezone (UTC+7). */
export function formatIctHhmm(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return ictNowParts(date).hhmm;
}

/** Case- and Vietnamese diacritic-insensitive normalization for staff search. */
export function normalizeVietnameseSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();
}

export function extractHolidaySet(raw: unknown): Set<string> {
  const merged = new Set<string>(VN_HOLIDAYS);
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (typeof item === 'string' && DATE_RE.test(item)) merged.add(item);
    }
  }
  return merged;
}
