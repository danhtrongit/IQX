import type { SqlClient } from '../../platform/database/index.js';
import {
  nextCalendarDate,
  tradingDayPredicate,
  type IsTradingDay,
} from '../strategy-config/strategy-config.calendar.js';

/** A holding longer than this is capped so a corrupt date can never spin the loop. */
const MAX_HOLDING_DAYS = 20 * 366;

/**
 * The trading calendar the Bot itself uses (weekdays minus the holidays of the active
 * `virtual_trading_configs` row, see `tradingDayPredicate`). Null when it is unavailable.
 */
export async function loadTradingCalendar(client: SqlClient): Promise<IsTradingDay | null> {
  const rows = await client.query<{ holidays: unknown }>(
    'select holidays from virtual_trading_configs where is_active = true order by updated_at desc limit 1',
  );
  return tradingDayPredicate(rows[0]);
}

/**
 * Trading sessions in `[from, to)` (both `YYYY-MM-DD`): the session of `from` counts, the session
 * of `to` does not. A position bought at session T and sold at session T+1 has held 1 session,
 * whether or not the Bot also ran on the days in between.
 */
export function tradingSessionsBetween(
  from: string,
  to: string,
  isTradingDay: IsTradingDay,
): number {
  let count = 0;
  let date = from;
  for (let step = 0; date < to && step < MAX_HOLDING_DAYS; step += 1) {
    if (isTradingDay(date)) count += 1;
    date = nextCalendarDate(date);
  }
  return count;
}

/**
 * Sessions an open position has been held through `asOf` (inclusive, the last session the Bot
 * processed): `[opened_session, asOf]`.
 */
export function openHoldingSessions(
  openedSession: string,
  asOf: string,
  isTradingDay: IsTradingDay,
): number {
  return tradingSessionsBetween(openedSession, nextCalendarDate(asOf), isTradingDay);
}
