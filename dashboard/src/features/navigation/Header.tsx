import { useLocation, useNavigate } from "react-router"
import {
  Avatar,
  Badge,
  Button,
  Divider,
  Dropdown,
  Menu,
  Tooltip,
} from "@arco-design/web-react"
import {
  IconDown,
  IconMenu,
  IconMoonFill,
  IconPoweroff,
  IconSunFill,
} from "@arco-design/web-react/icon"
import { useAuth } from "@/features/auth"
import { usePremiumStatus } from "@/features/premium"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { SymbolSearch } from "./SymbolSearch"
import { IconCrown } from "./icons"

const NAV_ITEMS = [
  { label: "Trang chủ", href: "/" },
  { label: "Thị trường", href: "/thi-truong" },
  { label: "Cổ phiếu", href: "/co-phieu" },
  { label: "Kiến thức", href: "/bai-hoc" },
  { label: "Giới thiệu", href: "/gioi-thieu" },
]

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].substring(0, 2).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

function getTierLabel(role: string): string {
  switch (role) {
    case "premium":
      return "Premium"
    case "admin":
      return "Admin"
    default:
      return "Free"
  }
}

export function Header() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { theme, toggleTheme } = useTheme()
  const { user, isAuthenticated, logout, setShowAuthModal, setAuthModalTab } = useAuth()
  const { isPremium, isTrial } = usePremiumStatus()

  const openAuth = (tab: "login" | "register") => {
    setAuthModalTab(tab)
    setShowAuthModal(true)
  }

  return (
    <div className="flex h-11 items-center gap-1.5 px-2">
      {/* Brand */}
      <button
        type="button"
        onClick={() => navigate("/")}
        className="flex shrink-0 items-center gap-1.5 px-2 text-base font-bold tracking-tight"
      >
        <span
          className="flex size-6 items-center justify-center rounded-md text-xs font-black text-white"
          style={{ background: "rgb(var(--primary-6))" }}
        >
          IQ
        </span>
        <span>
          IQX
          <span style={{ color: "rgb(var(--primary-6))" }}>.</span>
        </span>
      </button>

      <Divider type="vertical" className="!mx-1 !h-5" />

      {/* Mobile nav */}
      <div className="md:hidden">
        <Dropdown
          position="bl"
          droplist={
            <Menu onClickMenuItem={(href) => navigate(href)} selectedKeys={[pathname]}>
              {NAV_ITEMS.map((item) => (
                <Menu.Item key={item.href}>{item.label}</Menu.Item>
              ))}
            </Menu>
          }
        >
          <Button type="text" size="small" icon={<IconMenu />} aria-label="Menu" />
        </Dropdown>
      </div>

      {/* Desktop nav */}
      <nav className="hidden items-center gap-0.5 md:flex">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => navigate(item.href)}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              style={
                active
                  ? { background: "var(--color-primary-light-1)", color: "rgb(var(--primary-6))" }
                  : { color: "var(--color-text-2)" }
              }
            >
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="flex-1" />

      {/* Global search */}
      <SymbolSearch />

      <Divider type="vertical" className="!mx-1 !h-5" />

      {/* Theme toggle */}
      <Tooltip content={theme === "dark" ? "Chế độ sáng" : "Chế độ tối"}>
        <Button
          type="text"
          shape="circle"
          size="small"
          aria-label="Đổi giao diện"
          icon={theme === "dark" ? <IconSunFill /> : <IconMoonFill />}
          onClick={toggleTheme}
        />
      </Tooltip>

      <Divider type="vertical" className="!mx-1 !h-5" />

      {/* Auth / user */}
      {isAuthenticated && user ? (
        <div className="flex items-center gap-1">
          {user.role === "user" && !isPremium && (
            <Button
              size="small"
              type="primary"
              status="warning"
              icon={<IconCrown />}
              onClick={() => navigate("/nang-cap")}
            >
              <span className="hidden lg:inline">Nâng cấp Premium</span>
              <span className="lg:hidden">Premium</span>
            </Button>
          )}
          <Dropdown
            position="br"
            droplist={
              <Menu style={{ minWidth: 200 }}>
                <Menu.Item key="__info" disabled style={{ height: "auto", cursor: "default" }}>
                  <div className="py-1">
                    <p className="truncate text-xs font-medium text-[var(--color-text-1)]">
                      {user.fullName || "Chưa đặt tên"}
                    </p>
                    <p className="truncate text-[10px] text-[var(--color-text-3)]">
                      {user.email}
                    </p>
                  </div>
                </Menu.Item>
                <Divider className="!my-1" />
                <Menu.Item key="settings" onClick={() => navigate("/cai-dat")}>
                  Cài đặt
                </Menu.Item>
                <Menu.Item key="premium" onClick={() => navigate("/nang-cap")}>
                  <span className="flex items-center gap-2">
                    <IconCrown style={{ color: "rgb(var(--orange-6))" }} />
                    Nâng cấp
                    <Badge
                      className="ml-auto"
                      text={getTierLabel(user.role)}
                      status={user.role === "user" ? "default" : "success"}
                    />
                  </span>
                </Menu.Item>
                <Divider className="!my-1" />
                <Menu.Item key="logout" onClick={() => logout()}>
                  <span className="flex items-center gap-2" style={{ color: "rgb(var(--red-6))" }}>
                    <IconPoweroff />
                    Đăng xuất
                  </span>
                </Menu.Item>
              </Menu>
            }
          >
            <Button type="text" size="small" className="!px-1.5">
              <span className="flex items-center gap-1.5">
                <Avatar size={20} style={{ background: "var(--color-primary-light-1)" }}>
                  <span className="text-[10px] font-bold" style={{ color: "rgb(var(--primary-6))" }}>
                    {getInitials(user.fullName, user.email)}
                  </span>
                </Avatar>
                <span className="max-w-20 truncate text-xs font-medium">
                  {user.fullName || user.email.split("@")[0]}
                </span>
                {isTrial && (
                  <Badge dot color="orange" />
                )}
                <IconDown className="text-[var(--color-text-3)]" />
              </span>
            </Button>
          </Dropdown>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            size="small"
            type="primary"
            status="warning"
            icon={<IconCrown />}
            onClick={() => navigate("/nang-cap")}
          >
            Premium
          </Button>
          <Button size="small" type="text" onClick={() => openAuth("login")}>
            Đăng nhập
          </Button>
          <Button size="small" type="primary" onClick={() => openAuth("register")}>
            Đăng ký
          </Button>
        </div>
      )}
    </div>
  )
}
