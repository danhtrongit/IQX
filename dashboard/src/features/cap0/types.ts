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
  /** Seeded practice cash (VND) — default 100.000.000. */
  virtual_balance_init: number
  /** Nhiệm vụ ① «Đặt lệnh mua đầu tiên». */
  task_1_done_at: string | null
  /** Nhiệm vụ ②–④: ba tour sản phẩm. */
  task_2_done_at: string | null
  task_3_done_at: string | null
  task_4_done_at: string | null
  /** Nhiệm vụ ⑤ «Bán một lệnh — kết sổ đầu tiên». */
  task_5_done_at: string | null
  /** Sự kiện ★ của nhiệm vụ ①; backend ghi lại cùng cổng `star`. */
  task1_star_clicked: boolean
  /** Cổng hành vi duy nhất: người dùng đã đóng Kết sổ nhiệm vụ ⑤. */
  task5_debrief_done: boolean
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

/**
 * Evidence gates the PATCH /cap0/task endpoint accepts for nhiệm vụ ①/⑤.
 */
export type Cap0Gate = "star" | "debrief"

/**
 * One `cap0_order_kehoach` row (spec §10) — the Kế hoạch chip a user picked
 * for a Cấp 0 BUY, plus everything the Kết sổ derives from that order. (Not
 * necessarily a *Sân tập* buy; nothing here filters on order mode.)
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

export type PlacementExperience = "never" | "unsure" | "regular"

/** Trạng thái xếp lớp từ GET/POST `/cap0/placement`. */
export interface Cap0PlacementOut {
  placed_level: number
  experience: PlacementExperience
  da_xem_tour: boolean
}

/**
 * Order mode — `san_tap` là T+0 ở Cấp 0; `thuc_chien` là luật T+2,5 sau khi
 * tốt nghiệp Cấp 0.
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
 * Count the two required trading tasks. Tour history does not affect graduation.
 */
export function countTasksDone(progress: Cap0Progress | null | undefined): number {
  if (!progress) return 0
  return (
    [
      progress.task_1_done_at,
      progress.task_5_done_at,
    ].filter((t) => t != null).length
  )
}

/**
 * spec §9 "Sau khi bấm: badge góc màn hình đổi từ SÂN TẬP · T+0 sang THỰC
 * CHIẾN" — the single source of truth for the mode pill everywhere it's
 * shown (`Cap0TradingPage`'s topbar, `JourneyPanel`'s level card).
 *
 */
export function tradingModeFor(progress: Cap0Progress | null | undefined): TradingMode {
  return progress?.graduated_at ? "thuc_chien" : "san_tap"
}
