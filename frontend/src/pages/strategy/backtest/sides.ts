import type { IndicatorConfig, Side } from "@/pages/demo-trading/bot/config/types"

/** A side takes part in a strategy only with the master ON, the side ON, and at least one enabled rule. */
export function isSideUsed(indicators: Record<string, IndicatorConfig> | undefined, indicatorId: string, side: Side): boolean {
  const saved = indicators?.[indicatorId]
  return !!saved && saved.master_enabled && saved[side].enabled && saved[side].rules.some((rule) => rule.enabled !== false)
}
