import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, FastForward, History, Info, Pause, Play } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { legendItems, windowIndices, THRESHOLD_STROKE, REFERENCE_STROKE } from "./chart-geometry"
import { PracticeFailureNotice } from "./practice-failure"
import { PracticeChartView } from "./practice-chart"
import { usePractice } from "./practice-context"
import { PracticeAssumptionsDialog, PracticeHistoryDialog } from "./practice-dialogs"
import { SIDES, SIDE_LABEL, formatDec, frameAt } from "./practice-model"
import { useExitPractice } from "./practice-nav"
import { PLAYBACK_SPEEDS, TICK_MS, pausePlayback, usePlayback, type PlaybackSpeed } from "./practice-playback"
import { PracticeResults } from "./practice-results"
import { TradeDetailDialog } from "./trade-detail-dialog"

const pad2 = (value: number) => String(value).padStart(2, "0")
const PAN_STEP = 20

function Legend() {
  const { chart, side, setSide, previewFetching, phase } = usePractice()
  const plot = chart?.plot[side]
  const items = plot ? legendItems(plot) : []
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 pb-2 text-[11px] min-[520px]:px-4" data-testid="practice-legend">
      <div role="group" aria-label="Phía điều kiện hiển thị trên biểu đồ" className="inline-flex overflow-hidden rounded-sm border border-border">
        {SIDES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={side === item}
            data-chart-side={item}
            onClick={() => setSide(item)}
            className={cn(
              "px-2.5 py-1 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              side === item ? (item === "buy" ? "bg-price-up/20 text-price-up" : "bg-price-down/20 text-price-down") : "bg-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {SIDE_LABEL[item]}
          </button>
        ))}
      </div>
      <span className="text-muted-foreground" data-testid="legend-side">
        Tham số phía {SIDE_LABEL[side]}
      </span>
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5 text-muted-foreground">
          <i
            aria-hidden="true"
            className="inline-block h-0.5 w-3.5"
            style={{ background: item.dash ? `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 7px)` : item.color }}
          />
          {item.label}
        </span>
      ))}
      {plot?.threshold_levels.map((level) => (
        <span key={`threshold-${level}`} className="inline-flex items-center gap-1.5 text-muted-foreground" data-legend="threshold">
          <i aria-hidden="true" className="inline-block h-0.5 w-3.5" style={{ background: `repeating-linear-gradient(90deg, ${THRESHOLD_STROKE} 0 5px, transparent 5px 8px)` }} />
          Ngưỡng {formatDec(level)} (điều kiện {SIDE_LABEL[side]})
        </span>
      ))}
      {plot && plot.reference_levels.length > 0 && (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground" data-legend="reference">
          <i aria-hidden="true" className="inline-block h-0.5 w-3.5" style={{ background: `repeating-linear-gradient(90deg, ${REFERENCE_STROKE} 0 1.5px, transparent 1.5px 4.5px)` }} />
          Mốc tham khảo {plot.reference_levels.map(formatDec).join(" · ")}, không phải ngưỡng điều kiện
        </span>
      )}
      {previewFetching && phase === "ready" && (
        <span className="text-muted-foreground" aria-live="polite">
          Đang cập nhật biểu đồ…
        </span>
      )}
    </div>
  )
}

function PlaybackBar({ lastSession }: { lastSession: number }) {
  const practice = usePractice()
  const { playbackStore: store, playbackControls: controls, phase, run } = practice
  const playing = usePlayback(store, (value) => value.playing)
  const speed = usePlayback(store, (value) => value.speed)
  const revealed = usePlayback(store, (value) => (value.runId === run?.run_id ? value.revealed : 0))
  const replaying = phase === "replaying"
  const percent = run && lastSession > 0 ? Math.min(100, (revealed / lastSession) * 100) : 0
  const status =
    phase === "ready" || phase === "starting"
      ? phase === "starting"
        ? "Đang khóa cấu hình…"
        : "Sẵn sàng luyện tập"
      : phase === "replaying"
        ? playing
          ? "Đang chạy"
          : "Đã tạm dừng"
        : phase === "computing" || phase === "failed"
          ? "Chưa có kết quả"
          : phase === "viewing_past"
            ? "Đã hoàn thành · xem lại"
            : "Đã hoàn thành"
  return (
    <div className="border-t border-border bg-muted/30" data-testid="practice-playback">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[11px] text-muted-foreground min-[520px]:px-4">
        <span aria-live="polite" data-testid="practice-status">
          {status}
          {replaying && <span className="tabular-nums"> · Phiên {revealed}/{lastSession}</span>}
        </span>
        {replaying && controls ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Điều khiển phát lại">
            <Button type="button" variant="outline" size="sm" onClick={() => controls.toggle()}>
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {playing ? "Tạm dừng" : "Tiếp tục"}
            </Button>
            <label className="inline-flex items-center gap-1.5">
              <span className="sr-only">Tốc độ chạy</span>
              <select
                aria-label="Tốc độ chạy"
                value={speed}
                onChange={(event) => controls.setSpeed(Number(event.target.value) as PlaybackSpeed)}
                className="h-7 rounded-sm border border-input bg-background px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                {PLAYBACK_SPEEDS.map((option) => (
                  <option key={option} value={option}>
                    {option}×
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="outline" size="sm" disabled={!practice.actionsArmed} onClick={() => controls.finish()}>
              <FastForward aria-hidden="true" />
              Xem kết quả ngay
            </Button>
          </div>
        ) : phase === "ready" || phase === "starting" ? (
          <span>Điều kiện được khóa khi Bắt đầu</span>
        ) : run?.result ? (
          <span>24 tháng · {run.result.last_session} phiên</span>
        ) : null}
      </div>
      <div className="h-0.5 bg-border" role="progressbar" aria-label="Tiến độ phát lại" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export function PracticeMain() {
  const practice = usePractice()
  const exit = useExitPractice()
  const { state, spec, phase, run, chart, indicatorId, indicatorName, side, playbackStore: store, playbackControls: controls } = practice

  const [historyOpen, setHistoryOpen] = useState(false)
  const [assumptionsOpen, setAssumptionsOpen] = useState(false)
  const [detailOrdinal, setDetailOrdinal] = useState<number | null>(null)
  const [pan, setPan] = useState<{ runId: string | null; end: number } | null>(null)
  const cardRef = useRef<HTMLElement | null>(null)

  const runId = run?.run_id ?? null
  const lastSession = run?.result?.last_session ?? 0
  const attached = usePlayback(store, (value) => value.runId)
  const storeRevealed = usePlayback(store, (value) => value.revealed)
  const playing = usePlayback(store, (value) => value.playing)
  // Before the run exists only the observation window is drawn (session 0 is its last bar).
  const revealed = run?.result ? (attached === run.run_id ? storeRevealed : Math.min(1, lastSession)) : (chart?.last_session ?? 0)
  const panEnd = pan && pan.runId === runId && !playing ? pan.end : null

  // Replay clock: runs only while the main area is mounted; leaving pauses and remembers the position.
  useEffect(() => {
    if (!playing || !controls) return
    const timer = setInterval(() => controls.tick(), TICK_MS)
    return () => clearInterval(timer)
  }, [playing, controls])
  useEffect(() => () => pausePlayback(store), [store])

  const frame = useMemo(() => (run?.result ? frameAt(run, revealed) : null), [run, revealed])
  const events = run?.result?.events
  const chartEvents = useMemo(() => events ?? [], [events])

  const windowBars = state?.case.window_bars ?? 130
  const win = chart ? windowIndices({ firstSession: chart.first_session, revealed, windowBars, panEnd, barCount: chart.bars.close.length }) : null
  const sliderMin = chart && win ? chart.first_session + win.minEnd : 0
  const sliderMax = chart && win ? chart.first_session + win.maxEnd : 0
  const sliderValue = chart && win ? chart.first_session + win.end : 0
  const movePan = useCallback(
    (end: number) => {
      controls?.pause()
      setPan({ runId, end })
    },
    [controls, runId],
  )

  const openTrade = useCallback(
    (ordinal: number) => {
      controls?.pause()
      setDetailOrdinal(ordinal)
    },
    [controls],
  )
  const focusSession = useCallback(
    (session: number) => {
      controls?.pause()
      setDetailOrdinal(null)
      setPan({ runId, end: session + Math.round(windowBars / 5) })
      cardRef.current?.scrollIntoView?.({ block: "nearest" })
    },
    [controls, runId, windowBars],
  )
  const detailRow = frame?.rows.find((row) => row.trade.ordinal === detailOrdinal) ?? null

  const shownOrdinal = practice.viewingPast && run ? run.ordinal : (state?.ordinal ?? 1)
  const resultsFooter =
    phase === "viewing_past" ? (
      <Button type="button" variant="outline" disabled={!practice.actionsArmed} onClick={() => practice.viewRun(null)}>
        <ArrowLeft aria-hidden="true" />
        Về lượt hiện tại
      </Button>
    ) : phase === "set_completed" ? (
      <Button type="button" disabled>
        Đã hết {state?.total ?? 30} lượt
      </Button>
    ) : phase === "completed" ? (
      <Button type="button" disabled={!practice.canNext || practice.nextPending || !practice.actionsArmed} onClick={() => void practice.next()}>
        Tập luyện tiếp
        <ArrowRight aria-hidden="true" />
      </Button>
    ) : null

  return (
    <section aria-labelledby="workspace-heading" className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="practice-main">
      <header className="flex min-h-16 shrink-0 flex-col justify-center gap-0.5 border-b border-border bg-card px-3 py-2 min-[901px]:px-4">
        <h1 id="workspace-heading" className="truncate font-heading text-base font-bold min-[901px]:text-lg">
          Luyện tập {indicatorName}
        </h1>
        <p className="truncate text-xs text-muted-foreground">Thiết lập điều kiện và quan sát từng giao dịch.</p>
      </header>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block">
        <div className="min-w-0 space-y-3 p-1.5 min-[901px]:p-3 min-[1750px]:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={exit}>
              <ArrowLeft aria-hidden="true" />
              Về Bot
            </Button>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" disabled={!state} onClick={() => setHistoryOpen(true)}>
                <History aria-hidden="true" />
                Lượt đã luyện
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={!state} onClick={() => setAssumptionsOpen(true)}>
                <Info aria-hidden="true" />
                Giả định
              </Button>
            </div>
          </div>

          {phase === "error" && practice.loadFailure && (
            <PracticeFailureNotice failure={practice.loadFailure} indicatorId={indicatorId} onRetry={practice.reload} />
          )}

          {phase === "viewing_past" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs" data-testid="past-banner">
              <span>Đang xem lại lượt đã hoàn thành · Cấu hình được giữ nguyên.</span>
              <Button type="button" size="sm" variant="outline" onClick={() => practice.viewRun(null)}>
                Về lượt hiện tại
              </Button>
            </div>
          )}
          {phase === "set_completed" && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs leading-relaxed" data-testid="set-completed">
              Bạn đã hoàn thành cả {state?.total ?? 30} tình huống của bộ này. Không có lượt tiếp theo; mở “Lượt đã luyện” để xem lại bất kỳ lượt nào.
            </div>
          )}
          {!run && practice.runFailure && phase !== "failed" && phase !== "error" && (
            <PracticeFailureNotice failure={practice.runFailure} indicatorId={indicatorId} onRetry={practice.reload} />
          )}
          {phase === "failed" && (
            <PracticeFailureNotice
              failure={practice.runFailure ?? { kind: "compute_failed", message: "Không tính được kết quả lượt này. Lượt vẫn được giữ để thử lại." }}
              indicatorId={indicatorId}
              onRetry={() => void practice.retryStart()}
            />
          )}

          {phase !== "error" && (
            <section ref={cardRef} className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="practice-chart-title">
              <div className="flex items-center justify-between gap-3 px-3 pt-3 pb-2 min-[520px]:px-4">
                <h2 id="practice-chart-title" className="font-heading text-sm font-bold">
                  Luyện tập {indicatorName}
                </h2>
                <span className="text-xs tabular-nums text-muted-foreground" data-testid="practice-ordinal">
                  Lượt {pad2(shownOrdinal)} / {state?.total ?? 30}
                </span>
              </div>
              <Legend />
              {chart ? (
                <div className="px-1.5 min-[520px]:px-2.5">
                  <PracticeChartView
                    chart={chart}
                    side={side}
                    revealed={revealed}
                    windowBars={windowBars}
                    panEnd={panEnd}
                    events={chartEvents}
                    paneTitle={indicatorName.toUpperCase()}
                    onMarkerSelect={openTrade}
                  />
                </div>
              ) : practice.previewFailure ? (
                <div className="px-3 pb-3 min-[520px]:px-4">
                  <PracticeFailureNotice failure={practice.previewFailure} indicatorId={indicatorId} onRetry={practice.retryPreview} />
                </div>
              ) : (
                <div className="space-y-2 px-3 pb-3 min-[520px]:px-4" aria-busy="true" aria-label="Đang tải biểu đồ">
                  <Skeleton className="h-72 w-full" />
                </div>
              )}
              {chart && (
                <div className="flex items-center gap-2 px-2 pt-1 pb-2 min-[520px]:px-3">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Xem phần trước" disabled={sliderMin >= sliderMax} onClick={() => movePan(Math.max(sliderMin, sliderValue - PAN_STEP))}>
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <input
                    type="range"
                    aria-label="Dịch vùng biểu đồ đã mở"
                    aria-valuetext={`Đến Phiên ${sliderValue}`}
                    min={sliderMin}
                    max={Math.max(sliderMin, sliderMax)}
                    step={1}
                    value={sliderValue}
                    disabled={sliderMin >= sliderMax}
                    onChange={(event) => movePan(Number(event.target.value))}
                    className="h-1 min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Xem phần sau" disabled={sliderMin >= sliderMax} onClick={() => movePan(Math.min(sliderMax, sliderValue + PAN_STEP))}>
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              )}
              <PlaybackBar lastSession={lastSession} />
            </section>
          )}

          {run && frame && state && (
            <PracticeResults
              run={run}
              frame={frame}
              done={phase === "completed" || phase === "set_completed" || phase === "viewing_past"}
              indicatorName={indicatorName}
              completedCount={state.completed_count}
              total={state.total}
              onOpenTrade={openTrade}
              footer={resultsFooter}
            />
          )}
        </div>
      </ScrollArea>

      {spec && (
        <TradeDetailDialog row={detailRow} spec={spec} indicatorName={indicatorName} onClose={() => setDetailOrdinal(null)} onFocusSession={focusSession} />
      )}
      <PracticeHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        indicatorId={indicatorId}
        indicatorName={indicatorName}
        currentRunId={state?.current_run?.run_id ?? null}
        onView={(id) => practice.viewRun(id === state?.current_run?.run_id ? null : id)}
      />
      {state && <PracticeAssumptionsDialog open={assumptionsOpen} onOpenChange={setAssumptionsOpen} profile={state.profile} windowBars={windowBars} />}
    </section>
  )
}
