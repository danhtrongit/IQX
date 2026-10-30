/**
 * Chỉ báo đã chọn của Flashback v2 chỉ nằm ở trình duyệt (server v2 không lưu chỉ báo), nên người
 * chơi giữ nguyên bộ chỉ báo giữa các ván. Đọc và ghi đều bọc try/catch vì trình duyệt có thể chặn
 * localStorage; không đọc được thì bắt đầu với biểu đồ trống.
 */
import type { FlashbackIndicatorParams, FlashbackIndicatorParamValue } from "./flashback-api"
import type { LocalIndicator } from "./flashback-context"

const STORAGE_KEY = "iqx.flashback.indicators.v2"
/** Trần số instance để một giá trị lạ trong localStorage không làm biểu đồ nặng. */
const MAX_INDICATORS = 12

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function paramValue(value: unknown): FlashbackIndicatorParamValue | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (isRecord(value) && typeof value.lower === "number" && typeof value.upper === "number") {
    return Number.isFinite(value.lower) && Number.isFinite(value.upper) ? { lower: value.lower, upper: value.upper } : null
  }
  return null
}

/** Danh sách đã lưu, đã kiểm tra hình dạng; bản ghi hỏng bị bỏ qua. */
export function loadStoredIndicators(): LocalIndicator[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const list: LocalIndicator[] = []
    for (const item of parsed) {
      if (list.length >= MAX_INDICATORS) break
      if (!isRecord(item) || typeof item.id !== "string" || !isRecord(item.params)) continue
      const params: FlashbackIndicatorParams = {}
      let valid = true
      for (const [key, value] of Object.entries(item.params)) {
        const next = paramValue(value)
        if (next === null) {
          valid = false
          break
        }
        params[key] = next
      }
      if (valid) list.push({ key: `s${list.length}`, id: item.id, params })
    }
    return list
  } catch {
    return []
  }
}

export function saveStoredIndicators(list: readonly LocalIndicator[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.map((item) => ({ id: item.id, params: item.params }))))
  } catch {
    // Trình duyệt chặn localStorage: bộ chỉ báo chỉ giữ trong phiên này.
  }
}
