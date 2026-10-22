/**
 * Vùng chính của Flashback (spec v1.1 §2.2, §2.4, §2.5).
 *
 * Thẻ "Đề mới đã mở" phủ biểu đồ cho tới khi người chơi tham gia; sau đó biểu đồ mở kèm ô số
 * liệu, nút "Phiên tiếp" và các phím tắt. Trên điện thoại có thanh nút cố định ở đáy.
 */
import { useCallback, useEffect, useState } from "react"
import { Sigma, Timer, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { cn } from "@/lib/utils"
import { FlashbackChart } from "./flashback-chart"
import { useFlashback } from "./flashback-context"
import { IndicatorPicker, IndicatorSettings } from "./flashback-indicator-dialogs"
import { defaultParams } from "./flashback-indicators"
import { FlashbackResult } from "./flashback-result"
import {
  FLASHBACK_PLAY_SESSIONS,
  countdownText,
  formatMoney,
  formatNumber,
  formatSignedPercent,
} from "./flashback-model"
import { useFlashbackIndicators } from "./use-flashback"

export function FlashbackMain({ onNavigate }: { onNavigate: (panel: string) => void }) {
  const game = useFlashback()
  const frame = useWorkspaceFrame()
  const unlocked = useFlashbackIndicators(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [settingsKey, setSettingsKey] = useState<string | null>(null)
  const [resultOpen, setResultOpen] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  /** Mở khung đặt lệnh (panel trên điện thoại) và đưa con trỏ vào ô số cổ phiếu. */
  const openOrder = useCallback((side: "buy" | "sell") => {
    game.setSide(side)
    game.setPanelTab("trade")
    frame?.setOpen(true)
    window.setTimeout(() => game.requestQtyFocus(), 350)
  }, [frame, game])

  // Phím tắt: Space = phiên tiếp, B/S = chọn Mua/Bán và đưa con trỏ vào ô số cổ phiếu.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return
      if (pickerOpen || settingsKey) return
      if (event.code === "Space") {
        event.preventDefault()
        if (!game.entry) return
        if (game.step < FLASHBACK_PLAY_SESSIONS) {
          void game.nextSession()
        } else if (game.entry.status !== "finished" && !game.finished) {
          void game.finish()
        }
        return
      }
      if (event.key === "b" || event.key === "B") {
        event.preventDefault()
        openOrder("buy")
        return
      }
      if (event.key === "s" || event.key === "S") {
        event.preventDefault()
        openOrder("sell")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [game, openOrder, pickerOpen, settingsKey])

  if (game.loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground" role="status">
        Đang tải đề Flashback…
      </div>
    )
  }

  if (game.failed || !game.round) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground" role="status">
        Chưa tải được đề Flashback. Hãy thử lại sau.
      </div>
    )
  }

  const round = game.round
  const joined = game.entry !== null
  const finished = game.entry?.status === "finished"
  const atLastSession = game.step >= FLASHBACK_PLAY_SESSIONS
  const progress = Math.min(100, (game.step / FLASHBACK_PLAY_SESSIONS) * 100)
  const settingsInstance =
    game.indicators.find((item) => item.key === settingsKey) ?? null
  const settingsMeta =
    (unlocked.data?.indicators ?? []).find((indicator) => indicator.id === settingsInstance?.id) ?? null

  return (
    <div className="space-y-3 max-[900px]:pb-16">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="font-heading text-xl font-bold">Flashback</h2>
        {round.round_no != null ? (
          <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground">
            {`Đề #${round.round_no}`}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-chart-2/50 bg-chart-2/10 px-2.5 py-1 text-xs font-semibold text-foreground">
          <Timer className="size-3.5 text-chart-2" aria-hidden="true" />
          Đóng sau <span className="tabular-nums">{countdownText(round.closes_at, now)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
          <Users className="size-3.5" aria-hidden="true" />
          <span className="tabular-nums">{formatNumber(round.player_count)}</span> người chơi
        </span>
      </header>

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-[1.3fr_1fr_1fr_1fr]" aria-label="Số liệu lượt chơi">
        <StatTile label="Phiên" value={`${game.step} / ${FLASHBACK_PLAY_SESSIONS}`}>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        </StatTile>
        <StatTile label="Tổng tài sản" value={formatMoney(game.totalAssets)} />
        <StatTile label="Tiền mặt" value={formatMoney(game.cash)} />
        <StatTile
          label="Lợi nhuận"
          value={formatSignedPercent(game.pnlPct)}
          tone={game.pnlPct > 0 ? "up" : game.pnlPct < 0 ? "down" : undefined}
        />
      </section>

      <section className="relative flex min-h-[420px] flex-col gap-2 rounded-lg border border-border bg-card p-2.5">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
            aria-label="Các chỉ báo"
          >
            <Sigma className="size-3.5" aria-hidden="true" />
            Các chỉ báo
          </Button>
        </div>

        <FlashbackChart
          bars={game.bars}
          indicators={game.indicators}
          orders={game.entry?.orders ?? []}
          historySessions={game.historySessions}
          totalSlots={game.totalSlots}
          onToggle={game.toggleIndicator}
          onSettings={setSettingsKey}
          onRemove={game.removeIndicator}
        />

        {joined ? null : (
          <JoinCard
            roundNo={round.round_no}
            firstJoinFree={round.first_join_free}
            feeXu={round.fee_xu}
            rewardTable={round.reward_table}
            closesAt={round.closes_at}
            now={now}
            busy={game.joinBusy}
            error={game.joinError}
            onJoin={game.join}
            onEnterAcademy={() => onNavigate("academy")}
          />
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2 max-[900px]:hidden">
        <Button
          type="button"
          size="lg"
          data-testid="flashback-next"
          onClick={atLastSession ? () => void game.finish() : () => void game.nextSession()}
          disabled={!joined || finished || (atLastSession ? game.finishBusy : game.nextBusy)}
        >
          {finished ? "Đã hoàn thành đề" : atLastSession ? "Kết thúc và xem kết quả" : "Phiên tiếp ▶"}
        </Button>
      </div>

      {/* Thanh cố định đáy trên điện thoại: Mua · Bán · Phiên tiếp */}
      <div className="fixed inset-x-0 bottom-0 z-20 hidden items-center gap-2 border-t border-border bg-card/95 px-3 py-2 backdrop-blur max-[900px]:flex">
        <Button type="button" variant="outline" size="lg" className="flex-1" onClick={() => openOrder("buy")}>
          Mua
        </Button>
        <Button type="button" variant="outline" size="lg" className="flex-1" onClick={() => openOrder("sell")}>
          Bán
        </Button>
        <Button
          type="button"
          size="lg"
          className="flex-1"
          data-testid="flashback-next-mobile"
          onClick={atLastSession ? () => void game.finish() : () => void game.nextSession()}
          disabled={!joined || finished || (atLastSession ? game.finishBusy : game.nextBusy)}
        >
          {finished ? "Xong" : atLastSession ? "Kết thúc và xem kết quả" : "Phiên tiếp ▶"}
        </Button>
      </div>

      <IndicatorPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        indicators={unlocked.data?.indicators ?? []}
        onPick={(indicator) => {
          game.addIndicator(indicator.id, defaultParams(indicator))
          setPickerOpen(false)
        }}
        onEnterAcademy={() => onNavigate("academy")}
      />

      <IndicatorSettings
        open={settingsKey !== null}
        onOpenChange={(open) => { if (!open) setSettingsKey(null) }}
        indicator={settingsMeta}
        instanceKey={settingsKey}
        initialParams={settingsInstance?.params}
        onSave={(params) => {
          if (settingsKey) game.updateIndicator(settingsKey, params)
          setSettingsKey(null)
        }}
      />

      {finished && resultOpen ? (
        <FlashbackResult
          onClose={() => setResultOpen(false)}
          onShowLeaderboard={() => {
            setResultOpen(false)
            game.setPanelTab("rank")
          }}
        />
      ) : null}
    </div>
  )
}

function StatTile({
  label,
  value,
  tone,
  children,
}: {
  label: string
  value: string
  tone?: "up" | "down"
  children?: React.ReactNode
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <span className="block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <b
        className={cn(
          "mt-1 block truncate font-heading text-lg font-bold tabular-nums",
          tone === "up" ? "text-price-up" : tone === "down" ? "text-price-down" : "text-foreground",
        )}
      >
        {value}
      </b>
      {children}
    </div>
  )
}

function JoinCard({
  roundNo,
  firstJoinFree,
  feeXu,
  rewardTable,
  closesAt,
  now,
  busy,
  error,
  onJoin,
  onEnterAcademy,
}: {
  roundNo?: number | null
  firstJoinFree: boolean
  feeXu: number
  rewardTable: { from_rank: number; to_rank: number | null; xu?: number; reward_xu?: number }[]
  closesAt: string
  now: number
  busy: boolean
  error: string | null
  onJoin: () => void
  onEnterAcademy: () => void
}) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-background/85 p-4" data-testid="join-card">
      <div className="w-full max-w-[420px] space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-heading text-lg font-bold">Đề mới đã mở</h3>
          {roundNo != null ? (
            <span className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-semibold text-foreground">
              {`Đề #${roundNo}`}
            </span>
          ) : null}
        </div>
        <Row label="Dữ liệu" value="60 phiên lịch sử, chơi 60 phiên" />
        <Row label="Vốn" value={formatMoney(10_000_000)} />
        <Row label="Thời gian" value={`Đóng sau ${countdownText(closesAt, now)}`} />
        <Row label="Phí tham gia" value={firstJoinFree ? "Miễn phí (lần đầu tham gia)" : `${formatNumber(feeXu)} xu`} />
        <div className="space-y-1 rounded-md border border-border bg-muted/40 p-2.5">
          {rewardTable
            .filter((row) => (row.reward_xu ?? row.xu ?? 0) > 0)
            .map((row) => {
              const rewardXu = row.reward_xu ?? row.xu ?? 0
              const label =
                row.to_rank === row.from_rank
                  ? `Hạng ${row.from_rank}`
                  : row.to_rank
                    ? `Hạng ${row.from_rank}–${row.to_rank}`
                    : `Từ ${row.from_rank} trở xuống`
              return (
                <Row
                  key={`${row.from_rank}-${row.to_rank ?? "last"}`}
                  label={label}
                  value={`${formatNumber(rewardXu)} xu`}
                />
              )
            })}
        </div>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <Button type="button" className="w-full" onClick={onJoin} disabled={busy}>
          {firstJoinFree ? "Tham gia miễn phí" : `Tham gia · ${formatNumber(feeXu)} xu`}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onEnterAcademy}>
          Học thêm bài để có xu
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <b className="text-right font-semibold tabular-nums text-foreground">{value}</b>
    </div>
  )
}
