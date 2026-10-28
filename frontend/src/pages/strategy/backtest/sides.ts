import type { SharedConfig, Side } from "@/pages/demo-trading/bot/config/types"

/** A side takes part in the saved configuration only with the master ON, the side ON, and at least one enabled rule. */
export function isSideUsed(config: SharedConfig | undefined, indicatorId: string, side: Side): boolean {
  const saved = config?.indicators[indicatorId]
  return !!saved && saved.master_enabled && saved[side].enabled && saved[side].rules.some((rule) => rule.enabled !== false)
}
