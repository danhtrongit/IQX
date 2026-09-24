export type MascotId = "bach_ho" | "thanh_long" | "loc_huou" | "phung_hoang" | "kim_quy"
export type MascotState = "idle" | "greet" | "analyzing" | "updated" | "tap_reaction"
export type UIEvent =
  | { event: "level_seen"; level: number }
  | { event: "hatch_seen" | "reveal_seen" | "greet_seen" }
  | { event: "bot_run_updated_seen"; run_id: string }

export type IdentityState = {
  lifecycle: "egg" | "pending_data_repair" | "reveal_pending" | "mascot"
  current_level: number
  cap6_graduated_at: string | null
  mascot_rules_version: number
  mascot: null | { id: MascotId; name: string; dominant_layer: string; assignment_basis: string; valid_pair_count: number; match_counts: Record<string, number>; tied_layers: string[] }
  today_local: string
  timezone: string
  ui_state: { last_seen_egg_level: number | null; egg_hatch_seen_at: string | null; reveal_seen_at: string | null; greeted_local_date: string | null; last_animated_bot_run_id: string | null }
  bot_run: { status: string; latest_run_id: string | null; last_updated_at: string | null; processed_unseen_sessions: number; issues: { code: string; detail?: string; symbol?: string }[]; connected: boolean }
}
