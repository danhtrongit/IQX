/**
 * Metadata và kiểm tra tham số chỉ báo của Flashback.
 *
 * Nguồn duy nhất là registry kỹ thuật của Bot (`technical-registry.json`) để Flashback và Bot
 * dùng cùng tên tham số, cùng miền giá trị, cùng bước nhảy và cùng quy tắc kiểm tra chéo
 * (spec Flashback v1.1 §2.7). Không có registry riêng cho Flashback.
 */

import { loadTechnicalRegistry } from '../quant/v2/technical-registry.js';
import type { RegistryEntry, RegistryField } from '../quant/v2/types.js';

/** Giá trị một tham số: số đơn hoặc cặp ngưỡng dưới/trên (chỉ báo có hai ngưỡng). */
export type FlashbackIndicatorParamValue = number | { lower: number; upper: number };

/** Bộ tham số của một chỉ báo, theo đúng key của registry. */
export type FlashbackIndicatorParams = Record<string, FlashbackIndicatorParamValue>;

/** Một chỉ báo được chọn trong lượt chơi. */
export interface FlashbackIndicatorInstanceInput {
  readonly id: string;
  readonly params: FlashbackIndicatorParams;
}

/** Một phía của tham số (ngưỡng dưới theo phía Mua, ngưỡng trên theo phía Bán của Bot). */
export interface FlashbackParamSide {
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly label: string;
}

/** Metadata một tham số gửi cho trình duyệt. */
export interface FlashbackIndicatorParamMeta {
  readonly key: string;
  readonly label: string;
  readonly type: 'integer' | 'number';
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  /** Mặc định lấy từ phía Mua của registry. */
  readonly default: number;
  /** Ngưỡng dưới khi phía Mua và phía Bán khác nhau (ví dụ RSI). */
  readonly lower: FlashbackParamSide | null;
  /** Ngưỡng trên khi phía Mua và phía Bán khác nhau (ví dụ RSI). */
  readonly upper: FlashbackParamSide | null;
}

/** Metadata một chỉ báo gửi cho trình duyệt. */
export interface FlashbackIndicatorMeta {
  readonly id: string;
  readonly name: string;
  readonly chapter: number;
  readonly lesson_id: string | null;
  readonly params: readonly FlashbackIndicatorParamMeta[];
  readonly cross_fields: readonly { left: string; op: '>' | '<'; right: string }[];
  /** Số phiên lịch sử cần thêm để khởi tạo chỉ báo với tham số mặc định. */
  readonly warmup_sessions: number;
}

/**
 * Các field là "cửa sổ nhìn lại" (số phiên cần dữ liệu quá khứ). Field loại `number` là ngưỡng
 * (RSI 30, CCI -100) nên không tính vào số phiên khởi tạo.
 */
const WINDOW_FIELD_KEYS: Record<string, true> = {
  period: true,
  lookback: true,
  baseline: true,
  fast: true,
  slow: true,
  signal: true,
  smooth: true,
  k: true,
  d: true,
};

/** Sai số cho phép khi kiểm tra giá trị nằm đúng bước nhảy. */
const STEP_TOLERANCE = 1e-6;

function isWindowField(field: RegistryField): boolean {
  return field.type === 'integer' && WINDOW_FIELD_KEYS[field.key] === true;
}

function sideOf(entry: RegistryEntry, side: 'buy' | 'sell', field: RegistryField): FlashbackParamSide {
  const override = entry[side].field_overrides?.[field.key];
  return {
    min: override?.min ?? field.min,
    max: override?.max ?? field.max,
    default: entry[side].params[field.key] ?? field.min,
    label: override?.label ?? field.label,
  };
}

function buildCatalog(): FlashbackIndicatorMeta[] {
  return loadTechnicalRegistry()
    .filter((entry) => entry.availability === 'ohlcv')
    .map((entry) => {
      const params = entry.fields.map((field) => {
        const lower = sideOf(entry, 'buy', field);
        const upper = sideOf(entry, 'sell', field);
        const differs =
          lower.min !== upper.min || lower.max !== upper.max || lower.default !== upper.default;
        return {
          key: field.key,
          label: field.label,
          type: field.type,
          min: field.min,
          max: field.max,
          step: field.step,
          unit: field.unit,
          default: lower.default,
          lower: differs ? lower : null,
          upper: differs ? upper : null,
        };
      });
      const warmup = params.reduce((max, param) => {
        const field = entry.fields.find((item) => item.key === param.key);
        if (!field || !isWindowField(field)) return max;
        return Math.max(max, param.default);
      }, 0);
      return {
        id: entry.id,
        name: entry.name,
        chapter: entry.chapter,
        lesson_id: entry.lesson_id,
        params,
        cross_fields: (entry.validation?.cross_fields ?? []).map((rule) => ({
          left: rule.left,
          op: rule.op,
          right: rule.right,
        })),
        warmup_sessions: warmup,
      };
    });
}

let catalog: readonly FlashbackIndicatorMeta[] | undefined;

/** Toàn bộ chỉ báo lấy được từ registry (chưa lọc theo quyền của người dùng). */
export function flashbackIndicatorCatalog(): readonly FlashbackIndicatorMeta[] {
  catalog ??= buildCatalog();
  return catalog;
}

/** Metadata của một chỉ báo theo id. */
export function flashbackIndicatorMeta(id: string): FlashbackIndicatorMeta | undefined {
  return flashbackIndicatorCatalog().find((item) => item.id === id);
}

/** Số phiên lịch sử cần thêm cho một bộ tham số đã chọn. */
export function flashbackWarmupRequired(
  instances: readonly FlashbackIndicatorInstanceInput[],
): number {
  let required = 0;
  for (const instance of instances) {
    const meta = flashbackIndicatorMeta(instance.id);
    if (!meta) continue;
    for (const param of meta.params) {
      const value = instance.params[param.key];
      if (value === undefined) continue;
      const numeric = typeof value === 'number' ? value : Math.max(value.lower, value.upper);
      required = Math.max(required, numeric);
    }
  }
  return required;
}

function effectiveNumber(value: FlashbackIndicatorParamValue): number {
  return typeof value === 'number' ? value : value.lower;
}

function checkValue(
  meta: FlashbackIndicatorMeta,
  param: FlashbackIndicatorParamMeta,
  value: FlashbackIndicatorParamValue,
): string | null {
  const check = (raw: number, min: number, max: number): string | null => {
    if (!Number.isFinite(raw)) return `${param.label} không phải số hợp lệ.`;
    if (raw < min || raw > max)
      return `${param.label} phải nằm trong khoảng ${min} - ${max} (đang là ${raw}).`;
    if (param.type === 'integer' && !Number.isInteger(raw))
      return `${param.label} phải là số nguyên.`;
    const steps = (raw - param.min) / param.step;
    if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE)
      return `${param.label} phải là bội của ${param.step} (đang là ${raw}).`;
    return null;
  };
  if (typeof value === 'number') return check(value, param.min, param.max);
  const lowerMin = param.lower?.min ?? param.min;
  const lowerMax = param.lower?.max ?? param.max;
  const upperMin = param.upper?.min ?? param.min;
  const upperMax = param.upper?.max ?? param.max;
  const lowerError = check(value.lower, lowerMin, lowerMax);
  if (lowerError) return lowerError;
  const upperError = check(value.upper, upperMin, upperMax);
  if (upperError) return upperError;
  return null;
}

/**
 * Kiểm tra một bộ tham số theo registry: key phải có trong registry, giá trị phải nằm đúng
 * miền và đúng bước nhảy, và phải thoả các quy tắc kiểm tra chéo (ví dụ MACD fast < slow).
 * Trả về thông báo lỗi tiếng Việt hoặc `null` khi hợp lệ.
 */
export function validateFlashbackIndicatorParams(
  meta: FlashbackIndicatorMeta,
  params: FlashbackIndicatorParams,
): string | null {
  for (const [key, value] of Object.entries(params)) {
    const param = meta.params.find((item) => item.key === key);
    if (!param) return `${meta.name}: không có tham số "${key}".`;
    const error = checkValue(meta, param, value);
    if (error) return `${meta.name}: ${error}`;
  }
  for (const rule of meta.cross_fields) {
    const left = params[rule.left];
    const right = params[rule.right];
    if (left === undefined || right === undefined) continue;
    const leftValue = effectiveNumber(left);
    const rightValue = effectiveNumber(right);
    const ok = rule.op === '<' ? leftValue < rightValue : leftValue > rightValue;
    if (!ok) {
      const leftLabel = meta.params.find((item) => item.key === rule.left)?.label ?? rule.left;
      const rightLabel = meta.params.find((item) => item.key === rule.right)?.label ?? rule.right;
      return `${meta.name}: ${leftLabel} phải ${rule.op === '<' ? 'nhỏ hơn' : 'lớn hơn'} ${rightLabel}.`;
    }
  }
  return null;
}
