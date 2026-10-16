import { formatNumber, formatVnd } from '@/lib/format';

export const DASH = '—';

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** `100.000.000 đ` (web strategy/shared/format.ts fmtVnd). */
export function fmtVnd(value: number | null | undefined): string {
  return isNum(value) ? `${formatVnd(value)} đ` : DASH;
}

/** `+1.234 đ` / `−1.234 đ` with a true minus sign. */
export function fmtSignedVnd(value: number | null | undefined): string {
  if (!isNum(value)) return DASH;
  const r = Math.round(value);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${formatVnd(Math.abs(r))} đ`;
}

/** Plain percent (already in percent units): `12,3%`. */
export function fmtPercent(value: number | null | undefined, digits = 1): string {
  return isNum(value) ? `${formatNumber(value, digits)}%` : DASH;
}

/** Signed percent: `+1,23%` / `−1,23%`. */
export function fmtSignedPercent(value: number | null | undefined, digits = 2): string {
  if (!isNum(value)) return DASH;
  const body = formatNumber(Math.abs(value), digits);
  const zero = /^0(,0*)?$/.test(body);
  return `${value > 0 && !zero ? '+' : value < 0 && !zero ? '−' : ''}${body}%`;
}

export function fmtInt(value: number | null | undefined): string {
  return isNum(value) ? formatNumber(Math.round(value), 0) : DASH;
}

/** Sign of a number as a theme color key for P&L text. */
export function toneKey(value: number | null | undefined): 'priceUp' | 'priceDown' | 'foreground' {
  if (!isNum(value) || value === 0) return 'foreground';
  return value > 0 ? 'priceUp' : 'priceDown';
}
