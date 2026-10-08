import { useState } from "react"
import { Wallet } from "lucide-react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { formatDate, formatDong, formatDongSigned, formatInt, formatPercentValue, formatRatio, TONE_CLASS, toNumber, toneOf } from "../format"
import type { BotPosition } from "../types"
import { DetailDialog, type DetailRow } from "./detail-dialog"
import { sourceLabel } from "./journal"
import { PageControls } from "./page-controls"
import { scopeBadge } from "./scope"
import { usePaging } from "./use-paging"

const PAGE_SIZE = 20

/** `(close / entry − 1)`: the price move since entry, not the net P&L. */
function priceChange(position: BotPosition): number | null {
  const close = toNumber(position.current_close_vnd)
  const entry = toNumber(position.entry_price_vnd)
  return close === null || entry === null || entry === 0 ? null : close / entry - 1
}

function entrySourceName(position: BotPosition): string {
  const snapshot = position.entry_source_snapshot
  const name = snapshot && typeof snapshot.name === "string" ? snapshot.name : null
  const kind = snapshot && typeof snapshot.kind === "string" ? snapshot.kind : null
  return kind === "vn30" ? "VN30" : (name ?? sourceLabel(kind, null))
}

function PositionDetail({ position, onClose }: { position: BotPosition; onClose: () => void }) {
  const decision = position.last_decision
  const rows: DetailRow[] = [
    { label: "Mã", value: position.symbol },
    { label: "Ngành", value: position.sector ?? "—" },
    { label: "Khối lượng", value: `${formatInt(position.qty)} CP` },
    { label: "Giá vốn", value: formatDong(position.entry_price_vnd) },
    { label: "Giá tham chiếu", value: formatDong(position.current_close_vnd) },
    { label: "Giá trị thị trường", value: formatDong(position.market_value_vnd) },
    { label: "Tỷ trọng", value: position.weight_pct === null ? "—" : formatPercentValue(position.weight_pct) },
    { label: "Lãi/lỗ tạm tính (sau phí)", value: formatDongSigned(position.unrealized_pnl_net_vnd), tone: TONE_CLASS[toneOf(position.unrealized_pnl_net_vnd)] },
    { label: "Phiên mua", value: formatDate(position.opened_session) },
    { label: "Số phiên đang giữ", value: `${position.holding_sessions} phiên` },
    { label: "Nguồn mua lúc mở", value: entrySourceName(position) },
    { label: "Cấu hình lúc mua", value: position.entry_config_revision === null ? "—" : `Bản ${position.entry_config_revision}` },
    { label: "Phạm vi hiện tại", value: scopeBadge(position).label },
  ]
  if (decision) {
    rows.push({ label: `Quyết định gần nhất · ${formatDate(decision.trading_date)}`, value: decision.reason_label ?? decision.reason })
  }
  // Legacy values of positions opened before the current policy; they never act on the position.
  const legacy: DetailRow[] = []
  if (position.legacy_stop_loss_vnd !== null) legacy.push({ label: "Mốc cắt lỗ cũ", value: formatDong(position.legacy_stop_loss_vnd) })
  if (position.legacy_take_profit_vnd !== null) legacy.push({ label: "Mốc chốt lời cũ", value: formatDong(position.legacy_take_profit_vnd) })
  if (position.legacy_amplitude_at_entry_vnd !== null) legacy.push({ label: "Biên độ lúc mua (cũ)", value: formatDong(position.legacy_amplitude_at_entry_vnd) })
  if (position.legacy_filter_ids.length > 0) legacy.push({ label: "Nguồn săn (cũ)", value: position.legacy_filter_ids.join(", ") })
  return (
    <DetailDialog title={`Vị thế ${position.symbol}`} description="Số liệu theo giá đóng cửa chính thức của phiên gần nhất." rows={rows} onClose={onClose}>
      {legacy.length > 0 && (
        <section aria-label="Dữ liệu chính sách cũ" className="rounded-md border border-border bg-muted/40 p-3">
          <h3 className="text-xs font-semibold">Dữ liệu chính sách cũ</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">Chỉ để tra cứu lịch sử. Các mốc này không còn tác động đến Bot.</p>
          <dl className="mt-2 divide-y divide-border">
            {legacy.map((row) => (
              <div key={row.label} className="flex justify-between gap-4 py-1.5 text-xs"><dt className="text-muted-foreground">{row.label}</dt><dd className="font-medium tabular-nums">{row.value}</dd></div>
            ))}
          </dl>
        </section>
      )}
    </DetailDialog>
  )
}

export function PositionsTable({ positions, valuationComplete }: { positions: BotPosition[]; valuationComplete: boolean }) {
  const [open, setOpen] = useState<BotPosition | null>(null)
  const paging = usePaging(positions.length, PAGE_SIZE)
  const rows = positions.slice(paging.start, paging.end)

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
        <Wallet aria-hidden="true" className="size-6 text-muted-foreground/60" />
        <p className="text-sm font-medium">Chưa có cổ phiếu đang nắm giữ</p>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">Bot chỉ mua khi điều kiện đã bật có hiệu lực và thỏa mãn.</p>
      </div>
    )
  }

  return (
    <div>
      <Table aria-label="Vị thế Bot đang giữ" className="min-w-[860px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Mã</TableHead>
            <TableHead className="text-right">Số CP</TableHead>
            <TableHead className="text-right">Giá vốn</TableHead>
            <TableHead className="text-right">Giá tham chiếu</TableHead>
            <TableHead className="text-right">Lãi / lỗ</TableHead>
            <TableHead className="text-right">Đã giữ</TableHead>
            <TableHead>Nguồn mua lúc mở</TableHead>
            <TableHead>Phạm vi hiện tại</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((position) => {
            const scope = scopeBadge(position)
            const tone = TONE_CLASS[toneOf(position.unrealized_pnl_net_vnd)]
            const move = priceChange(position)
            return (
              <TableRow key={position.id}>
                <TableCell>
                  <button type="button" className="rounded-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" onClick={() => setOpen(position)} aria-label={`Chi tiết vị thế ${position.symbol}`}>
                    {position.symbol}
                  </button>
                </TableCell>
                <TableCell className="text-right">{formatInt(position.qty)}</TableCell>
                <TableCell className="text-right">{formatDong(position.entry_price_vnd)}</TableCell>
                <TableCell className="text-right">{formatDong(position.current_close_vnd)}</TableCell>
                <TableCell className="text-right">
                  <strong className={cn("font-semibold", tone)}>{formatDongSigned(position.unrealized_pnl_net_vnd)}</strong>
                  {move !== null && <small className={cn("block text-[10px]", TONE_CLASS[toneOf(move)])} title="Chênh lệch giá tham chiếu so với giá vốn">{formatRatio(move)}</small>}
                </TableCell>
                <TableCell className="text-right">{position.holding_sessions} phiên</TableCell>
                <TableCell>{entrySourceName(position)}</TableCell>
                <TableCell>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium", scope.inSource === true ? "border-primary/40 bg-primary/10 text-primary" : scope.inSource === false ? "border-price-ref/40 bg-price-ref/10 text-price-ref" : "border-border text-muted-foreground")}>
                    <span aria-hidden="true" className={cn("size-1.5 rounded-full", scope.inSource === true ? "bg-primary" : scope.inSource === false ? "bg-price-ref" : "bg-muted-foreground")} />
                    {scope.label}
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {!valuationComplete && <p className="px-3 py-2 text-[11px] text-price-ref">Chưa có giá đóng cửa hợp lệ cho một số vị thế; lãi/lỗ của các mã đó chưa được tính.</p>}
      <PageControls paging={paging} total={positions.length} label="vị thế" />
      {open && <PositionDetail position={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
