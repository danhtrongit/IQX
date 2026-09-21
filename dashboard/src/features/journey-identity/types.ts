import type { Lop, Lop5Partial } from "@/features/cap4/types"

export type MascotId = "bach_ho" | "thanh_long" | "loc_huou" | "phung_hoang" | "kim_quy"
export type EggLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type EggEffect = "orbit_ring" | "evolved_core" | "node_ring" | "analysis_ring" | "conflict_cross" | "balanced_orbit" | "pre_hatch"
export type MascotState = "idle" | "greet" | "analyzing" | "updated" | "tap_reaction"
export type Lifecycle = "egg" | "pending_data_repair" | "reveal_pending" | "mascot"
export interface IdentityState {
  lifecycle: Lifecycle
  current_level: number
  cap6_graduated_at: string | null
  mascot_rules_version: number
  today_local: string
  timezone: string
  mascot: null | {
    id: MascotId
    name: string
    dominant_layer: Lop
    assignment_basis: "ai_match_count" | "stable_tie_break" | "zero_match_tie_break"
    valid_pair_count: number
    match_counts: Record<Lop, number>
    tied_layers: Lop[]
    window_start: string
    window_end: string
    assigned_at: string
  }
  ui_state: {
    last_seen_egg_level: number | null
    egg_hatch_seen_at: string | null
    reveal_seen_at: string | null
    greeted_local_date: string | null
    last_animated_bot_run_id: string | null
  }
  bot_run: {
    status: "idle" | "running" | "succeeded" | "failed"
    latest_run_id: string | null
    last_updated_at: string | null
    processed_unseen_sessions: number
    issues: { code: string; detail?: string; symbol?: string }[]
    connected: boolean
  }
}
export type UIEvent =
  | { event: "level_seen"; level: EggLevel }
  | { event: "hatch_seen" }
  | { event: "reveal_seen"; local_date?: string }
  | { event: "greet_seen"; local_date?: string }
  | { event: "bot_run_updated_seen"; run_id: string; local_date?: string }
export interface ReadingDataset {
  id: string
  symbol: string
  trading_date: string
  price: number | null
  readings: Record<Lop, { lines: string[]; degraded: boolean }>
}
export interface ReadingReveal {
  id: string
  dataset_id: string
  ai_answers: Lop5Partial
  readings: ReadingDataset["readings"]
  first_answers: Lop5Partial
}
