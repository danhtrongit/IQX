import { useState } from "react"
import { History, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { formatDate, formatDong, formatDongSigned, formatInt, formatRatio, TONE_CLASS, toneOf } from "../format"
import { DetailDialog, type DetailRow } from "./detail-dialog"
import { evidenceLines } from "./evidence"
import type { ExecutionRow } from "./history"
import { decisionLabel, sourceLabel } from "./journal"

function entrySourceText(row: ExecutionRow): string {
  const entry = row.entryItem
  return entry ? sourceLabel(entry.universe_kind, entry.universe_revision) : "—"
}

function ExecutionDetail({ row, names, onClose }: { row: ExecutionRow; names: Readonly<Record<string, string>>; onClose: () => void }) {
  const { item, execution } = row
  const sell = row.side === "sell"
  const rows: DetailRow[] = [
    { label: "Phiên", value: formatDate(item.trading_date) },
    { label: "Giá khớp", value: formatDong(execution.price_vnd) },
    { label: "Khối lượng", value: `${formatInt(execution.qty)} CP` },
    { label: "Giá trị", value: formatDong(execution.gross_value_vnd) },
    { label: "Phí", value: formatDong(execution.fee_vnd) },
    ...(sell ? [{ label: "Thuế bán", value: formatDong(execution.tax_vnd) }] : []),
    { label: sell ? "Tiền thu về" : "Tiền chi ra", value: formatDongSigned(execution.net_cash_delta_vnd) },
    { label: "Nguồn mua lúc mở", value: entrySourceText(row) },
    { label: "Cấu hình quyết định", value: item.decision_config_revision === null ? "—" : `Bản ${item.decision_config_revision}` },
  ]
  if (sell) {
    rows.push({ label: "Phiên mua", value: formatDate(row.openedSession) })
    rows.push({
      label: "Lãi/lỗ đã chốt (sau phí, thuế)",
      value: row.realizedPnl === null ? "Chưa tải đủ lịch sử" : `${formatDongSigned(row.realizedPnl)}${row.entryCost ? ` (${formatRatio(row.realizedPnl / row.entryCost)})` : ""}`,
      tone: TONE_CLASS[toneOf(row.realizedPnl)],
    })
  }
  rows.push({ label: "Lý do", value: decisionLabel(item) })
  const evidence = evidenceLines(item, names)
  const legacy: DetailRow[] = []
  if (item.legacy_filter_ids.length > 0) legacy.push({ label: "Nguồn săn (cũ)", value: item.legacy_filter_ids.join(", ") })
  if (item.legacy_threshold_vnd !== null) legacy.push({ label: "Mốc kích hoạt (cũ)", value: formatDong(item.legacy_threshold_vnd) })
  return (
    <DetailDialog title={`${sell ? "Bán" : "Mua"} ${row.symbol}`} description="Số liệu ghi tại thời điểm Bot quyết định." rows={rows} onClose={onClose}>
      {evidence.length > 0 && (
        <section aria-label="Điều kiện tại thời điểm quyết định">
          <h3 className="text-xs font-semibold">Điều kiện tại thời điểm quyết định</h3>
          <ul className="mt-1.5 space-y-1 text-[11px] leading-4 text-muted-foreground">
            {evidence.map((line) => <li key={line.key}>{line.text}</li>)}
          </ul>
        </section>
      )}
      {legacy.length > 0 && (
        <section aria-label="Dữ liệu chính sách cũ" className="rounded-md border border-border bg-muted/40 p-3">
          <h3 className="text-xs font-semibold">Dữ liệu chính sách cũ</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">Chỉ để tra cứu lịch sử, không còn tác động đến Bot.</p>
          <dl className="mt-2 divide-y divide-border">
            {legacy.map((entry) => (
              <div key={entry.label} className="flex justify-between gap-4 py-1.5 text-xs"><dt className="text-muted-foreground">{entry.label}</dt><dd className="font-medium">{entry.value}</dd></div>
            ))}
          </dl>
        </section>
      )}
    </DetailDialog>
  )
}

export function LoadMore({ hasMore, loading, onClick, label }: { hasMore: boolean; loading: boolean; onClick: () => void; label: string }) {
  if (!hasMore) return null
  return (
    <div className="border-t border-border p-2 text-center">
      <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onClick}>
        {loading && <LoaderCircle aria-hidden="true" className="animate-spin" />}
        {label}
      </Button>
    </div>
  )
}

export function HistoryTable({
  rows,
  names,
  hasMore,
  loading,
  onLoadMore,
}: {
  rows: ExecutionRow[]
  names: Readonly<Record<string, string>>
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
}) {
  const [open, setOpen] = useState<ExecutionRow | null>(null)

  if (rows.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
          <History aria-hidden="true" className="size-6 text-muted-foreground/60" />
          <p className="text-sm font-medium">{loading ? "Đang tải lịch sử giao dịch…" : "Chưa có giao dịch Bot"}</p>
          {!loading && <p className="max-w-sm text-xs leading-5 text-muted-foreground">Các lệnh Mua và Bán Bot đã khớp sẽ được ghi nhận tại đây.</p>}
        </div>
        <LoadMore hasMore={hasMore} loading={loading} onClick={onLoadMore} label="Tải thêm lịch sử" />
      </div>
    )
  }

  return (
    <div>
      <Table aria-label="Lịch sử giao dịch Bot" className="min-w-[860px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Phiên</TableHead>
            <TableHead>Mã</TableHead>
            <TableHead>Loại</TableHead>
            <TableHead className="text-right">Số CP</TableHead>
            <TableHead className="text-right">Giá khớp</TableHead>
            <TableHead className="text-right">Lãi/lỗ đã chốt</TableHead>
            <TableHead>Nguồn mua</TableHead>
            <TableHead><span className="sr-only">Chi tiết</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{formatDate(row.item.trading_date)}</TableCell>
              <TableCell className="font-semibold">{row.symbol}</TableCell>
              <TableCell>
                <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold", row.side === "buy" ? "border-price-up/40 bg-price-up/10 text-price-up" : "border-price-down/40 bg-price-down/10 text-price-down")}>
                  {row.side === "buy" ? "Mua" : "Bán"}
                </span>
              </TableCell>
              <TableCell className="text-right">{formatInt(row.execution.qty)}</TableCell>
              <TableCell className="text-right">{formatDong(row.execution.price_vnd)}</TableCell>
              <TableCell className="text-right">
                {row.side === "sell" && row.realizedPnl !== null ? (
                  <>
                    <strong className={cn("font-semibold", TONE_CLASS[toneOf(row.realizedPnl)])}>{formatDongSigned(row.realizedPnl)}</strong>
                    {row.entryCost ? <small className={cn("block text-[10px]", TONE_CLASS[toneOf(row.realizedPnl)])}>{formatRatio(row.realizedPnl / row.entryCost)}</small> : null}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>{entrySourceText(row)}</TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="link" size="xs" className="h-auto p-0 text-[11px]" onClick={() => setOpen(row)}>
                  Chi tiết<span className="sr-only"> {row.side === "buy" ? "Mua" : "Bán"} {row.symbol} {formatDate(row.item.trading_date)}</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <LoadMore hasMore={hasMore} loading={loading} onClick={onLoadMore} label="Tải thêm lịch sử" />
      {open && <ExecutionDetail row={open} names={names} onClose={() => setOpen(null)} />}
    </div>
  )
}
