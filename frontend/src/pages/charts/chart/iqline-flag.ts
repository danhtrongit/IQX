/**
 * Công tắc IQLine cho cả bốn nơi dùng (docs/iqline-design.md GĐ 7). Mặc định bật. Quay lại bản cũ theo từng nơi bằng
 * `VITE_IQLINE_OFF` lúc build, ví dụ `market,flashback,static`, hoặc `?iqline=0` cho riêng một lượt xem khi cần so sánh.
 * `?iqline=1` luôn bật. Không nơi nào khác được tự đọc URL hay biến môi trường này.
 */
export type IQLinePlace = "market" | "flashback" | "static"

function offPlaces(): readonly string[] {
  const raw: unknown = import.meta.env.VITE_IQLINE_OFF
  return typeof raw === "string" ? raw.split(",").map((place) => place.trim()) : []
}

export function iqlineEnabled(place: IQLinePlace, params: Pick<URLSearchParams, "get">, off: readonly string[] = offPlaces()): boolean {
  const override = params.get("iqline")
  if (override === "0") return false
  if (override === "1") return true
  return !off.includes(place)
}

export function iqlineMarketEnabled(params: Pick<URLSearchParams, "get">): boolean {
  return iqlineEnabled("market", params)
}
