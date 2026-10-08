import { cn } from "@/lib/utils"

import { formatDong, formatRatio, TONE_CLASS, toneOf } from "../format"
import type { BotOverview } from "../types"

/** The four headline figures of the Bot account. Unknown stays "—", never 0. */
export function KpiStrip({ overview }: { overview: BotOverview | undefined }) {
  const account = overview?.account ?? null
  const stats: { label: string; value: string; tone?: string }[] = [
    { label: "Vốn Bot ban đầu", value: formatDong(overview?.bot?.initial_cash_vnd) },
    { label: "Tiền mặt", value: formatDong(account?.cash_vnd) },
    { label: "Giá trị danh mục", value: formatDong(account?.nav_vnd) },
    { label: "Tổng lợi nhuận", value: formatRatio(account?.return_total), tone: TONE_CLASS[toneOf(account?.return_total)] },
  ]
  return (
    <div>
      <dl aria-label="Tài khoản Bot" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border min-[1031px]:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 bg-card px-2.5 py-3 min-[1031px]:px-3.5">
            <dt className="truncate text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</dt>
            <dd className={cn("mt-1 truncate text-sm font-semibold tabular-nums min-[1750px]:text-base", stat.tone)}>{stat.value}</dd>
          </div>
        ))}
      </dl>
      {account && !account.valuation_complete && (
        <p className="mt-1.5 text-[11px] leading-4 text-price-ref">Giá trị danh mục chưa định giá đầy đủ do thiếu giá đóng cửa của một hoặc nhiều vị thế.</p>
      )}
    </div>
  )
}
