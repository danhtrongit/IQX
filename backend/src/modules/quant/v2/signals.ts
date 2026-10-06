import { calc } from './indicators.js';
import { and3, evaluateRule, evaluateRuleWithEvidence } from './rules.js';
import { loadTechnicalRegistry } from './technical-registry.js';
import type {
  Bar,
  RegistryEntry,
  SharedConfig,
  Side,
  SideConfig,
  SideSignalsEvidence,
  TracedRuleEvaluation,
  Tri,
} from './types.js';

/** Per-bar AND of one indicator side's rules (its own params; never the other side's). */
export function indicatorSideSignals(
  indicatorId: string,
  sideConfig: SideConfig,
  bars: readonly Bar[],
): Tri[] {
  const series = calc(indicatorId, sideConfig.params, bars);
  return bars.map((_, i) =>
    and3(sideConfig.rules.map((rule) => evaluateRule(rule, series, sideConfig.params, i))),
  );
}

/**
 * Consensus signal of one side: AND across every indicator whose master and
 * side switches are ON. No active indicator → all false (never unknown).
 */
export function sideSignals(
  config: SharedConfig,
  bars: readonly Bar[],
  side: Side,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): Tri[] {
  const active: Array<{ id: string; sideConfig: SideConfig }> = [];
  for (const entry of registry) {
    const item = config.indicators[entry.id];
    if (item?.master_enabled && item[side].enabled)
      active.push({ id: entry.id, sideConfig: item[side] });
  }
  if (!active.length) return bars.map(() => false);
  const outputs = active.map(({ id, sideConfig }) => indicatorSideSignals(id, sideConfig, bars));
  return bars.map((_, i) => and3(outputs.map((signals) => signals[i] ?? null)));
}

/**
 * `sideSignals` with resolved rule operands for audit. Empty sides remain false;
 * callers use `active_indicator_ids` to distinguish an inactive gate.
 */
export function sideSignalsWithEvidence(
  config: SharedConfig,
  bars: readonly Bar[],
  side: Side,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): SideSignalsEvidence[] {
  const active = registry.flatMap((entry) => {
    const item = config.indicators[entry.id];
    return item?.master_enabled && item[side].enabled
      ? [{ id: entry.id, sideConfig: item[side] }]
      : [];
  });
  const activeIds = active.map(({ id }) => id);
  if (!active.length) {
    return bars.map(() => ({ result: false, active_indicator_ids: [], rules: [] }));
  }
  const seriesByIndicator = new Map(
    active.map(({ id, sideConfig }) => [id, calc(id, sideConfig.params, bars)] as const),
  );
  return bars.map((_, i) => {
    const rules: TracedRuleEvaluation[] = [];
    for (const { id, sideConfig } of active) {
      const series = seriesByIndicator.get(id)!;
      for (const rule of sideConfig.rules) {
        rules.push({
          id: rule.id,
          indicator: id,
          side,
          op: rule.op,
          ...evaluateRuleWithEvidence(rule, series, sideConfig.params, i),
        });
      }
    }
    return {
      result: and3(rules.map((rule) => rule.result)),
      active_indicator_ids: [...activeIds],
      rules,
    };
  });
}
