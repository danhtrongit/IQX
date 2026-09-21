import type { Cap0Progress } from "./types"

/** Two required trading tasks; product tours remain available separately. */
export const TASK_NAMES: Record<number, string> = {
  1: "Lệnh đầu tiên + Nắm giữ + Theo dõi",
  2: "Tour phân tích cổ phiếu",
  3: "Tour bản tin thị trường",
  4: "Tour phân tích báo cáo tài chính",
  5: "Bán một lệnh — kết sổ đầu tiên",
}

export const TASK_NOS = [1, 5] as const
export const TOTAL_TASKS = TASK_NOS.length
export const NUMERALS = "①②③④⑤"

/** Các tour Cấp 0 chạy trên product view thật, không nằm giữa `/dau-truong`. */
export const CAP0_TASK_TOUR_ROUTES: Readonly<Record<number, string>> = {
  2: "/?view=stock&tour=phantich",
  3: "/?view=market&tour=bantin",
  4: "/?view=financial&tour=bctc",
}

export type TaskState = "done" | "active" | "locked"

/**
 * ① mở đầu. Sau khi ① xong, ba tour ②–④ và nhiệm vụ bán ⑤ đều mở độc lập;
 * mỗi dòng đã xong dựa trên timestamp riêng từ backend.
 */
export function taskState(no: number, progress: Cap0Progress | null | undefined): TaskState {
  if (no === 1) return progress?.task_1_done_at ? "done" : "active"

  const doneAt =
    no === 2
      ? progress?.task_2_done_at
      : no === 3
        ? progress?.task_3_done_at
        : no === 4
          ? progress?.task_4_done_at
          : progress?.task_5_done_at

  if (doneAt) return "done"
  return progress?.task_1_done_at ? "active" : "locked"
}

export function focusTaskNo(progress: Cap0Progress | null | undefined): number | null {
  return TASK_NOS.find((no) => taskState(no, progress) === "active") ?? null
}
