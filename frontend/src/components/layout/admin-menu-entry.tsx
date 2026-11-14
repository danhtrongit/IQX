import { ShieldCheck } from "lucide-react"
import { Link } from "react-router"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

import { adminHomePath, adminScopeForRole } from "./admin-access"
import { useSacoSelf } from "./admin-saco"

/**
 * Mục "Quản trị" trong menu tài khoản: quản trị viên, trưởng nhóm và tài khoản đang là SACO.
 * Chỉ gắn vào nội dung menu đã mở, nên câu hỏi SACO chỉ chạy khi người dùng mở menu.
 */
export function AdminMenuEntry({ role }: { role: string | null | undefined }) {
  const roleScope = adminScopeForRole(role)
  const saco = useSacoSelf(!roleScope)
  if (roleScope) {
    return <DropdownMenuItem asChild><Link to="/admin"><ShieldCheck />{roleScope === "team" ? "Quản trị nhóm" : "Quản trị"}</Link></DropdownMenuItem>
  }
  if (!saco.data?.saco?.active) return null
  return <DropdownMenuItem asChild><Link to={adminHomePath("saco")}><ShieldCheck />Quản trị SACO</Link></DropdownMenuItem>
}
