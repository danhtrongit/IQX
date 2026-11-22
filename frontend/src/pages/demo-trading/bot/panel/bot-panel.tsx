/**
 * «Bot» tool panel (right), spec Bot và Chiến lược v2.0 §5.4: the Bot only picks a strategy
 * (CHIẾN LƯỢC IQX / CHIẾN LƯỢC CỦA TÔI) and holds the THÔNG BÁO card. Strategies are created and
 * edited in the Backtest; nothing here starts a run or places an order.
 */
import { useEffect, useRef } from "react"
import { useSearchParams } from "react-router"

import { PanelState } from "@/components/layout/panel-state"
import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { useAuth } from "@/hooks/use-auth"
import { NOTIFICATION_FOCUS } from "@/pages/notifications/api"

import { NotificationCard } from "./notification-card"
import { StrategyLists } from "./strategy-lists"

export function BotPanel() {
  const { isAuthenticated, openAuth } = useAuth()
  const [params, setParams] = useSearchParams()
  const card = useRef<HTMLElement>(null)
  const focus = params.get("focus")

  // `Cài đặt thông báo` of the bell: scroll to the card once, then drop the parameter.
  useEffect(() => {
    if (focus !== NOTIFICATION_FOCUS || !isAuthenticated) return
    const timer = window.setTimeout(() => {
      card.current?.scrollIntoView({ block: "center" })
      card.current?.focus({ preventScroll: true })
      setParams((current) => {
        const next = new URLSearchParams(current)
        next.delete("focus")
        return next
      }, { replace: true })
    }, 50)
    return () => window.clearTimeout(timer)
  }, [focus, isAuthenticated, setParams])

  if (!isAuthenticated) {
    return (
      <SidebarPanel title="Bot">
        <PanelState title="Đăng nhập để dùng Bot" description="Bot gắn với tài khoản của bạn." action={{ label: "Đăng nhập", onClick: () => openAuth("login") }} />
      </SidebarPanel>
    )
  }

  return (
    <SidebarPanel title="Bot">
      <StrategyLists />
      <NotificationCard ref={card} />
    </SidebarPanel>
  )
}
