/**
 * Admin core surface — the routes Main registers:
 *
 *   /admin                 → AdminDashboardPage
 *   /admin/users           → UsersPage
 *   /admin/users/:userId   → UserDetailPage
 *   /admin/system          → SystemPage
 *   /admin/audit           → AuditPage
 *   /admin/alerts          → AlertSignalsPage
 *
 * Everything below the page exports is reusable by the other `/admin/**`
 * surfaces (tables, badges, confirmation gate, Vietnamese labels, adapters and
 * query hooks). All of it goes through the shared `api()` client; there is no
 * admin-local session, storage or HTTP client.
 */
export { AdminDashboardPage } from "./dashboard-page"
export { UsersPage } from "./users-page"
export { UserDetailPage } from "./user-detail-page"
export { SystemPage } from "./system-page"
export { AuditPage } from "./audit-page"
export { AlertSignalsPage } from "./alerts-page"

export {
  AdminDataTable,
  type AdminColumn,
  type AdminPagination,
  type AdminSelection,
  type AdminSort,
} from "./components/admin-data-table"
export { ConfirmDialog, type ConfirmRequest } from "./components/confirm-dialog"
export { useConfirmDialog } from "./components/use-confirm-dialog"
export { DetailList } from "./components/detail-list"
export { JsonView } from "./components/json-view"
export { KpiTile } from "./components/kpi-tile"
export { SoftDeleteUserDialog } from "./components/soft-delete-user-dialog"
export { StatusBadge } from "./components/status-badge"
export { UserAccessDialog, type AccessMode } from "./components/user-access-dialog"
export { UserProfileDialog } from "./components/user-profile-dialog"

export * from "./api"
export * from "./format"
export * from "./hooks"
export * from "./labels"
