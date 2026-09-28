export type JsonObject = Record<string, unknown>;

export type MarketEnvelope<T = unknown> = {
  data: T;
  meta: {
    source: string;
    source_priority: number;
    fallback_used: boolean;
    as_of: string;
    raw_endpoint?: string;
    currency?: string;
    interval?: string;
  };
};

export type SourceResult<T> = { data: T; sourceUrl: string };

export function envelope<T>(
  data: T,
  source: string,
  sourceUrl?: string,
  extra: Partial<MarketEnvelope<T>['meta']> = {},
): MarketEnvelope<T> {
  return {
    data,
    meta: {
      source,
      source_priority: 1,
      fallback_used: false,
      as_of: new Date().toISOString(),
      ...(sourceUrl ? { raw_endpoint: sourceUrl } : {}),
      ...extra,
    },
  };
}

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown, label: string): JsonObject {
  if (!isRecord(value)) throw new Error(`Invalid upstream shape: ${label} must be an object`);
  return value;
}

export function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid upstream shape: ${label} must be an array`);
  return value;
}

export function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function integer(value: unknown): number | null {
  const result = finiteNumber(value);
  return result === null ? null : Math.trunc(result);
}

export function snakeCase(value: string): string {
  return value
    .replace(/(.)([A-Z][a-z]+)/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}
