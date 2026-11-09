/**
 * Sắp xếp bảng theo dõi. Cột chữ (Mã, Bộ lọc) bấm lần đầu tăng dần; cột số (Ngày đề xuất, hai
 * cột giá, Lợi nhuận, Số phiên) bấm lần đầu giảm dần; bấm lại thì đảo chiều. Mặc định ngày đề
 * xuất mới nhất lên trước. Giá trị trống luôn xuống cuối, hoà thì xếp theo mã.
 */
import type { TrackingItem } from "./bulletin-api"

export type TrackingSortKey =
  | "symbol"
  | "slot"
  | "first_trade_date"
  | "entry_price"
  | "price"
  | "return_pct"
  | "sessions"

export type SortDirection = "asc" | "desc"
export type TrackingSort = { key: TrackingSortKey; direction: SortDirection }

export const DEFAULT_TRACKING_SORT: TrackingSort = { key: "first_trade_date", direction: "desc" }

const TEXT_KEYS: ReadonlySet<TrackingSortKey> = new Set(["symbol", "slot"])

export function firstDirection(key: TrackingSortKey): SortDirection {
  return TEXT_KEYS.has(key) ? "asc" : "desc"
}

/** Bấm tiêu đề cột: cột mới theo chiều đầu tiên của nó, cột đang sắp xếp thì đảo chiều. */
export function nextTrackingSort(current: TrackingSort, key: TrackingSortKey): TrackingSort {
  if (current.key !== key) return { key, direction: firstDirection(key) }
  return { key, direction: current.direction === "asc" ? "desc" : "asc" }
}

function valueOf(item: TrackingItem, key: TrackingSortKey): string | number | null {
  switch (key) {
    case "symbol":
      return item.symbol
    case "slot":
      return item.slot
    case "first_trade_date":
      return item.first_trade_date
    case "entry_price":
      return item.entry_price
    case "price":
      return item.price
    case "return_pct":
      return item.return_pct
    case "sessions":
      return item.sessions
  }
}

export function sortTracking(items: readonly TrackingItem[], sort: TrackingSort): TrackingItem[] {
  const sign = sort.direction === "asc" ? 1 : -1
  return [...items].sort((a, b) => {
    const left = valueOf(a, sort.key)
    const right = valueOf(b, sort.key)
    if (left === null && right !== null) return 1
    if (right === null && left !== null) return -1
    if (left !== null && right !== null && left !== right) {
      const order = typeof left === "string" && typeof right === "string" ? left.localeCompare(right) : Number(left) - Number(right)
      if (order !== 0) return order * sign
    }
    return a.symbol.localeCompare(b.symbol)
  })
}
