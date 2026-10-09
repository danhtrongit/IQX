import { useState } from "react"
import { History } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { formatDate, formatDong, formatDongSigned, formatInt, formatPercentSigned, TONE_CLASS, toneOf } from "../format"
import type { BotTrade } from "../types"
import { DetailDialog, DetailList, type DetailRow } from "./detail-dialog"
import { LoadMore } from "./load-more"
import { snapshotSourceText } from "./source"

const revisionText = (revision: number | null): string => (revision === null ? "—" : `Bản ${revision}`)
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
    {
      label: "Lãi/lỗ đã chốt (sau phí, thuế)",
      value: `${formatDongSigned(trade.realized_pnl_vnd)}${trade.realized_pnl_pct === null ? "" : ` (${formatPercentSigned(trade.realized_pnl_pct)})`}`,
      tone,
    },
    { label: "Khối lượng", value: `${formatInt(sell.qty)} CP` },
    { label: "Thời gian giữ", value: `${sessionsText(trade)} · ${trade.holding_days} ngày` },
    { label: "Nguồn mua lúc mở", value: snapshotSourceText(buy.entry_source_snapshot) },
  ]
  const buyRows: DetailRow[] = [
    { label: "Phiên mua", value: formatDate(buy.session) },
    { label: "Giá khớp", value: formatDong(buy.price_vnd) },
    { label: "Giá trị", value: formatDong(buy.gross_value_vnd) },
    { label: "Phí mua", value: formatDong(buy.fee_vnd) },
    { label: "Tổng tiền chi ra", value: formatDong(buy.total_vnd) },
    { label: "Cấu hình quyết định", value: revisionText(buy.decision_config_revision) },
    { label: "Lý do", value: reasonText(buy) },
  ]
  const sellRows: DetailRow[] = [
    { label: "Phiên bán", value: formatDate(sell.session) },
    { label: "Giá khớp", value: formatDong(sell.price_vnd) },
    { label: "Giá trị", value: formatDong(sell.gross_value_vnd) },
    { label: "Phí bán", value: formatDong(sell.fee_vnd) },
    { label: "Thuế bán", value: formatDong(sell.tax_vnd) },
    { label: "Tiền thu về", value: formatDong(sell.net_vnd) },
    { label: "Cấu hình quyết định", value: revisionText(sell.decision_config_revision) },
    { label: "Lý do", value: reasonText(sell) },
  ]
  const legacy: DetailRow[] = []
  if (trade.legacy_stop_loss_vnd !== null) legacy.push({ label: "Mốc cắt lỗ cũ", value: formatDong(trade.legacy_stop_loss_vnd) })
  if (trade.legacy_take_profit_vnd !== null) legacy.push({ label: "Mốc chốt lời cũ", value: formatDong(trade.legacy_take_profit_vnd) })
  if (trade.legacy_amplitude_at_entry_vnd !== null) legacy.push({ label: "Biên độ lúc mua (cũ)", value: formatDong(trade.legacy_amplitude_at_entry_vnd) })
  if (trade.legacy_amplitude_source_ref !== null) legacy.push({ label: "Nguồn biên độ (cũ)", value: trade.legacy_amplitude_source_ref })
  if (trade.legacy_filter_ids.length > 0) legacy.push({ label: "Nguồn săn (cũ)", value: trade.legacy_filter_ids.join(", ") })
  return (
    <DetailDialog title={`Giao dịch ${trade.symbol}`} description="Số liệu ghi tại thời điểm Bot mua và bán." rows={summary} onClose={onClose}>
      <section aria-label="Lệnh mua">
        <h3 className="mb-0.5 text-xs font-semibold text-price-up">Lệnh mua</h3>
        <DetailList rows={buyRows} />
      </section>
      <section aria-label="Lệnh bán">
        <h3 className="mb-0.5 text-xs font-semibold text-price-down">Lệnh bán</h3>
        <DetailList rows={sellRows} />
      </section>
      <p className="text-[11px] leading-4 text-muted-foreground">
        Điều kiện Bot đã so sánh lúc mua và bán được ghi trong Nhật ký của phiên {formatDate(buy.session)} và phiên {formatDate(sell.session)}.
      </p>
      {legacy.length > 0 && (
        <section aria-label="Dữ liệu chính sách cũ" className="rounded-md border border-border bg-muted/40 p-3">
          <h3 className="text-xs font-semibold">Dữ liệu chính sách cũ</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">Chỉ để tra cứu lịch sử, không còn tác động đến Bot.</p>
          <div className="mt-2">
            <DetailList rows={legacy} />
          </div>
        </section>
      )}
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
          <History aria-hidden="true" className="size-6 text-muted-foreground/60" />
          <p className="text-sm font-medium">{loading ? "Đang tải lịch sử giao dịch…" : "Chưa có giao dịch đã chốt"}</p>
          {!loading && (
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">
              Khi Bot bán hết một vị thế, lần mua và lần bán đó cùng lãi/lỗ đã chốt được ghi tại đây. Vị thế chưa bán nằm ở tab Đang giữ.
            </p>
          )}
        </div>
        <LoadMore hasMore={hasMore} loading={loading} onClick={onLoadMore} label="Tải thêm lịch sử" />
      </div>
    )
  }

  return (
    <div>
      <Table aria-label="Lịch sử giao dịch Bot" className="min-w-[920px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Phiên bán</TableHead>
            <TableHead>Mã</TableHead>
            <TableHead className="text-right">Số CP</TableHead>
            <TableHead className="text-right">Giá mua</TableHead>
            <TableHead className="text-right">Giá bán</TableHead>
            <TableHead className="text-right">Lãi/lỗ đã chốt</TableHead>
            <TableHead className="text-right">Đã giữ</TableHead>
            <TableHead>Nguồn mua</TableHead>
            <TableHead><span className="sr-only">Chi tiết</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => {
            const tone = TONE_CLASS[toneOf(trade.realized_pnl_vnd)]
            return (
              <TableRow key={trade.id}>
                <TableCell>
                  {formatDate(trade.sell.session)}
                  <small className="block text-[10px] text-muted-foreground">Mua {formatDate(trade.buy.session)}</small>
                </TableCell>
                <TableCell className="font-semibold">{trade.symbol}</TableCell>
                <TableCell className="text-right">{formatInt(trade.sell.qty)}</TableCell>
                <TableCell className="text-right">{formatDong(trade.buy.price_vnd)}</TableCell>
                <TableCell className="text-right">{formatDong(trade.sell.price_vnd)}</TableCell>
                <TableCell className="text-right">
                  <strong className={cn("font-semibold", tone)}>{formatDongSigned(trade.realized_pnl_vnd)}</strong>
                  {trade.realized_pnl_pct !== null && <small className={cn("block text-[10px]", tone)}>{formatPercentSigned(trade.realized_pnl_pct)}</small>}
                </TableCell>
                <TableCell className="text-right">{sessionsText(trade)}</TableCell>
                <TableCell>{snapshotSourceText(trade.buy.entry_source_snapshot)}</TableCell>
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
