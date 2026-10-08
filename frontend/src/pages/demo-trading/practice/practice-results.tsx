import { BookOpen, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { PracticeRun } from "./practice-api"
import {
  PENDING_REASON,
  TONE_CLASS,
  formatInt,
  formatRatioPercent,
  formatSignedMoney,
  sessionLabel,
  toneOf,
  type PracticeFrame,
  type TradeRowView,
} from "./practice-model"

function Kpi({ label, value, tone, note, testId }: { label: string; value: string; tone?: "up" | "down" | "flat"; note?: string; testId: string }) {
  return (
    <div className="min-w-0 border-border p-3 min-[520px]:p-4 [&+&]:border-l" data-kpi={testId}>
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <strong className={cn("mt-1.5 block font-heading text-2xl font-bold tabular-nums min-[520px]:text-[28px]", tone ? TONE_CLASS[tone] : "text-foreground")}>{value}</strong>
      {note && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{note}</p>}
    </div>
  )
}

/** The only two aggregates of a practice run: total return and the number of filled buys. */
export function PracticeKpis({ frame, valuationMissing }: { frame: PracticeFrame; valuationMissing: boolean }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card" data-testid="practice-kpis">
      <Kpi
        testId="total_return"
        label="Tổng lợi nhuận"
        value={formatRatioPercent(frame.totalReturn)}
        tone={frame.totalReturn === null ? undefined : toneOf(frame.totalReturn)}
        note={frame.totalReturn === null && valuationMissing ? "Chưa đủ dữ liệu định giá cuối kỳ." : undefined}
      />
      <Kpi testId="buy_count" label="Số giao dịch" value={String(frame.buyCount)} note="Số lần Mua đã khớp" />
    </div>
  )
}

function TradeRow({ row, indicatorName, onOpen }: { row: TradeRowView; indicatorName: string; onOpen: (ordinal: number) => void }) {
  const { trade } = row
  const tone = toneOf(row.pnlVnd)
  const reason = trade.sell?.reason === "max_holding" ? "Hết thời gian giữ" : `Điều kiện ${indicatorName}`
  return (
    <tr
      className="cursor-pointer border-t border-border/70 transition-colors hover:bg-muted/60"
      data-trade-row={trade.ordinal}
      onClick={() => onOpen(trade.ordinal)}
    >
      <td className="px-3 py-2.5">
        <span className="inline-grid size-6 place-items-center rounded-sm bg-muted text-[11px] font-semibold">{trade.ordinal}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="block">{sessionLabel(trade.buy.session)}</span>
        <small className="text-[11px] text-muted-foreground">{formatInt(trade.qty)} CP</small>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatInt(trade.buy.price)}</td>
      <td className="px-3 py-2.5">
        {row.holding || row.sellSession === null ? (
          <Badge variant="secondary">Đang giữ</Badge>
        ) : (
          <>
            <span className="block">{sessionLabel(row.sellSession)}</span>
            <small className="text-[11px] text-muted-foreground">{reason}</small>
          </>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{row.sellPrice === null ? "—" : formatInt(row.sellPrice)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{row.heldSessions} phiên</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        <strong className={cn("block", TONE_CLASS[tone])}>{formatRatioPercent(row.pnlRatio)}</strong>
        <small className="text-[11px] text-muted-foreground">
          {row.provisional ? "Tạm tính " : ""}
          {formatSignedMoney(row.pnlVnd)}
        </small>
      </td>
      <td className="px-2 py-2.5 text-right">
        <button
          type="button"
          aria-label={`Xem giao dịch ${trade.ordinal}`}
          className="inline-grid size-7 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={(event) => {
            event.stopPropagation()
            onOpen(trade.ordinal)
          }}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </td>
    </tr>
  )
}

/** Results of the run at the displayed replay frame, the comment once complete, and the footer slot. */
export function PracticeResults({
  run,
  frame,
  done,
  indicatorName,
  completedCount,
  total,
  onOpenTrade,
  footer,
}: {
  run: PracticeRun
  frame: PracticeFrame
  done: boolean
  indicatorName: string
  completedCount: number
  total: number
  onOpenTrade: (ordinal: number) => void
  footer?: ReactNode
}) {
  const result = run.result
  if (!result) return null
  const open = frame.rows.filter((row) => row.holding).length
  const comment = result.comment
  return (
    <section aria-labelledby="practice-results-heading" className="space-y-3.5" data-testid="practice-results">
      <h2 id="practice-results-heading" className="font-heading text-[15px] font-bold">
        {done ? "Kết quả 24 tháng" : "Kết quả đang chạy"}
      </h2>
      <PracticeKpis frame={frame} valuationMissing={done && result.kpis.valuation === "missing"} />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 px-3 py-3 min-[520px]:px-4">
          <h3 className="font-heading text-sm font-bold">Lịch sử giao dịch</h3>
          <span className="text-[11px] text-muted-foreground">
            {frame.closedCount} đã bán{open ? ` · ${open} đang giữ` : ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-xs" data-testid="practice-trades">
            <thead>
              <tr className="bg-muted/40 text-left text-[11px] font-medium text-muted-foreground">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Phiên mua</th>
                <th className="px-3 py-2 text-right">Giá mua (đ)</th>
                <th className="px-3 py-2">Phiên bán / Đang giữ</th>
                <th className="px-3 py-2 text-right">Giá bán (đ)</th>
                <th className="px-3 py-2 text-right">Thời gian giữ</th>
                <th className="px-3 py-2 text-right">Lãi / lỗ</th>
                <th className="px-2 py-2 text-right">
                  <span className="sr-only">Xem</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {frame.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    Chưa có lần Mua nào.
                  </td>
                </tr>
              ) : (
                frame.rows.map((row) => <TradeRow key={row.trade.ordinal} row={row} indicatorName={indicatorName} onOpen={onOpenTrade} />)
              )}
            </tbody>
          </table>
        </div>
        {done && (result.pending_orders.length > 0 || result.missed_buys.length > 0) && (
          <div className="space-y-1 border-t border-border px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground min-[520px]:px-4" data-testid="practice-pending">
            {result.pending_orders.length > 0 && (
              <>
                <p>Lệnh ở cuối kỳ đang chờ phiên khớp tiếp theo; chưa được tính là đã khớp.</p>
                <ul className="list-disc pl-4">
                  {result.pending_orders.map((order) => (
                    <li key={`${order.side}-${order.signal_session}`}>
                      {PENDING_REASON[order.reason](indicatorName)} · tín hiệu {sessionLabel(order.signal_session)}
                      {order.time_due && order.reason === "indicator" ? " (thời gian giữ cũng đã đến hạn)" : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {result.missed_buys.length > 0 && (
              <p>
                {result.missed_buys.length} tín hiệu Mua không khớp được vì tiền sau phí chưa đủ một lô ({result.missed_buys.map((miss) => sessionLabel(miss.fill_session)).join(", ")}).
              </p>
            )}
          </div>
        )}
      </div>

      {done && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="practice-comment">
          <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold">
            <BookOpen className="size-4 text-primary" aria-hidden="true" />
            Nhận xét
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {comment.status === "ok" && comment.text ? comment.text : "Chưa đủ dữ liệu định giá cuối kỳ nên lượt này chưa có nhận xét."}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="practice-footer">
        <span className="text-[11px] text-muted-foreground">
          {completedCount}/{total} lượt
        </span>
        {footer}
      </div>
    </section>
  )
}
