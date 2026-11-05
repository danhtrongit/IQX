/** Hằng số của `IQLine mode="market"`, để trang dùng được mà không phải nhập file component (và để fast refresh chạy đúng). */
import type { ChartIndicatorInput } from "../types"

/** Chỉ báo mặc định của mã chưa có dữ liệu lưu: ô khối lượng như TradingView. */
export const DEFAULT_INDICATORS: readonly ChartIndicatorInput[] = [{ key: "volume", id: "volume", params: {} }]

/** Số nến xin lần đầu và mỗi lần nạp thêm lịch sử khi kéo về trái. */
export const INITIAL_BARS = 400
export const OLDER_BARS = 300
/** Còn ít hơn ngần này nến ở bên trái khung nhìn thì nạp thêm lịch sử. */
export const PREFETCH_BARS = 40

/** Số chỉ báo tối đa trên một biểu đồ. */
export const MAX_INDICATORS = 12

let keySeed = 0
/** Khoá mới cho một chỉ báo: duy nhất trong danh sách và trong phiên. */
export function newIndicatorKey(id: string, taken: readonly ChartIndicatorInput[]): string {
  const used = new Set(taken.map((item) => item.key))
  let key: string
  do {
    keySeed += 1
    key = `${id}-${Date.now().toString(36)}${keySeed.toString(36)}`
  } while (used.has(key))
  return key
}
