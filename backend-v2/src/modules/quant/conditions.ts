import {
  BINARY_INDICATORS,
  INDICATORS,
  buildFrame,
  type NumericFrame,
  type Ohlcv,
} from './indicators.js';

export const RAW_FIELDS = ['close', 'open', 'high', 'low', 'volume'] as const;
export const REFERENCEABLE = new Set<string>([...INDICATORS, ...RAW_FIELDS]);
export const COMPARATORS = new Set(['>', '<', '>=', '<=', '==']);
export const CROSS_OPS = new Set(['cross_above', 'cross_below']);
export const ALL_OPS = new Set([...COMPARATORS, ...CROSS_OPS, 'is_true']);
export type Logic = 'AND' | 'OR';
export type Condition = {
  indicator: string;
  op: string;
  value?: number | string | null;
  join?: Logic | null;
};
export type Combination = { logic: Logic; conditions: Condition[] };

export class CombinationError extends Error {}

export { buildFrame };

export function validateCondition(condition: Condition): void {
  if (!REFERENCEABLE.has(condition.indicator))
    throw new CombinationError(`Chỉ số không hợp lệ: '${condition.indicator}'`);
  if (!ALL_OPS.has(condition.op))
    throw new CombinationError(`Toán tử không hợp lệ: '${condition.op}'`);
  if (condition.join != null && condition.join !== 'AND' && condition.join !== 'OR')
    throw new CombinationError(`Liên kết phải là AND/OR, nhận '${String(condition.join)}'`);
  if (condition.op === 'is_true') {
    if (!BINARY_INDICATORS.has(condition.indicator as never))
      throw new CombinationError(
        `'is_true' chỉ dùng cho chỉ số nhị phân, không phải '${condition.indicator}'`,
      );
    return;
  }
  if (condition.value == null)
    throw new CombinationError(`Điều kiện ${condition.indicator} ${condition.op} thiếu ngưỡng`);
  if (typeof condition.value === 'string' && !REFERENCEABLE.has(condition.value))
    throw new CombinationError(`Trường so sánh không hợp lệ: '${condition.value}'`);
  if (CROSS_OPS.has(condition.op) && BINARY_INDICATORS.has(condition.indicator as never))
    throw new CombinationError(
      `Không thể dùng cross trên chỉ số nhị phân '${condition.indicator}'`,
    );
}

export function validateCombination(combination: Combination): void {
  if (combination.logic !== 'AND' && combination.logic !== 'OR')
    throw new CombinationError(`Logic phải là AND/OR, nhận '${String(combination.logic)}'`);
  if (combination.conditions.length === 0)
    throw new CombinationError('Tổ hợp phải có ít nhất 1 điều kiện');
  combination.conditions.forEach(validateCondition);
}

function rhs(
  frame: NumericFrame,
  value: number | string | null | undefined,
  length: number,
): Float64Array {
  if (typeof value === 'string') return frame[value]!;
  const out = new Float64Array(length);
  out.fill(value == null ? Number.NaN : value);
  return out;
}

export function evalConditionSeries(frame: NumericFrame, condition: Condition): Uint8Array {
  const lhs = frame[condition.indicator];
  if (!lhs) throw new CombinationError(`Chỉ số không hợp lệ: '${condition.indicator}'`);
  const output = new Uint8Array(lhs.length);
  if (condition.op === 'is_true') {
    for (let index = 0; index < lhs.length; index += 1)
      if (!Number.isNaN(lhs[index]!) && lhs[index] === 1) output[index] = 1;
    return output;
  }
  const right = rhs(frame, condition.value, lhs.length);
  for (let index = 0; index < lhs.length; index += 1) {
    const leftValue = lhs[index]!,
      rightValue = right[index]!;
    if (Number.isNaN(leftValue) || Number.isNaN(rightValue)) continue;
    if (condition.op === 'cross_above' || condition.op === 'cross_below') {
      if (index === 0) continue;
      const previousLeft = lhs[index - 1]!,
        previousRight = right[index - 1]!;
      if (Number.isNaN(previousLeft) || Number.isNaN(previousRight)) continue;
      output[index] =
        condition.op === 'cross_above'
          ? Number(leftValue > rightValue && previousLeft <= previousRight)
          : Number(leftValue < rightValue && previousLeft >= previousRight);
      continue;
    }
    switch (condition.op) {
      case '>':
        output[index] = Number(leftValue > rightValue);
        break;
      case '<':
        output[index] = Number(leftValue < rightValue);
        break;
      case '>=':
        output[index] = Number(leftValue >= rightValue);
        break;
      case '<=':
        output[index] = Number(leftValue <= rightValue);
        break;
      case '==':
        output[index] = Number(leftValue === rightValue);
        break;
      default:
        throw new CombinationError(`Toán tử không hợp lệ: '${condition.op}'`);
    }
  }
  return output;
}

export function evaluateSeries(frame: NumericFrame, combination: Combination): Uint8Array {
  const firstFrame = Object.values(frame)[0];
  if (combination.conditions.length === 0) return new Uint8Array(firstFrame?.length ?? 0);
  const groups: Uint8Array[][] = [[evalConditionSeries(frame, combination.conditions[0]!)]];
  for (const condition of combination.conditions.slice(1)) {
    const values = evalConditionSeries(frame, condition);
    if ((condition.join ?? combination.logic) === 'OR') groups.push([values]);
    else groups[groups.length - 1]!.push(values);
  }
  const output = new Uint8Array(firstFrame?.length ?? 0);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number(groups.some((group) => group.every((series) => series[index] === 1)));
  }
  return output;
}

export function evaluateLatest(frame: NumericFrame, combination: Combination): boolean {
  const values = evaluateSeries(frame, combination);
  return values.length > 0 && values[values.length - 1] === 1;
}

export function calculateFrame(data: Ohlcv): NumericFrame {
  return buildFrame(data);
}
