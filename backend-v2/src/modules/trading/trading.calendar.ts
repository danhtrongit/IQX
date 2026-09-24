const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function dateOnly(value: Date): string {
  return new Date(value.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function isTradingDay(date: string, holidays: ReadonlySet<string>): boolean {
  const day = utcDate(date).getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(date);
}

export function currentTradingDate(now: Date, holidays: ReadonlySet<string>): string {
  let current = dateOnly(now);
  while (!isTradingDay(current, holidays)) {
    const date = utcDate(current);
    date.setUTCDate(date.getUTCDate() - 1);
    current = date.toISOString().slice(0, 10);
  }
  return current;
}

export function addTradingDays(date: string, count: number, holidays: ReadonlySet<string>): string {
  const cursor = utcDate(date);
  let remaining = count;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const candidate = cursor.toISOString().slice(0, 10);
    if (isTradingDay(candidate, holidays)) remaining -= 1;
  }
  return cursor.toISOString().slice(0, 10);
}

/** End of the GFD session, 15:00 Asia/Ho_Chi_Minh (08:00 UTC). */
export function sessionExpiry(date: string): Date {
  return new Date(`${date}T08:00:00.000Z`);
}
