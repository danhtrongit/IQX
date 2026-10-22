/**
 * Mockup chart helpers ported verbatim (IQX-Hoc-Vien-MAU.html page script). Do not "fix" them:
 * the approved pictures and the golden indexes (design §6.5) depend on these exact formulas.
 * Arrays use `number | null` like the mockup; `at()` reads with the mockup's loose semantics.
 */

export type Num = number | null;

/** Read a defined number (throws on holes, which would be a porting bug). */
export function at(a: readonly Num[], i: number): number {
  const v = a[i];
  if (v === null || v === undefined) throw new Error(`no value at ${i}`);
  return v;
}

/** Linear congruential generator used by C1L2-g4 and C4L1-g4: `seed=(seed*9301+49297)%233280`. */
export function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** mulberry32-style generator (`rng(seed)` in every chapter 4/5 IIFE). */
export function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `series(n,seed,f,noise)`: AR(1) noise `e=e*.55+(r()-.5)*noise`. */
export function series(n: number, seed: number, f: (i: number) => number, noise: number): number[] {
  const r = rng(seed);
  const out: number[] = [];
  let e = 0;
  for (let i = 0; i < n; i++) {
    e = e * 0.55 + (r() - 0.5) * noise;
    out.push(f(i) + e);
  }
  return out;
}

/** `genVar(n,seed,f,amp)`: like series with a variable amplitude. */
export function genVar(
  n: number,
  seed: number,
  f: (i: number) => number,
  amp: (i: number) => number,
): number[] {
  const r = rng(seed);
  const out: number[] = [];
  let e = 0;
  for (let i = 0; i < n; i++) {
    e = e * 0.55 + (r() - 0.5) * amp(i);
    out.push(f(i) + e);
  }
  return out;
}

/**
 * `path(segs,start,seed,nz)`: linear legs plus AR(.5) noise. `r` may be passed in so a caller can keep
 * drawing from the same generator afterwards (C5L4-g3/g5 volumes).
 */
export function path(
  segs: readonly (readonly [number, number])[],
  start: number,
  seedOrRng: number | (() => number),
  nz: number,
): number[] {
  const r = typeof seedOrRng === 'number' ? rng(seedOrRng) : seedOrRng;
  const out = [start];
  let v = start;
  let e = 0;
  for (const [n, d] of segs) {
    for (let i = 0; i < n; i++) {
      v += d / n;
      e = e * 0.5 + (r() - 0.5) * nz;
      out.push(v + e);
    }
  }
  return out;
}

/** `sma(a,n)`: null before n-1. */
export function sma(a: readonly number[], n: number): Num[] {
  return a.map((_, i) =>
    i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n,
  );
}

/** Mockup EMA: k=2/(n+1), seeded with the FIRST value (not the SMA). */
export function emaFirstSeeded(a: readonly Num[], n: number): Num[] {
  const k = 2 / (n + 1);
  const out: Num[] = [];
  a.forEach((v, i) => {
    const prev = out[i - 1];
    out.push(
      i === 0 || v === null ? v : prev === null || prev === undefined ? v : v * k + prev * (1 - k),
    );
  });
  return out;
}

/** Wilder RSI with SMA seed of the first n changes and the `l||1e-9` guard. */
export function rsiWilder(a: readonly number[], n: number): Num[] {
  const out: Num[] = Array.from({ length: a.length }, () => null);
  let g = 0;
  let l = 0;
  for (let i = 1; i <= n; i++) {
    const d = at(a, i) - at(a, i - 1);
    if (d > 0) g += d;
    else l -= d;
  }
  g /= n;
  l /= n;
  out[n] = 100 - 100 / (1 + g / (l || 1e-9));
  for (let i = n + 1; i < a.length; i++) {
    const d = at(a, i) - at(a, i - 1);
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = 100 - 100 / (1 + g / (l || 1e-9));
  }
  return out;
}

/** Bollinger bands: SMA(n) +- k * population sigma. */
export function bands(
  p: readonly number[],
  n: number,
  k: number,
): { mid: Num[]; up: Num[]; lo: Num[] } {
  const mid = sma(p, n);
  const up: Num[] = [];
  const lo: Num[] = [];
  p.forEach((_, i) => {
    const m = mid[i];
    if (m === null || m === undefined) {
      up.push(null);
      lo.push(null);
      return;
    }
    const sl = p.slice(i - n + 1, i + 1);
    const sd = Math.sqrt(sl.reduce((s, v) => s + (v - m) * (v - m), 0) / n);
    up.push(m + k * sd);
    lo.push(m - k * sd);
  });
  return { mid, up, lo };
}

export interface Macd {
  e12: Num[];
  e26: Num[];
  m: number[];
  sg: number[];
  h: number[];
}

export function macdOf(p: readonly number[]): Macd {
  const e12 = emaFirstSeeded(p, 12);
  const e26 = emaFirstSeeded(p, 26);
  const m = p.map((_, i) => at(e12, i) - at(e26, i));
  const sgN = emaFirstSeeded(m, 9);
  const sg = m.map((_, i) => at(sgN, i));
  const h = m.map((v, i) => v - at(sg, i));
  return { e12, e26, m, sg, h };
}

/** `crosses(a,b,from,to)`: sign changes of a-b. */
export function crosses(
  a: readonly Num[],
  b: readonly Num[],
  from: number,
  to: number,
): { i: number; up: boolean }[] {
  const out: { i: number; up: boolean }[] = [];
  for (let i = Math.max(from, 1); i < to; i++) {
    const a0 = a[i - 1];
    const b0 = b[i - 1];
    if (a0 === null || b0 === null || a0 === undefined || b0 === undefined) continue;
    const d0 = a0 - b0;
    const d1 = at(a, i) - at(b, i);
    if (d0 * d1 < 0) out.push({ i, up: d1 > 0 });
  }
  return out;
}

/** `crossList(M,from,to)`: histogram sign change confirmed two bars later. */
export function crossList(M: Macd, from: number, to: number): { i: number; up: boolean }[] {
  const out: { i: number; up: boolean }[] = [];
  for (let i = from + 1; i < to - 3; i++) {
    const a = at(M.h, i - 1);
    const b = at(M.h, i);
    if (a < 0 && b >= 0 && at(M.h, i + 2) > 0) out.push({ i, up: true });
    if (a > 0 && b <= 0 && at(M.h, i + 2) < 0) out.push({ i, up: false });
  }
  return out;
}

/** RSI dot state machine of C4L6-g2: marks the extreme of every overbought/oversold excursion. */
export function rsiDotStates(
  r: readonly Num[],
  from: number,
  to: number,
): { i: number; over: boolean }[] {
  const out: { i: number; over: boolean }[] = [];
  let st = 0;
  let best = -1;
  for (let i = from; i < to; i++) {
    const v = at(r, i);
    if (st === 0) {
      if (v > 70) {
        st = 1;
        best = i;
      } else if (v < 30) {
        st = -1;
        best = i;
      }
    } else if (st === 1) {
      if (v > at(r, best)) best = i;
      if (v < 55 || i === to - 1) {
        out.push({ i: best, over: true });
        st = 0;
      }
    } else {
      if (v < at(r, best)) best = i;
      if (v > 45 || i === to - 1) {
        out.push({ i: best, over: false });
        st = 0;
      }
    }
  }
  return out;
}

/** Round to 4 decimals (committed precision); -0 becomes 0. */
export function round4(v: number): number {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
}

export const r4 = (a: readonly Num[]): Num[] => a.map((v) => (v === null ? null : round4(v)));

/** Window [from, to] inclusive of an array, rounded. */
export const win = (a: readonly Num[], from: number, to: number): Num[] =>
  r4(a.slice(from, to + 1));

/** vi-VN number format with fixed digits ("14,3", "1.400"). */
export function fmtVi(v: number, digits = 0): string {
  const fixed = Math.abs(v).toFixed(digits);
  const [int = '0', dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${v < 0 ? '-' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}
