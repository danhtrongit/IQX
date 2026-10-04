import { createHash } from 'node:crypto';
import type { SharedConfig } from './types.js';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const withJson = value as { toJSON?: unknown };
    if (typeof withJson.toJSON === 'function')
      return canonicalize((withJson.toJSON as () => unknown).call(value));
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

/** JSON text with object keys sorted recursively (array order preserved). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? 'null';
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** sha256 hex of the canonical JSON of a shared config. */
export function configHash(config: SharedConfig): string {
  return sha256Hex(canonicalJson(config));
}
