/**
 * Lớp dữ liệu của màn quản trị "Bản tin cuối phiên" (NỘI DUNG). Chỉ quản trị viên; mọi request đi
 * qua `requestOperation`. Kiểu lấy thẳng từ contract sinh (giữ snake_case của máy chủ).
 *
 * Máy chủ là nơi kiểm tra và dựng PDF: client chỉ gửi nhận định, mức giá và lệnh Public/Gỡ, rồi
 * hiển thị lại kết quả kiểm tra (`checks`) và trang xem trước (SVG) mà máy chủ trả về.
 */
import { requestOperation } from "@/lib/contract-client"
import type { ApiResponseFor } from "@/lib/contract-types"

export type AdminBulletinList = ApiResponseFor<"GET /api/v2/admin/market-bulletins">
export type AdminBulletinRow = AdminBulletinList["items"][number]
export type AdminBulletinStatus = AdminBulletinRow["status"]

export type AdminBulletinDetail = ApiResponseFor<"GET /api/v2/admin/market-bulletins/{date}">
export type AdminBulletinContent = AdminBulletinDetail["content"]
export type AdminBulletinLevels = AdminBulletinContent["levels"]
export type AdminBulletinMetrics = NonNullable<AdminBulletinDetail["metrics"]>
export type AdminBulletinSuggestion = AdminBulletinDetail["suggestions"][number]
export type AdminBulletinSlot = AdminBulletinDetail["slots"][number]
export type AdminBulletinChecks = AdminBulletinDetail["checks"]
export type AdminBulletinCheck = AdminBulletinChecks["items"][number]

export type AdminBulletinPreview = ApiResponseFor<"POST /api/v2/admin/market-bulletins/{date}/preview">
export type PreviewVariant = AdminBulletinPreview["variant"]

export type LevelKey = keyof AdminBulletinLevels
export type CommentKey = "trend" | "momentum" | "liquidity"

export function fetchAdminBulletins(signal?: AbortSignal): Promise<AdminBulletinList> {
  return requestOperation("GET /api/v2/admin/market-bulletins", {}, { signal })
}

export function fetchAdminBulletin(date: string, signal?: AbortSignal): Promise<AdminBulletinDetail> {
  return requestOperation("GET /api/v2/admin/market-bulletins/{date}", { path: { date } }, { signal })
}

/** Lưu nhận định và các mức giá; máy chủ trả lại chi tiết kèm kết quả kiểm tra mới. */
export function saveAdminBulletinContent(date: string, content: AdminBulletinContent): Promise<AdminBulletinDetail> {
  return requestOperation("PUT /api/v2/admin/market-bulletins/{date}/content", { path: { date }, body: content })
}

/** Xem trước các trang của một bản; `content` là nội dung đang gõ, chưa cần lưu. */
export function previewAdminBulletin(
  date: string,
  variant: PreviewVariant,
  content: AdminBulletinContent,
  signal?: AbortSignal,
): Promise<AdminBulletinPreview> {
  return requestOperation(
    "POST /api/v2/admin/market-bulletins/{date}/preview",
    { path: { date }, body: { variant, content } },
    { signal },
  )
}

/** Public lần đầu hoặc Public lại bản đã sửa: máy chủ kiểm lại toàn bộ rồi dựng cả hai PDF. */
export function publishAdminBulletin(date: string): Promise<AdminBulletinDetail> {
  return requestOperation("POST /api/v2/admin/market-bulletins/{date}/publish", { path: { date } })
}

export function unpublishAdminBulletin(date: string): Promise<AdminBulletinDetail> {
  return requestOperation("POST /api/v2/admin/market-bulletins/{date}/unpublish", { path: { date } })
}
