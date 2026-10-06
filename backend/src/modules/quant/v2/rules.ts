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
    const j = i + (x.offset || 0);
    const series = s[x.key];
    return j >= 0 && series ? (series[j] ?? null) : null;
  }
  if (x.kind === 'param') return p[x.key] ?? null;
  if (x.kind === 'constant') return x.value;
  return null;
}

function finiteOrNull(value: number | null): ResolvedValue {
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
  const r = operandValue(rule.rhs, series, params, i);
  if (!isFiniteNumber(l) || !isFiniteNumber(r)) return null;
  const now = rule.op === '>' ? l > r : rule.op === '<' ? l < r : null;
  if (now === null) return null;
  if (rule.kind === 'cross') {
    // A cross needs both previous values even when today's comparison is false.
    const previousL = operandValue(rule.lhs, series, params, i - 1);
    const previousR = operandValue(rule.rhs, series, params, i - 1);
    if (!isFiniteNumber(previousL) || !isFiniteNumber(previousR)) return null;
    return now && (rule.op === '>' ? previousL <= previousR : previousL >= previousR);
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
  const rhs = finiteOrNull(operandValue(rule.rhs, series, params, i));
  if (rule.kind !== 'cross') {
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
