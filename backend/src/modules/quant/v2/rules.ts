import { isFiniteNumber } from './indicators.js';
import type {
  LogicNode,
  Operand,
  ResolvedValue,
  Rule,
  RuleEvaluationEvidence,
  SeriesMap,
  Tri,
} from './types.js';

/**
 * Three-valued rule evaluation, exact port of the reference engine
 * (`evaluateRule`, `and3`, `evalTree`). Missing data yields `null` (unknown),
 * comparisons are strict, and membership is an open interval whose complement
 * is only defined on valid inputs.
 */

function operandValue(
  x: Operand,
  s: SeriesMap,
  p: Record<string, number>,
  i: number,
): number | null {
  if (x.kind === 'series') {
    let offset = x.offset || 0;
    if (x.offset_param) {
      const paramOffset = p[x.offset_param];
      if (!isFiniteNumber(paramOffset) || paramOffset <= 0) return null;
      offset = -Math.round(paramOffset);
    }
    const j = i + offset;
    const series = s[x.key];
    return j >= 0 && series ? (series[j] ?? null) : null;
  }
  if (x.kind === 'param') return p[x.key] ?? null;
  if (x.kind === 'constant') return x.value;
  return null;
}

function finiteOrNull(value: number | null | undefined): ResolvedValue {
  return isFiniteNumber(value) ? value : null;
}

export function evaluateRule(
  rule: Rule,
  series: SeriesMap,
  params: Record<string, number>,
  i: number,
): Tri {
  const l = operandValue(rule.lhs, series, params, i);
  if (rule.kind === 'membership') {
    const lo = operandValue(rule.rhs.lower, series, params, i);
    const hi = operandValue(rule.rhs.upper, series, params, i);
    if (!isFiniteNumber(l) || !isFiniteNumber(lo) || !isFiniteNumber(hi) || lo > hi) return null;
    const inside = l > lo && l < hi;
    return rule.op === '∈' ? inside : rule.op === '∉' ? !inside : null;
  }
  if (rule.op === 'reenter_lower' || rule.op === 'reenter_upper') {
    const lo = series.lower?.[i] ?? null;
    const hi = series.upper?.[i] ?? null;
    const prevL = operandValue(rule.lhs, series, params, i - 1);
    const prevBound =
      rule.op === 'reenter_lower' ? (series.lower?.[i - 1] ?? null) : (series.upper?.[i - 1] ?? null);
    if (
      !isFiniteNumber(l) ||
      !isFiniteNumber(lo) ||
      !isFiniteNumber(hi) ||
      !isFiniteNumber(prevL) ||
      !isFiniteNumber(prevBound) ||
      lo > hi
    ) {
      return null;
    }
    const insideNow = l >= lo && l <= hi;
    const outsidePrev = rule.op === 'reenter_lower' ? prevL < prevBound : prevL > prevBound;
    return outsidePrev && insideNow;
  }
  if (
    rule.op === 'break_upper' ||
    rule.op === 'break_lower' ||
    rule.op === 'cross_up_middle' ||
    rule.op === 'cross_down_middle'
  ) {
    const targetKey =
      rule.op === 'break_upper'
        ? 'upper'
        : rule.op === 'break_lower'
          ? 'lower'
          : 'middle';
    const r = series[targetKey]?.[i] ?? null;
    const prevL = operandValue(rule.lhs, series, params, i - 1);
    const prevR = series[targetKey]?.[i - 1] ?? null;
    if (
      !isFiniteNumber(l) ||
      !isFiniteNumber(r) ||
      !isFiniteNumber(prevL) ||
      !isFiniteNumber(prevR)
    ) {
      return null;
    }
    const isUp = rule.op === 'break_upper' || rule.op === 'cross_up_middle';
    return isUp ? l > r && prevL <= prevR : l < r && prevL >= prevR;
  }
  if (rule.op === 'break_high' || rule.op === 'break_low') {
    const targetKey = rule.op === 'break_high' ? 'upper' : 'lower';
    const seriesVal = series[targetKey]?.[i];
    const r = isFiniteNumber(seriesVal) ? seriesVal : operandValue(rule.rhs, series, params, i);
    if (!isFiniteNumber(l) || !isFiniteNumber(r)) return null;
    return rule.op === 'break_high' ? l > r : l < r;
  }
  const r = operandValue(rule.rhs, series, params, i);
  if (!isFiniteNumber(l) || !isFiniteNumber(r)) return null;
  const isCrossOp = rule.op === 'cross_up' || rule.op === 'cross_down' || rule.kind === 'cross';
  const isUp = rule.op === '>' || rule.op === 'cross_up';
  const isDown = rule.op === '<' || rule.op === 'cross_down';
  const now = isUp ? l > r : isDown ? l < r : null;
  if (now === null) return null;
  if (isCrossOp) {
    // A cross needs both previous values even when today's comparison is false.
    const previousL = operandValue(rule.lhs, series, params, i - 1);
    const previousR = operandValue(rule.rhs, series, params, i - 1);
    if (!isFiniteNumber(previousL) || !isFiniteNumber(previousR)) return null;
    return now && (isUp ? previousL <= previousR : previousL >= previousR);
  }
  return now;
}

/** Evaluate a rule and retain the numeric operands used for the decision. */
export function evaluateRuleWithEvidence(
  rule: Rule,
  series: SeriesMap,
  params: Record<string, number>,
  i: number,
): RuleEvaluationEvidence {
  const lhs = finiteOrNull(operandValue(rule.lhs, series, params, i));
  const result = evaluateRule(rule, series, params, i);
  if (rule.kind === 'membership') {
    const lower = finiteOrNull(operandValue(rule.rhs.lower, series, params, i));
    const upper = finiteOrNull(operandValue(rule.rhs.upper, series, params, i));
    return {
      lhs,
      rhs: null,
      rhs_lower: lower,
      rhs_upper: upper,
      result,
      missing: lhs === null || lower === null || upper === null,
    };
  }
  if (rule.op === 'reenter_lower' || rule.op === 'reenter_upper') {
    const lower = finiteOrNull(series.lower?.[i]);
    const upper = finiteOrNull(series.upper?.[i]);
    const previousLhs = finiteOrNull(operandValue(rule.lhs, series, params, i - 1));
    const previousRhs = finiteOrNull(
      rule.op === 'reenter_lower' ? series.lower?.[i - 1] : series.upper?.[i - 1],
    );
    return {
      lhs,
      rhs: rule.op === 'reenter_lower' ? lower : upper,
      rhs_lower: lower,
      rhs_upper: upper,
      result,
      missing:
        lhs === null ||
        lower === null ||
        upper === null ||
        previousLhs === null ||
        previousRhs === null,
      previous_lhs: previousLhs,
      previous_rhs: previousRhs,
    };
  }
  if (
    rule.op === 'break_upper' ||
    rule.op === 'break_lower' ||
    rule.op === 'cross_up_middle' ||
    rule.op === 'cross_down_middle'
  ) {
    const targetKey =
      rule.op === 'break_upper'
        ? 'upper'
        : rule.op === 'break_lower'
          ? 'lower'
          : 'middle';
    const rhs = finiteOrNull(series[targetKey]?.[i]);
    const previousLhs = finiteOrNull(operandValue(rule.lhs, series, params, i - 1));
    const previousRhs = finiteOrNull(series[targetKey]?.[i - 1]);
    return {
      lhs,
      rhs,
      result,
      missing: lhs === null || rhs === null || previousLhs === null || previousRhs === null,
      previous_lhs: previousLhs,
      previous_rhs: previousRhs,
    };
  }
  if (rule.op === 'break_high' || rule.op === 'break_low') {
    const targetKey = rule.op === 'break_high' ? 'upper' : 'lower';
    const seriesVal = series[targetKey]?.[i];
    const rhs = finiteOrNull(
      isFiniteNumber(seriesVal) ? seriesVal : operandValue(rule.rhs, series, params, i),
    );
    return { lhs, rhs, result, missing: lhs === null || rhs === null };
  }
  const rhs = finiteOrNull(operandValue(rule.rhs, series, params, i));
  const isCrossOp = rule.op === 'cross_up' || rule.op === 'cross_down' || rule.kind === 'cross';
  if (!isCrossOp) {
    return { lhs, rhs, result, missing: lhs === null || rhs === null };
  }
  const previousLhs = finiteOrNull(operandValue(rule.lhs, series, params, i - 1));
  const previousRhs = finiteOrNull(operandValue(rule.rhs, series, params, i - 1));
  return {
    lhs,
    rhs,
    result,
    missing: lhs === null || rhs === null || previousLhs === null || previousRhs === null,
    previous_lhs: previousLhs,
    previous_rhs: previousRhs,
  };
}

/** Kleene AND: any false → false; otherwise any unknown → unknown; an empty list is true. */
export function and3(values: readonly Tri[]): Tri {
  if (values.includes(false)) return false;
  if (values.includes(null)) return null;
  return values.every((x) => x === true);
}

/**
 * Boolean tree evaluated by `evalTree`. Leaves are either reference-engine
 * rule ids (`{type:'rule', id}`) or Chapter 16 indicator leaves (`LogicNode`).
 */
export type TriTreeNode =
  | { type: 'rule'; id: string }
  | LogicNode
  | { type: 'and' | 'or'; children: TriTreeNode[] }
  | { type: 'not'; child: TriTreeNode };

/** Evaluate a tree with Kleene logic; `lookup` receives the rule id or indicator id of each leaf. */
export function evalTree(node: TriTreeNode, lookup: (id: string) => Tri): Tri {
  if (node.type === 'rule') return lookup(node.id);
  if (node.type === 'indicator') return lookup(node.indicator_id);
  if (node.type === 'not') {
    const v = evalTree(node.child, lookup);
    return v === null ? null : !v;
  }
  const values = node.children.map((child) => evalTree(child, lookup));
  if (!values.length) throw new Error('Nhóm điều kiện lồng nhau không được rỗng.');
  if (node.type === 'and') return and3(values);
  if (node.type === 'or')
    return values.includes(true) ? true : values.includes(null) ? null : false;
  throw new Error('Loại nhóm điều kiện không hợp lệ.');
}
