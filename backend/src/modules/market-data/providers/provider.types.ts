export type JsonObject = Record<string, unknown>;

export interface ProviderResult<T> {
  data: T;
  rawEndpoint: string;
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asObjects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

export function snakeCase(value: string): string {
  return value
    .replace(/(.)([A-Z][a-z]+)/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

export function snakeObject(value: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [snakeCase(key), item]));
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function numberOrZero(value: unknown): number {
  return numberOrNull(value) ?? 0;
}
