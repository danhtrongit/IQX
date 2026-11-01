import type { Cell, Point } from '../types';

export const rand = (min: number, max: number): number => min + Math.random() * (max - min);

export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

export const cellCenter = (c: Cell): Point => ({ x: c.x + 0.5, y: c.y + 0.5 });

export const cellOf = (p: Point): Cell => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

/** Deterministic PRNG so procedural art is stable between reloads. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
