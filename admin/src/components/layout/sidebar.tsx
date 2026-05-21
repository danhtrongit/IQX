import { useState } from "react"
import { NavLink } from "react-router"
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Package,
  ScrollText,
  Webhook,
  TrendingUp,
  Settings,
  FileBarChart2,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

interface NavGroup {
  label: string
  icon: React.ElementType
  items: NavItem[]
}

const topNavItems: NavItem[] = [
  { label: "Tổng quan", href: "/", icon: LayoutDashboard },
  { label: "Người dùng", href: "/users", icon: Users },
]

const navGroups: NavGroup[] = [
  {
    label: "Premium",
    icon: CreditCard,
    items: [
      { label: "Gói", href: "/plans", icon: Package },
      { label: "Thuê bao", href: "/subscriptions", icon: ScrollText },
      { label: "Thanh toán", href: "/payments", icon: CreditCard },
      { label: "IPN Logs", href: "/ipn", icon: Webhook },
    ],
  },
  {
    label: "Giao dịch ảo",
    icon: TrendingUp,
    items: [
      { label: "Tài khoản", href: "/vt/accounts", icon: Users },
      { label: "Cấu hình", href: "/vt/config", icon: Settings },
    ],
  },
]

const bottomNavItems: NavItem[] = [
  { label: "Audit Log", href: "/audit", icon: FileBarChart2 },
  { label: "System", href: "/system", icon: Settings },
]

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.href}
      end={item.href === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )
      }
    >
      <item.icon className="size-4 shrink-0" />
      {item.label}
    </NavLink>
  )
}

function CollapsibleGroup({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
      >
        <group.icon className="size-4 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        {open ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
      </button>
      {open && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
          {group.items.map((item) => (
            <NavItemLink key={item.href} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col bg-sidebar border-r border-sidebar-border">
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {/* Top nav items */}
        {topNavItems.map((item) => (
          <NavItemLink key={item.href} item={item} />
        ))}

        <div className="my-2 border-t border-sidebar-border" />

        {/* Collapsible groups */}
        <div className="space-y-0.5">
          {navGroups.map((group) => (
            <CollapsibleGroup key={group.label} group={group} />
          ))}
        </div>

        <div className="my-2 border-t border-sidebar-border" />

        {/* Bottom nav items */}
        {bottomNavItems.map((item) => (
          <NavItemLink key={item.href} item={item} />
        ))}
      </div>
    </aside>
  )
}
