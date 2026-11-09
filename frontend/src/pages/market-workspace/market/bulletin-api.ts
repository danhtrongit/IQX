/**
 * Lớp dữ liệu công khai của Bản tin thị trường: bản tin mới nhất, theo ngày, lưu 6 tháng và
 * bảng theo dõi. Kiểu lấy thẳng từ contract sinh (giữ snake_case của máy chủ).
 */
import { API_BASE } from "@/lib/api"
import { requestOperation } from "@/lib/contract-client"
import type { ApiResponseFor } from "@/lib/contract-types"

export type LatestBulletinResponse = ApiResponseFor<"GET /api/v2/market/bulletins/latest">
export type PublicBulletin = NonNullable<LatestBulletinResponse["bulletin"]>
export type BulletinFile = PublicBulletin["files"][number]
export type BulletinVariant = BulletinFile["variant"]

export type BulletinArchiveResponse = ApiResponseFor<"GET /api/v2/market/bulletins/archive">

export type TrackingResponse = ApiResponseFor<"GET /api/v2/market/tracking">
export type TrackingItem = TrackingResponse["items"][number]
export type TrackingSummary = TrackingResponse["summary"]

/** Bộ lọc 1, 2, 3 của bản tin; `null` là tất cả. */
export type TrackingSlot = 1 | 2 | 3

export function fetchLatestBulletin(signal?: AbortSignal): Promise<LatestBulletinResponse> {
  return requestOperation("GET /api/v2/market/bulletins/latest", {}, { signal })
}

/** Bản tin một ngày; ngày chưa Public trả 404. */
export function fetchBulletinByDate(date: string, signal?: AbortSignal): Promise<LatestBulletinResponse> {
  return requestOperation("GET /api/v2/market/bulletins", { query: { date } }, { signal })
}

export function fetchBulletinArchive(page: number, signal?: AbortSignal): Promise<BulletinArchiveResponse> {
  return requestOperation("GET /api/v2/market/bulletins/archive", { query: { page } }, { signal })
}

export function fetchTracking(slot: TrackingSlot | null, signal?: AbortSignal): Promise<TrackingResponse> {
  return requestOperation("GET /api/v2/market/tracking", { query: slot === null ? {} : { slot } }, { signal })
}

/** Chọn file theo thiết bị; thiếu bản đúng thiết bị thì dùng bản còn lại. */
export function pickBulletinFile(bulletin: PublicBulletin, variant: BulletinVariant): BulletinFile | null {
  return bulletin.files.find((file) => file.variant === variant) ?? bulletin.files[0] ?? null
}

/**
 * Đường dẫn file PDF theo cấu hình `API_BASE`: máy chủ trả `/api/v2/...`, còn bản dựng có thể
 * trỏ API sang origin khác. Tải về đi qua cùng đường dẫn với `?download=1`.
 */
export function bulletinFileHref(path: string): string {
  const relative = path.replace(/^\/api\/v2/, "")
  return `${API_BASE}${relative}`
}
