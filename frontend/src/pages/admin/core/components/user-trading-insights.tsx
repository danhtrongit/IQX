import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime, formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { TradingInsight } from "../api"
import { formatDay } from "../format"
import { StatusBadge } from "./status-badge"

/** % lợi nhuận: xanh khi lãi, đỏ khi lỗ, không màu khi hoà (§5.1.3). */
export function PnlPct({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  return (
    <span className={cn("font-medium tabular-nums", value > 0 && "text-price-up", value < 0 && "text-price-down")}>
      {formatPercent(value)}
    </span>
  )
}

const NOT_ACTIVATED = <span className="text-muted-foreground">Chưa kích hoạt</span>

/**
 * Tab "Demo Trading và Bot": mỗi tài khoản một dòng với mã tài khoản, lợi nhuận %, hoạt
 * động gần đây và trạng thái. Không có vốn hay giá trị bằng tiền, nên dùng được cho cả
 * trưởng nhóm.
 */
export function UserTradingInsights({ demoTrading, bot }: { demoTrading: TradingInsight | null; bot: TradingInsight | null }) {
  const rows = [
    { id: "demo", label: "Demo Trading", insight: demoTrading },
    { id: "bot", label: "Bot", insight: bot },
  ]
  return (
    <div className="overflow-hidden rounded-lg bg-card ring-1 ring-border/60 ring-inset dark:ring-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Tài khoản</TableHead>
            <TableHead scope="col" className="text-right">Lợi nhuận</TableHead>
            <TableHead scope="col">Hoạt động gần đây</TableHead>
            <TableHead scope="col">Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ id, label, insight }) => {
            const activated = !!insight?.activated
            return (
              <TableRow key={id}>
                <TableCell>
                  <span className="font-medium">{label}</span>
                  {activated && insight?.accountId && (
                    <span className="block font-mono text-[11px] text-muted-foreground">{insight.accountId}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {activated ? (
                    <>
                      <PnlPct value={insight?.pnlPct ?? null} />
                      {insight?.asOf && (
                        <span className="block text-[11px] text-muted-foreground">tính đến {formatDay(insight.asOf, true)}</span>
                      )}
                    </>
                  ) : (
                    NOT_ACTIVATED
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {activated ? (insight?.lastActivityAt ? formatDateTime(insight.lastActivityAt) : <span className="text-muted-foreground">—</span>) : NOT_ACTIVATED}
                </TableCell>
                <TableCell>{activated ? <StatusBadge status={insight?.status ?? null} /> : NOT_ACTIVATED}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
