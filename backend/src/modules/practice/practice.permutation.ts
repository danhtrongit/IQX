import { randomInt, randomUUID } from 'node:crypto';

import type { NewCase } from './practice.repository.js';

/** Uniform in [0, bound). Replaceable in tests to obtain a deterministic permutation. */
export type RandomInt = (bound: number) => number;

/** Fisher-Yates shuffle with a cryptographic source (never `Math.random`). */
export function shuffle<T>(
  items: readonly T[],
  random: RandomInt = (bound) => randomInt(bound),
): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * Server-side permutation of the set symbols: ordinal 1..N, each symbol exactly once, each with
 * a random opaque `case_id`. Stored once per (user, indicator, set); never regenerated.
 */
export function generateCases(
  symbols: readonly string[],
  random?: RandomInt,
  newId: () => string = randomUUID,
): NewCase[] {
  return shuffle(symbols, random).map((symbol, index) => ({
    ordinal: index + 1,
    case_id: newId(),
    symbol,
  }));
}
