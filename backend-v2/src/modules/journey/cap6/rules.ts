import type { OrderPlanRow } from '../cap5/cap5.types.js';
import { CONFLICT_LEVELS, type Cap6SkipRow, type ConflictLevel } from './cap6.types.js';

export const CONSISTENCY_TARGET = 3;
export const SMALL_POSITION_MAX_PCT = 10;
export const MIN_CLOSED_ORDERS_FOR_RATE = 3;

export function isConsistentOrder(
  plan: Pick<OrderPlanRow, 'had_conflict' | 'conflict_level' | 'pct_von'>,
): boolean | null {
  if (plan.had_conflict !== true) return null;
  if (plan.conflict_level === 'nhe') return true;
  if (plan.conflict_level !== 'nghiem') return null;
  if (plan.pct_von === null) return null;
  return Number(plan.pct_von) <= SMALL_POSITION_MAX_PCT;
}

export function isConsistentSkip(
  skip: Pick<Cap6SkipRow, 'had_conflict' | 'conflict_level'>,
): boolean {
  return skip.had_conflict === true && CONFLICT_LEVELS.includes(skip.conflict_level);
}

function vietnamDay(value: Date | string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function countConsistent(
  plans: ReadonlyArray<
    Pick<OrderPlanRow, 'had_conflict' | 'conflict_level' | 'pct_von' | 'had_veto'>
  >,
  skips: ReadonlyArray<
    Pick<Cap6SkipRow, 'symbol' | 'at' | 'had_conflict' | 'had_veto' | 'conflict_level'>
  >,
): { consistent: number; vetoConsistent: number } {
  let consistent = 0;
  let vetoConsistent = 0;
  for (const plan of plans) {
    if (isConsistentOrder(plan) !== true) continue;
    consistent += 1;
    if (plan.had_veto === true) vetoConsistent += 1;
  }
  const seen = new Set<string>();
  for (const skip of skips) {
    if (!isConsistentSkip(skip)) continue;
    const key = `${skip.symbol.toUpperCase()}:${vietnamDay(skip.at)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    consistent += 1;
    if (skip.had_veto === true) vetoConsistent += 1;
  }
  return { consistent, vetoConsistent };
}

export function averagePositionRows(
  plans: ReadonlyArray<Pick<OrderPlanRow, 'had_conflict' | 'conflict_level' | 'pct_von'>>,
) {
  const levels: ConflictLevel[] = ['nhe', 'ngai', 'nghiem', 'chua_ro'];
  const values = new Map<ConflictLevel, number[]>(levels.map((level) => [level, []]));
  for (const plan of plans) {
    if (plan.had_conflict !== true || plan.pct_von === null) continue;
    if (!CONFLICT_LEVELS.includes(plan.conflict_level as ConflictLevel)) continue;
    values.get(plan.conflict_level as ConflictLevel)?.push(Number(plan.pct_von));
  }
  const averages = new Map<ConflictLevel, number | null>();
  for (const level of levels) {
    const list = values.get(level) ?? [];
    averages.set(
      level,
      list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null,
    );
  }
  return levels.map((level) => {
    const avg = averages.get(level) ?? null;
    let matches: boolean | null = null;
    if (level !== 'chua_ro' && avg !== null) {
      const index = levels.indexOf(level);
      const lighter = levels
        .slice(0, index)
        .map((item) => averages.get(item))
        .filter((item): item is number => item !== null && item !== undefined);
      if (lighter.length) matches = lighter.every((item) => avg <= item);
    }
    return { level, count: values.get(level)?.length ?? 0, average: avg, matches };
  });
}
