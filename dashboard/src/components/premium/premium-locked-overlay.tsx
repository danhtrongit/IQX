import { useNavigate } from "react-router"
import { Lock, Crown, LogIn, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"

interface PremiumLockedOverlayProps {
  featureName: string
  description?: string
}

export function PremiumLockedOverlay({ featureName, description }: PremiumLockedOverlayProps) {
  const navigate = useNavigate()
  const { isAuthenticated, setShowAuthModal, setAuthModalTab } = useAuth()

  const openAuth = (tab: "login" | "register") => {
    setAuthModalTab(tab)
    setShowAuthModal(true)
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4 backdrop-blur-md bg-background/70">
      <div className="max-w-sm w-full rounded-xl border border-border bg-card/95 shadow-2xl p-5 flex flex-col items-center text-center gap-3">
        <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="size-6 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {isAuthenticated
              ? "Tính năng dành cho Premium"
              : "Đăng nhập để sử dụng tính năng này"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-medium text-foreground">{featureName}</span>
            {description ? ` — ${description}` : ""}
          </p>
        </div>
        {isAuthenticated ? (
          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={() => navigate("/nang-cap")}
          >
            <Crown className="size-3.5" />
            Nâng cấp ngay
          </Button>
        ) : (
          <div className="w-full grid grid-cols-2 gap-2">
            <Button
              size="sm"
              className="w-full gap-1.5"
              onClick={() => openAuth("login")}
            >
              <LogIn className="size-3.5" />
              Đăng nhập
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5"
              onClick={() => openAuth("register")}
            >
              <UserPlus className="size-3.5" />
              Đăng ký
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
