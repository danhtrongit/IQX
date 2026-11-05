/**
 * Chỉ báo mở từ URL (`?chi-bao=<id>`, docs/iqline-design.md §13) cho `IQLine mode="market"`.
 *
 * Chỉ báo chỉ thêm vào bản đang xem của mã: `withTryIndicators` bọc `store` và trộn chúng vào kết quả `load`, còn `save` đi thẳng
 * xuống `store` thật. Vì IQLine chỉ gọi `save` khi người dùng tự đổi (vẽ, thêm, ẩn, xoá, sửa chỉ báo), layout đã lưu của họ không
 * bị ghi đè chỉ vì mở một liên kết. Sau lần lưu đầu tiên của một mã, bản lưu là của người dùng nên không trộn lại (nếu không,
 * chỉ báo họ vừa xoá sẽ hiện lại khi đổi mã rồi quay về).
 */
import { getIndicator, validateIndicatorParams } from "@/lib/iqline/indicators"
import { DEFAULT_INDICATORS, MAX_INDICATORS, newIndicatorKey } from "@/lib/iqline/react/market-defaults"
import type { ChartDocument, ChartIndicatorInput, IQLineStore } from "@/lib/iqline/types"

/** Id có trong sổ đăng ký và tham số mặc định hợp lệ. Id lạ thì bỏ qua, không lỗi. */
export function isTryableIndicator(id: string): boolean {
  return getIndicator(id) !== undefined && validateIndicatorParams(id, {}) === null
}

/**
 * Thêm các chỉ báo `ids` vào danh sách. Không thêm trùng: đã có chỉ báo cùng id đang hiện thì giữ nguyên; chỉ có bản đang ẩn thì
 * bỏ ẩn (người dùng bấm "Thử" để nhìn thấy nó); đủ `MAX_INDICATORS` thì không thêm. Không sửa danh sách đầu vào.
 */
export function mergeTryIndicators(indicators: readonly ChartIndicatorInput[], ids: readonly string[]): ChartIndicatorInput[] {
  const next = [...indicators]
  for (const id of ids) {
    if (!isTryableIndicator(id) || next.some((item) => item.id === id && !item.hidden)) continue
    const hidden = next.findIndex((item) => item.id === id)
    if (hidden >= 0) next[hidden] = { ...next[hidden], hidden: false }
    else if (next.length < MAX_INDICATORS) next.push({ key: newIndicatorKey(id, next), id, params: {} })
  }
  return next
}

const emptyDocument = (): ChartDocument => ({ iqline: { version: 1, drawings: [], indicators: [...DEFAULT_INDICATORS], chartType: "candles" } })

/** `store` mà `load` trả thêm các chỉ báo `ids` (xem đầu file). Không có id hợp lệ thì trả lại đúng `store`. */
export function withTryIndicators(store: IQLineStore, ids: readonly string[]): IQLineStore {
  const tryable = ids.filter(isTryableIndicator)
  if (tryable.length === 0) return store
  const saved = new Set<string>()
  return {
    async load(symbol) {
      const document = await store.load(symbol).catch(() => null)
      if (saved.has(symbol.toUpperCase())) return document
      const base = document ?? emptyDocument()
      return { ...base, iqline: { ...base.iqline, indicators: mergeTryIndicators(base.iqline.indicators, tryable) } }
    },
    save(symbol, document) {
      saved.add(symbol.toUpperCase())
      store.save(symbol, document)
    },
  }
}
