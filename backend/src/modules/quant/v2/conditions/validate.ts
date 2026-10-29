import { isFiniteNumber } from '../indicators.js';
import type {
  EngineValidationError,
  RowDefinition,
  RowField,
  RowNumberField,
  RowsRegistryEntry,
  Side,
} from '../types.js';

/**
 * Save-time validation of one tab of a row-based indicator (SPEC V3 §4; messages of the
 * sample HTML). Both tabs are validated, disabled rows and a disabled tab included. Nothing is
 * repaired. Unknown keys, unknown enum codes, wrong row ids/count and the old side-level
 * format (`params`) are rejected.
 */

export const SIDE_LABEL: Readonly<Record<Side, string>> = Object.freeze({
  buy: 'Mua',
  sell: 'Bán',
});
/** Step tolerance of the reference engine (`|(v-min)/step - round| ≤ 1e-6`). */
const STEP_TOLERANCE = 1e-6;
const SIDE_KEYS = new Set(['enabled', 'rules']);
const ROW_FIXED_KEYS = new Set(['id', 'enabled']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** `Mua · dòng 2` */
export const rowPrefix = (side: Side, row: number): string => `${SIDE_LABEL[side]} · dòng ${row}`;

/** `Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.` */
export const rangeMessage = (side: Side, row: number, field: RowNumberField): string =>
  `${rowPrefix(side, row)}: ${field.label} phải từ ${field.min} đến ${field.max}${
    field.type === 'integer' ? ', số nguyên' : ''
  }.`;

/** `Mua · dòng 1: Chu kỳ SMA chỉ chọn 5, 10, 20, 50, 100, 200.` */
export const optionsMessage = (
  side: Side,
  row: number,
  label: string,
  options: readonly number[],
): string => `${rowPrefix(side, row)}: ${label} chỉ chọn ${options.join(', ')}.`;

/** `Mua · dòng 1: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.` */
export const fastSlowMessage = (side: Side, row: number): string =>
  `${rowPrefix(side, row)}: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.`;

function validateField(
  field: RowField,
  value: unknown,
  side: Side,
  row: number,
  path: string,
): EngineValidationError | null {
  const error = (message: string): EngineValidationError => ({ path, message, side, row });
  if (field.type === 'enum') {
    return typeof value === 'string' && field.options.some((o) => o.value === value)
      ? null
      : error(`${rowPrefix(side, row)}: ${field.label} không hợp lệ.`);
  }
  if (field.options) {
    return isFiniteNumber(value) && field.options.includes(value)
      ? null
      : error(optionsMessage(side, row, field.label, field.options));
  }
  if (
    !isFiniteNumber(value) ||
    value < field.min ||
    value > field.max ||
    (field.type === 'integer' && !Number.isInteger(value))
  ) {
    return error(rangeMessage(side, row, field));
  }
  const steps = (value - field.min) / field.step;
  if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE) {
    return error(`${rowPrefix(side, row)}: ${field.label} phải theo bước ${field.step}.`);
  }
  return null;
}

/** Validate one stored row against its definition (fields in sentence order, then constraints). */
export function validateRow(
  definition: RowDefinition,
  value: unknown,
  side: Side,
  row: number,
  path: string,
): EngineValidationError[] {
  const prefix = rowPrefix(side, row);
  if (!isRecord(value)) return [{ path, message: `${prefix}: điều kiện không hợp lệ.`, side, row }];
  if (value.id !== definition.id) {
    return [{ path: `${path}.id`, message: `${prefix}: mã điều kiện không hợp lệ.`, side, row }];
  }
  const errors: EngineValidationError[] = [];
  if (typeof value.enabled !== 'boolean') {
    errors.push({
      path: `${path}.enabled`,
      message: `${prefix}: trạng thái điều kiện không hợp lệ.`,
      side,
      row,
    });
  }
  for (const key of Object.keys(value)) {
    if (!ROW_FIXED_KEYS.has(key) && !definition.fields.some((f) => f.key === key)) {
      errors.push({
        path: `${path}.${key}`,
        message: `${prefix}: trường không hợp lệ ${key}.`,
        side,
        row,
      });
    }
  }
  for (const field of definition.fields) {
    const error = validateField(field, value[field.key], side, row, `${path}.${field.key}`);
    if (error) errors.push(error);
  }
  for (const constraint of definition.constraints) {
    const left = value[constraint.left];
    const right = value[constraint.right];
    if (!isFiniteNumber(left) || !isFiniteNumber(right) || left < right) continue;
    errors.push({
      path: `${path}.${constraint.left}`,
      message: fastSlowMessage(side, row),
      side,
      row,
    });
  }
  return errors;
}

/**
 * Validate one tab `{ enabled, rules }` of a row-based indicator. Paths are
 * `${basePath}.rules.<index>.<field>` (0-based index; messages use the 1-based row number).
 * Returns [] when valid.
 */
export function validateSideRows(
  entry: RowsRegistryEntry,
  side: Side,
  value: unknown,
  basePath = `indicators.${entry.id}.${side}`,
): EngineValidationError[] {
  const label = SIDE_LABEL[side];
  if (!isRecord(value) || typeof value.enabled !== 'boolean') {
    return [{ path: basePath, message: `${entry.name}: thiếu cấu hình ${label}.`, side }];
  }
  const errors: EngineValidationError[] = [];
  for (const key of Object.keys(value)) {
    if (!SIDE_KEYS.has(key)) {
      errors.push({
        path: `${basePath}.${key}`,
        message: `${entry.name} ${label}: trường không hợp lệ ${key}.`,
        side,
      });
    }
  }
  const rules = value.rules;
  const rulesPath = `${basePath}.rules`;
  if (!Array.isArray(rules) || rules.length !== entry.rows.length) {
    errors.push({
      path: rulesPath,
      message: `${entry.name} ${label}: sai số dòng điều kiện.`,
      side,
    });
    return errors;
  }
  entry.rows.forEach((definition, index) => {
    errors.push(...validateRow(definition, rules[index], side, index + 1, `${rulesPath}.${index}`));
  });
  return errors;
}
