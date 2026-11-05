/** Ngăn xếp hoàn tác và làm lại có giới hạn. Thuần, không biết nội dung của `T`. */

export const DEFAULT_HISTORY_LIMIT = 100

export type History<T> = {
  /** Các trạng thái trước, cũ nhất ở đầu mảng. */
  past: readonly T[]
  /** Các trạng thái đã hoàn tác, trạng thái sắp được làm lại nằm cuối mảng. */
  future: readonly T[]
  /** Số bước hoàn tác tối đa; bước cũ nhất bị bỏ khi vượt. */
  limit: number
}

export function createHistory<T>(limit: number = DEFAULT_HISTORY_LIMIT): History<T> {
  return { past: [], future: [], limit: Math.max(1, Math.floor(limit)) }
}

/** Ghi trạng thái TRƯỚC thay đổi. Một thay đổi mới xoá hết các bước làm lại. */
export function recordHistory<T>(history: History<T>, before: T): History<T> {
  const past = [...history.past, before]
  if (past.length > history.limit) past.splice(0, past.length - history.limit)
  return { ...history, past, future: [] }
}

/** Lùi một bước: trả về trạng thái cần khôi phục và lịch sử mới (đẩy `present` sang `future`); null nếu hết bước. */
export function undoHistory<T>(history: History<T>, present: T): { history: History<T>; value: T } | null {
  if (history.past.length === 0) return null
  const value = history.past[history.past.length - 1]
  return { value, history: { ...history, past: history.past.slice(0, -1), future: [...history.future, present] } }
}

/** Tiến một bước: ngược lại với `undoHistory`. */
export function redoHistory<T>(history: History<T>, present: T): { history: History<T>; value: T } | null {
  if (history.future.length === 0) return null
  const value = history.future[history.future.length - 1]
  const past = [...history.past, present]
  if (past.length > history.limit) past.splice(0, past.length - history.limit)
  return { value, history: { ...history, past, future: history.future.slice(0, -1) } }
}

export const canUndo = (history: History<unknown>): boolean => history.past.length > 0
export const canRedo = (history: History<unknown>): boolean => history.future.length > 0
