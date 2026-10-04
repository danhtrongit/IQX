import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import type {
  Bar,
  CanceledOrder,
  ClosedTrade,
  CurvePoint,
  Kpis,
  OpenPosition,
  RegistryEntry,
  RunOptions,
  SeriesMap,
  SharedConfig,
  Side,
  Tri,
} from '../../../src/modules/quant/v2/index.js';

/**
 * Typed handle on the spec reference engine (bot-v2 assets/engine.js copied
 * verbatim to engine.reference.cjs; only an eslint-disable header was added).
 */
export type ReferenceRunResult = {
  schema_version: string;
  engine_version: string;
  snapshot: {
    config: SharedConfig;
    options: RunOptions;
    actual_start: string;
    actual_end: string;
    bar_count: number;
  };
  initial: CurvePoint;
  curve: CurvePoint[];
  trades: ClosedTrade[];
  open_position: OpenPosition | null;
  cash: number;
  canceled: CanceledOrder[];
  kpis: Kpis;
};

export type ReferenceEngine = {
  calc(id: string, params: Record<string, number>, bars: Bar[]): SeriesMap;
  evaluateRule(rule: unknown, series: SeriesMap, params: Record<string, number>, i: number): Tri;
  evalTree(node: unknown, lookup: (id: string) => Tri): Tri;
  and3(values: Tri[]): Tri;
  defaultConfig(registry: RegistryEntry[]): SharedConfig;
  validateConfig(config: unknown, registry: RegistryEntry[], grants?: string[]): string[];
  sideSignals(config: SharedConfig, registry: RegistryEntry[], bars: Bar[], side: Side): Tri[];
  run(
    config: SharedConfig,
    registry: RegistryEntry[],
    bars: Bar[],
    options?: Partial<RunOptions>,
  ): ReferenceRunResult;
  syntheticBars(n?: number): Bar[];
};

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export const reference = require('./engine.reference.cjs') as ReferenceEngine;

/** Raw registry JSON (not zod-parsed) as consumed by the reference engine. */
export const rawRegistry = JSON.parse(
  readFileSync(
    join(here, '../../../src/modules/quant/v2/registry/technical-registry.json'),
    'utf8',
  ),
) as RegistryEntry[];

const CONTEXT_KEYS = [
  'market',
  'sector',
  'advances',
  'declines',
  'above50',
  'eligible',
  'newHigh',
  'newLow',
  'coverage',
] as const;

/** Synthetic bars without any context field (pure OHLCV). */
export function withoutContext(bars: readonly Bar[]): Bar[] {
  return bars.map((bar) => {
    const copy: Bar = { ...bar };
    for (const key of CONTEXT_KEYS) delete copy[key];
    return copy;
  });
}

/** Bars with gaps: invalid OHLC, NaN close, null context and low coverage at fixed positions. */
export function withDefects(bars: readonly Bar[]): Bar[] {
  return bars.map((bar, i) => {
    if (i === 300) return { ...bar, high: bar.low - 1 };
    if (i === 450) return { ...bar, close: Number.NaN };
    if (i === 520) return { ...bar, volume: -1 };
    if (i >= 600 && i < 605) return { ...bar, market: null, sector: null, advances: null };
    if (i === 700) return { ...bar, coverage: 0.5 };
    if (i === 710) return { ...bar, coverage: null, eligible: 0 };
    return { ...bar };
  });
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const numbersClose = (a: number, b: number): boolean => {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
};

function collectMismatches(actual: unknown, expected: unknown, path: string, out: string[]): void {
  if (out.length > 20) return;
  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || !numbersClose(actual, expected)) {
      out.push(`${path}: ${String(actual)} != ${String(expected)}`);
    }
    return;
  }
  if (expected === null || expected === undefined || typeof expected !== 'object') {
    if (actual !== expected) out.push(`${path}: ${String(actual)} != ${String(expected)}`);
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      out.push(`${path}: array length mismatch`);
      return;
    }
    expected.forEach((item: unknown, i) =>
      collectMismatches(actual[i], item, `${path}[${i}]`, out),
    );
    return;
  }
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
    out.push(`${path}: expected object`);
    return;
  }
  const a = actual as Record<string, unknown>;
  const e = expected as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(e)]);
  for (const key of keys) {
    if (a[key] === undefined && e[key] === undefined) continue;
    if (!(key in e)) {
      out.push(`${path}.${key}: unexpected key`);
      continue;
    }
    collectMismatches(a[key], e[key], `${path}.${key}`, out);
  }
}

/** Deep equality with numbers within 1e-9 (relative for |x| > 1) and identical nulls. */
export function expectDeepClose(actual: unknown, expected: unknown, label = 'value'): void {
  const mismatches: string[] = [];
  collectMismatches(actual, expected, label, mismatches);
  expect(mismatches).toEqual([]);
}
