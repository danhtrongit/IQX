import { useState } from "react"
import { Wallet } from "lucide-react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { DEFAULT_MAX_HOLDING } from "@/pages/strategy/shared/strategy-diff"

import type { BotPositionV2, SellState } from "../api-v2"
import { formatDate, formatDong, formatDongSigned, formatInt, formatRatio, TONE_CLASS, toNumber, toneOf } from "../format"
import { dayMonth } from "@/pages/strategy/shared/bot-schedule"
import { DetailDialog, type DetailRow } from "./detail-dialog"
import { PageControls } from "./page-controls"
import { snapshotSourceText } from "./source"
import { usePaging } from "./use-paging"

const PAGE_SIZE = 20

/** Strategy of the last session: its name and Giữ tối đa (N); `null` = not chosen (N = 30). */
export type PositionStrategy = { name: string; maxHolding: number } | null

/** `(close / entry − 1)`: the price move since entry, not the net P&L. */
function priceChange(position: BotPositionV2): number | null {
  const close = toNumber(position.current_close_vnd)
  const entry = toNumber(position.entry_price_vnd)
  return close === null || entry === null || entry === 0 ? null : close / entry - 1
}

const limitOf = (position: BotPositionV2, strategy: PositionStrategy): number => position.max_holding ?? strategy?.maxHolding ?? DEFAULT_MAX_HOLDING
const countedOf = (position: BotPositionV2): number => position.counted ?? position.holding_sessions
const heldOf = (position: BotPositionV2): number => position.held ?? position.holding_sessions
const entryOf = (position: BotPositionV2): string | null => position.entry_session ?? position.opened_session ?? null

const STATE_LABEL: Record<SellState, string> = {
  t2_wait: "Chờ T+2",
  sellable: "Có thể bán",
  due: "Đến hạn",
  due_unfilled: "Đến hạn, chưa khớp",
}

const STATE_TONE: Record<SellState, string> = {
  t2_wait: "border-status-warning/50 bg-status-warning/10 text-status-warning",
  sellable: "border-primary/40 bg-primary/10 text-primary",
  due: "border-price-down/40 bg-price-down/10 text-price-down",
  due_unfilled: "border-status-warning/50 bg-status-warning/10 text-status-warning",
}

/** The server's state, or one derived from counted/N when an older server does not send it. */
function sellStateOf(position: BotPositionV2, strategy: PositionStrategy): SellState {
  if (position.sell_state) return position.sell_state
  if (heldOf(position) < 2) return "t2_wait"
  return countedOf(position) >= limitOf(position, strategy) ? "due" : "sellable"
}

function sellStateDetail(position: BotPositionV2, state: SellState): string | null {
  if (state === "t2_wait") return position.sellable_from_session ? `Bán được từ ${dayMonth(position.sellable_from_session)}` : null
  if (state === "sellable") return position.due_session ? `Đến hạn ${dayMonth(position.due_session)}` : null
  if (state === "due") return "Bán ở phiên xử lý kế tiếp"
  return position.sell_state_detail ?? "Tạm ngừng giao dịch"
}

function SellStateCell({ position, strategy }: { position: BotPositionV2; strategy: PositionStrategy }) {
  const state = sellStateOf(position, strategy)
  const detail = sellStateDetail(position, state)
  return (
    <div data-testid="sell-state" data-state={state}>
      <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", STATE_TONE[state])}>{STATE_LABEL[state]}</span>
      {detail && <small className="mt-0.5 block text-[10px] text-academy-subtle">{detail}</small>}
    </div>
  )
}

function scopeOf(position: BotPositionV2): { label: string; inSource: boolean | null } {
  if (position.in_universe === true) return { label: "Trong nguồn mua", inSource: true }
  if (position.in_universe === false) return { label: "Ngoài nguồn mua", inSource: false }
  return { label: "Chưa xác định", inSource: null }
}

const entrySourceOf = (position: BotPositionV2): string => position.entry_universe_label ?? snapshotSourceText(position.entry_source_snapshot)

function dueText(position: BotPositionV2, strategy: PositionStrategy): string {
  const state = sellStateOf(position, strategy)
  if (state === "due") return "Đã đến hạn"
  if (state === "due_unfilled") return "Đến hạn, chưa khớp"
  return formatDate(position.due_session)
}

function PositionDetail({ position, strategy, onClose }: { position: BotPositionV2; strategy: PositionStrategy; onClose: () => void }) {
  const limit = limitOf(position, strategy)
  const anchorDiffers = !!position.anchor_session && position.anchor_session !== entryOf(position)
  const rows: DetailRow[] = [
    { label: "Phiên mua", value: formatDate(entryOf(position)) },
    { label: "Bán được từ (T+2)", value: formatDate(position.sellable_from_session) },
    { label: "Đã giữ", value: `${heldOf(position)} phiên` },
    ...(anchorDiffers ? [{ label: "Mốc tính hạn", value: `${formatDate(position.anchor_session)} (phiên áp dụng giới hạn)` }] : []),
    { label: "Giới hạn", value: `${limit} phiên · ${strategy?.name ?? "mặc định"}` },
    { label: "Đến hạn", value: dueText(position, strategy) },
    { label: "Nguồn mua lúc mở", value: entrySourceOf(position) },
    { label: "Khối lượng", value: `${formatInt(position.qty)} CP` },
    { label: "Giá vốn", value: formatDong(position.entry_price_vnd) },
    { label: "Giá tham chiếu", value: formatDong(position.current_close_vnd) },
    { label: "Lãi/lỗ tạm tính (sau phí)", value: formatDongSigned(position.unrealized_pnl_net_vnd), tone: TONE_CLASS[toneOf(position.unrealized_pnl_net_vnd)] },
  ]
  return <DetailDialog title={`${position.symbol} · chi tiết vị thế`} rows={rows} onClose={onClose} />
}

/** Đang giữ (§5.5): Đã giữ `counted / N`, the four sell states, entry source and current scope. */
export function PositionsTable({ positions, valuationComplete, strategy }: { positions: BotPositionV2[]; valuationComplete: boolean; strategy: PositionStrategy }) {
  const [open, setOpen] = useState<BotPositionV2 | null>(null)
  const paging = usePaging(positions.length, PAGE_SIZE)
  const rows = positions.slice(paging.start, paging.end)

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
        <Wallet aria-hidden="true" className="size-6 text-primary/60" />
        <p className="text-sm font-medium">Chưa có cổ phiếu đang nắm giữ</p>
      </div>
    )
  }

  return (
    <div>
      <Table aria-label="Vị thế Bot đang giữ" className="min-w-[980px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Mã</TableHead>
            <TableHead className="text-right">Số CP</TableHead>
            <TableHead className="text-right">Giá vốn</TableHead>
            <TableHead className="text-right">Giá tham chiếu</TableHead>
            <TableHead className="text-right">Lãi / Lỗ</TableHead>
            <TableHead className="text-right">Đã giữ</TableHead>
            <TableHead>Trạng thái bán</TableHead>
            <TableHead>Nguồn mua lúc mở</TableHead>
            <TableHead>Phạm vi hiện tại</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((position) => {
            const scope = scopeOf(position)
            const tone = TONE_CLASS[toneOf(position.unrealized_pnl_net_vnd)]
            const move = priceChange(position)
            const counted = countedOf(position)
            const held = heldOf(position)
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
                  {move !== null && <small className={cn("block text-[10px]", TONE_CLASS[toneOf(move)])}>{formatRatio(move)}</small>}
                </TableCell>
                <TableCell className="text-right" data-testid="held-cell">
                  {counted} / {limitOf(position, strategy)} phiên
                  {held !== counted && <small className="block text-[10px] text-academy-subtle">Thực giữ {held} phiên</small>}
                </TableCell>
                <TableCell><SellStateCell position={position} strategy={strategy} /></TableCell>
                <TableCell>{entrySourceOf(position)}</TableCell>
                <TableCell>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium", scope.inSource === true ? "border-primary/40 bg-primary/10 text-primary" : scope.inSource === false ? "border-status-warning/50 bg-status-warning/10 text-status-warning" : "border-border text-foreground")}>
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
      {open && <PositionDetail position={open} strategy={strategy} onClose={() => setOpen(null)} />}
    </div>
  )
}
