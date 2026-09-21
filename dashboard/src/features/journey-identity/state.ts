import type { IdentityState, MascotState } from "./types"
import { trackJourneyEvent } from "@/shared/analytics/journey"

export function deriveMascotState(state: IdentityState): MascotState {
  if (state.bot_run.status === "running") return "analyzing"
  if (state.bot_run.status === "failed") return "idle"
  if (state.bot_run.status === "succeeded" && state.bot_run.latest_run_id &&
      state.bot_run.latest_run_id !== state.ui_state.last_animated_bot_run_id) return "updated"
  if (state.ui_state.greeted_local_date !== state.today_local) return "greet"
  return "idle"
}

export function revealPhase(state: IdentityState): "egg" | "hatch" | "welcome" | "mascot" {
  if (!state.cap6_graduated_at || !state.mascot || state.lifecycle === "pending_data_repair") return "egg"
  if (!state.ui_state.egg_hatch_seen_at) return "hatch"
  if (!state.ui_state.reveal_seen_at) return "welcome"
  return "mascot"
}

/** Whitelisted local instrumentation; never includes answers or trading data. */
export function identityEvent(name: string, fields: Record<string, string | number | boolean> = {}) {
  window.dispatchEvent(new CustomEvent("iqx:identity-telemetry", { detail: { name, ...fields } }))
  trackJourneyEvent(name, fields)
}
