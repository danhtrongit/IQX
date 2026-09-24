import type { Cap8ExitSnapshot, DailyClose } from './cap8.types.js';

export interface ExitClassification {
  remainingPositionPct: number;
  exitMethod: string;
  effectiveStopVnd: number | null;
  compliant: boolean;
  emotional: boolean;
  reason: string;
}

function day(value: Date | string): string {
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

export function timelyStop(
  history: readonly DailyClose[],
  stop: number,
  sellDay: string,
  after?: string,
): { timely: boolean; reason: string } {
  const sessions = history.filter((row) => !after || row.day >= after);
  const crossing = sessions.findIndex((row) => row.close <= stop);
  if (crossing < 0) return { timely: false, reason: 'stop_crossing_not_verified' };
  const crossedAt = sessions[crossing]!.day;
  const deadline = sessions[Math.min(crossing + 1, sessions.length - 1)]!.day;
  if (sellDay > deadline) return { timely: false, reason: 'late_stop_exit' };
  if (sellDay < crossedAt) return { timely: false, reason: 'stop_before_verified_crossing' };
  return { timely: true, reason: 'timely_stop_exit' };
}

/** Classify only from immutable SELL-fill snapshots and independently verified closes. */
export function classifyCap8Exit(
  sell: Cap8ExitSnapshot,
  history: readonly DailyClose[] | null,
): ExitClassification {
  const base: ExitClassification = {
    remainingPositionPct: 0,
    exitMethod: 'unknown',
    effectiveStopVnd: null,
    compliant: false,
    emotional: false,
    reason: 'missing_execution_snapshot',
  };
  if (sell.snapshotAt === null || sell.beforeQuantity === null || sell.afterQuantity === null)
    return base;
  if (
    sell.beforeQuantity <= 0 ||
    sell.afterQuantity < 0 ||
    sell.afterQuantity > sell.beforeQuantity
  ) {
    return { ...base, reason: 'invalid_execution_snapshot' };
  }
  const full = sell.afterQuantity === 0;
  const result: ExitClassification = {
    ...base,
    remainingPositionPct: (sell.afterQuantity / sell.beforeQuantity) * 100,
    exitMethod: full ? 'full' : 'partial',
    effectiveStopVnd: sell.dynamicStopVnd ?? sell.originalStopVnd,
    reason: 'missing_active_plan',
  };
  if (
    sell.matchedBuyOrderId === null ||
    sell.takeProfitVnd === null ||
    sell.originalStopVnd === null ||
    sell.avgCostVnd === null
  ) {
    return result;
  }
  if (sell.filledPriceVnd >= sell.takeProfitVnd) {
    return { ...result, compliant: true, reason: 'take_profit_hit' };
  }
  const sellDay = day(sell.snapshotAt);
  if (sell.dynamicStopVnd !== null && sell.filledPriceVnd <= sell.dynamicStopVnd) {
    if (sell.dynamicStopSetAt === null)
      return { ...result, reason: 'missing_dynamic_stop_timestamp' };
    if (sell.dynamicStopVnd <= sell.avgCostVnd)
      return { ...result, reason: 'dynamic_stop_does_not_lock_profit' };
    if (!history) return { ...result, reason: 'unknown_price_history' };
    const stop = timelyStop(history, sell.dynamicStopVnd, sellDay, day(sell.dynamicStopSetAt));
    return stop.timely
      ? {
          ...result,
          compliant: true,
          exitMethod: 'trailing_hit',
          reason: 'timely_trailing_stop_exit',
        }
      : { ...result, reason: stop.reason };
  }
  if (sell.filledPriceVnd <= sell.originalStopVnd) {
    if (sell.planActivatedAt === null)
      return { ...result, reason: 'missing_plan_activation_timestamp' };
    if (!history) return { ...result, reason: 'unknown_price_history' };
    const stop = timelyStop(history, sell.originalStopVnd, sellDay, day(sell.planActivatedAt));
    return stop.timely
      ? { ...result, compliant: true, reason: 'timely_original_stop_exit' }
      : { ...result, reason: stop.reason };
  }
  if (full && sell.filledPriceVnd > sell.avgCostVnd) {
    return { ...result, emotional: true, reason: 'emotional_full_exit_below_target' };
  }
  return { ...result, reason: 'price_did_not_hit_plan_threshold' };
}
