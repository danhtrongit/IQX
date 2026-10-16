import type { ComponentType } from "react"

import { useAuth } from "@/hooks/use-auth"

import { adminScopeForRole } from "./admin-access"

/**
 * Chọn bản trang theo phạm vi của người xem (admin spec v1.1 §5.1): `/admin`,
 * `/admin/users` và `/admin/users/:userId` dùng chung URL nhưng trưởng nhóm nhận bản
 * `team/*`, không bao giờ gọi `admin/*`. `AdminLayout` đã chặn mọi vai trò khác.
 */
export function AdminScopeRoute({ admin: Admin, team: Team }: { admin: ComponentType; team: ComponentType }) {
  const { user } = useAuth()
  const scope = adminScopeForRole(user?.role)
  if (scope === "team") return <Team />
  if (scope === "admin") return <Admin />
  return null
}
