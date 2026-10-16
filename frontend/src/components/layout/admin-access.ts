export type AdminAccessState = "loading" | "session-error" | "unauthenticated" | "forbidden" | "authorized"

/**
 * Phạm vi của trang quản trị (admin spec v1.1 §1.4): `admin` thấy toàn bộ, `team` là bản
 * thu gọn của trưởng nhóm (Tổng quan và Người dùng của nhóm mình).
 */
export type AdminScope = "admin" | "team"

export type AdminAccess = { state: AdminAccessState; scope: AdminScope | null }

export function adminScopeForRole(role: string | null | undefined): AdminScope | null {
  if (role === "admin") return "admin"
  if (role === "team_lead") return "team"
  return null
}

/** Cổng điều hướng của `/admin`. Đây chỉ là an toàn điều hướng; máy chủ vẫn kiểm tra quyền. */
export function getAdminAccess(auth: {
  isLoading: boolean
  sessionError: unknown
  user: { role?: string } | null | undefined
}): AdminAccess {
  if (auth.isLoading) return { state: "loading", scope: null }
  if (auth.sessionError) return { state: "session-error", scope: null }
  if (!auth.user) return { state: "unauthenticated", scope: null }
  const scope = adminScopeForRole(auth.user.role)
  return scope ? { state: "authorized", scope } : { state: "forbidden", scope: null }
}

/**
 * Trưởng nhóm dùng chung URL với quản trị viên cho Tổng quan (`/admin`), danh sách người
 * dùng (`/admin/users`) và chi tiết người dùng (`/admin/users/:id`). Mọi đường dẫn khác
 * dưới `/admin` đưa trưởng nhóm về `/admin`.
 */
export function isTeamAdminPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/"
  if (path === "/admin" || path === "/admin/users") return true
  return /^\/admin\/users\/[^/]+$/.test(path)
}
