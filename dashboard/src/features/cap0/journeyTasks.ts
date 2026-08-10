import type { Cap0Progress } from "./types"

/**
 * Danh mục 5 nhiệm vụ Cấp 0 + cách suy ra trạng thái của chúng.
 *
 * Tách khỏi `JourneyPanel.tsx` vì `JourneyBar.tsx` cần ĐÚNG cùng một phép
 * chọn "nhiệm vụ đang làm": thanh journey mà gọi tên một nhiệm vụ khác với ô
 * tập trung trong tab Hành trình là chính cái mâu thuẫn mà bản dẫn-từng-nhiệm-
 * vụ-một này đi sửa. Module thuần (không JSX, không hook) nên thanh bar không
 * phải kéo theo `Badge`/`ModeBadge`/premium chỉ để biết tên một nhiệm vụ.
 *
 * ★ KHÔNG có luật mở khoá nào mới ở đây: `taskState` là bản chuyển nguyên văn
 * từ `JourneyPanel.tsx`, giữ nguyên từng nhánh (xem docstring của nó).
 */

/**
 * The 5 Cấp 0 tasks — names verbatim spec v3.0 §7. Task numbers are the spec's
 * circled numerals ①..⑤, kept here as plain `no` (1..5) to key off
 * `Cap0Progress.task_N_done_at`.
 *
 * v2.2 had six: its ⑤ was "Lệnh thứ hai — tự đặt ngưỡng cắt lỗ", which v3.0
 * deletes with cắt lỗ/chốt lời themselves; its ⑥ (bán + Kết sổ) is now ⑤.
 */
export const TASK_NAMES: Record<number, string> = {
  1: "Lệnh đầu tiên + Nắm giữ + Theo dõi",
  2: "Tour bảng điện — 8 điểm",
  3: "Tour bản tin thị trường",
  4: 'Tour "6 người chơi" trên mã của bạn',
  5: "Bán một lệnh — kết sổ đầu tiên",
}

/**
 * Descriptions shown in the ô tập trung (spec §7 "có dòng mô tả"). Only
 * task ① has a verbatim description in the mockup (`#hd1`) — ②③④/⑤
 * descriptions here are reasonable paraphrases of their spec behaviour (not a
 * verbatim requirement per the task brief, which only calls out level card /
 * checklist headers / 5 task names / journey-bar copy as verbatim).
 */
export const TASK_DESCRIPTIONS: Record<number, string> = {
  1: "Mua công ty bạn biết · chọn lý do trong Kế hoạch · xem tiền nằm đâu · gắn sao ★. Làm thiếu bước nào, hệ thống sẽ nhắc.",
  2: "Tour ngắn ~2-3 phút, 8 điểm: nhận mặt các khu vực trên sân chơi bạn vừa dùng ở nhiệm vụ ①.",
  3: "Tour giới thiệu bản tin thị trường IQX — nơi tổng hợp diễn biến phiên.",
  4: 'Tour "6 người chơi" — ai đang mua/bán ảnh hưởng tới giá mã bạn chọn.',
  5: "Bán một lệnh đang có để khép vòng đời lệnh đầu tiên. Xong sẽ mở màn Kết sổ.",
}

export const STAGES: { label: string; tasks: number[] }[] = [
  { label: "CHẶNG 1 — VÀO SÂN", tasks: [1] },
  { label: "CHẶNG 2 — HIỂU SÂN CHƠI · TOUR SẢN PHẨM IQX", tasks: [2, 3, 4] },
  { label: "CHẶNG 3 — KHÉP VÒNG", tasks: [5] },
]

/** Spec v3.0 §4 "3 CHẶNG · 5 NHIỆM VỤ" — the denominator of every counter. */
export const TOTAL_TASKS = 5

/** Task numbers in journey order — the order the ô tập trung walks through. */
export const TASK_NOS = [1, 2, 3, 4, 5] as const

/** Circled numerals ①..⑤ — shown inline before each task name (mockup `.task .nm`). */
export const NUMERALS = "①②③④⑤"

/**
 * Trạng thái MỞ KHOÁ của một nhiệm vụ — 3 giá trị, y như trước.
 * (Cách VẼ nó thì có thêm `current`/`open`, xem `rowState` trong
 * `JourneyPanel.tsx`; đó là chuyện trình bày, không phải chuyện mở khoá.)
 */
export type TaskState = "done" | "active" | "locked"

/**
 * State of one checklist task (spec §7 "Trạng thái mỗi mục checklist").
 *
 * - ①: the entry task — active until `task_1_done_at`, then done.
 * - ②③④: the 3 Chặng 2 product tours (T2/T3/T4,
 *   `docs/superpowers/plans/2026-07-27-cap0-tours.md`) — done once their own
 *   `task_N_done_at` is set, else active once ① is done. INDEPENDENT of each
 *   other within Chặng 2 (any order — do NOT hard-sequence ②→③→④; a user can
 *   run them in whatever order they click "Làm ngay →").
 * - ⑤: spec §4 Chặng 3 "Điều kiện mở: có ≥1 lệnh đang mở (sau khi xong ①)" —
 *   active once ① is done (does NOT wait on ②③④ — Chặng 2 and Chặng 3 gate off
 *   the SAME ① flag). This panel only has `useCap0Progress`, not live position
 *   data, so "xong ①" is the approximation of "có lệnh đang mở"; the gbar,
 *   which does read the portfolio, applies the real condition.
 *   `task_5_done_at` is set by the Kết sổ gate and nothing else.
 */
export function taskState(no: number, progress: Cap0Progress | null | undefined): TaskState {
  if (no === 2 || no === 3 || no === 4) {
    const doneAt =
      no === 2 ? progress?.task_2_done_at : no === 3 ? progress?.task_3_done_at : progress?.task_4_done_at
    if (doneAt) return "done"
    return progress?.task_1_done_at ? "active" : "locked"
  }
  if (no === 1) return progress?.task_1_done_at ? "done" : "active"
  // no === 5
  if (progress?.task_5_done_at) return "done"
  return progress?.task_1_done_at ? "active" : "locked"
}

/**
 * Nhiệm vụ được ĐƯA LÊN Ô TẬP TRUNG — nhiệm vụ `active` có số nhỏ nhất, hay
 * `null` khi không còn nhiệm vụ nào mở (tức là đã xong cả 5 → ô tập trung đổi
 * sang trạng thái sẵn sàng tốt nghiệp).
 *
 * ★ Nó CHỈ chọn trong số nhiệm vụ mà `taskState` đã coi là `active`, không tự
 * đặt thêm thứ tự nào: ②③④ vẫn độc lập và ⑤ vẫn mở cùng lúc với chúng — những
 * nhiệm vụ active không được tập trung vẫn giữ lối tắt "Làm ngay →" riêng trong
 * checklist thu gọn. "Một nhiệm vụ một lúc" ở đây là cách DẪN, không phải một
 * cái khoá mới.
 */
export function focusTaskNo(progress: Cap0Progress | null | undefined): number | null {
  return TASK_NOS.find((no) => taskState(no, progress) === "active") ?? null
}

/** Nhãn chặng chứa nhiệm vụ `no` (ô tập trung nhắc lại nó). */
export function stageLabelOf(no: number): string {
  return STAGES.find((s) => s.tasks.includes(no))?.label ?? ""
}
