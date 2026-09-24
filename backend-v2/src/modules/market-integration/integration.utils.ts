import { createHash } from 'node:crypto';

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function positive(value: unknown): number | null {
  const result = finite(value);
  return result !== null && result > 0 ? result : null;
}

export function sessionDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    let timestamp = Number(value);
    if (!Number.isFinite(timestamp)) return null;
    if (timestamp > 10_000_000_000) timestamp /= 1000;
    const date = new Date(timestamp * 1000 + 7 * 60 * 60 * 1000);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

export function compactDate(value: string): string {
  return value.replaceAll('-', '');
}

export function daysBefore(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function stableHash(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (typeof item === 'bigint') return item.toString();
    if (Array.isArray(item)) return item.map(canonical);
    if (isObject(item)) {
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, child]) => child !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, canonical(child)]),
      );
    }
    return item;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export async function mapLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        result[index] = await operation(items[index]!);
      }
    },
  );
  await Promise.all(workers);
  return result;
}

export function vnToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isCompletedVietnamSession(date: string, now = new Date()): boolean {
  const today = vnToday(now);
  if (date < today) return true;
  if (date > today) return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? -1);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? -1);
  return hour > 15 || (hour === 15 && minute >= 15);
}
