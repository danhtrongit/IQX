import type { ReactNode } from "react"
import { Link } from "react-router"
import { LoaderCircle, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"

/** Premium plan page (legacy `/nang-cap`). */
export const PREMIUM_UPGRADE_PATH = "/nang-cap"

interface PremiumGateProps {
  featureName: string
  description?: string
  children: ReactNode
}

/**
 * Wraps premium-only content: a spinner while the subscription status loads,
 * the children for premium users, otherwise the children blurred behind a
 * locked overlay. The server still authorizes every premium request — this is
 * presentation only.
 */
export function PremiumGate({ featureName, description, children }: PremiumGateProps) {
  const { isPremium, premiumLoading, isAuthenticated, openAuth } = useAuth()

  if (premiumLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }

  if (isPremium) return <>{children}</>

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div aria-hidden className="pointer-events-none blur-sm opacity-40">
        {children}
      </div>
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-4 backdrop-blur-md">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-lg bg-card p-5 text-center shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/12">
            <Lock className="size-5 text-primary" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold">
              {isAuthenticated ? "Tính năng dành cho Premium" : "Đăng nhập để sử dụng tính năng này"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{featureName}</span>
              {description ? ` — ${description}` : ""}
            </p>
          </div>
          {isAuthenticated ? (
            <Button asChild className="w-full">
              <Link to={PREMIUM_UPGRADE_PATH}>Nâng cấp ngay</Link>
            </Button>
          ) : (
            <div className="flex w-full gap-2">
              <Button className="flex-1" onClick={() => openAuth("login")}>
                Đăng nhập
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => openAuth("register")}>
                Đăng ký
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
