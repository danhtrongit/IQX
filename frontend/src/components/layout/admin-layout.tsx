import { useState } from "react"
import { NavLink, Outlet } from "react-router"
import { BellRing, BookOpen, CreditCard, History, LayoutDashboard, Menu, Package, ReceiptText, ServerCog, ShieldCheck, SlidersHorizontal, Users, WalletCards, Webhook } from "lucide-react"
import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { getAdminAccessState } from "./admin-access"

const groups = [
  { label: "Quản lý", items: [
    { to: "/admin", label: "Tổng quan", icon: LayoutDashboard },
    { to: "/admin/users", label: "Người dùng", icon: Users },
    { to: "/admin/lessons", label: "Khoá học", icon: BookOpen },
    { to: "/admin/alerts", label: "Tín hiệu cảnh báo", icon: BellRing },
  ] },
  { label: "Doanh thu", items: [
    { to: "/admin/plans", label: "Gói Premium", icon: Package },
    { to: "/admin/subscriptions", label: "Thuê bao", icon: CreditCard },
    { to: "/admin/payments", label: "Thanh toán", icon: ReceiptText },
    { to: "/admin/ipn", label: "Nhật ký IPN", icon: Webhook },
  ] },
  { label: "Giao dịch mô phỏng", items: [
    { to: "/admin/vt/accounts", label: "Tài khoản giao dịch", icon: WalletCards },
    { to: "/admin/vt/config", label: "Cấu hình giao dịch", icon: SlidersHorizontal },
  ] },
  { label: "Vận hành", items: [
    { to: "/admin/audit", label: "Nhật ký kiểm toán", icon: History },
    { to: "/admin/system", label: "Hệ thống", icon: ServerCog },
  ] },
]

function AdminNavigation({ onNavigate }: { onNavigate?: () => void }) {
  return <nav aria-label="Điều hướng quản trị" className="space-y-5 p-3">
    {groups.map(group => <div key={group.label}>
      <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">{group.label}</p>
      <ul className="space-y-1">
        {group.items.map(({ to, label, icon: Icon }) => <li key={to}>
          <NavLink to={to} end={to === "/admin"} onClick={onNavigate} className={({ isActive }) => cn("flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring", isActive ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:text-foreground")}>
            <Icon aria-hidden="true" className="size-4 shrink-0" />{label}
          </NavLink>
        </li>)}
      </ul>
    </div>)}
  </nav>
}

export function AdminLayout() {
  const auth = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const access = getAdminAccessState(auth)
  if (access === "loading") return <WorkspacePage title="Quản trị"><div role="status" aria-label="Đang xác minh quyền truy cập" className="space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-64 w-full" /></div></WorkspacePage>
  if (access === "session-error") return <WorkspacePage title="Quản trị"><PanelState title="Không xác minh được phiên đăng nhập" description={auth.sessionError?.message} action={{ label: "Thử lại", onClick: () => window.location.reload() }} /></WorkspacePage>
  if (access === "unauthenticated") return <WorkspacePage title="Khu vực quản trị"><PanelState title="Đăng nhập để tiếp tục" description="Khu vực này chỉ dành cho tài khoản quản trị IQX. Đường dẫn hiện tại sẽ được giữ sau khi đăng nhập." action={{ label: "Đăng nhập", onClick: () => auth.openAuth() }} /></WorkspacePage>
  if (access === "forbidden") return <WorkspacePage title="Không có quyền truy cập" description="Tài khoản hiện tại không có quyền quản trị."><PanelState title="Quyền quản trị là bắt buộc" description="Dữ liệu và thao tác quản trị được kiểm tra quyền trên máy chủ." /><Button asChild variant="outline"><NavLink to="/demo-trading">Trở về Demo Trading</NavLink></Button></WorkspacePage>

  return <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex min-h-16 items-center gap-2 border-b border-border px-6 font-heading font-semibold"><ShieldCheck className="size-4 text-primary" />Quản trị IQX</div>
      <ScrollArea className="min-h-0 flex-1"><AdminNavigation /></ScrollArea>
    </aside>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-border bg-card px-3 md:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild><Button variant="ghost" size="sm"><Menu />Điều hướng quản trị</Button></SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col p-0">
            <SheetHeader><SheetTitle>Quản trị IQX</SheetTitle><SheetDescription>Người dùng, nội dung, doanh thu và vận hành.</SheetDescription></SheetHeader>
            <ScrollArea className="min-h-0 flex-1"><AdminNavigation onNavigate={() => setMenuOpen(false)} /></ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
      <Outlet />
    </div>
  </div>
}
