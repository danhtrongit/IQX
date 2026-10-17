import { useState } from "react"
import { Navigate, NavLink, Outlet, useLocation } from "react-router"
import { BellRing, BookOpen, Copy, CreditCard, History, LayoutDashboard, Menu, Network, Package, ReceiptText, ServerCog, SlidersHorizontal, Users, WalletCards, Webhook, type LucideIcon } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { BrainWaveLogo } from "@/components/brand/brain-wave-logo"
import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { fetchTeamReferralCode, referralKeys, referralOfferLabel } from "@/pages/referral/api"
import { getAdminAccess, isTeamAdminPath, type AdminScope } from "./admin-access"

type NavGroup = { label: string; items: { to: string; label: string; icon: LucideIcon }[] }

const adminGroups: NavGroup[] = [
  { label: "Quản lý", items: [
    { to: "/admin", label: "Tổng quan", icon: LayoutDashboard },
    { to: "/admin/users", label: "Người dùng", icon: Users },
    { to: "/admin/team-leads", label: "Trưởng nhóm", icon: Network },
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

/** Trưởng nhóm chỉ có nhóm Quản lý với Tổng quan và Người dùng (admin spec v1.1 §5.1.1). */
const teamGroups: NavGroup[] = [
  { label: "Quản lý", items: [
    { to: "/admin", label: "Tổng quan", icon: LayoutDashboard },
    { to: "/admin/users", label: "Người dùng", icon: Users },
  ] },
]

const SCOPE_COPY: Record<AdminScope, { title: string; description: string }> = {
  admin: { title: "Quản trị IQX", description: "Người dùng, nội dung, doanh thu và vận hành." },
  team: { title: "Quản trị nhóm", description: "Tổng quan và người dùng trong nhóm của bạn." },
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    toast.success("Đã sao chép mã giới thiệu")
  } catch {
    toast.error("Không sao chép được. Hãy chọn và sao chép thủ công.")
  }
}

/** Ô mã giới thiệu ở cuối menu của trưởng nhóm: mã (tên đăng nhập), % hoa hồng và ưu đãi. */
export function TeamCodeCard() {
  const { user } = useAuth()
  const referral = useQuery({
    queryKey: referralKeys.teamCode(user?.id),
    queryFn: ({ signal }) => fetchTeamReferralCode(signal),
    enabled: !!user,
    staleTime: 60_000,
  })

  return <section aria-label="Mã giới thiệu của bạn" className="mx-3 mb-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
    <p className="text-muted-foreground">Mã giới thiệu của bạn (tên đăng nhập)</p>
    {referral.isPending ? <div role="status" aria-label="Đang tải mã giới thiệu" className="mt-2 space-y-2"><Skeleton className="h-5 w-28" /><Skeleton className="h-6 w-full" /></div>
      : referral.isError ? <div className="mt-2 space-y-2">
        <p className="text-destructive">Không tải được mã giới thiệu.</p>
        <Button type="button" size="xs" variant="outline" onClick={() => void referral.refetch()}>Thử lại</Button>
      </div>
      : <>
        <p className="mt-1 font-mono text-sm font-semibold break-all text-foreground">{referral.data.code}</p>
        <Button type="button" size="xs" variant="outline" className="mt-2 w-full" onClick={() => void copyCode(referral.data.code)}><Copy />Sao chép mã</Button>
        <dl className="mt-3 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">Hoa hồng</dt>
            <dd className="font-medium tabular-nums text-foreground">{referral.data.commissionPct == null ? "—" : `${referral.data.commissionPct}%`}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground">Ưu đãi người dùng mới</dt>
            <dd className="text-right font-medium text-foreground">{referralOfferLabel(referral.data.offerType, referral.data.offerDays)}</dd>
          </div>
        </dl>
      </>}
  </section>
}

function AdminNavigation({ scope, onNavigate }: { scope: AdminScope; onNavigate?: () => void }) {
  const groups = scope === "team" ? teamGroups : adminGroups
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

function NavigationBody({ scope, onNavigate }: { scope: AdminScope; onNavigate?: () => void }) {
  return <>
    <AdminNavigation scope={scope} onNavigate={onNavigate} />
    {scope === "team" && <TeamCodeCard />}
  </>
}

export function AdminLayout() {
  const auth = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const { state: access, scope } = getAdminAccess(auth)
  if (access === "loading") return <WorkspacePage title="Quản trị"><div role="status" aria-label="Đang xác minh quyền truy cập" className="space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-64 w-full" /></div></WorkspacePage>
  if (access === "session-error") return <WorkspacePage title="Quản trị"><PanelState title="Không xác minh được phiên đăng nhập" description={auth.sessionError?.message} action={{ label: "Thử lại", onClick: () => window.location.reload() }} /></WorkspacePage>
  if (access === "unauthenticated") return <WorkspacePage title="Khu vực quản trị"><PanelState title="Đăng nhập để tiếp tục" description="Khu vực này chỉ dành cho tài khoản quản trị và trưởng nhóm IQX. Đường dẫn hiện tại sẽ được giữ sau khi đăng nhập." action={{ label: "Đăng nhập", onClick: () => auth.openAuth() }} /></WorkspacePage>
  if (access === "forbidden" || !scope) return <WorkspacePage title="Không có quyền truy cập" description="Tài khoản hiện tại không có quyền quản trị."><PanelState title="Quyền quản trị là bắt buộc" description="Dữ liệu và thao tác quản trị được kiểm tra quyền trên máy chủ." /><Button asChild variant="outline"><NavLink to="/demo-trading">Trở về Demo Trading</NavLink></Button></WorkspacePage>
  // Trưởng nhóm chỉ vào được Tổng quan và Người dùng; mọi trang khác quay về /admin.
  if (scope === "team" && !isTeamAdminPath(location.pathname)) return <Navigate replace to="/admin" />

  const copy = SCOPE_COPY[scope]
  const displayName = auth.user?.full_name?.trim() || auth.user?.username || auth.user?.email

  return <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex min-h-16 items-center gap-2.5 border-b border-border px-6 font-heading font-semibold">
        <BrainWaveLogo size="xs" aria-hidden="true" />
        <span>{copy.title}</span>
      </div>
      <ScrollArea className="min-h-0 flex-1"><NavigationBody scope={scope} /></ScrollArea>
    </aside>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className={cn("flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3", scope === "admin" && "md:hidden")}>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild><Button variant="ghost" size="sm" className="md:hidden"><Menu />Điều hướng quản trị</Button></SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col p-0">
            <SheetHeader>
              <div className="flex items-center gap-2">
                <BrainWaveLogo size="xs" aria-hidden="true" />
                <SheetTitle>{copy.title}</SheetTitle>
              </div>
              <SheetDescription>{copy.description}</SheetDescription>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1"><NavigationBody scope={scope} onNavigate={() => setMenuOpen(false)} /></ScrollArea>
          </SheetContent>
        </Sheet>
        {scope === "team" && <div className="ml-auto flex min-w-0 items-center gap-2" data-testid="admin-identity">
          <span className="truncate text-sm font-medium">{displayName}</span>
          <Badge variant="secondary">Trưởng nhóm</Badge>
        </div>}
      </div>
      <Outlet />
    </div>
  </div>
}
