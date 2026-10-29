import {
  evaluateIndicatorSide,
  evaluateIndicatorSideSeries,
  type IndicatorSideEvaluation,
} from './conditions/evaluate.js';
import { createSeriesCache } from './conditions/series-cache.js';
import { and3 } from './rules.js';
import { loadTechnicalRegistry } from './technical-registry.js';
import type {
  Bar,
  IndicatorSideSummary,
  RegistryEntry,
  SharedConfig,
  Side,
  SideConfig,
  SideSignalsEvidence,
  TracedRuleEvaluation,
  Tri,
} from './types.js';

/**
 * Per-bar signals of one indicator side through the shared evaluator (`evaluateIndicatorSide`):
 * the Kleene AND of its enabled rows, each row with its own params. A side without an enabled
 * row (`no_signal`) is all false, as before V3.
 */
export function indicatorSideSignals(
  indicatorId: string,
  sideConfig: SideConfig,
  bars: readonly Bar[],
): Tri[] {
  return evaluateIndicatorSideSeries(indicatorId, { ...sideConfig, enabled: true }, bars).map(
    (evaluation) => (evaluation.status === 'no_signal' ? false : evaluation.result),
  );
}

function activeSides(
  config: SharedConfig,
  side: Side,
  registry: readonly RegistryEntry[],
): Array<{ id: string; sideConfig: SideConfig }> {
  const active: Array<{ id: string; sideConfig: SideConfig }> = [];
  for (const entry of registry) {
    const item = config.indicators[entry.id];
    if (item?.master_enabled && item[side].enabled)
      active.push({ id: entry.id, sideConfig: item[side] });
  }
  return active;
}

/**
 * Consensus signal of one side: AND across every indicator whose master and
 * side switches are ON. No active indicator → all false (never unknown); an active
 * indicator without an enabled row makes the side false (multi-indicator combination unchanged).
 */
export function sideSignals(
  config: SharedConfig,
  bars: readonly Bar[],
  side: Side,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): Tri[] {
  const active = activeSides(config, side, registry);
  if (!active.length) return bars.map(() => false);
  const cache = createSeriesCache(bars);
  const outputs = active.map(({ id, sideConfig }) =>
    evaluateIndicatorSideSeries(id, sideConfig, cache).map((evaluation) =>
      evaluation.status === 'no_signal' ? false : evaluation.result,
    ),
  );
  return bars.map((_, i) => and3(outputs.map((signals) => signals[i] ?? null)));
}

const summary = (evaluation: IndicatorSideEvaluation): IndicatorSideSummary => ({
  indicator: evaluation.indicator,
  status: evaluation.status,
  reason: evaluation.reason,
  result: evaluation.result,
});

/**
 * `sideSignals` with resolved row operands for audit. Empty sides remain false;
 * callers use `active_indicator_ids` to distinguish an inactive gate and `indicators`
 * for each active indicator's own status (`no_signal` when it has no enabled row).
 */
export function sideSignalsWithEvidence(
  config: SharedConfig,
  bars: readonly Bar[],
  side: Side,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): SideSignalsEvidence[] {
  const active = activeSides(config, side, registry);
  const activeIds = active.map(({ id }) => id);
  if (!active.length) {
    return bars.map(() => ({ result: false, active_indicator_ids: [], rules: [], indicators: [] }));
  }
  const cache = createSeriesCache(bars);
  return bars.map((_, i) => {
    const rules: TracedRuleEvaluation[] = [];
    const indicators: IndicatorSideSummary[] = [];
    let anyEmptySide = false;
    for (const { id, sideConfig } of active) {
      const evaluation = evaluateIndicatorSide(id, sideConfig, cache, i);
      indicators.push(summary(evaluation));
      if (evaluation.status === 'no_signal') {
        anyEmptySide = true;
        continue;
      }
      for (const row of evaluation.rows) rules.push({ ...row, indicator: id, side });
    }
    return {
      result: anyEmptySide || !rules.length ? false : and3(rules.map((rule) => rule.result)),
      active_indicator_ids: [...activeIds],
      rules,
      indicators,
    };
  });
}
