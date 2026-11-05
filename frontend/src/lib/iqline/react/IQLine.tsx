/**
 * `<IQLine mode="market" />` (docs/iqline-design.md §6): biểu đồ giá của `/bieu-do` và `/co-phieu/:symbol`.
 *
 * Ghép: `useIQLineChart` (bộ điều khiển dùng chung) + `IQLineCanvasView` (canvas) + DOM (chú giải, thanh công cụ, công cụ vẽ,
 * hộp thoại chỉ báo) + dữ liệu từ `datafeed` + lưu trữ từ `store`.
 *
 * Quy tắc vòng đời (§6):
 * - Đổi mã hoặc khung không dựng lại component. Hình vẽ theo mã: đổi mã thì bỏ hình cũ (`documentKey`) rồi nạp hình của mã mới từ `store`.
 * - `getBars` đang chạy bị huỷ khi đổi mã hoặc khung; kết quả về muộn bị bỏ vì khoá dữ liệu đã đổi.
 * - Hàm callback nằm trong ref của hook nên đổi hàm không dựng lại gì. Đổi `theme` chỉ đọc lại màu, giữ zoom, hình và công cụ.
 * - Chỉ lưu sau khi đã nạp xong hình của mã hiện tại, nên một lần lưu không ghi đè dữ liệu chưa kịp đọc. Mọi lỗi lưu trữ do `store` nuốt.
 */
import { lazy, Suspense, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

import { readPalette } from "../render/palette"
import type { PriceLevels } from "../scene/colors"
import type { AiOverlay, ChartIndicatorInput, ChartMark, ChartType, Drawing, IQLineDatafeed, IQLineHandle, IQLineStore, Interval, PriceScaleMode, TimedBar } from "../types"
import { ChartLegend } from "./chart-legend"
import { ChartToolbar } from "./chart-toolbar"
import { IQLineCanvasView } from "./IQLineCanvas"
import { DEFAULT_INDICATORS, INITIAL_BARS, OLDER_BARS, PREFETCH_BARS } from "./market-defaults"
import { mergeLatestBar, prependOlderBars } from "./merge-bars"
import { useIQLineChart } from "./use-iqline-chart"
import type { IndicatorDialogState } from "./indicator-dialogs"

// Công cụ vẽ và hộp thoại là phần nặng, tải khi cần (§14: dưới 60 KB gzip, không nằm trong lõi).
const DrawingToolbar = lazy(() => import("./drawing-toolbar"))
const DrawingStyleBar = lazy(() => import("./drawing-toolbar").then((module) => ({ default: module.DrawingStyleBar })))
const IndicatorDialogs = lazy(() => import("./indicator-dialogs"))

export type IQLineMarketProps = {
  mode: "market"
  theme: "light" | "dark"
  symbol: string
  interval: Interval
  /** Có thì thanh công cụ hiện ô chọn khung thời gian (trang giữ khung trên URL). */
  onIntervalChange?: (interval: Interval) => void
  datafeed: IQLineDatafeed
  /** Bỏ trống thì không lưu và không nạp hình vẽ. */
  store?: IQLineStore
  indicators: readonly ChartIndicatorInput[]
  /** Bỏ trống thì biểu đồ không cho thêm, sửa, ẩn hay xoá chỉ báo. */
  onIndicatorsChange?: (next: readonly ChartIndicatorInput[]) => void
  priceLevels?: PriceLevels
  overlays?: readonly AiOverlay[]
  onMarkClick?: (id: string | number) => void
  labelToken?: "muted-foreground" | "academy-label"
  formatPrice?: (price: number) => string
  className?: string
  /** React 19: `ref` là một prop thường. */
  ref?: Ref<IQLineHandle>
}

export type IQLineProps = IQLineMarketProps

type Status = "loading" | "ready" | "empty" | "error"
type Feed = { key: string; bars: readonly TimedBar[]; status: Status; noMore: boolean }

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError"
const nowSeconds = (): number => Math.floor(Date.now() / 1000)

export function IQLine(props: IQLineProps) {
  const { ref, symbol, interval, onIntervalChange, datafeed, store, theme, indicators, onIndicatorsChange, priceLevels, overlays, onMarkClick, labelToken, formatPrice, className } = props
  const dataKey = `${symbol}|${interval}`

  // ---- dữ liệu nến. Đổi khoá thì dọn ngay trong lượt render, trước khi hook dựng dữ liệu cho mã mới.
  const [feed, setFeed] = useState<Feed>({ key: dataKey, bars: [], status: "loading", noMore: false })
  if (feed.key !== dataKey) setFeed({ key: dataKey, bars: [], status: "loading", noMore: false })
  const [retry, setRetry] = useState(0)
  const [marks, setMarks] = useState<{ key: string; items: readonly ChartMark[] }>({ key: dataKey, items: [] })
  const [chartType, setChartTypeState] = useState<ChartType>("candles")
  const [priceScale, setPriceScale] = useState<PriceScaleMode>("linear")
  const [dialog, setDialog] = useState<IndicatorDialogState>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Bản sao mới nhất của tài liệu đang lưu; chỉ đọc và ghi trong trình xử lý và effect, không trong lúc render.
  const doc = useRef({ symbol, drawings: [] as readonly Drawing[], indicators, chartType, loaded: null as string | null, store, onIndicatorsChange })
  useLayoutEffect(() => {
    doc.current.symbol = symbol
    doc.current.indicators = indicators
    doc.current.store = store
    doc.current.onIndicatorsChange = onIndicatorsChange
  })

  const save = () => {
    const current = doc.current
    if (!current.store || current.loaded !== current.symbol) return
    current.store.save(current.symbol, { iqline: { version: 1, drawings: [...current.drawings], indicators: [...current.indicators], chartType: current.chartType } })
  }

  const chart = useIQLineChart({
    mode: "market",
    theme,
    bars: feed.bars,
    interval,
    chartType,
    priceScaleMode: priceScale,
    indicatorInputs: indicators,
    resetKey: dataKey,
    documentKey: symbol,
    priceLevels,
    marks: marks.key === dataKey ? marks.items : undefined,
    overlays,
    onMarkClick,
    labelToken,
    formatPrice,
    ariaLabel: `Biểu đồ ${symbol}, khung ${interval}`,
    onDrawingsChange: (shapes) => {
      doc.current.drawings = shapes
      save()
    },
  })
  const { controller } = chart

  // ---- nạp nến lần đầu; huỷ khi đổi mã hoặc khung.
  useEffect(() => {
    const abort = new AbortController()
    const key = dataKey
    const update = (change: (previous: Feed) => Feed) => setFeed((previous) => (previous.key === key ? change(previous) : previous))
    datafeed
      .getBars({ symbol, interval, to: nowSeconds() + 86_400, countBack: INITIAL_BARS, signal: abort.signal })
      .then((result) => {
        if (abort.signal.aborted) return
        update((previous) => ({ ...previous, bars: result.bars, noMore: result.noMoreHistory, status: result.bars.length > 0 ? "ready" : "empty" }))
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted || isAbort(error)) return
        update((previous) => ({ ...previous, status: "error" }))
      })
    return () => abort.abort()
  }, [datafeed, symbol, interval, dataKey, retry])

  // ---- nạp thêm lịch sử khi kéo gần mép trái.
  const older = useRef<{ busy: boolean; abort: AbortController | null }>({ busy: false, abort: null })
  useEffect(
    () => () => {
      older.current.abort?.abort()
      older.current = { busy: false, abort: null }
    },
    [dataKey],
  )
  const firstTime = feed.bars[0]?.time
  const ready = feed.status === "ready"
  const left = chart.viewport.from
  useEffect(() => {
    if (!ready || feed.noMore || older.current.busy || firstTime === undefined || left > PREFETCH_BARS) return
    const abort = new AbortController()
    const key = dataKey
    older.current = { busy: true, abort }
    datafeed
      .getBars({ symbol, interval, to: firstTime, countBack: OLDER_BARS, signal: abort.signal })
      .then((result) => {
        if (abort.signal.aborted) return
        setFeed((previous) => (previous.key === key ? { ...previous, bars: prependOlderBars(previous.bars, result.bars), noMore: result.noMoreHistory } : previous))
      })
      .catch(() => undefined)
      .finally(() => {
        if (older.current.abort === abort) older.current = { busy: false, abort: null }
      })
  }, [datafeed, symbol, interval, dataKey, ready, feed.noMore, firstTime, left])

  // ---- nến realtime (thăm dò 15 giây trong datafeed): thay nến cuối hoặc thêm nến mới.
  useEffect(() => {
    if (!ready) return undefined
    const key = dataKey
    return datafeed.subscribeBars(symbol, interval, (bar) => {
      setFeed((previous) => {
        if (previous.key !== key) return previous
        const next = mergeLatestBar(previous.bars, bar)
        return next === previous.bars ? previous : { ...previous, bars: next }
      })
    })
  }, [datafeed, symbol, interval, dataKey, ready])

  // ---- đánh dấu tin theo khoảng thời gian của dữ liệu đang có.
  useEffect(() => {
    if (!ready || firstTime === undefined || !datafeed.getMarks) return undefined
    const abort = new AbortController()
    const key = dataKey
    datafeed
      .getMarks({ symbol, from: firstTime, to: nowSeconds(), signal: abort.signal })
      .then((items) => {
        if (!abort.signal.aborted) setMarks({ key, items })
      })
      .catch(() => undefined)
    return () => abort.abort()
  }, [datafeed, symbol, dataKey, ready, firstTime])

  // ---- hình vẽ, kiểu hiển thị và chỉ báo của mã: nạp từ `store` khi đổi mã.
  useEffect(() => {
    let cancelled = false
    doc.current.loaded = null
    doc.current.drawings = []
    if (!store) return undefined
    const apply = (loaded: Awaited<ReturnType<IQLineStore["load"]>>) => {
      if (cancelled) return
      const next = loaded?.iqline
      doc.current.drawings = next?.drawings ?? []
      doc.current.chartType = next?.chartType ?? "candles"
      doc.current.indicators = next?.indicators ?? DEFAULT_INDICATORS
      doc.current.loaded = symbol
      controller.dispatch({ type: "set-drawings", drawings: doc.current.drawings })
      setChartTypeState(doc.current.chartType)
      doc.current.onIndicatorsChange?.(doc.current.indicators)
    }
    store.load(symbol).then(apply, () => apply(null))
    return () => {
      cancelled = true
    }
  }, [store, symbol, controller])

  const commitIndicators = (next: readonly ChartIndicatorInput[]) => {
    doc.current.indicators = next
    doc.current.onIndicatorsChange?.(next)
    save()
  }
  const setChartType = (next: ChartType) => {
    doc.current.chartType = next
    setChartTypeState(next)
    save()
  }
  const editable = onIndicatorsChange !== undefined

  // ---- tay cầm cho thanh công cụ bên ngoài (§6).
  const handle: IQLineHandle = {
    fitContent: () => {
      controller.dispatch({ type: "reset" })
      controller.dispatch({ type: "reset-price-scale", paneKey: "p" })
    },
    screenshot: () => {
      const host = chart.hostRef.current
      const background = host ? readPalette(host).background : "#ffffff"
      return controller.snapshot(background)
    },
    undo: () => controller.dispatch({ type: "undo" }),
    redo: () => controller.dispatch({ type: "redo" }),
  }
  useImperativeHandle(ref, () => handle)

  const downloadScreenshot = () => {
    handle
      .screenshot()
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `${symbol}-${interval}.png`
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      })
      .catch(() => undefined)
  }

  // ---- toàn màn hình: dùng API của trình duyệt, không có (iPhone) thì phủ kín bằng CSS.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null && document.fullscreenElement === rootRef.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])
  const [cssFullscreen, setCssFullscreen] = useState(false)
  useEffect(() => {
    if (!cssFullscreen) return undefined
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setCssFullscreen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [cssFullscreen])
  const toggleFullscreen = () => {
    const element = rootRef.current
    if (!element) return
    if (cssFullscreen) return setCssFullscreen(false)
    if (document.fullscreenElement) return void document.exitFullscreen().catch(() => undefined)
    if (typeof element.requestFullscreen === "function") element.requestFullscreen().catch(() => setCssFullscreen(true))
    else setCssFullscreen(true)
  }
  const isFullscreen = fullscreen || cssFullscreen

  return (
    <div ref={rootRef} data-iqline-root="market" className={cn("flex size-full min-h-0 min-w-0 flex-col bg-background text-foreground", cssFullscreen && "fixed inset-0 z-50 size-auto", className)}>
      <ChartToolbar
        interval={interval}
        onIntervalChange={onIntervalChange}
        chartType={chartType}
        onChartTypeChange={setChartType}
        priceScale={priceScale}
        onPriceScaleChange={setPriceScale}
        indicatorCount={indicators.length}
        onOpenIndicators={editable ? () => setDialog({ kind: "add" }) : undefined}
        canUndo={chart.canUndo}
        canRedo={chart.canRedo}
        onUndo={handle.undo}
        onRedo={handle.redo}
        onFit={handle.fitContent}
        onScreenshot={downloadScreenshot}
        onToggleFullscreen={toggleFullscreen}
        fullscreen={isFullscreen}
      />
      <div className="flex min-h-0 flex-1">
        <Suspense fallback={<div aria-hidden="true" className="w-9 shrink-0 border-r border-border bg-card" />}>
          <DrawingToolbar chart={chart} />
        </Suspense>
        <div className="relative min-h-0 min-w-0 flex-1">
          <div className="absolute inset-0">
            <IQLineCanvasView chart={chart} />
          </div>
          <ChartLegend
            chart={chart}
            symbol={symbol}
            formatPrice={formatPrice}
            editable={editable}
            onToggleIndicator={(key) => commitIndicators(indicators.map((item) => (item.key === key ? { ...item, hidden: !item.hidden } : item)))}
            onEditIndicator={(key) => setDialog({ kind: "edit", key })}
            onRemoveIndicator={(key) => commitIndicators(indicators.filter((item) => item.key !== key))}
          />
          {chart.state.drawings.selectedId !== null ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-2">
              <Suspense fallback={null}>
                <DrawingStyleBar chart={chart} />
              </Suspense>
            </div>
          ) : null}
          {feed.status !== "ready" ? (
            <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 text-xs text-muted-foreground">
              {feed.status === "loading" ? <span>Đang tải biểu đồ…</span> : null}
              {feed.status === "empty" ? <span>Chưa có dữ liệu nến cho mã này.</span> : null}
              {feed.status === "error" ? (
                <>
                  <span>Không tải được dữ liệu biểu đồ.</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFeed((previous) => ({ ...previous, status: "loading" }))
                      setRetry((value) => value + 1)
                    }}
                  >
                    Thử lại
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {dialog ? (
        <Suspense fallback={null}>
          <IndicatorDialogs state={dialog} indicators={indicators} onChange={commitIndicators} onClose={() => setDialog(null)} />
        </Suspense>
      ) : null}
    </div>
  )
}
