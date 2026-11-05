/**
 * Tham số URL "Thử trên biểu đồ" (docs/iqline-design.md §13): bài chỉ báo của Học viện mở `/bieu-do?chi-bao=<id>`, và
 * biểu đồ thêm chỉ báo đó vào phiên xem của mã đang mở.
 *
 * File này thuần và không nhập gì, để Học viện dùng được mà không kéo sổ đăng ký chỉ báo vào gói của mình. Việc kiểm tra id
 * có trong sổ đăng ký nằm ở `iqline-try-indicator.ts`, được tải cùng IQLine.
 */
export const TRY_INDICATOR_PARAM = "chi-bao"

const CHART_PATH = "/bieu-do"
/** Cùng dạng với id đăng ký của chỉ báo (`indicators/registry.ts`). */
const INDICATOR_ID = /^[a-z][a-z0-9_]{0,31}$/
/** Chỉ đọc chừng này giá trị; biểu đồ còn giới hạn theo số chỉ báo tối đa khi thêm. */
const MAX_READ = 12

/** Liên kết `/bieu-do` mở sẵn một chỉ báo. Không kèm mã và khung: trang biểu đồ tự chọn mặc định. */
export function tryIndicatorHref(indicatorId: string): string {
  return `${CHART_PATH}?${new URLSearchParams([[TRY_INDICATOR_PARAM, indicatorId]])}`
}

/** Các id trong URL: sai dạng thì bỏ, trùng thì chỉ giữ một, giữ thứ tự xuất hiện. Không kiểm tra với sổ đăng ký. */
export function readTryIndicatorParam(params: Pick<URLSearchParams, "getAll">): string[] {
  const ids: string[] = []
  for (const raw of params.getAll(TRY_INDICATOR_PARAM)) {
    const id = raw.trim()
    if (INDICATOR_ID.test(id) && !ids.includes(id)) ids.push(id)
    if (ids.length >= MAX_READ) break
  }
  return ids
}
