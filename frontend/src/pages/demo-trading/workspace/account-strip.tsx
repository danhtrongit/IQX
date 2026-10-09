import { useTradingPortfolio } from "@/hooks/use-trading"
import { formatMoney, formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"

/** The four headline figures of the self-trading demo account. Unknown stays "—", never 0. */
export function AccountStrip({ className }: { className?: string }) {
  const { data: portfolio } = useTradingPortfolio()
  const account = portfolio?.account ?? null
  const pnlTone = portfolio == null || portfolio.return_pct === 0 ? undefined : portfolio.return_pct > 0 ? "text-price-up" : "text-price-down"
  const stats: { label: string; value: string; tone?: string }[] = [
    { label: "Vốn ban đầu", value: formatMoney(account?.initial_cash_vnd) },
    { label: "Tiền mặt", value: formatMoney(account?.cash_available_vnd) },
    { label: "Giá trị danh mục", value: formatMoney(portfolio?.nav_vnd) },
    { label: "Tổng lợi nhuận", value: formatPercent(portfolio?.return_pct), tone: pnlTone },
  ]
  return (
    <dl
      aria-label="Tài khoản tự giao dịch"
      className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border min-[1031px]:grid-cols-4", className)}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0 bg-card px-2.5 py-3 min-[1031px]:px-3">
          <dt className="truncate text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</dt>
          <dd className={cn("mt-1 truncate text-sm font-semibold tabular-nums min-[1750px]:text-base", stat.tone)}>{stat.value}</dd>
        </div>
      ))}
    </dl>
  )
}
