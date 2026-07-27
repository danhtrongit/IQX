import type { Cap0Progress } from "./types"

/**
 * Progressive hide-by-level (spec §8) — the SINGLE place that decides which
 * pre-existing, untouched web components stay hidden while the user is still
 * inside Cấp 0 vs. when each one unlocks. A pure function of `Cap0Progress`:
 * it says nothing about being OUTSIDE Cấp 0 — every call site combines it
 * with its own `isCap0Active` check (`isCap0Active && !cap0Visibility(...).x`
 * to hide), so outside a `Cap0Provider` nothing here ever fires and every
 * component renders exactly as it does today.
 *
 * Spec §8 table → condition mở lại:
 *  - Sổ lệnh bid/ask            → xong nhiệm vụ ② (tour bảng điện — now built
 *    this delivery: `bangDienTour`/`TourOverlay`, launched from Journey's
 *    "Làm ngay →" on task ②; completing the tour's last step unlocks this).
 *  - Ô Giá / dropdown MP/LO     → nhiệm vụ ⑤ mở, tức là xong nhiệm vụ ①.
 *  - Tab "Tin tức" / "AI Mẫu nến" → lên Cấp 1 (tốt nghiệp Cấp 0).
 *
 * `graduated` short-circuits every flag to visible — once the user has
 * graduated, nothing Cấp 0-related should still be hidden even if some task
 * flag happens to be unset for any reason.
 */
export interface Cap0Visibility {
  /** Sổ lệnh bid/ask trong panel đặt lệnh. */
  orderBook: boolean
  /** Ô Giá trong phiếu lệnh. */
  priceField: boolean
  /** Dropdown loại lệnh (MP/LO/…). */
  orderTypeDropdown: boolean
  /** Tab "Tin tức" (sidebar phải). */
  newsTab: boolean
  /** Tab "AI Mẫu nến" (sidebar phải). */
  aiPatternsTab: boolean
}

export function cap0Visibility(progress: Cap0Progress | null | undefined): Cap0Visibility {
  const graduated = !!progress?.graduated_at
  const task1Done = !!progress?.task_1_done_at
  const task2Done = !!progress?.task_2_done_at

  return {
    orderBook: graduated || task2Done,
    priceField: graduated || task1Done,
    orderTypeDropdown: graduated || task1Done,
    newsTab: graduated,
    aiPatternsTab: graduated,
  }
}
