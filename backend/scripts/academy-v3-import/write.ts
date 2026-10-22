import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Deterministic JSON: object keys sorted, arrays in order, 2-space indent, trailing newline. */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`non-finite number in output`);
  return v;
}

export const sha256 = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');

export function writeJson(path: string, value: unknown): string {
  const text = stableJson(value);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return text;
}

/** Remove `*.json` files in `dir` that are not in `keep` (stale lessons or banks). */
export function pruneJson(dir: string, keep: ReadonlySet<string>): string[] {
  const removed: string[] = [];
  if (!existsSync(dir)) return removed;
  const names = readdirSync(dir);
  for (const n of names)
    if (n.endsWith('.json') && !keep.has(n)) {
      rmSync(join(dir, n));
      removed.push(n);
    }
  return removed;
}
