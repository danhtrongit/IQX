/**
 * Effective-session calendar for the shared config (SHARED-CONFIG-API §2): a saved revision
 * applies to the Bot from the first valid trading session whose date is strictly after the
 * save date in Asia/Ho_Chi_Minh. Session dates are computed on calendar days, never +24h.
 */

export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** Safety bound when searching for the next session (a holiday block is never this long). */
const MAX_SESSION_SEARCH_DAYS = 60;

export type EffectiveStatus = 'pending' | 'effective' | 'calendar_unavailable';

/** Trading-day predicate over `YYYY-MM-DD` dates. */
export type IsTradingDay = (date: string) => boolean;

const vnDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date (`YYYY-MM-DD`) of an instant in Asia/Ho_Chi_Minh. */
export function vnDate(instant: Date): string {
  const parts = vnDateFormatter.formatToParts(instant);
  const part = (type: 'year' | 'month' | 'day') =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Next calendar date of a `YYYY-MM-DD` date. */
export function nextCalendarDate(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * First trading session with date > the Asia/Ho_Chi_Minh save date, or null when no session
 * exists within the search bound.
 */
export function nextEffectiveSession(savedAtUtc: Date, isTradingDay: IsTradingDay): string | null {
  let date = vnDate(savedAtUtc);
  for (let step = 0; step < MAX_SESSION_SEARCH_DAYS; step += 1) {
    date = nextCalendarDate(date);
    if (isTradingDay(date)) return date;
  }
  return null;
}

/**
 * Trading-day predicate of the active `virtual_trading_configs` row: weekdays minus the
 * listed holidays (same semantics as DomainRuntime.isTradingDay). Returns null when the
 * calendar is unavailable: no active row, invalid holiday JSON, or a non-array value.
 */
export function tradingDayPredicate(
  calendar: { holidays: unknown } | null | undefined,
): IsTradingDay | null {
  if (!calendar) return null;
  let holidays: unknown = calendar.holidays;
  if (typeof holidays === 'string') {
    try {
      holidays = JSON.parse(holidays);
    } catch {
      return null;
    }
  }
  if (holidays == null) holidays = [];
  if (!Array.isArray(holidays)) return null;
  const closed = new Set(holidays.map(String));
  return (date) => {
    const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return day !== 0 && day !== 6 && !closed.has(date);
  };
}

/** Status at read time: pending until the VN date reaches the effective session. */
export function effectiveStatus(effectiveSession: string | null, now: Date): EffectiveStatus {
  if (effectiveSession === null) return 'calendar_unavailable';
  return vnDate(now) >= effectiveSession ? 'effective' : 'pending';
}
