import { calc } from './indicators.js';
import { and3, evaluateRule } from './rules.js';
import { loadTechnicalRegistry } from './technical-registry.js';
import type { Bar, RegistryEntry, SharedConfig, Side, SideConfig, Tri } from './types.js';

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
