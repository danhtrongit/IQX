/**
 * Khu quản trị giao dịch ảo (Sân tập) — xuất cho bộ định tuyến của `/admin`.
 *
 * Đường dẫn do shell quản trị đăng ký:
 * - `/admin/vt/accounts`          → `VTAccountsPage`
 * - `/admin/vt/accounts/:accountId` → `VTAccountDetailPage`
 * - `/admin/vt/config`            → `VTConfigPage`
 *
 * Kèm theo là adapter API (`api.ts`), hook React Query (`hooks.ts`), bảng nhãn
 * tiếng Việt (`labels.ts`) và định dạng riêng của khu vực (`format.ts`).
 */
export { VTAccountsPage } from "./vt-accounts-page"
export { VTAccountDetailPage } from "./vt-account-detail-page"
export { VTConfigPage } from "./vt-config-page"

export * from "./api"
export * from "./hooks"
export * from "./labels"
