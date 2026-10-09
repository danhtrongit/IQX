import { Coins } from "lucide-react"
import { Link, useLocation } from "react-router"

import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { formatXu } from "@/pages/demo-trading/shop/shop-model"
import { useShopState } from "@/pages/demo-trading/shop/use-shop"

/** Opens the workspace's Shop tool; on the workspace it keeps the selected symbol and shows the Shop main view. */
function shopDestination(pathname: string, search: string): string {
  if (pathname !== "/demo-trading") return "/demo-trading?view=shop"
  const params = new URLSearchParams(search)
  params.set("view", "shop")
  params.delete("content")
  return `/demo-trading?${params}`
}

function CoinChip() {
  const location = useLocation()
  const shop = useShopState()
  const balance = shop.data?.wallet.balance
  const label = balance != null
    ? `${formatXu(balance)} xu. Mở Shop`
    : shop.isError ? "Chưa tải được số dư xu. Mở Shop" : "Đang tải số dư xu. Mở Shop"
  return (
    <Link
      to={shopDestination(location.pathname, location.search)}
      aria-label={label}
      data-testid="header-coin-chip"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-accent/50 bg-accent/10 px-2.5 text-xs font-bold whitespace-nowrap tabular-nums transition-colors",
        "text-amber-700 hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-accent max-[420px]:px-2",
      )}
    >
      <Coins className="size-4" aria-hidden="true" />
      <span aria-hidden="true">{balance != null ? formatXu(balance) : shop.isError ? "—" : "…"}</span>
      <span aria-hidden="true" className="max-[420px]:hidden">xu</span>
    </Link>
  )
}

/** Coin balance in the header: only for signed-in accounts, read from the same query as the Shop panel. */
export function HeaderCoinChip() {
  const { user } = useAuth()
  if (!user) return null
  return <CoinChip />
}
