/**
 * Tab Lịch sử đấu của sảnh (spec v2.1 §5): sáu ô tổng kết theo khoảng thời gian đang lọc, bộ lọc kết
 * quả và thời gian, danh sách ván (mới nhất trên cùng, 20 ván mỗi trang, tối đa 200 ván gần nhất) và
 * phần chi tiết mở khi bấm một dòng: kết quả của mọi người trong ván và LỆNH CỦA CHÍNH MÌNH. Chỉ xem
 * được lịch sử của mình, không có biểu đồ xem lại, không hiện lệnh của người khác.
 */
import { useState, type ReactNode } from "react"
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type {
  FlashbackHistoryDays,
  FlashbackHistoryItem,
  FlashbackHistoryResultFilter,
  FlashbackHistorySummary,
} from "./flashback-api"
import { PlayerAvatar } from "./flashback-avatar"
import {
  HISTORY_DAY_FILTERS,
  HISTORY_RESULT_FILTERS,
  HISTORY_RESULT_LABEL,
  formatDateTime,
  formatMatchDate,
  formatNumber,
  formatSignedMoney,
  formatSignedPercent,
  historyRankLine,
  historyRoomLine,
  historyXuLine,
  pointsLabel,
  signTone,
} from "./flashback-model"
import { useFlashbackHistory, useFlashbackHistorySummary } from "./use-flashback-progress"

const TONE_CLASS = { up: "text-price-up", down: "text-price-down", flat: "text-foreground" } as const

/** Cột của dòng ván từ màn hình vừa trở lên: Thời gian, Kết quả, Mã, Lợi nhuận, Điểm, mũi tên. */
const ROW_COLUMNS = "sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_96px_20px]"

export function HistoryTab() {
  const [result, setResult] = useState<FlashbackHistoryResultFilter>("all")
  const [days, setDays] = useState<FlashbackHistoryDays>("all")
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  const history = useFlashbackHistory({ result, days, page })
  const summary = useFlashbackHistorySummary(days)

  /** Đổi bộ lọc thì về trang 1 và đóng phần chi tiết đang mở. */
  function pickResult(next: FlashbackHistoryResultFilter) {
    setResult(next)
    setPage(1)
    setOpenId(null)
  }
  function pickDays(next: FlashbackHistoryDays) {
    setDays(next)
    setPage(1)
    setOpenId(null)
  }
  function goPage(next: number) {
    setPage(next)
    setOpenId(null)
  }

  const data = history.data
  const items = data?.items ?? []
  const currentPage = data?.page ?? page
  const pages = data?.pages ?? 1

  return (
    <div className="mx-auto w-full max-w-[1080px] space-y-3" data-testid="flashback-history">
      <SummaryTiles summary={summary.data} loading={summary.isPending} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <FilterGroup label="Lọc kết quả" options={HISTORY_RESULT_FILTERS} value={result} onPick={pickResult} />
        <FilterGroup label="Lọc thời gian" options={HISTORY_DAY_FILTERS} value={days} onPick={pickDays} />
      </div>

      {history.isError && !data ? (
        <PanelState
          title="Chưa tải được lịch sử đấu"
          description="Kiểm tra kết nối rồi thử lại."
          descriptionClassName="text-foreground"
          action={{ label: "Thử lại", onClick: () => void history.refetch() }}
        />
      ) : !data ? (
        <div className="space-y-2" role="status" aria-label="Đang tải lịch sử đấu">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-3 py-6 text-center text-sm font-semibold">Chưa có ván nào</p>
      ) : (
        <section aria-label="Danh sách ván" className="space-y-2">
          <div
            className={cn("hidden items-center gap-3 px-3 text-xs font-semibold text-text-secondary sm:grid", ROW_COLUMNS)}
            aria-hidden="true"
          >
            <span>Thời gian</span>
            <span>Kết quả</span>
            <span>Mã</span>
            <span>Lợi nhuận</span>
            <span className="text-right">Điểm</span>
            <span />
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {items.map((item) => (
              <HistoryRow
                key={item.match_id}
                item={item}
                open={openId === item.match_id}
                onToggle={() => setOpenId((current) => (current === item.match_id ? null : item.match_id))}
              />
            ))}
          </ul>
        </section>
      )}

      {pages > 1 ? (
        <nav aria-label="Phân trang lịch sử" className="flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => goPage(Math.max(1, currentPage - 1))}
          >
            Trang trước
          </Button>
          <span className="text-sm font-semibold tabular-nums" aria-live="polite">
            Trang {currentPage}/{pages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= pages}
            onClick={() => goPage(Math.min(pages, currentPage + 1))}
          >
            Trang sau
          </Button>
        </nav>
      ) : null}
    </div>
  )
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onPick: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          size="sm"
          variant={value === option.id ? "default" : "outline"}
          aria-pressed={value === option.id}
          onClick={() => onPick(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ sáu ô tổng kết

function SummaryTiles({ summary, loading }: { summary: FlashbackHistorySummary | undefined; loading: boolean }) {
  if (!summary) {
    return loading ? (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6" role="status" aria-label="Đang tải tổng kết">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[74px]" />
        ))}
      </div>
    ) : null
  }
  const rate = Math.round(summary.win_rate * 100)
  return (
    <section aria-label="Tổng kết" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      <Tile label="Số ván" value={formatNumber(summary.games)} note={`${formatNumber(summary.solo_games)} ván chơi 1 mình`} />
      <Tile label="Thắng / Tỷ lệ" value={`${formatNumber(summary.wins)} · ${rate}%`} note="Ván từ 2 người" />
      <Tile
        label="Xu"
        value={formatSignedMoney(summary.xu_net)}
        valueClassName={TONE_CLASS[signTone(summary.xu_net)]}
        note="Xu nhận trừ xu cược"
      />
      <Tile label="Điểm cấp" value={`+${formatNumber(summary.points)}`} note="Từ các ván trên" />
      <Tile
        label="Lãi trung bình"
        value={formatSignedPercent(summary.avg_pnl_percent)}
        valueClassName={TONE_CLASS[signTone(summary.avg_pnl_percent)]}
        note="Mỗi ván"
      />
      <Tile
        label="Ván tốt nhất"
        value={summary.best_pnl_percent === null ? "—" : formatSignedPercent(summary.best_pnl_percent)}
        valueClassName={TONE_CLASS[signTone(summary.best_pnl_percent)]}
        note={summary.best_symbol ?? ""}
      />
    </section>
  )
}

function Tile({ label, value, valueClassName, note }: { label: string; value: string; valueClassName?: string; note: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-card px-3.5 py-3" data-testid="flashback-history-tile">
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      <b className={cn("truncate font-heading text-lg font-bold tabular-nums", valueClassName)}>{value}</b>
      <small className="min-h-4 text-[11.5px] font-semibold text-text-secondary">{note}</small>
    </div>
  )
}

// ------------------------------------------------------------------ danh sách ván

function ResultTag({ result }: { result: FlashbackHistoryItem["result"] }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-sm px-2 py-0.5 text-[12.5px] font-extrabold",
        result === "win" || result === "tie"
          ? "bg-price-up/15 text-price-up"
          : result === "lose"
            ? "bg-price-down/15 text-price-down"
            : "bg-muted text-foreground",
      )}
    >
      {HISTORY_RESULT_LABEL[result]}
    </span>
  )
}

function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("flex min-w-0 flex-col gap-0.5", className)}>{children}</span>
}

const SUB = "truncate text-xs font-semibold text-text-secondary tabular-nums"

function HistoryRow({ item, open, onToggle }: { item: FlashbackHistoryItem; open: boolean; onToggle: () => void }) {
  const solo = item.result === "solo"
  const detailId = `flashback-history-${item.match_id}`
  const rank = historyRankLine(item)
  return (
    <li
      data-testid="flashback-history-row"
      data-result={item.result}
      data-open={open}
      className={cn("overflow-hidden rounded-lg border bg-card", open ? "border-primary" : "border-border")}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
        className={cn(
          "grid w-full grid-cols-2 items-center gap-x-3 gap-y-2 px-3 py-2.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
          ROW_COLUMNS,
        )}
      >
        <Cell>
          <b className="tabular-nums">{formatDateTime(item.ended_at)}</b>
          <span className={SUB}>{historyRoomLine(item)}</span>
        </Cell>
        <Cell className="items-end sm:items-start">
          <ResultTag result={item.result} />
          {rank ? <span className={SUB}>{rank}</span> : null}
        </Cell>
        <Cell>
          <b>{item.symbol}</b>
          <span className={cn(SUB, "flex items-center gap-1")}>
            {formatMatchDate(item.start_date)}
            <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">đến</span>
            {formatMatchDate(item.end_date)}
          </span>
        </Cell>
        <Cell className="items-end sm:items-start">
          <b className={cn("tabular-nums", TONE_CLASS[signTone(item.pnl_percent)])}>{formatSignedPercent(item.pnl_percent)}</b>
          <span className={cn(SUB, item.stake_xu > 0 && TONE_CLASS[signTone(item.xu)])}>{historyXuLine(item)}</span>
        </Cell>
        <span className="font-extrabold tabular-nums sm:text-right">
          {solo ? (
            <>
              {/* Spec §5.2: ván chơi 1 mình để dấu "—" ở cột Điểm; người đọc màn hình nghe "Không tính điểm". */}
              <span aria-hidden="true">—</span>
              <span className="sr-only">Không tính điểm</span>
            </>
          ) : (
            pointsLabel(item.points, solo)
          )}
        </span>
        <span className="flex justify-end" aria-hidden="true">
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </span>
      </button>
      {open ? <HistoryDetail id={detailId} item={item} /> : null}
    </li>
  )
}

function HistoryDetail({ id, item }: { id: string; item: FlashbackHistoryItem }) {
  const stake = item.stake_xu > 0
  const multi = item.result !== "solo"
  return (
    <div id={id} className="grid gap-4 border-t border-border px-3 pt-3 pb-3.5 md:grid-cols-2" data-testid="flashback-history-detail">
      <section aria-label="Kết quả ván" className="min-w-0 space-y-1.5">
        <h4 className="font-heading text-sm font-bold">Kết quả ván</h4>
        <ol className="m-0 flex max-h-[40vh] list-none flex-col gap-1 overflow-y-auto p-0">
          {item.players.map((player) => (
            <li
              key={player.user_id}
              data-me={player.is_me}
              className={cn(
                "grid grid-cols-[1.25rem_2rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-[13px] tabular-nums sm:grid-cols-[1.25rem_2rem_minmax(0,1fr)_auto_auto_auto]",
                player.is_me ? "bg-primary/10 outline outline-1 outline-primary" : "bg-muted/40",
              )}
            >
              <span className="text-center font-black">{player.rank}</span>
              <PlayerAvatar
                name={player.name}
                avatarUrl={player.avatar_url}
                seed={player.user_id}
                className="size-[26px]"
                level={player.level}
                crown={player.crown}
              />
              <span className="truncate font-extrabold">{player.name}</span>
              <b className={cn("text-right", TONE_CLASS[signTone(player.pnl_percent)])}>{formatSignedPercent(player.pnl_percent)}</b>
              <span className={cn("text-right font-semibold max-sm:col-start-3", stake && TONE_CLASS[signTone(player.xu)])}>
                {stake ? `${formatSignedMoney(player.xu)} xu` : ""}
              </span>
              <span className="min-w-[64px] text-right font-bold max-sm:col-span-1">{multi ? pointsLabel(player.points, false) : ""}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Lệnh của bạn" className="min-w-0 space-y-1.5">
        <h4 className="font-heading text-sm font-bold">
          Lệnh của bạn · {item.orders.length} lệnh · tiền mặt cuối ván {formatNumber(item.cash_percent)}%
        </h4>
        {item.orders.length === 0 ? (
          <p className="m-0 rounded-md bg-muted/40 px-2 py-3 text-center text-[13px] font-semibold">Không có lệnh</p>
        ) : (
          <div className="max-h-[40vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="text-xs text-text-secondary">
                  <th scope="col" className="px-2 py-1.5 text-left font-semibold">Phiên</th>
                  <th scope="col" className="px-2 py-1.5 text-left font-semibold">Lệnh</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-semibold">KL</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-semibold">Giá</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-semibold">Phí</th>
                </tr>
              </thead>
              <tbody>
                {item.orders.map((order) => (
                  <tr key={order.id} className="border-t border-border" data-testid="flashback-history-order">
                    <td className="px-2 py-1.5">{order.step}</td>
                    <td className={cn("px-2 py-1.5 font-bold", order.side === "buy" ? "text-price-up" : "text-price-down")}>
                      {order.side === "buy" ? "Mua" : "Bán"}
                    </td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(order.qty)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(Number(order.price))}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(Number(order.fee))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
