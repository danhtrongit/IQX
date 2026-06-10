import { useNavigate } from "react-router"
import { Button, Space } from "@arco-design/web-react"
import { IconLock, IconTrophy, IconUser, IconUserAdd } from "@arco-design/web-react/icon"
import { useAuth } from "@/features/auth"
import { useSidebar } from "@/shared/contexts/sidebar-context"

interface PremiumLockedOverlayProps {
  featureName: string
  description?: string
  onAuthRequested?: () => void
}

export function PremiumLockedOverlay({
  featureName,
  description,
  onAuthRequested,
}: PremiumLockedOverlayProps) {
  const navigate = useNavigate()
  const { isAuthenticated, setShowAuthModal, setAuthModalTab } = useAuth()
  const { setIsOpen: setSidebarOpen } = useSidebar()

  const openAuth = (tab: "login" | "register") => {
    setSidebarOpen(false)
    onAuthRequested?.()
    setAuthModalTab(tab)
    setShowAuthModal(true)
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4 backdrop-blur-md bg-[var(--color-bg-1)]/70">
      <div
        className="w-full max-w-sm rounded-xl border p-5 flex flex-col items-center text-center gap-3 shadow-2xl"
        style={{
          borderColor: "var(--color-border-2)",
          background: "var(--color-bg-2)",
        }}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: 48, height: 48, background: "rgb(var(--primary-1))" }}
        >
          <IconLock style={{ fontSize: 24, color: "rgb(var(--primary-6))" }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text-1)" }}>
            {isAuthenticated
              ? "Tính năng dành cho Premium"
              : "Đăng nhập để sử dụng tính năng này"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--color-text-3)" }}>
            <span className="font-medium" style={{ color: "var(--color-text-1)" }}>
              {featureName}
            </span>
            {description ? ` — ${description}` : ""}
          </p>
        </div>
        {isAuthenticated ? (
          <Button
            long
            type="primary"
            icon={<IconTrophy />}
            onClick={() => navigate("/nang-cap")}
          >
            Nâng cấp ngay
          </Button>
        ) : (
          <Space style={{ width: "100%" }}>
            <Button type="primary" icon={<IconUser />} onClick={() => openAuth("login")}>
              Đăng nhập
            </Button>
            <Button icon={<IconUserAdd />} onClick={() => openAuth("register")}>
              Đăng ký
            </Button>
          </Space>
        )}
      </div>
    </div>
  )
}
