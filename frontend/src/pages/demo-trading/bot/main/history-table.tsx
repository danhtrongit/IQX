import { useState } from "react"
import { History } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { formatDate, formatDong, formatDongSigned, formatInt, formatPercentSigned, TONE_CLASS, toneOf } from "../format"
import type { BotTradeV2 as BotTrade } from "../api-v2"
import { DetailDialog, DetailList, type DetailRow } from "./detail-dialog"
import { LoadMore } from "./load-more"
import { snapshotSourceText } from "./source"

/** `Điều kiện Bán` / `Hết thời gian giữ` (v2 trades); the stored label of a legacy sell otherwise. */
function exitText(trade: BotTrade): string {
  if (trade.exit_reason === "indicator") return "Điều kiện Bán"
  if (trade.exit_reason === "max_holding") return "Hết thời gian giữ"
  return trade.sell.reason_label ?? trade.sell.reason ?? "—"
}
/** Both reasons were true at the sell (`(cùng đến hạn)`). */
const bothReasons = (trade: BotTrade): boolean => !!trade.exit_reasons && trade.exit_reasons.includes("indicator") && trade.exit_reasons.includes("max_holding")
/** `RSI + SMA20 · bản 05/11 20:02`; `—` for a trade from before strategies. */
const strategyText = (trade: BotTrade): string => (trade.strategy_label ? [trade.strategy_label, trade.version_label].filter(Boolean).join(" · ") : "—")
const reasonText = (leg: { reason_label: string | null; reason: string | null }): string => leg.reason_label ?? leg.reason ?? "—"
const sessionsText = (trade: Pick<BotTrade, "holding_sessions">): string => `${trade.holding_sessions} phiên`

/**
 * One closed trade: the buy, the sell that closed the whole position, and the realized
 * result the server computed (sell cash in minus buy cash out, fees and tax counted once).
 */
function TradeDetail({ trade, onClose }: { trade: BotTrade; onClose: () => void }) {
  const { buy, sell } = trade
  const tone = TONE_CLASS[toneOf(trade.realized_pnl_vnd)]
  const summary: DetailRow[] = [
    { label: "Phiên mua", value: formatDate(buy.session) },
    { label: "Phiên bán", value: formatDate(sell.session) },
    { label: "Thời gian giữ", value: sessionsText(trade) },
    { label: "Lý do bán", value: `${exitText(trade)}${bothReasons(trade) ? " (cùng đến hạn)" : ""}` },
    { label: "Giới hạn khi bán", value: trade.max_holding_at_exit ? `${trade.max_holding_at_exit} phiên` : "—" },
    { label: "Chiến lược · bản", value: strategyText(trade) },
    {
      label: "Lãi/lỗ đã chốt (sau phí, thuế)",
      value: `${formatDongSigned(trade.realized_pnl_vnd)}${trade.realized_pnl_pct === null ? "" : ` (${formatPercentSigned(trade.realized_pnl_pct)})`}`,
      tone,
    },
    { label: "Khối lượng", value: `${formatInt(sell.qty)} CP` },
    { label: "Nguồn mua lúc mở", value: snapshotSourceText(buy.entry_source_snapshot) },
  ]
  const buyRows: DetailRow[] = [
    { label: "Phiên mua", value: formatDate(buy.session) },
    { label: "Giá khớp", value: formatDong(buy.price_vnd) },
    { label: "Giá trị", value: formatDong(buy.gross_value_vnd) },
    { label: "Phí mua", value: formatDong(buy.fee_vnd) },
    { label: "Tổng tiền chi ra", value: formatDong(buy.total_vnd) },
    { label: "Lý do", value: reasonText(buy) },
  ]
  const sellRows: DetailRow[] = [
    { label: "Phiên bán", value: formatDate(sell.session) },
    { label: "Giá khớp", value: formatDong(sell.price_vnd) },
    { label: "Giá trị", value: formatDong(sell.gross_value_vnd) },
    { label: "Phí bán", value: formatDong(sell.fee_vnd) },
    { label: "Thuế bán", value: formatDong(sell.tax_vnd) },
    { label: "Tiền thu về", value: formatDong(sell.net_vnd) },
    { label: "Lý do", value: reasonText(sell) },
  ]
  return (
    <DetailDialog title={`${trade.symbol} · chi tiết giao dịch Bán`} rows={summary} onClose={onClose}>
      <section aria-label="Lệnh mua">
        <h3 className="mb-0.5 text-xs font-semibold text-price-up">Lệnh mua</h3>
        <DetailList rows={buyRows} />
      </section>
      <section aria-label="Lệnh bán">
        <h3 className="mb-0.5 text-xs font-semibold text-price-down">Lệnh bán</h3>
        <DetailList rows={sellRows} />
      </section>
    </DetailDialog>
  )
}

/** Lịch sử: every closed trade, newest first, with the server's realized P&L. */
export function HistoryTable({
  trades,
  hasMore,
  loading,
  onLoadMore,
}: {
  trades: BotTrade[]
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
}) {
  const [open, setOpen] = useState<BotTrade | null>(null)

  if (trades.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
          <History aria-hidden="true" className="size-6 text-primary/60" />
          <p className="text-sm font-medium">{loading ? "Đang tải lịch sử giao dịch…" : "Chưa có giao dịch đã bán"}</p>
          {!loading && (
            <p className="max-w-sm text-xs leading-5 text-academy-subtle">
              Vị thế chưa bán nằm ở tab Đang giữ.
            </p>
          )}
        </div>
        <LoadMore hasMore={hasMore} loading={loading} onClick={onLoadMore} label="Tải thêm lịch sử" />
      </div>
    )
  }

  return (
    <div>
      <Table aria-label="Lịch sử giao dịch Bot" className="min-w-[1080px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Mã</TableHead>
            <TableHead className="text-right">Số CP</TableHead>
            <TableHead>Ngày mua</TableHead>
            <TableHead>Ngày bán</TableHead>
            <TableHead className="text-right">Giá mua</TableHead>
            <TableHead className="text-right">Giá bán</TableHead>
            <TableHead className="text-right">Thời gian giữ</TableHead>
            <TableHead className="text-right">Lãi / Lỗ</TableHead>
            <TableHead>Lý do bán</TableHead>
            <TableHead>Chiến lược · bản</TableHead>
            <TableHead><span className="sr-only">Chi tiết</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => {
            const tone = TONE_CLASS[toneOf(trade.realized_pnl_vnd)]
            return (
              <TableRow key={trade.id}>
                <TableCell className="font-semibold">{trade.symbol}</TableCell>
                <TableCell className="text-right">{formatInt(trade.sell.qty)}</TableCell>
                <TableCell>{formatDate(trade.buy.session)}</TableCell>
                <TableCell>{formatDate(trade.sell.session)}</TableCell>
                <TableCell className="text-right">{formatDong(trade.buy.price_vnd)}</TableCell>
                <TableCell className="text-right">{formatDong(trade.sell.price_vnd)}</TableCell>
                <TableCell className="text-right">{sessionsText(trade)}</TableCell>
                <TableCell className="text-right">
                  <strong className={cn("font-semibold", tone)}>{formatDongSigned(trade.realized_pnl_vnd)}</strong>
                  {trade.realized_pnl_pct !== null && <small className={cn("block text-[10px]", tone)}>{formatPercentSigned(trade.realized_pnl_pct)}</small>}
                </TableCell>
                <TableCell data-testid="exit-reason">
                  <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[11px] font-medium", trade.exit_reason === "max_holding" ? "border-status-warning/50 bg-status-warning/10 text-status-warning" : "border-border")}>{exitText(trade)}</span>
                  {bothReasons(trade) && <small className="ml-1 text-[10px] text-academy-subtle">(cùng đến hạn)</small>}
                </TableCell>
                <TableCell className="max-w-[220px] whitespace-normal text-[11px]">{strategyText(trade)}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="link" size="xs" className="h-auto p-0 text-[11px]" onClick={() => setOpen(trade)}>
                    Chi tiết<span className="sr-only"> {trade.symbol} bán {formatDate(trade.sell.session)}</span>
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <LoadMore hasMore={hasMore} loading={loading} onClick={onLoadMore} label="Tải thêm lịch sử" />
      {open && <TradeDetail trade={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
