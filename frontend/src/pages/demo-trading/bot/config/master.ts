import type { IndicatorConfig } from "./types"

export type MasterIntent =
  /** Save the master change as is; the children (sides, params, operators) are kept. */
  | { kind: "save"; config: IndicatorConfig }
  /** Master ON with both sides OFF: open the config so the user picks a side. Cancel activates nothing. */
  | { kind: "configure" }

/**
 * What flipping the master switch of one indicator means (Bot SPEC §7.2):
 * - ON → OFF only turns the master off and keeps the configuration;
 * - OFF → ON with a side already ON turns the master on and keeps that side (the other side is not enabled);
 * - OFF → ON with both sides OFF opens the configuration instead of activating anything.
 */
export function masterToggleIntent(saved: IndicatorConfig): MasterIntent {
  if (saved.master_enabled) return { kind: "save", config: { ...saved, master_enabled: false } }
  if (saved.buy.enabled || saved.sell.enabled) return { kind: "save", config: { ...saved, master_enabled: true } }
  return { kind: "configure" }
}
