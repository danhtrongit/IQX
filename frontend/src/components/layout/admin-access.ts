export type AdminAccessState = "loading" | "session-error" | "unauthenticated" | "forbidden" | "authorized"

/**
 * Phạm vi của trang quản trị (admin spec v1.1 §1.4): `admin` thấy toàn bộ, `team` là bản
 * thu gọn của trưởng nhóm (Tổng quan và Người dùng của nhóm mình), `saco` là tài khoản
 * thường đang là SACO (chỉ Bài của tôi và trình soạn bài nhận định).
 */
export type AdminScope = "admin" | "team" | "saco"

export type AdminAccess = { state: AdminAccessState; scope: AdminScope | null }

/** Trạng thái SACO của tài khoản (từ `GET /trading-floor/me`), chỉ hỏi khi vai trò không phải admin hay trưởng nhóm. */
export type SacoAccess = { pending: boolean; active: boolean }

export function adminScopeForRole(role: string | null | undefined): AdminScope | null {
  if (role === "admin") return "admin"
  if (role === "team_lead") return "team"
  return null
}

/** Cổng điều hướng của `/admin`. Đây chỉ là an toàn điều hướng; máy chủ vẫn kiểm tra quyền. */
export function getAdminAccess(
  auth: {
    isLoading: boolean
    sessionError: unknown
    user: { role?: string } | null | undefined
  },
  saco?: SacoAccess,
): AdminAccess {
  if (auth.isLoading) return { state: "loading", scope: null }
  if (auth.sessionError) return { state: "session-error", scope: null }
  if (!auth.user) return { state: "unauthenticated", scope: null }
  const scope = adminScopeForRole(auth.user.role)
  if (scope) return { state: "authorized", scope }
  if (saco?.pending) return { state: "loading", scope: null }
  if (saco?.active) return { state: "authorized", scope: "saco" }
  return { state: "forbidden", scope: null }
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/"
}

/** Trang đầu của từng phạm vi; mọi đường dẫn ngoài danh sách cho phép quay về đây. */
export function adminHomePath(scope: AdminScope): string {
  return scope === "saco" ? "/admin/saco/posts" : "/admin"
}

/**
 * Trưởng nhóm dùng chung URL với quản trị viên cho Tổng quan (`/admin`), danh sách người
 * dùng (`/admin/users`), chi tiết người dùng (`/admin/users/:id`) và Quản lý SACO
 * (`/admin/saco`). Mọi đường dẫn khác dưới `/admin` đưa trưởng nhóm về `/admin`.
 */
export function isTeamAdminPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  if (path === "/admin" || path === "/admin/users" || path === "/admin/saco") return true
  return /^\/admin\/users\/[^/]+$/.test(path)
}

/** SACO chỉ vào Bài của tôi (`/admin/saco/posts`), Viết bài mới và trang soạn/xem một bài. */
export function isSacoAdminPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  if (path === "/admin/saco/posts") return true
  return /^\/admin\/saco\/posts\/[^/]+$/.test(path)
}
