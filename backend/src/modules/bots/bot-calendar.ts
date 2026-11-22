/**
 * Time and calendar of the Bot v2.0 schedule (spec §6.4, PLAN D1).
 *
 * - Cutoff ("giờ chốt dữ liệu") = `BOT_SESSION_CUTOFF` (HH:MM, Asia/Ho_Chi_Minh, default 19:00):
 *   the moment session D of the price store is committed for the Bot.
 * - Past sessions = the store's VNINDEX dates; future sessions (Phiên tới, due dates) = weekdays
 *   minus `virtual_trading_configs.holidays` (`SessionCalendar` with `holidays`).
 */

import type { SqlClient } from '../../platform/database/index.js';
import { SessionCalendar } from '../strategy-rules/index.js';

export const DEFAULT_BOT_SESSION_CUTOFF = '19:00';
/** Last tick of a session day: a session still without store data is given up (D25). */
export const BOT_SESSION_GIVE_UP = '23:50';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseCutoff(raw: string | undefined | null): { hour: number; minute: number } {
  const value = raw?.trim() || DEFAULT_BOT_SESSION_CUTOFF;
  const match = HHMM.exec(value);
  if (!match) throw new Error(`BOT_SESSION_CUTOFF must be HH:MM (got ${value})`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** Cutoff from the environment (read at call time so tests can change it). */
export function botSessionCutoff(): { hour: number; minute: number } {
  return parseCutoff(process.env.BOT_SESSION_CUTOFF);
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** `YYYY-MM-DD` of an instant in Asia/Ho_Chi_Minh (UTC+7, no DST). */
export function ictDate(instant: Date): string {
  return new Date(instant.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Minutes since midnight ICT. */
export function ictMinutes(instant: Date): number {
  const shifted = new Date(instant.getTime() + 7 * 3_600_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** The cutoff instant of `date` (ICT). */
export function cutoffInstant(
  date: string,
  cutoff: { hour: number; minute: number } = botSessionCutoff(),
): Date {
  return new Date(`${date}T${pad(cutoff.hour)}:${pad(cutoff.minute)}:00+07:00`);
}

export function isAtOrAfterCutoff(
  now: Date,
  cutoff: { hour: number; minute: number } = botSessionCutoff(),
): boolean {
  return ictMinutes(now) >= cutoff.hour * 60 + cutoff.minute;
}

export function isGiveUpTime(now: Date): boolean {
  const { hour, minute } = parseCutoff(BOT_SESSION_GIVE_UP);
  return ictMinutes(now) >= hour * 60 + minute;
}

/** Holidays of the active virtual trading config (empty when unreadable). */
export async function loadHolidays(client: SqlClient): Promise<string[]> {
  const rows = await client.query<{ holidays: unknown }>(
    `select holidays from virtual_trading_configs
      where is_active = true order by updated_at desc limit 1`,
  );
  let holidays: unknown = rows[0]?.holidays ?? [];
  if (typeof holidays === 'string') {
    try {
      holidays = JSON.parse(holidays);
    } catch {
      holidays = [];
    }
  }
  return Array.isArray(holidays) ? holidays.map(String) : [];
}

/** Store sessions + predicted future sessions. */
export function botCalendar(storeDates: readonly string[], holidays: Iterable<string>): SessionCalendar {
  return new SessionCalendar(storeDates, { holidays });
}

/** Is `date` a trading session: stored, or predicted (weekday, not a holiday, after the store). */
export function isSession(calendar: SessionCalendar, date: string): boolean {
  return calendar.has(date) || calendar.isPredictedSession(date);
}

/**
 * Phiên tới at `now` (§6.4): today when today is a session and the cutoff has not passed (and
 * today has not been locked yet); otherwise the next session after today.
 */
export function nextSessionAt(
  calendar: SessionCalendar,
  now: Date,
  options: { todayLocked?: boolean; cutoff?: { hour: number; minute: number } } = {},
): string {
  const today = ictDate(now);
  if (
    isSession(calendar, today) &&
    !options.todayLocked &&
    !isAtOrAfterCutoff(now, options.cutoff ?? botSessionCutoff())
  ) {
    return today;
  }
  const next = calendar.addSessions(today, 1);
  if (next === null) throw new Error('Không xác định được phiên giao dịch kế tiếp');
  return next;
}
