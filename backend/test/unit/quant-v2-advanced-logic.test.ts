import { describe, expect, it } from 'vitest';
import {
  evaluateLogic,
  logicIndicatorIds,
  logicSignals,
  validateLogicNode,
} from '../../src/modules/quant/v2/advanced/index.js';
import {
  LOGIC_MAX_CHILDREN,
  LOGIC_MAX_DEPTH,
  type LogicNode,
  type Tri,
} from '../../src/modules/quant/v2/index.js';

const leaf = (id: string): LogicNode => ({ type: 'indicator', indicator_id: id });
const and = (...children: LogicNode[]): LogicNode => ({ type: 'and', children });
const or = (...children: LogicNode[]): LogicNode => ({ type: 'or', children });
const not = (child: LogicNode): LogicNode => ({ type: 'not', child });
const lookupOf =
  (values: Record<string, Tri>) =>
  (id: string): Tri =>
    values[id] ?? null;

describe('quant v2 advanced — logic groups (Chapter 16)', () => {
  it('ch16-l03 fixture: A true, B false, C true → (A AND B) OR C is true (1)', () => {
    const tree = or(and(leaf('A'), leaf('B')), leaf('C'));
    expect(evaluateLogic(tree, lookupOf({ A: true, B: false, C: true }))).toBe(true);
  });

  it('keeps three-valued logic: NOT unknown is unknown, AND false wins, OR true wins', () => {
    const v = lookupOf({ T: true, F: false, U: null });
    expect(evaluateLogic(not(leaf('U')), v)).toBeNull();
    expect(evaluateLogic(not(leaf('F')), v)).toBe(true);
    expect(evaluateLogic(and(leaf('U'), leaf('F')), v)).toBe(false);
    expect(evaluateLogic(and(leaf('U'), leaf('T')), v)).toBeNull();
    expect(evaluateLogic(or(leaf('U'), leaf('T')), v)).toBe(true);
    expect(evaluateLogic(or(leaf('U'), leaf('F')), v)).toBeNull();
    expect(evaluateLogic(and(leaf('T'), leaf('T')), v)).toBe(true);
  });

  it('evaluates per bar; absent or short series are unknown, never false', () => {
    const tree = or(leaf('a'), not(leaf('b')));
    const out = logicSignals(tree, { a: [false, true, null, false], b: [true, false, false] }, 4);
    // bar0: F OR NOT T = F; bar1: T; bar2: U OR T = T; bar3: F OR NOT(missing) = U
    expect(out).toEqual([false, true, true, null]);
    expect(logicIndicatorIds(and(leaf('x'), or(leaf('y'), not(leaf('x')))))).toEqual(['x', 'y']);
  });

  it('accepts a tree at the depth/children limits', () => {
    // and → or → not → indicator = depth 4 = LOGIC_MAX_DEPTH.
    expect(LOGIC_MAX_DEPTH).toBe(4);
    expect(validateLogicNode(and(or(not(leaf('ma')))))).toEqual([]);
    const wide = and(...Array.from({ length: LOGIC_MAX_CHILDREN }, () => leaf('ma')));
    expect(validateLogicNode(wide)).toEqual([]);
  });

  it('rejects depth, width, empty groups, cycles, unknown keys and disallowed indicators', () => {
    expect(validateLogicNode(and(or(not(not(leaf('ma'))))))[0]?.message).toMatch(/độ sâu tối đa 4/);
    const tooWide = and(...Array.from({ length: LOGIC_MAX_CHILDREN + 1 }, () => leaf('ma')));
    expect(validateLogicNode(tooWide)[0]?.message).toMatch(/tối đa 16/);
    expect(validateLogicNode({ type: 'or', children: [] })[0]?.message).toMatch(/không được rỗng/);
    const cyclic: { type: 'not'; child: unknown } = { type: 'not', child: null };
    cyclic.child = cyclic;
    expect(validateLogicNode(cyclic).length).toBeGreaterThan(0);
    const shared = { type: 'and', children: [] as unknown[] };
    shared.children.push(shared);
    expect(validateLogicNode(shared).some((e) => /vòng|độ sâu/.test(e.message))).toBe(true);
    expect(validateLogicNode({ type: 'indicator', indicator_id: 'ma', code: 'x' })[0]?.path).toBe(
      'logic.code',
    );
    expect(validateLogicNode({ type: 'xor', children: [] })[0]?.path).toBe('logic.type');
    expect(validateLogicNode('ma')[0]?.message).toMatch(/không hợp lệ/);
    expect(validateLogicNode(or(leaf('ma'), leaf('rsi')), ['ma'])).toEqual([
      {
        path: 'logic.children.1.indicator_id',
        message: 'Chỉ báo không được dùng trong biểu thức: rsi.',
      },
    ]);
    expect(validateLogicNode(leaf('rsi'), new Set(['rsi']))).toEqual([]);
  });
});
