/**
 * Màn chơi Flashback v2 (spec v2 §6, v2.1 §6, §7, v2.4 §2): thanh người chơi với đồng hồ chung ở giữa,
 * bốn ô số liệu (Phiên, Tổng tài sản, Tiền mặt, Lợi nhuận của mình), biểu đồ kèm nút "Các chỉ báo" và công cụ vẽ, nút "Phiên
 * tiếp" và các phím tắt. Trên điện thoại có thanh nút cố định ở đáy. Mỗi người tự bấm "Phiên tiếp",
 * không chờ người khác; ở phiên cuối nút đổi thành "Hoàn thành".
 *
 * Thẻ nến (Candle Dojo v1.2 §9): khung và nhãn mẫu nến trên biểu đồ, thẻ bật lên rồi lướt vào khối "Thẻ trong ván" cùng hàng với nút
 * "Phiên tiếp" (điện thoại: một hàng dưới biểu đồ). Chỉ thêm các phần này, màn chơi giữ nguyên.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Play, Sigma } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { FlashbackCallBar } from "./flashback-call-bar"
import { FlashbackCardPopup, type CardPopupHandle } from "./flashback-card-popup"
import { FlashbackCardsTray } from "./flashback-cards-tray"
import { ChatUnreadBadge } from "./flashback-chat"
import { useChatOpener } from "./use-flashback-chat"
import { FlashbackChatSheet } from "./flashback-chat-sheet"
import { FlashbackChart } from "./flashback-chart"
import { useFlashback, type ChatApi, type MatchApi } from "./flashback-context"
import { DrawingToolbar } from "./flashback-drawing-toolbar"
import { IndicatorPicker, IndicatorSettings } from "./flashback-indicator-dialogs"
import { MAX_INDICATORS } from "./flashback-indicator-store"
import { defaultParams } from "./flashback-indicators"
import { iqlineFlashbackEnabled } from "./iqline-flag"
import { formatMoney, formatSignedPercent, profitPercent } from "./flashback-model"
import { PlayerBar } from "./flashback-player-bar"
import { FlashbackResult } from "./flashback-result"
import { useResultLock } from "./use-result-lock"
import { useChartDrawings } from "./use-chart-drawings"
import { useMatchCards } from "./use-flashback-cards"

/** Biểu đồ IQLine (`?iqline=1`) tải chậm: ở đường mặc định thư viện Canvas không được tải. */
const FlashbackIqlineChart = lazy(() => import("./flashback-chart-iqline"))

export function FlashbackMatchScreen() {
  const { match, chat, matchLoading, matchFailed, retryMatch } = useFlashback()
  // `key` theo ID ván: sang ván mới thì hình vẽ và các hộp thoại bắt đầu lại (v2.1 §7.5).
  if (match) return <MatchView key={match.snapshot.match_id} match={match} chat={chat} />
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

function MatchView({ match, chat }: { match: MatchApi; chat: ChatApi }) {
  const frame = useWorkspaceFrame()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [settingsKey, setSettingsKey] = useState<string | null>(null)

  const locked = match.finished || match.ended
  const atLastBar = match.step >= match.playBars
  const { setSide, requestQtyFocus, nextSession, finish } = match
  const resultOpen = match.resultOpen
  const lockSeconds = useResultLock(resultOpen)
  const openChat = useChatOpener(chat)
  const closeChat = chat.setOpen
  // Biểu đồ IQLine khi URL có `?iqline=1`, còn lại là biểu đồ SVG cũ (công tắc ở `iqline-flag.ts`).
  const iqline = iqlineFlashbackEnabled()
  const dialogsClosed = !pickerOpen && settingsKey === null && !resultOpen
  // Hình vẽ của riêng mình, giữ trong suốt ván (kể cả khi "Xem lại biểu đồ"); phím tắt tắt khi có hộp thoại.
  // Biểu đồ IQLine giữ hình ở bộ điều khiển riêng của nó nên hook này tắt phím tắt để không xử lý hai lần.
  const drawings = useChartDrawings(!iqline && dialogsClosed)
  // Thẻ nến đã gặp (server chỉ trả thẻ mình sở hữu): khung trên biểu đồ, khay, thẻ bật lên và bay vào khay.
  const cards = useMatchCards(match.snapshot.cards, match.step)
  const chartRef = useRef<HTMLElement>(null)
  const trayRef = useRef<HTMLElement>(null)
  const popupRef = useRef<CardPopupHandle>(null)

  /**
   * Hiện khung đặt lệnh (mở lớp trên điện thoại, bung lại cột đã thu gọn trên màn hình rộng) và đưa
   * con trỏ vào ô số cổ phiếu. Lớp trượt trên điện thoại phải chạy xong hiệu ứng mới nhận được con
   * trỏ; cột bên phải màn hình rộng đã nằm sẵn nên nhận ngay, người gõ nhanh không mất chữ số đầu.
   */
  const openOrder = useCallback(
    (side: "buy" | "sell") => {
      // Khung chat đè lên panel Đặt lệnh: đặt lệnh thì đóng lại.
      closeChat(false)
      setSide(side)
      frame?.revealPanel()
      window.setTimeout(() => requestQtyFocus(), frame?.overlay ? 350 : 0)
    },
    [closeChat, frame, setSide, requestQtyFocus],
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
        // Thẻ chưa bay xong thì vào khay ngay, rồi mới xử lý phiên mới (Candle Dojo §9.3).
        popupRef.current?.finish()
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

  const indicatorsButton = (
    <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)} aria-label="Các chỉ báo">
      <Sigma className="size-3.5" aria-hidden="true" />
      Các chỉ báo
    </Button>
  )

  const next = nextButton(match, atLastBar)
  const onNext = () => {
    popupRef.current?.finish()
    next.onClick()
  }
  // Chỉ của mình, tính từ tài khoản của mình; server không trả % của người khác trong lúc chơi (v2.4 §2).
  const profit = profitPercent(match.totalAssets, match.initialCash)

  return (
    <div className="space-y-3 max-[900px]:pb-16">
      <PlayerBar match={match} chat={chat} />

      <FlashbackCallBar inMatch />

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="Số liệu ván chơi">
        <StatTile label="Phiên" value={`${match.step} / ${match.playBars}`}>
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
        <StatTile
          label="Lợi nhuận"
          value={formatSignedPercent(profit)}
          valueClassName={profit > 0 ? "text-price-up" : profit < 0 ? "text-price-down" : "text-foreground"}
          testId="flashback-profit"
        />
      </section>

      <section ref={chartRef} className="relative flex flex-col gap-2 rounded-lg border border-border bg-card p-2.5">
        {iqline ? (
          <Suspense
            fallback={
              <>
                <div className="flex flex-wrap items-center gap-2">{indicatorsButton}</div>
                <Skeleton className="h-[420px] w-full" role="status" aria-label="Đang tải biểu đồ" />
              </>
            }
          >
            <FlashbackIqlineChart
              leading={indicatorsButton}
              bars={match.bars}
              warmup={match.warmup}
              indicators={match.indicators}
              orders={match.me.orders}
              viewBars={match.viewBars}
              playBars={match.playBars}
              legacyShapes={drawings.state.shapes}
              drawingKeys={dialogsClosed}
              cards={cards.cards}
              cardHighlight={cards.focus}
              onToggle={match.toggleIndicator}
              onSettings={setSettingsKey}
              onRemove={match.removeIndicator}
            />
          </Suspense>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {indicatorsButton}
              <DrawingToolbar drawings={drawings} />
            </div>

            <FlashbackChart
              bars={match.bars}
              indicators={match.indicators}
              orders={match.me.orders}
              viewBars={match.viewBars}
              playBars={match.playBars}
              drawings={drawings}
              cards={cards.cards}
              cardHighlight={cards.focus}
              onToggle={match.toggleIndicator}
              onSettings={setSettingsKey}
              onRemove={match.removeIndicator}
            />
          </>
        )}

        {match.finished && !match.ended ? (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-background/85 p-4" data-testid="flashback-waiting">
            <div className="w-full max-w-[420px] space-y-1.5 rounded-lg border border-border bg-card p-4 text-center">
              <h3 className="font-heading text-lg font-bold">Chờ người chơi khác</h3>
              {match.playingCount > 0 ? <p className="font-semibold">Còn {match.playingCount} người đang chơi</p> : null}
            </div>
          </div>
        ) : null}
      </section>

      {/* Máy tính: nút "Phiên tiếp" và khối "Thẻ trong ván" chung một hàng. Điện thoại: nút nằm ở thanh đáy, khối thẻ là một hàng dưới biểu đồ. */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="lg"
          className="max-[900px]:hidden"
          data-testid="flashback-next"
          onClick={onNext}
          disabled={next.disabled}
        >
          {next.label}
          {next.shortcut ? <kbd className="rounded-sm border border-primary-foreground/40 px-1 text-[11px] font-semibold">Space</kbd> : null}
        </Button>
        <FlashbackCardsTray
          ref={trayRef}
          cards={cards.cards}
          hidden={cards.flying}
          landed={cards.landed}
          onSelect={cards.flash}
        />
      </div>

      {/* Thanh cố định đáy trên điện thoại: Mua · Bán · Chat · Phiên tiếp */}
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
        {chat.enabled ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="relative flex-1"
            aria-pressed={chat.open}
            data-testid="flashback-chat-mobile"
            onClick={() => openChat(!chat.open)}
          >
            Chat
            <ChatUnreadBadge count={chat.unread} />
          </Button>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="flex-[1.4]"
          data-testid="flashback-next-mobile"
          onClick={onNext}
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
          // Biểu đồ IQLine kiểm tra trần chỉ báo ở đây (biểu đồ SVG cũ chỉ cắt khi nạp từ trình duyệt).
          if (iqline && match.indicators.length >= MAX_INDICATORS) {
            toast.info(`Tối đa ${MAX_INDICATORS} chỉ báo`)
            setPickerOpen(false)
            return
          }
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

      <FlashbackCardPopup
        ref={popupRef}
        arrival={cards.arrival}
        chartRef={chartRef}
        trayRef={trayRef}
        onFocus={cards.setFocus}
        onFlying={cards.setFlying}
        onLanded={cards.land}
      />

      <FlashbackChatSheet chat={chat} />

      {match.result ? <FlashbackResult match={match} result={match.result} chat={chat} lockSeconds={lockSeconds} /> : null}
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
  valueClassName = "text-foreground",
  testId,
  children,
}: {
  label: string
  value: string
  valueClassName?: string
  testId?: string
  children?: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <span className="block text-[11px] font-semibold text-text-secondary">{label}</span>
      <b className={cn("mt-1 block truncate font-heading text-lg font-bold tabular-nums", valueClassName)} data-testid={testId}>
        {value}
      </b>
      {children}
    </div>
  )
}
