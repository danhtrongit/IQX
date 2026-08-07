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
  /** Nhiệm vụ ⑤ «Bán một lệnh — kết sổ đầu tiên». */
  task_5_done_at: string | null
  /**
   * Task ① recorded fact — ★ watchlist click happened. NOT a graduation gate
   * (spec v3.0 §9: Cấp 0 has exactly ONE behaviour gate, `task5_debrief_done`).
   */
  task1_star_clicked: boolean
  /**
   * The ONE behaviour gate of Cấp 0 (spec v3.0 §4 ⑤ / §9) — the Kết sổ screen
   * was closed. v2.2's second gate (`task5_sl_typed`, a keydown into the ô cắt
   * lỗ) is gone with cắt lỗ/chốt lời itself.
   */
  task5_debrief_done: boolean
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

/** Behaviour gates the PATCH /cap0/task endpoint can flip (v3.0: two, one real). */
export type Cap0Gate = "star" | "debrief"

/**
 * One `cap0_order_kehoach` row (spec §10) — the Kế hoạch chip a user picked
 * for a Cấp 0 BUY, plus everything the Kết sổ derives from that order. (Not
 * necessarily a *Sân tập* buy — see `TradingMode`: an existing premium
 * subscriber's Cấp 0 orders are `thuc_chien`, and nothing here filters on it.)
 * Mirrors the backend `Cap0KehoachOut` schema 1:1.
 *
 * It is its OWN table, deliberately NOT Cấp 1's `order_kehoach` — the two
 * vocabularies are disjoint and a Cấp 0 row in Cấp 1's table would
 * permanently 409 that order's Form Kế hoạch (see `Cap0Service.record_kehoach`).
 */
export interface Cap0Kehoach {
  id: string
  order_id: string
  symbol: string
  mode: string
  /** Slug — `cong_ty_toi_biet` … `thu_cho_biet`. */
  ly_do_doi_thuong: string
  /** Verbatim spec §4 chip label — render as-is on the Kết sổ `Lý do mua` row. */
  ly_do_label: string
  /** BUY order `created_at`. */
  mua_luc: string
  /** BUY order `trading_date`. */
  ngay_mua: string
  gia_vao: number | null
  /**
   * `Thời gian giữ`, in trading sessions, measured from this buy to the SELL
   * that closed it — never to "today", which drifted upward every day a Kết sổ
   * went unread (the retro path re-opens round trips that closed long ago).
   *
   * **0 is the common Cấp 0 case** — Sân tập is T+0, so most round trips open
   * and close in the same phiên. The backend deliberately does NOT floor it to
   * 1 (that would be a fabricated number), so the Kết sổ must word 0 honestly
   * instead of printing "0 phiên".
   *
   * `null` = the position is still open, so the round trip has no length yet.
   */
  so_phien_giu: number | null
}

/** Response of POST /cap0/placement — never traded → 0, experienced → 2. */
export interface PlacementResult {
  placed_level: number
}

/**
 * Order mode — `san_tap` is the free T+0 practice engine, `thuc_chien` the paid
 * T+2,5 one.
 *
 * ★ It is decided by the user's SUBSCRIPTION, not by their level: Cấp 0 is free
 * and open to everyone, so an existing premium subscriber walking through Cấp 0
 * places `thuc_chien` orders. Nothing may treat "Cấp 0" and "san_tap" as
 * synonyms (the backend used to, and hid the Kế hoạch chip from that whole
 * cohort).
 */
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

/**
 * How many of the FIVE Cấp 0 tasks are complete (spec v3.0 §4 "3 CHẶNG · 5
 * NHIỆM VỤ").
 *
 * v2.2 had six: the old ⑤ was "lệnh thứ hai + tự gõ ngưỡng cắt lỗ", which v3.0
 * deletes outright, promoting the old ⑥ (bán + Kết sổ) to ⑤. The BE migration
 * copies `task_6_done_at` INTO `task_5_done_at` and drops column 6, so this
 * function reads five columns and column 5 means "bán + kết sổ" — never the
 * stale SL-keydown timestamp column 5 used to hold.
 */
export function countTasksDone(progress: Cap0Progress | null | undefined): number {
  if (!progress) return 0
  return (
    [
      progress.task_1_done_at,
      progress.task_2_done_at,
      progress.task_3_done_at,
      progress.task_4_done_at,
      progress.task_5_done_at,
    ].filter((t) => t != null).length
  )
}

/**
 * spec §9 "Sau khi bấm: badge góc màn hình đổi từ SÂN TẬP · T+0 sang THỰC
 * CHIẾN" — the single source of truth for the mode pill everywhere it's
 * shown (`Cap0TradingPage`'s topbar, `JourneyPanel`'s level card).
 *
 * IMPORTANT (final-review fix — premium-honest mode): the backend only ever
 * routes a user's orders through the real T+2,5 `thuc_chien` engine when
 * they're premium — a free user's orders stay `san_tap`/T+0 regardless of
 * `graduated_at` (see `backend/.../orders.py` place-order fail-closed guard).
 * So the UI must require BOTH `graduated_at` AND `isPremium` before claiming
 * "THỰC CHIẾN" — otherwise a free graduate sees a badge promising rules the
 * backend never actually applies to their orders. Every consumer must thread
 * the SAME `usePremiumStatus().isPremium` in so the topbar and journey card
 * never disagree.
 */
export function tradingModeFor(
  progress: Cap0Progress | null | undefined,
  isPremium: boolean,
): TradingMode {
  return progress?.graduated_at && isPremium ? "thuc_chien" : "san_tap"
}
