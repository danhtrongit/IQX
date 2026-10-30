/**
 * Màn chơi Flashback v2 (spec v2 §6): thanh người chơi với đồng hồ chung ở giữa, ba ô số liệu
 * (Phiên, Tổng tài sản, Tiền mặt), biểu đồ, nút "Phiên tiếp" và các phím tắt. Trên điện thoại có
 * thanh nút cố định ở đáy. Mỗi người tự bấm "Phiên tiếp", không chờ người khác; ở phiên cuối nút
 * đổi thành "Hoàn thành".
 */
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Play, Sigma } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { FlashbackPlayer } from "./flashback-api"
import { PlayerAvatar } from "./flashback-avatar"
import { FlashbackChart } from "./flashback-chart"
import { useFlashback, type MatchApi } from "./flashback-context"
import { IndicatorPicker, IndicatorSettings } from "./flashback-indicator-dialogs"
import { defaultParams } from "./flashback-indicators"
import {
  FLASHBACK_LOW_TIME_MS,
  clockText,
  formatMoney,
  formatSignedPercent,
  leaderIds,
} from "./flashback-model"
import { FlashbackResult } from "./flashback-result"

export function FlashbackMatchScreen() {
  const { match, matchLoading, matchFailed, retryMatch } = useFlashback()
  if (match) return <MatchView match={match} />
  if (matchFailed) {
    return (
      <PanelState
        title="Chưa tải được ván chơi"
        description="Kiểm tra kết nối rồi thử lại."
        descriptionClassName="text-foreground"
        action={{ label: "Thử lại", onClick: retryMatch }}
      />
    )
  }
  return (
    <div className="space-y-3" role="status" aria-label={matchLoading ? "Đang tải ván chơi" : "Đang vào ván"}>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-[420px] w-full" />
    </div>
  )
}

function MatchView({ match }: { match: MatchApi }) {
  const frame = useWorkspaceFrame()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [settingsKey, setSettingsKey] = useState<string | null>(null)

  const locked = match.finished || match.ended
  const atLastBar = match.step >= match.playBars
  const { setSide, requestQtyFocus, nextSession, finish } = match
  const resultOpen = match.resultOpen

  /**
   * Hiện khung đặt lệnh (mở lớp trên điện thoại, bung lại cột đã thu gọn trên màn hình rộng) và đưa
   * con trỏ vào ô số cổ phiếu. Lớp trượt trên điện thoại phải chạy xong hiệu ứng mới nhận được con
   * trỏ; cột bên phải màn hình rộng đã nằm sẵn nên nhận ngay, người gõ nhanh không mất chữ số đầu.
   */
  const openOrder = useCallback(
    (side: "buy" | "sell") => {
      setSide(side)
      frame?.revealPanel()
      window.setTimeout(() => requestQtyFocus(), frame?.overlay ? 350 : 0)
    },
    [frame, setSide, requestQtyFocus],
  )

  // Phím tắt: Space = phiên tiếp (hoặc Hoàn thành ở phiên cuối), B/S = chọn Mua/Bán và đưa con trỏ
  // vào ô số cổ phiếu. Không chặn phím khi đang gõ, khi có hộp thoại mở hay khi nút đang giữ phím.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return
      if (pickerOpen || settingsKey !== null || resultOpen || locked) return
      if (event.code === "Space") {
        // Space trên một nút là bấm chính nút đó.
        if (target?.closest("button, a, [role='button'], [role='combobox']")) return
        event.preventDefault()
        if (atLastBar) finish()
        else nextSession()
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
  }, [atLastBar, finish, locked, nextSession, openOrder, pickerOpen, resultOpen, settingsKey])

  const progress = match.playBars > 0 ? Math.min(100, (match.step / match.playBars) * 100) : 0
  const settingsInstance = match.indicators.find((item) => item.key === settingsKey) ?? null
  const settingsMeta = match.indicatorMetas.find((indicator) => indicator.id === settingsInstance?.id) ?? null

  const next = nextButton(match, atLastBar)

  return (
    <div className="space-y-3 max-[900px]:pb-16">
      <PlayerBar match={match} />

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="Số liệu ván chơi">
        <StatTile label="Phiên" value={`${match.step} / ${match.playBars}`} className="col-span-2 sm:col-span-1">
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Tiến độ phiên"
            aria-valuemin={0}
            aria-valuemax={match.playBars}
            aria-valuenow={match.step}
          >
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        </StatTile>
        <StatTile label="Tổng tài sản" value={formatMoney(match.totalAssets)} />
        <StatTile label="Tiền mặt" value={formatMoney(match.cash)} />
      </section>

      <section className="relative flex flex-col gap-2 rounded-lg border border-border bg-card p-2.5">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)} aria-label="Các chỉ báo">
            <Sigma className="size-3.5" aria-hidden="true" />
            Các chỉ báo
          </Button>
        </div>

        <FlashbackChart
          bars={match.bars}
          indicators={match.indicators}
          orders={match.me.orders}
          viewBars={match.viewBars}
          playBars={match.playBars}
          onToggle={match.toggleIndicator}
          onSettings={setSettingsKey}
          onRemove={match.removeIndicator}
        />

        {match.finished && !match.ended ? (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-background/85 p-4" data-testid="flashback-waiting">
            <div className="w-full max-w-[420px] space-y-1.5 rounded-lg border border-border bg-card p-4 text-center">
              <h3 className="font-heading text-lg font-bold">Chờ người chơi khác</h3>
              {match.playingCount > 0 ? <p className="font-semibold">Còn {match.playingCount} người đang chơi</p> : null}
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-2 max-[900px]:hidden">
        <Button type="button" size="lg" data-testid="flashback-next" onClick={next.onClick} disabled={next.disabled}>
          {next.label}
          {next.shortcut ? <kbd className="rounded-sm border border-primary-foreground/40 px-1 text-[11px] font-semibold">Space</kbd> : null}
        </Button>
      </div>

      {/* Thanh cố định đáy trên điện thoại: Mua · Bán · Phiên tiếp */}
      <div className="fixed inset-x-0 bottom-0 z-20 hidden items-center gap-2 border-t border-border bg-card/95 px-3 py-2 backdrop-blur max-[900px]:flex">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="flex-1"
          data-testid="flashback-buy-mobile"
          disabled={locked}
          onClick={() => openOrder("buy")}
        >
          Mua
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="flex-1"
          data-testid="flashback-sell-mobile"
          disabled={locked}
          onClick={() => openOrder("sell")}
        >
          Bán
        </Button>
        <Button
          type="button"
          size="lg"
          className="flex-[1.4]"
          data-testid="flashback-next-mobile"
          onClick={next.onClick}
          disabled={next.disabled}
        >
          {next.label}
        </Button>
      </div>

      <IndicatorPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        indicators={match.indicatorMetas}
        loading={match.indicatorsLoading}
        onPick={(indicator) => {
          match.addIndicator(indicator.id, defaultParams(indicator))
          setPickerOpen(false)
        }}
      />

      <IndicatorSettings
        open={settingsKey !== null}
        onOpenChange={(open) => {
          if (!open) setSettingsKey(null)
        }}
        indicator={settingsMeta}
        instanceKey={settingsKey}
        initialParams={settingsInstance?.params}
        onSave={(params) => {
          if (settingsKey) match.updateIndicator(settingsKey, params)
          setSettingsKey(null)
        }}
      />

      {match.result ? <FlashbackResult match={match} result={match.result} /> : null}
    </div>
  )
}

/** Nhãn và hành vi của nút đáy: Phiên tiếp, Hoàn thành, Đã hoàn thành hoặc Xem kết quả (§6.2, §7.3). */
function nextButton(match: MatchApi, atLastBar: boolean): {
  label: ReactNode
  disabled: boolean
  shortcut: boolean
  onClick: () => void
} {
  if (match.ended) {
    return { label: "Xem kết quả", disabled: !match.result, shortcut: false, onClick: () => match.setResultOpen(true) }
  }
  if (match.finished) {
    return { label: "Đã hoàn thành", disabled: true, shortcut: false, onClick: () => undefined }
  }
  if (atLastBar) {
    return { label: "Hoàn thành", disabled: match.finishBusy, shortcut: false, onClick: match.finish }
  }
  return {
    label: (
      <>
        Phiên tiếp
        <Play className="size-3.5 fill-current" aria-hidden="true" />
      </>
    ),
    disabled: match.nextBusy,
    shortcut: true,
    onClick: match.nextSession,
  }
}

function StatTile({
  label,
  value,
  className,
  children,
}: {
  label: string
  value: string
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-border bg-card p-3", className)}>
      <span className="block text-[11px] font-semibold text-text-secondary">{label}</span>
      <b className="mt-1 block truncate font-heading text-lg font-bold text-foreground tabular-nums">{value}</b>
      {children}
    </div>
  )
}

// ------------------------------------------------------------------ thanh người chơi

function PlayerBar({ match }: { match: MatchApi }) {
  const leaders = leaderIds(match.players)
  const middle = Math.ceil(match.players.length / 2)
  const cells = match.players.map((player) => (
    <PlayerCell key={player.user_id} player={player} leader={leaders.has(player.user_id)} />
  ))
  return (
    <section
      aria-label="Người chơi"
      className="flex flex-wrap items-center justify-center gap-1 rounded-lg border border-border bg-card p-2 min-[901px]:gap-2.5 min-[901px]:p-2.5"
    >
      {cells.slice(0, middle)}
      <MatchClock clock={match.clock} ended={match.ended} onExpire={match.expireClock} />
      {cells.slice(middle)}
    </section>
  )
}

function PlayerCell({ player, leader }: { player: FlashbackPlayer; leader: boolean }) {
  const percent = player.pnl_percent
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 min-[901px]:gap-2.5 min-[901px]:px-2.5",
        player.is_me && "bg-primary/10",
      )}
      data-testid="flashback-player"
      data-me={player.is_me}
      data-leader={leader}
    >
      <PlayerAvatar
        name={player.name}
        avatarUrl={player.avatar_url}
        seed={player.user_id}
        className={cn("size-7 min-[901px]:size-[34px]", leader && "ring-[3px] ring-chart-2")}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <b className="max-w-[74px] truncate text-[13px] font-extrabold min-[901px]:max-w-[130px] min-[901px]:text-[15px]">
          {player.name}
          {leader ? <span className="sr-only"> đang dẫn đầu</span> : null}
        </b>
        <span
          className={cn(
            "self-start rounded-sm px-1.5 py-0.5 text-[13px] leading-none font-extrabold tabular-nums",
            percent > 0 ? "bg-price-up text-card" : percent < 0 ? "bg-price-down text-card" : "bg-muted text-foreground",
          )}
        >
          {formatSignedPercent(percent)}
        </span>
      </div>
    </div>
  )
}

/** Đồng hồ chung của phòng: mm:ss ở giữa thanh, đỏ khi còn dưới 1 phút, "Kết thúc" khi hết ván. */
function MatchClock({
  clock,
  ended,
  onExpire,
}: {
  clock: MatchApi["clock"]
  ended: boolean
  onExpire: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (ended) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ended])

  const remaining = Math.max(0, clock.remainingMs - Math.max(0, now - clock.receivedAt))
  const expired = !ended && remaining <= 0
  // Hết giờ theo đồng hồ: hỏi server ngay để biết ván đã kết thúc chưa.
  useEffect(() => {
    if (expired) onExpire()
  }, [expired, onExpire])

  const low = !ended && remaining < FLASHBACK_LOW_TIME_MS
  return (
    <div
      className="flex items-center justify-center border-x border-border px-3.5 max-[900px]:order-first max-[900px]:w-full max-[900px]:border-x-0 max-[900px]:border-b max-[900px]:px-0 max-[900px]:pb-1.5"
      data-testid="flashback-clock"
      data-low={low}
      role="timer"
      aria-label="Thời gian còn lại"
    >
      <b
        className={cn(
          "font-heading text-lg font-black tabular-nums min-[901px]:text-[22px]",
          low ? "text-destructive" : "text-foreground",
        )}
      >
        {ended ? "Kết thúc" : clockText(remaining)}
      </b>
    </div>
  )
}
