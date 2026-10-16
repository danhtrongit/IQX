import { formatNumber } from '@/lib/format';
import type { Money } from './types';

/** Parse a money string (or number) safely; anything unparseable is `null` (never 0). */
export function toNumber(value: Money): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** `1.234.567 đ`, rounded; "—" when unknown. */
export function formatDong(value: Money): string {
  const n = toNumber(value);
  return n === null ? '—' : `${formatNumber(Math.round(n), 0)} đ`;
}

/** `+1.234 đ` / `−1.234 đ`. */
export function formatDongSigned(value: Money): string {
  const n = toNumber(value);
  if (n === null) return '—';
  const r = Math.round(n);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${formatNumber(Math.abs(r), 0)} đ`;
}

/** A ratio (0.0123) as signed percent `+1,23%`. */
export function formatRatio(value: Money, digits = 2): string {
  const n = toNumber(value);
  if (n === null) return '—';
  const pct = n * 100;
  const body = formatNumber(Math.abs(pct), digits);
  const zero = /^0(,0*)?$/.test(body);
  return `${pct > 0 && !zero ? '+' : pct < 0 && !zero ? '−' : ''}${body}%`;
}

/** A value already in percent units as signed percent. */
export function formatPercentSigned(value: Money, digits = 2): string {
  const n = toNumber(value);
  return n === null ? '—' : formatRatio(n / 100, digits);
}

export function toneOf(value: Money): 'priceUp' | 'priceDown' | 'foreground' {
  const n = toNumber(value);
  if (n === null || n === 0) return 'foreground';
  return n > 0 ? 'priceUp' : 'priceDown';
}
