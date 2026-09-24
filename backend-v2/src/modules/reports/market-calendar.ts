const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

export const VN_HOLIDAYS = new Set([
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-04-06',
  '2026-04-30',
  '2026-05-01',
  '2026-09-02',
]);

export function ictDate(now = new Date()): string {
  return new Date(now.getTime() + ICT_OFFSET_MS).toISOString().slice(0, 10);
}

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function isTradingDate(date: string): boolean {
  const parsed = utcDate(date);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
  const day = parsed.getUTCDay();
  return day !== 0 && day !== 6 && !VN_HOLIDAYS.has(date);
}

export function previousTradingDate(date: string): string {
  const cursor = utcDate(date);
  do cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (!isTradingDate(cursor.toISOString().slice(0, 10)));
  return cursor.toISOString().slice(0, 10);
}

export function currentOrPreviousTradingDate(now = new Date()): string {
  const current = ictDate(now);
  return isTradingDate(current) ? current : previousTradingDate(current);
}

export function thirdThursday(year: number, month: number): string {
  for (let day = 15; day <= 21; day += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCDay() === 4) return candidate.toISOString().slice(0, 10);
  }
  throw new Error('Unable to determine futures expiry');
}

export function isFuturesExpiryDate(date: string): boolean {
  const parsed = utcDate(date);
  return date === thirdThursday(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1);
}

export function buildCalendarBlock(date: string): Record<string, unknown> {
  const parsed = utcDate(date);
  let year = parsed.getUTCFullYear();
  let month = parsed.getUTCMonth() + 1;
  let expiry = thirdThursday(year, month);
  if (expiry < date) {
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
    expiry = thirdThursday(year, month);
  }
  const daysUntil = Math.round((utcDate(expiry).getTime() - parsed.getTime()) / 86_400_000);
  return {
    next_futures_expiry: {
      date: expiry,
      code: `VN30F${String(year % 100).padStart(2, '0')}${String(month).padStart(2, '0')}`,
      days_until: daysUntil,
      is_expiry_today: expiry === date,
    },
  };
}
