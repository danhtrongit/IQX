import { todayVN } from '@/lib/format';
import { fmtVnd } from '../shared/format';
import type { BacktestRequest, Execution, FeePreset } from './types';

export const CAPITAL_MIN = 1_000_000;
export const CAPITAL_MAX = 1_000_000_000_000;
export const CAPITAL_DEFAULT = 100_000_000;
export const MAX_RANGE_DAYS = 3653;
export const DEFAULT_SYMBOL = 'FPT';

export const EXECUTION_OPTIONS: { value: Execution; label: string }[] = [
  { value: 'next_open', label: 'Mở cửa phiên kế tiếp' },
  { value: 'same_close', label: 'Đóng cửa cùng phiên' },
];
export const FEE_OPTIONS: { value: FeePreset; label: string }[] = [
  { value: 'standard', label: 'Phí chuẩn của hồ sơ mô phỏng' },
  { value: 'none', label: 'Không tính phí' },
];

export type FormValues = {
  symbol: string;
  start: string;
  end: string;
  capital: string;
  execution: Execution;
  fee: FeePreset;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Days between two YYYY-MM-DD dates (UTC, no timezone drift). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** Same calendar day `years` earlier (clamped for 29/02). */
export function subtractYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y - years, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

export function defaultForm(now: Date = new Date()): FormValues {
  const end = todayVN(now);
  return { symbol: DEFAULT_SYMBOL, start: subtractYears(end, 2), end, capital: formatCapital(CAPITAL_DEFAULT), execution: 'next_open', fee: 'standard' };
}

/** "100.000.000" / "100000000" -> number. */
export function parseCapital(text: string): number | null {
  const digits = text.replace(/[.\s,]/g, '');
  if (digits === '' || !/^\d+$/.test(digits)) return null;
  return Number(digits);
}

export function formatCapital(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export type FormErrors = Partial<Record<'symbol' | 'start' | 'end' | 'capital' | 'indicators', string>>;

export const NO_BUY_MESSAGE = 'Chưa có điều kiện Mua đang dùng. Thêm chỉ báo vào Mua từ thư viện rồi lưu.';

export function validateForm(v: FormValues, opts: { hasBuyCondition: boolean }): FormErrors {
  const errors: FormErrors = {};
  if (!v.symbol.trim()) errors.symbol = 'Chọn mã cổ phiếu.';
  if (!isValidDate(v.start)) errors.start = 'Nhập ngày theo dạng YYYY-MM-DD.';
  if (!isValidDate(v.end)) errors.end = 'Nhập ngày theo dạng YYYY-MM-DD.';
  if (!errors.start && !errors.end) {
    const days = daysBetween(v.start, v.end);
    if (days <= 0) errors.end = 'Đến ngày phải sau Từ ngày.';
    else if (days > MAX_RANGE_DAYS) errors.end = 'Khoảng backtest tối đa 10 năm.';
  }
  const capital = parseCapital(v.capital);
  if (capital === null || capital < CAPITAL_MIN || capital > CAPITAL_MAX) {
    errors.capital = `Vốn ban đầu từ ${fmtVnd(CAPITAL_MIN)} đến ${fmtVnd(CAPITAL_MAX)}.`;
  }
  if (!opts.hasBuyCondition) errors.indicators = NO_BUY_MESSAGE;
  return errors;
}

export function toRequest(v: FormValues): BacktestRequest {
  return {
    symbol: v.symbol.trim().toUpperCase(),
    start: v.start,
    end: v.end,
    assumptions: { capital: parseCapital(v.capital) ?? CAPITAL_DEFAULT, fee_preset: v.fee, execution: v.execution },
  };
}
