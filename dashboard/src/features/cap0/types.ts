/**
 * Cấp 0 «Nhập môn» onboarding — shared types.
 *
 * `Cap0Progress` mirrors the backend `Cap0ProgressOut` schema 1:1 (snake_case)
 * so the wire shape maps straight onto the UI with no adapter — the spec §10
 * data model uses these exact field names.
 */

/** Behaviour-progress row for the current user (one per user). */
export interface Cap0Progress {
  id: string
  user_id: string
  /** Timestamp the user first entered Cấp 0. */
  entered_at: string
  /** Seeded practice cash (VND) — default 250.000.000. */
  virtual_balance_init: number
  task_1_done_at: string | null
  task_2_done_at: string | null
  task_3_done_at: string | null
  task_4_done_at: string | null
  task_5_done_at: string | null
  task_6_done_at: string | null
  /** Task ① gate — ★ watchlist click happened. */
  task1_star_clicked: boolean
  /** Task ⑤ gate 1 — a `keydown` typed the stop-loss threshold. */
  task5_sl_typed: boolean
  /** Task ⑥ gate 2 — the debrief ("Kết sổ") screen was closed. */
  task6_debrief_done: boolean
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

/** Behaviour gates the PATCH /cap0/task endpoint can flip. */
export type Cap0Gate = "star" | "sl_typed" | "debrief"

/** Response of POST /cap0/placement — never traded → 0, experienced → 2. */
export interface PlacementResult {
  placed_level: number
}

/** Order mode — Cấp 0 orders are always `san_tap`; `thuc_chien` is live. */
export type TradingMode = "san_tap" | "thuc_chien"

/** One evolving-hexagon level (spec §12 `LEVELS`). */
export interface Cap0Level {
  n: number
  name: string
  color: string
  fill: number
}

/** Props for the `badge()` SVG builder / `<Badge>` component (spec §12). */
export interface BadgeOptions {
  /** Level number (0..5) shown in the centre. */
  n: number
  /** Main colour (usually `LEVELS[n].color`). */
  color: string
  /** 0..5 — core density + number of lit edges (usually = n). */
  fill: number
  /** Rendered size in px (default 96). */
  size?: number
  /** Add the glow filter (high levels / graduation). */
  glow?: boolean
  /** 0..1 — draw an outer progress ring (only when != null). */
  ring?: number
  /** Show the level number in the centre (default true). */
  showNum?: boolean
}

/** How many of the 6 Cấp 0 tasks are complete. */
export function countTasksDone(progress: Cap0Progress | null | undefined): number {
  if (!progress) return 0
  return (
    [
      progress.task_1_done_at,
      progress.task_2_done_at,
      progress.task_3_done_at,
      progress.task_4_done_at,
      progress.task_5_done_at,
      progress.task_6_done_at,
    ].filter((t) => t != null).length
  )
}
