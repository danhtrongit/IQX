import type { Cap0Progress } from "./types"

/**
 * Danh mục 4 nhiệm vụ Cấp 0 + cách suy ra trạng thái của chúng.
 *
 * Tách khỏi `JourneyPanel.tsx` vì `JourneyBar.tsx` cần ĐÚNG cùng một phép
 * chọn "nhiệm vụ đang làm": thanh journey mà gọi tên một nhiệm vụ khác với ô
 * tập trung trong tab Hành trình là chính cái mâu thuẫn mà bản dẫn-từng-nhiệm-
 * vụ-một này đi sửa. Module thuần (không JSX, không hook) nên thanh bar không
 * phải kéo theo `Badge`/`ModeBadge`/premium chỉ để biết tên một nhiệm vụ.
 */

/**
 * 4 nhiệm vụ Cấp 0 — tên lấy nguyên văn từ mockup
 * `docs/superpowers/specs/cap0/iqx-cap0-hanhtrinh.html` (`.task .nm`). Số thứ
 * tự là các chữ số khoanh tròn ①..④ của mockup, giữ ở đây thành `no` (1..4) để
 * bám vào `Cap0Progress.task_N_done_at`.
 *
 * ★ Trước đây là 5, với ②③④ là ba tour sản phẩm của "CHẶNG 2 — HIỂU SÂN CHƠI".
 * Cả chặng đó đã bị bỏ khỏi Cấp 0: ① không còn gánh ba việc trong một dòng
 * ("Lệnh đầu tiên + Nắm giữ + Theo dõi") mà tách ra thành ①②③, và «Bán + Kết
 * sổ» lùi từ ⑤ về ④.
 */
export const TASK_NAMES: Record<number, string> = {
  1: "Đặt lệnh mua đầu tiên",
  2: "Xem tab Nắm giữ",
  3: "Xem tab Theo dõi",
  4: "Bán một lệnh, kết sổ đầu tiên",
}

/**
 * Mẫu số của mọi bộ đếm — mockup `.jbar .lv` «CẤP 0 · 3/4» và `.ck-head .c`
 * «3/4».
 */
export const TOTAL_TASKS = 4

/** Task numbers in journey order — the order the ô tập trung walks through. */
export const TASK_NOS = [1, 2, 3, 4] as const

/** Circled numerals ①..④ — shown inline before each task name (mockup `.task .nm`). */
export const NUMERALS = "①②③④"

/**
 * Trạng thái MỞ KHOÁ của một nhiệm vụ — 3 giá trị.
 * (Cách VẼ nó thì có thêm `current`/`open`, xem `rowState` trong
 * `JourneyPanel.tsx`; đó là chuyện trình bày, không phải chuyện mở khoá.)
 */
export type TaskState = "done" | "active" | "locked"

/**
 * State of one checklist task.
 *
 * - ①: the entry task — active until `task_1_done_at`, then done.
 * - ②③: the two tab visits (Nắm giữ / Theo dõi) — done once their own
 *   `task_N_done_at` is set, else active once ① is done. INDEPENDENT of each
 *   other (any order). Chúng khoá sau ① vì backend từ chối (400) một PATCH ②/③
 *   khi ① chưa xong: chưa mua gì thì tab Nắm giữ chẳng có gì để xem.
 * - ④: «Bán một lệnh, kết sổ đầu tiên» — active once ① is done (does NOT wait
 *   on ②③: cả ba mở cùng lúc, off the SAME ① flag). This panel only has
 *   `useCap0Progress`, not live position data, so "xong ①" is the approximation
 *   of "có lệnh đang mở"; the gbar, which does read the portfolio, applies the
 *   real condition. `task_4_done_at` is set by the Kết sổ gate and nothing else.
 */
export function taskState(no: number, progress: Cap0Progress | null | undefined): TaskState {
  if (no === 1) return progress?.task_1_done_at ? "done" : "active"
  const doneAt =
    no === 2
      ? progress?.task_2_done_at
      : no === 3
        ? progress?.task_3_done_at
        : progress?.task_4_done_at
  if (doneAt) return "done"
  return progress?.task_1_done_at ? "active" : "locked"
}

/**
 * Nhiệm vụ được ĐƯA LÊN Ô TẬP TRUNG — nhiệm vụ `active` có số nhỏ nhất, hay
 * `null` khi không còn nhiệm vụ nào mở (tức là đã xong cả 4 → ô tập trung đổi
 * sang trạng thái sẵn sàng tốt nghiệp).
 *
 * ★ Nó CHỈ chọn trong số nhiệm vụ mà `taskState` đã coi là `active`, không tự
 * đặt thêm thứ tự nào: ②③④ vẫn độc lập với nhau — những nhiệm vụ active không
 * được tập trung vẫn giữ lối tắt "Làm ngay →" riêng trong checklist thu gọn.
 * "Một nhiệm vụ một lúc" ở đây là cách DẪN, không phải một cái khoá mới.
 */
export function focusTaskNo(progress: Cap0Progress | null | undefined): number | null {
  return TASK_NOS.find((no) => taskState(no, progress) === "active") ?? null
}
