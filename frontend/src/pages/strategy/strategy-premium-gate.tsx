/**
 * Cổng truy cập của `/chien-luoc` — cả hai tab (Cảnh báo, Backtest) đều là tính
 * năng Premium, đúng như `PremiumGate` bao ngoài `StrategyPage` ở bản dashboard cũ.
 *
 * Bản cũ vẫn render nội dung mờ cho người chưa mua gói; ở đây nội dung Premium
 * KHÔNG được render (mọi endpoint đều premium-gated ở server, gọi khi chưa đủ
 * quyền chỉ tổ nhận 403), thay bằng thông báo rõ ràng và nút đăng nhập.
 */
import type { ReactNode } from "react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"

import { PanelState } from "@/components/layout/panel-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"

export function StrategyPremiumGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isPremium, premiumLoading, isLoading, openAuth } = useAuth()

  if (isLoading || (isAuthenticated && premiumLoading)) {
    return (
      <div className="mx-auto w-full max-w-[960px] space-y-3 p-4 sm:p-6">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-[960px] p-4 sm:p-6">
        <PanelState
          title="Cần đăng nhập"
          description="Cảnh báo tín hiệu và backtest dành cho tài khoản IQX. Đăng nhập để tiếp tục — hành trình học của bạn không bị ảnh hưởng."
          action={{ label: "Đăng nhập", onClick: () => openAuth("login") }}
        />
      </div>
    )
  }

  if (!isPremium) {
    return (
      <div className="mx-auto w-full max-w-[960px] p-4 sm:p-6">
        <PanelState
          title="Cần gói Premium"
          description="Cảnh báo tín hiệu kỹ thuật theo watchlist và bộ backtest chiến lược chỉ dành cho tài khoản Premium."
        />
        <div className="flex justify-center pb-6"><Button asChild><Link to="/nang-cap">Xem gói Premium</Link></Button></div>
      </div>
    )
  }

  return <>{children}</>
}
