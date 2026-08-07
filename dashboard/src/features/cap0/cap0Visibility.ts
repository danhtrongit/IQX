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
 * Spec v3.0 §8 table → condition mở lại:
 *  - Sổ lệnh bid/ask            → **lên Cấp 2** ("không hiện ở Cấp 0 và Cấp
 *    1"). There is therefore NO Cấp 0 condition that opens it, and this flag is
 *    a constant `false` — see `orderBook` below.
 *  - Ô Giá / dropdown MP/LO     → nhiệm vụ ⑤ mở, tức là xong nhiệm vụ ①.
 *  - Tab "Tin tức" / "AI Mẫu nến" → lên Cấp 1 (tốt nghiệp Cấp 0).
 *
 * `graduated` short-circuits the LEVEL-scoped flags to visible — once the user
 * has graduated, nothing that unlocks *within* Cấp 0 should still be hidden
 * even if some task flag happens to be unset. It deliberately does NOT
 * short-circuit `orderBook`, whose unlock is a whole level further out.
 */
export interface Cap0Visibility {
  /**
   * Sổ lệnh bid/ask trong panel đặt lệnh — always `false` here. Spec v3.0 §8
   * opens it at **Cấp 2**, and this function only ever sees `Cap0Progress`, so
   * no input it receives can justify showing it. The Cấp 2 unlock lives with
   * the only code that can know about Cấp 2: `TradingPanel`'s
   * `!isCap2Active && (...)` (see its `hideOrderBook`).
   */
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

  return {
    // v2.2 unlocked this on `task_2_done_at` (tour bảng điện) — a whole level
    // early. v3.0 §8 is explicit: "Lên Cấp 2 (không hiện ở Cấp 0 và Cấp 1)".
    orderBook: false,
    priceField: graduated || task1Done,
    orderTypeDropdown: graduated || task1Done,
    newsTab: graduated,
    aiPatternsTab: graduated,
  }
}
