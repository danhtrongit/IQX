/**
 * Cổng truy cập của `/chien-luoc`: cả ba tab (Cảnh báo, Backtest, Bộ lọc) là tính năng Premium.
 * Nội dung Premium KHÔNG được render khi chưa đăng nhập hoặc chưa có gói (mọi endpoint đều có guard
 * ở server, gọi khi chưa đủ quyền chỉ nhận 403); thay vào đó là thông báo rõ ràng và nút đăng nhập.
 * Cổng này chỉ là trình bày: server vẫn là nơi quyết định quyền.
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
          description="Cảnh báo, Backtest và Bộ lọc dành cho tài khoản IQX. Đăng nhập để tiếp tục: tiến độ học của bạn không bị ảnh hưởng."
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
          description="Cảnh báo tín hiệu kỹ thuật, Backtest chiến lược và Bộ lọc doanh nghiệp chỉ dành cho tài khoản Premium."
        />
        <div className="flex justify-center pb-6"><Button asChild><Link to="/nang-cap">Xem gói Premium</Link></Button></div>
      </div>
    )
  }

  return <>{children}</>
}
