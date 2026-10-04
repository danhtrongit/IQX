import { evalTree } from '../rules.js';
import {
  LOGIC_MAX_CHILDREN,
  LOGIC_MAX_DEPTH,
  type EngineValidationError,
  type LogicNode,
  type Tri,
} from '../types.js';

/**
 * Chapter 16 logic groups: a typed, bounded boolean tree over indicator sides
 * (ADVANCED-CAPABILITIES §6). Evaluation is three-valued (Kleene): NOT unknown
 * stays unknown, AND with a false is false, OR with a true is true. The server
 * only accepts this typed shape — never client code or expression strings.
 *
 * Depth counts nodes on the path from the root: the root is depth 1, so
 * `and → or → not → indicator` is depth 4 (= LOGIC_MAX_DEPTH).
 */

const NODE_KEYS: Record<LogicNode['type'], readonly string[]> = {
  indicator: ['type', 'indicator_id'],
  and: ['type', 'children'],
  or: ['type', 'children'],
  not: ['type', 'child'],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function allows(allowed: ReadonlySet<string> | readonly string[], id: string): boolean {
  return Array.isArray(allowed) ? allowed.includes(id) : (allowed as ReadonlySet<string>).has(id);
}

/**
 * Validate an untrusted logic tree. With `allowedIndicatorIds`, every leaf must
 * reference one of them (e.g. the active buy-side indicators). Returns [] when valid.
 */
export function validateLogicNode(
  node: unknown,
  allowedIndicatorIds?: ReadonlySet<string> | readonly string[],
  rootPath = 'logic',
): EngineValidationError[] {
  const errors: EngineValidationError[] = [];
  const ancestors = new Set<object>();

  const visit = (value: unknown, depth: number, path: string): void => {
    if (depth > LOGIC_MAX_DEPTH) {
      errors.push({ path, message: `Biểu thức vượt độ sâu tối đa ${LOGIC_MAX_DEPTH}.` });
      return;
    }
    if (!isRecord(value)) {
      errors.push({ path, message: 'Nút biểu thức không hợp lệ.' });
      return;
    }
    if (ancestors.has(value)) {
      errors.push({ path, message: 'Biểu thức có cấu trúc vòng.' });
      return;
    }
    const type = value.type;
    if (type !== 'indicator' && type !== 'and' && type !== 'or' && type !== 'not') {
      errors.push({ path: `${path}.type`, message: 'Loại nút biểu thức không hợp lệ.' });
      return;
    }
    for (const key of Object.keys(value)) {
      if (!NODE_KEYS[type].includes(key))
        errors.push({
          path: `${path}.${key}`,
          message: `Trường không hợp lệ trong biểu thức: ${key}.`,
        });
    }
    if (type === 'indicator') {
      const id = value.indicator_id;
      if (typeof id !== 'string' || id === '') {
        errors.push({ path: `${path}.indicator_id`, message: 'Thiếu mã chỉ báo trong biểu thức.' });
      } else if (allowedIndicatorIds !== undefined && !allows(allowedIndicatorIds, id)) {
        errors.push({
          path: `${path}.indicator_id`,
          message: `Chỉ báo không được dùng trong biểu thức: ${id}.`,
        });
      }
      return;
    }
    ancestors.add(value);
    if (type === 'not') {
      visit(value.child, depth + 1, `${path}.child`);
    } else {
      const children = value.children;
      if (!Array.isArray(children) || children.length === 0) {
        errors.push({ path: `${path}.children`, message: 'Nhóm điều kiện không được rỗng.' });
      } else if (children.length > LOGIC_MAX_CHILDREN) {
        errors.push({
          path: `${path}.children`,
          message: `Nhóm điều kiện tối đa ${LOGIC_MAX_CHILDREN} phần tử.`,
        });
      } else {
        children.forEach((child: unknown, i) => visit(child, depth + 1, `${path}.children.${i}`));
      }
    }
    ancestors.delete(value);
  };

  visit(node, 1, rootPath);
  return errors;
}

/** Indicator ids referenced by the tree, unique, in first-appearance order. */
export function logicIndicatorIds(node: LogicNode): string[] {
  const out: string[] = [];
  const walk = (n: LogicNode): void => {
    if (n.type === 'indicator') {
      if (!out.includes(n.indicator_id)) out.push(n.indicator_id);
    } else if (n.type === 'not') walk(n.child);
    else n.children.forEach(walk);
  };
  walk(node);
  return out;
}

/** Three-valued evaluation of a validated tree; `lookup` returns the leaf indicator's signal. */
export function evaluateLogic(node: LogicNode, lookup: (indicatorId: string) => Tri): Tri {
  return evalTree(node, lookup);
}

/**
 * Per-bar evaluation over aligned per-indicator signals; a leaf whose series is
 * absent or shorter than `length` is unknown (null), never false.
 */
export function logicSignals(
  node: LogicNode,
  signalsByIndicator: Readonly<Record<string, readonly Tri[]>>,
  length: number,
): Tri[] {
  return Array.from({ length }, (_, i) =>
    evaluateLogic(node, (id) => signalsByIndicator[id]?.[i] ?? null),
  );
}
