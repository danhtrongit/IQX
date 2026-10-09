import type { SharedConfig, Side } from "@/pages/demo-trading/bot/config/types"

/** A side takes part in the saved configuration only with the master ON and the side ON. */
export function isSideUsed(config: SharedConfig | undefined, indicatorId: string, side: Side): boolean {
  const saved = config?.indicators[indicatorId]
  return !!saved && saved.master_enabled && saved[side].enabled
}
