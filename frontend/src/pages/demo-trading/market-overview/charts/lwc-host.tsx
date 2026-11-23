import { useEffect, useMemo, useRef, useState } from "react"
import {
  BaselineSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type BaselineData,
  type BusinessDay,
  type DeepPartial,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type LineWidth,
  type MouseEventParams,
  type SeriesDataItemTypeMap,
  type Time,
  type TimeChartOptions,
  type WhitespaceData,
} from "lightweight-charts"
import { formatDayMonth, formatNum } from "../format"
import { formatIntradayChartTime } from "./intraday-axis"

export type LwcSeriesColorToken = "acc2" | "tx2" | "ref" | "up" | "dn" | "l1" | "l2" | "l3"
export type LwcTimeMode = "intraday" | "daily" | "index"

export interface LwcBaselineChartProps {
  data: readonly (LineData<Time> | BaselineData<Time> | WhitespaceData<Time>)[]
  refPrice: number | null
  seriesName: string
  singleTone?: "up" | "dn" | "acc"
  timeMode?: LwcTimeMode
  valueFormatter?: (value: number) => string
  timeFormatter?: (time: Time) => string
  volumeData?: readonly (HistogramData<Time> | WhitespaceData<Time>)[]
  showPriceScale?: boolean
  showTimeScale?: boolean
  rightPriceScaleMinWidth?: number
  onPriceScaleWidth?: (width: number) => void
  ariaLabel?: string
  className?: string
}

export interface LwcMultiLineSeriesInput {
  id: string
  name: string
  data: readonly (LineData<Time> | WhitespaceData<Time>)[]
  colorToken: LwcSeriesColorToken
  lineWidth?: LineWidth
  dashed?: boolean
  showLastValueLabel?: boolean
}

export interface LwcMultiLineChartProps {
  series: readonly LwcMultiLineSeriesInput[]
  timeMode?: LwcTimeMode
  valueFormatter?: (value: number) => string
  timeFormatter?: (time: Time) => string
  showEndLabels?: boolean
  showPriceScale?: boolean
  showTimeScale?: boolean
  rightPriceScaleMinWidth?: number
  ariaLabel?: string
  className?: string
}

export interface LwcHistogramChartProps {
  data: readonly (HistogramData<Time> | WhitespaceData<Time>)[]
  seriesName: string
  colorBySign?: boolean
  barOpacity?: number
  showZeroLine?: boolean
  timeMode?: LwcTimeMode
  timeLabelMap?: ReadonlyMap<number, string>
  valueFormatter?: (value: number) => string
  timeFormatter?: (time: Time) => string
  showPriceScale?: boolean
  showTimeScale?: boolean
  rightPriceScaleMinWidth?: number
  ariaLabel?: string
  className?: string
}

interface ChartThemePalette {
  panel: string
  tx: string
  tx2: string
  grid: string
  line: string
  line2: string
  up: string
  dn: string
  ref: string
  acc2: string
  l1: string
  l2: string
  l3: string
}

interface TooltipRow {
  label: string
  value: string
  color: string
}

interface TooltipState {
  left: number
  top: number
  timeLabel: string
  rows: TooltipRow[]
}

interface EndLabelBadge {
  id: string
  text: string
  color: string
  top: number
}

const FONT_FAMILY = '"Be Vietnam Pro", system-ui, sans-serif'

function canRenderCanvas(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    return ctx !== null && typeof ctx.measureText === "function"
  } catch {
    return false
  }
}

function readCssVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const val = styles.getPropertyValue(name).trim()
  return val || fallback
}

function readChartTheme(el: HTMLElement): ChartThemePalette {
  const styles = window.getComputedStyle(el)
  const isDark = document.documentElement.classList.contains("dark")
  return {
    panel: readCssVar(styles, "--mo-panel", isDark ? "#0F1B2E" : "#FFFFFF"),
    tx: readCssVar(styles, "--mo-tx", isDark ? "#EEF3FA" : "#0F172A"),
    tx2: readCssVar(styles, "--mo-tx2", isDark ? "#C9D6E4" : "#334155"),
    grid: readCssVar(styles, "--mo-grid", isDark ? "rgba(42,61,94,0.45)" : "rgba(15,23,42,0.07)"),
    line: readCssVar(styles, "--mo-line", isDark ? "#1E2E48" : "#E2E8F0"),
    line2: readCssVar(styles, "--mo-line2", isDark ? "#2A3D5E" : "#CBD5E1"),
    up: readCssVar(styles, "--mo-up", isDark ? "#1FC16B" : "#0E9F57"),
    dn: readCssVar(styles, "--mo-dn", isDark ? "#F0453A" : "#E0352B"),
    ref: readCssVar(styles, "--mo-ref", isDark ? "#F5B800" : "#C28E00"),
    acc2: readCssVar(styles, "--mo-acc2", isDark ? "#4C8DF6" : "#1D6FE8"),
    l1: readCssVar(styles, "--mo-l1", isDark ? "#4C8DF6" : "#1D6FE8"),
    l2: readCssVar(styles, "--mo-l2", isDark ? "#F59E0B" : "#E08A00"),
    l3: readCssVar(styles, "--mo-l3", isDark ? "#B26BFF" : "#9B4DEB"),
  }
}

function colorWithAlpha(color: string, alpha: number): string {
  const trimmed = color.trim()
  const hex6 = /^#([0-9a-fA-F]{6})$/.exec(trimmed)
  if (hex6) {
    const num = parseInt(hex6[1], 16)
    const r = (num >> 16) & 255
    const g = (num >> 8) & 255
    const b = num & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  const hex3 = /^#([0-9a-fA-F]{3})$/.exec(trimmed)
  if (hex3) {
    const r = parseInt(hex3[1][0] + hex3[1][0], 16)
    const g = parseInt(hex3[1][1] + hex3[1][1], 16)
    const b = parseInt(hex3[1][2] + hex3[1][2], 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return trimmed
}

function resolveColorToken(palette: ChartThemePalette, token: LwcSeriesColorToken): string {
  switch (token) {
    case "acc2":
      return palette.acc2
    case "tx2":
      return palette.tx2
    case "ref":
      return palette.ref
    case "up":
      return palette.up
    case "dn":
      return palette.dn
    case "l1":
      return palette.l1
    case "l2":
      return palette.l2
    case "l3":
      return palette.l3
  }
}

function isBusinessDay(time: Time): time is BusinessDay {
  return typeof time === "object" && time !== null && "year" in time && "month" in time
}

const DAILY_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function isValidDailyDateString(raw: string): boolean {
  const match = DAILY_DATE_RE.exec(raw)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const check = new Date(Date.UTC(year, month - 1, day))
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  )
}

function isValidTimeForMode(time: Time, timeMode: LwcTimeMode): boolean {
  if (typeof time === "string") {
    return timeMode === "daily" ? isValidDailyDateString(time) : false
  }
  if (typeof time === "number") {
    return Number.isFinite(time)
  }
  if (isBusinessDay(time)) {
    return (
      Number.isInteger(time.year) &&
      Number.isInteger(time.month) &&
      Number.isInteger(time.day) &&
      time.month >= 1 &&
      time.month <= 12 &&
      time.day >= 1 &&
      time.day <= 31
    )
  }
  return false
}

function sanitizeSeriesData<T extends { time: Time }>(
  points: readonly T[],
  timeMode: LwcTimeMode,
): T[] {
  const out: T[] = []
  for (const pt of points) {
    if (!isValidTimeForMode(pt.time, timeMode)) continue
    out.push(pt)
  }
  return out
}

function formatChartTime(
  time: Time,
  timeMode: LwcTimeMode,
  customFormatter?: (time: Time) => string,
  timeLabelMap?: ReadonlyMap<number, string>,
): string {
  if (customFormatter) return customFormatter(time)

  if (typeof time === "number") {
    if (timeLabelMap?.has(time)) return timeLabelMap.get(time) ?? ""
    if (timeMode === "intraday") return formatIntradayChartTime(time)
    if (timeMode === "daily") return formatDayMonth(new Date(time * 1000).toISOString())
    return String(time)
  }

  if (typeof time === "string") {
    return formatDayMonth(time)
  }

  if (isBusinessDay(time)) {
    const dd = String(time.day).padStart(2, "0")
    const mm = String(time.month).padStart(2, "0")
    return `${dd}/${mm}`
  }

  return ""
}

function extractNumericValue(
  datum: SeriesDataItemTypeMap<Time>[keyof SeriesDataItemTypeMap<Time>] | undefined,
): number | null {
  if (!datum || typeof datum !== "object") return null
  if ("value" in datum && typeof datum.value === "number" && Number.isFinite(datum.value)) {
    return datum.value
  }
  if ("close" in datum && typeof datum.close === "number" && Number.isFinite(datum.close)) {
    return datum.close
  }
  return null
}

function findLastNumericValue(
  points: readonly (LineData<Time> | BaselineData<Time> | WhitespaceData<Time>)[],
): number | null {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const pt = points[i]
    if ("value" in pt && typeof pt.value === "number" && Number.isFinite(pt.value)) {
      return pt.value
    }
  }
  return null
}

function buildBaseChartOptions(
  palette: ChartThemePalette,
  options: {
    width: number
    height: number
    timeMode: LwcTimeMode
    showPriceScale: boolean
    showTimeScale: boolean
    rightPriceScaleMinWidth?: number
    valueFormatter: (value: number) => string
    timeFormatter?: (time: Time) => string
    timeLabelMap?: ReadonlyMap<number, string>
  },
): DeepPartial<TimeChartOptions> {
  const {
    width,
    height,
    timeMode,
    showPriceScale,
    showTimeScale,
    rightPriceScaleMinWidth,
    valueFormatter,
    timeFormatter,
    timeLabelMap,
  } = options

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
    autoSize: false,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: palette.tx2,
      fontFamily: FONT_FAMILY,
      fontSize: 11,
      attributionLogo: false,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { color: palette.grid, style: LineStyle.Solid },
    },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: {
        color: palette.tx2,
        width: 1,
        style: LineStyle.Dashed,
        labelVisible: false,
      },
      horzLine: {
        visible: false,
        labelVisible: false,
      },
    },
    rightPriceScale: {
      visible: showPriceScale,
      borderVisible: false,
      ...(rightPriceScaleMinWidth !== undefined
        ? { minimumWidth: rightPriceScaleMinWidth }
        : {}),
      scaleMargins: { top: 0.08, bottom: 0.08 },
    },
    leftPriceScale: {
      visible: false,
    },
    timeScale: {
      visible: showTimeScale,
      borderVisible: false,
      timeVisible: timeMode === "intraday",
      secondsVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true,
      rightOffset: 0,
      tickMarkFormatter: (time: Time) =>
        formatChartTime(time, timeMode, timeFormatter, timeLabelMap),
    },
    localization: {
      priceFormatter: valueFormatter,
      timeFormatter: (time: Time) =>
        formatChartTime(time, timeMode, timeFormatter, timeLabelMap),
    },
    handleScroll: false,
    handleScale: false,
  }
}

function clampTooltipLeft(pointX: number, containerW: number): number {
  const approxW = 160
  if (pointX + 12 + approxW <= containerW - 4) return Math.max(4, pointX + 12)
  return Math.max(4, pointX - approxW - 12)
}

function computeEndLabelPositions(
  entries: Array<{ id: string; text: string; color: string; y: number }>,
  height: number,
): EndLabelBadge[] {
  const sorted = [...entries].sort((a, b) => a.y - b.y)
  const minGap = 16
  const topBound = 10
  const bottomBound = Math.max(topBound, height - 22)

  for (let i = 0; i < sorted.length; i += 1) {
    sorted[i].y = Math.max(topBound, Math.min(bottomBound, sorted[i].y - 8))
    if (i > 0 && sorted[i].y - sorted[i - 1].y < minGap) {
      sorted[i].y = Math.min(bottomBound, sorted[i - 1].y + minGap)
    }
  }
  for (let i = sorted.length - 2; i >= 0; i -= 1) {
    if (sorted[i + 1].y - sorted[i].y < minGap) {
      sorted[i].y = Math.max(topBound, sorted[i + 1].y - minGap)
    }
  }

  return sorted.map((entry) => ({
    id: entry.id,
    text: entry.text,
    color: entry.color,
    top: Math.round(entry.y),
  }))
}

/* ============================================================================
 * 1. LwcBaselineChart (index_chart: dual-color intraday + single-color daily)
 * ============================================================================ */

export function LwcBaselineChart({
  data,
  refPrice,
  seriesName,
  singleTone = "acc",
  timeMode = "intraday",
  valueFormatter,
  timeFormatter,
  volumeData,
  showPriceScale = true,
  showTimeScale = true,
  rightPriceScaleMinWidth,
  onPriceScaleWidth,
  ariaLabel,
  className,
}: LwcBaselineChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const mainSeriesRef = useRef<ISeriesApi<"Baseline"> | ISeriesApi<"Line"> | null>(null)
  const refLineRef = useRef<IPriceLine | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const isVisibleRef = useRef(true)
  const pendingResizeRef = useRef<(() => void) | null>(null)
  const pendingDataSyncRef = useRef<(() => void) | null>(null)

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const canvasSupported = useMemo(() => canRenderCanvas(), [])

  const fmtValue = useMemo(
    () => valueFormatter ?? ((v: number) => formatNum(v, 2)),
    [valueFormatter],
  )

  const latestPropsRef = useRef({
    data,
    refPrice,
    seriesName,
    singleTone,
    timeMode,
    fmtValue,
    timeFormatter,
    volumeData,
    showPriceScale,
    showTimeScale,
    rightPriceScaleMinWidth,
    onPriceScaleWidth,
  })
  useEffect(() => {
    latestPropsRef.current = {
      data,
      refPrice,
      seriesName,
      singleTone,
      timeMode,
      fmtValue,
      timeFormatter,
      volumeData,
      showPriceScale,
      showTimeScale,
      rightPriceScaleMinWidth,
      onPriceScaleWidth,
    }
  })

  const hasRef = refPrice !== null && Number.isFinite(refPrice)
  const hasVolume = volumeData !== undefined && volumeData.length > 0

  useEffect(() => {
    if (!canvasSupported) return
    const wrap = wrapRef.current
    const surface = surfaceRef.current
    if (!wrap || !surface) return

    const palette = readChartTheme(wrap)
    const initW = Math.max(1, Math.floor(wrap.clientWidth))
    const initH = Math.max(1, Math.floor(wrap.clientHeight))

    const chart = createChart(
      surface,
      buildBaseChartOptions(palette, {
        width: initW,
        height: initH,
        timeMode: latestPropsRef.current.timeMode,
        showPriceScale: latestPropsRef.current.showPriceScale,
        showTimeScale: latestPropsRef.current.showTimeScale,
        rightPriceScaleMinWidth: latestPropsRef.current.rightPriceScaleMinWidth,
        valueFormatter: latestPropsRef.current.fmtValue,
        timeFormatter: latestPropsRef.current.timeFormatter,
      }),
    )
    chartRef.current = chart

    const reportPriceScaleWidth = () => {
      const cb = latestPropsRef.current.onPriceScaleWidth
      if (!cb) return
      const width = Math.round(chart.priceScale("right").width())
      if (Number.isFinite(width) && width > 0) {
        cb(width)
      }
    }

    const applySeriesAndTheme = () => {
      const current = latestPropsRef.current
      const colors = readChartTheme(wrap)

      chart.applyOptions(
        buildBaseChartOptions(colors, {
          width: Math.max(1, Math.floor(wrap.clientWidth)),
          height: Math.max(1, Math.floor(wrap.clientHeight)),
          timeMode: current.timeMode,
          showPriceScale: current.showPriceScale,
          showTimeScale: current.showTimeScale,
          rightPriceScaleMinWidth: current.rightPriceScaleMinWidth,
          valueFormatter: current.fmtValue,
          timeFormatter: current.timeFormatter,
        }),
      )

      const main = mainSeriesRef.current
      if (main) {
        if (current.refPrice !== null && Number.isFinite(current.refPrice)) {
          ;(main as ISeriesApi<"Baseline">).applyOptions({
            baseValue: { type: "price", price: current.refPrice },
            topLineColor: colors.up,
            topFillColor1: colorWithAlpha(colors.up, 0.22),
            topFillColor2: colorWithAlpha(colors.up, 0.02),
            bottomLineColor: colors.dn,
            bottomFillColor1: colorWithAlpha(colors.dn, 0.02),
            bottomFillColor2: colorWithAlpha(colors.dn, 0.22),
          })
          if (refLineRef.current) {
            refLineRef.current.applyOptions({
              price: current.refPrice,
              color: colors.ref,
            })
          }
        } else {
          const singleColor =
            current.singleTone === "up"
              ? colors.up
              : current.singleTone === "dn"
                ? colors.dn
                : colors.acc2
          ;(main as ISeriesApi<"Line">).applyOptions({
            color: singleColor,
          })
        }
      }
    }

    const handleCrosshair = (param: MouseEventParams<Time>) => {
      if (!param.point || param.time === undefined || param.point.x < 0 || param.point.y < 0) {
        setTooltip(null)
        return
      }
      const main = mainSeriesRef.current
      if (!main) {
        setTooltip(null)
        return
      }
      const current = latestPropsRef.current
      const val = extractNumericValue(param.seriesData.get(main))
      if (val === null) {
        setTooltip(null)
        return
      }
      const colors = readChartTheme(wrap)
      const valColor =
        current.refPrice !== null && Number.isFinite(current.refPrice)
          ? val >= current.refPrice
            ? colors.up
            : colors.dn
          : current.singleTone === "up"
            ? colors.up
            : current.singleTone === "dn"
              ? colors.dn
              : colors.acc2

      const timeLabel = formatChartTime(param.time, current.timeMode, current.timeFormatter)
      setTooltip({
        left: clampTooltipLeft(param.point.x, wrap.clientWidth),
        top: 6,
        timeLabel,
        rows: [
          {
            label: current.seriesName,
            value: current.fmtValue(val),
            color: valColor,
          },
        ],
      })
    }

    chart.subscribeCrosshairMove(handleCrosshair)

    let resizeRaf = 0
    let flushRaf = 0
    let lastW = initW
    let lastH = initH
    const doResize = () => {
      if (!chartRef.current) return
      pendingResizeRef.current = null
      const nextW = Math.floor(wrap.clientWidth)
      const nextH = Math.floor(wrap.clientHeight)
      if (nextW <= 0 || nextH <= 0) return
      if (nextW === lastW && nextH === lastH) return
      lastW = nextW
      lastH = nextH
      chart.resize(nextW, nextH)
      chart.timeScale().fitContent()
      reportPriceScaleWidth()
    }

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            cancelAnimationFrame(resizeRaf)
            resizeRaf = requestAnimationFrame(() => {
              if (!chartRef.current) return
              if (!isVisibleRef.current) {
                pendingResizeRef.current = doResize
                return
              }
              doResize()
            })
          })
        : null
    resizeObserver?.observe(wrap)

    const intersectionObserver =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            const visible = entries.some((entry) => entry.isIntersecting)
            isVisibleRef.current = visible
            if (visible && (pendingResizeRef.current || pendingDataSyncRef.current)) {
              if (flushRaf) cancelAnimationFrame(flushRaf)
              flushRaf = requestAnimationFrame(() => {
                flushRaf = 0
                if (!chartRef.current || !isVisibleRef.current) return
                const flushResize = pendingResizeRef.current
                const flushData = pendingDataSyncRef.current
                pendingResizeRef.current = null
                pendingDataSyncRef.current = null
                if (flushResize) {
                  flushResize()
                } else {
                  doResize()
                }
                flushData?.()
              })
            }
          })
        : null
    intersectionObserver?.observe(wrap)

    const themeObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            applySeriesAndTheme()
          })
        : null
    themeObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })

    return () => {
      cancelAnimationFrame(resizeRaf)
      if (flushRaf) cancelAnimationFrame(flushRaf)
      pendingResizeRef.current = null
      pendingDataSyncRef.current = null
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      themeObserver?.disconnect()
      chart.unsubscribeCrosshairMove(handleCrosshair)
      chart.remove()
      chartRef.current = null
      mainSeriesRef.current = null
      refLineRef.current = null
      volumeSeriesRef.current = null
    }
  }, [canvasSupported])

  // Recreate series when mode flips between baseline (with refPrice) and line (without refPrice), or volume toggles.
  useEffect(() => {
    if (!canvasSupported) return
    const chart = chartRef.current
    const wrap = wrapRef.current
    if (!chart || !wrap) return

    if (mainSeriesRef.current) {
      chart.removeSeries(mainSeriesRef.current)
      mainSeriesRef.current = null
      refLineRef.current = null
    }
    if (volumeSeriesRef.current) {
      chart.removeSeries(volumeSeriesRef.current)
      volumeSeriesRef.current = null
    }

    const colors = readChartTheme(wrap)
    const current = latestPropsRef.current
    const bottomMargin = hasVolume ? 0.26 : 0.08

    if (hasRef && current.refPrice !== null && Number.isFinite(current.refPrice)) {
      const baseline = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: current.refPrice },
        topLineColor: colors.up,
        topFillColor1: colorWithAlpha(colors.up, 0.22),
        topFillColor2: colorWithAlpha(colors.up, 0.02),
        bottomLineColor: colors.dn,
        bottomFillColor1: colorWithAlpha(colors.dn, 0.02),
        bottomFillColor2: colorWithAlpha(colors.dn, 0.22),
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 3,
      })
      baseline.priceScale().applyOptions({
        scaleMargins: { top: 0.08, bottom: bottomMargin },
      })
      refLineRef.current = baseline.createPriceLine({
        price: current.refPrice,
        color: colors.ref,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "",
      })
      mainSeriesRef.current = baseline
    } else {
      const singleColor =
        current.singleTone === "up"
          ? colors.up
          : current.singleTone === "dn"
            ? colors.dn
            : colors.acc2
      const line = chart.addSeries(LineSeries, {
        color: singleColor,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 3,
      })
      line.priceScale().applyOptions({
        scaleMargins: { top: 0.08, bottom: bottomMargin },
      })
      mainSeriesRef.current = line
    }

    if (hasVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        priceLineVisible: false,
        lastValueVisible: false,
      })
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      })
      volumeSeriesRef.current = volumeSeries
    }
  }, [canvasSupported, hasRef, hasVolume])

  // Apply data & option updates incrementally (paused while off-screen).
  useEffect(() => {
    if (!canvasSupported) return
    const chart = chartRef.current
    const wrap = wrapRef.current
    if (!chart || !wrap) return

    const syncData = () => {
      const colors = readChartTheme(wrap)
      chart.applyOptions(
        buildBaseChartOptions(colors, {
          width: Math.max(1, Math.floor(wrap.clientWidth)),
          height: Math.max(1, Math.floor(wrap.clientHeight)),
          timeMode,
          showPriceScale,
          showTimeScale,
          rightPriceScaleMinWidth,
          valueFormatter: fmtValue,
          timeFormatter,
        }),
      )

      const safeData = sanitizeSeriesData(data, timeMode)
      const main = mainSeriesRef.current
      if (main) {
        if (hasRef && refPrice !== null) {
          ;(main as ISeriesApi<"Baseline">).applyOptions({
            baseValue: { type: "price", price: refPrice },
          })
          refLineRef.current?.applyOptions({ price: refPrice, color: colors.ref })
          ;(main as ISeriesApi<"Baseline">).setData(
            safeData as (BaselineData<Time> | WhitespaceData<Time>)[],
          )
        } else {
          const singleColor =
            singleTone === "up" ? colors.up : singleTone === "dn" ? colors.dn : colors.acc2
          ;(main as ISeriesApi<"Line">).applyOptions({ color: singleColor })
          ;(main as ISeriesApi<"Line">).setData(
            safeData as (LineData<Time> | WhitespaceData<Time>)[],
          )
        }
      }

      if (volumeSeriesRef.current && volumeData) {
        const safeVol = sanitizeSeriesData(volumeData, timeMode)
        volumeSeriesRef.current.setData(
          safeVol as (HistogramData<Time> | WhitespaceData<Time>)[],
        )
      }

      chart.timeScale().fitContent()
      if (onPriceScaleWidth) {
        const width = Math.round(chart.priceScale("right").width())
        if (Number.isFinite(width) && width > 0) {
          onPriceScaleWidth(width)
        }
      }
    }

    if (!isVisibleRef.current) {
      pendingDataSyncRef.current = syncData
      return
    }
    pendingDataSyncRef.current = null
    syncData()
  }, [
    canvasSupported,
    data,
    volumeData,
    hasRef,
    hasVolume,
    refPrice,
    singleTone,
    timeMode,
    showPriceScale,
    showTimeScale,
    rightPriceScaleMinWidth,
    onPriceScaleWidth,
    fmtValue,
    timeFormatter,
  ])

  const wrapperClass = className
    ? `relative h-full w-full min-h-0 overflow-hidden ${className}`
    : "relative h-full w-full min-h-0 overflow-hidden"

  if (!canvasSupported) {
    return (
      <div
        className={wrapperClass}
        data-chart-fallback="true"
        role="img"
        aria-label={ariaLabel ?? seriesName}
      >
        <span className="sr-only">{ariaLabel ?? seriesName}</span>
      </div>
    )
  }

  return (
    <div
      ref={wrapRef}
      className={wrapperClass}
      role="img"
      aria-label={ariaLabel ?? seriesName}
    >
      <div ref={surfaceRef} className="absolute inset-0" />
      {tooltip && (
        <div
          className="mo-tip"
          style={{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }}
        >
          {tooltip.timeLabel && <b>{tooltip.timeLabel}</b>}
          {tooltip.rows.map((row) => (
            <div key={row.label}>
              <span style={{ color: row.color }}>●</span> {row.label}: {row.value}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================================
 * 2. LwcMultiLineChart (market_liquidity 3-line & vn30f_vs_vn30 dual-line)
 * ============================================================================ */

export function LwcMultiLineChart({
  series,
  timeMode = "intraday",
  valueFormatter,
  timeFormatter,
  showEndLabels = false,
  showPriceScale = true,
  showTimeScale = true,
  rightPriceScaleMinWidth,
  ariaLabel,
  className,
}: LwcMultiLineChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesMapRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map())
  const isVisibleRef = useRef(true)
  const pendingResizeRef = useRef<(() => void) | null>(null)
  const pendingDataSyncRef = useRef<(() => void) | null>(null)

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [endLabels, setEndLabels] = useState<EndLabelBadge[]>([])
  const canvasSupported = useMemo(() => canRenderCanvas(), [])

  const fmtValue = useMemo(
    () => valueFormatter ?? ((v: number) => formatNum(v, 1)),
    [valueFormatter],
  )

  const latestPropsRef = useRef({
    series,
    timeMode,
    fmtValue,
    timeFormatter,
    showEndLabels,
    showPriceScale,
    showTimeScale,
    rightPriceScaleMinWidth,
  })
  useEffect(() => {
    latestPropsRef.current = {
      series,
      timeMode,
      fmtValue,
      timeFormatter,
      showEndLabels,
      showPriceScale,
      showTimeScale,
      rightPriceScaleMinWidth,
    }
  })

  const seriesKey = useMemo(
    () => series.map((s) => `${s.id}:${s.colorToken}:${s.dashed ? 1 : 0}`).join("|"),
    [series],
  )

  useEffect(() => {
    if (!canvasSupported) return
    const wrap = wrapRef.current
    const surface = surfaceRef.current
    if (!wrap || !surface) return

    const palette = readChartTheme(wrap)
    const initW = Math.max(1, Math.floor(wrap.clientWidth))
    const initH = Math.max(1, Math.floor(wrap.clientHeight))

    const chart = createChart(
      surface,
      buildBaseChartOptions(palette, {
        width: initW,
        height: initH,
        timeMode: latestPropsRef.current.timeMode,
        showPriceScale: latestPropsRef.current.showPriceScale,
        showTimeScale: latestPropsRef.current.showTimeScale,
        rightPriceScaleMinWidth: latestPropsRef.current.rightPriceScaleMinWidth,
        valueFormatter: latestPropsRef.current.fmtValue,
        timeFormatter: latestPropsRef.current.timeFormatter,
      }),
    )
    chartRef.current = chart

    const recomputeEndLabels = () => {
      const current = latestPropsRef.current
      if (!current.showEndLabels) {
        setEndLabels([])
        return
      }
      const colors = readChartTheme(wrap)
      const h = wrap.clientHeight
      if (h <= 0) return

      const entries: Array<{ id: string; text: string; color: string; y: number }> = []
      for (const s of current.series) {
        const api = seriesMapRef.current.get(s.id)
        const lastVal = findLastNumericValue(s.data)
        if (!api || lastVal === null) continue
        const coord = api.priceToCoordinate(lastVal)
        if (coord === null || !Number.isFinite(coord)) continue
        entries.push({
          id: s.id,
          text: `${s.name} ${current.fmtValue(lastVal)}`,
          color: resolveColorToken(colors, s.colorToken),
          y: coord,
        })
      }
      setEndLabels(computeEndLabelPositions(entries, h))
    }

    const applyTheme = () => {
      const current = latestPropsRef.current
      const colors = readChartTheme(wrap)
      chart.applyOptions(
        buildBaseChartOptions(colors, {
          width: Math.max(1, Math.floor(wrap.clientWidth)),
          height: Math.max(1, Math.floor(wrap.clientHeight)),
          timeMode: current.timeMode,
          showPriceScale: current.showPriceScale,
          showTimeScale: current.showTimeScale,
          rightPriceScaleMinWidth: current.rightPriceScaleMinWidth,
          valueFormatter: current.fmtValue,
          timeFormatter: current.timeFormatter,
        }),
      )
      for (const s of current.series) {
        const api = seriesMapRef.current.get(s.id)
        if (api) {
          api.applyOptions({
            color: resolveColorToken(colors, s.colorToken),
          })
        }
      }
      recomputeEndLabels()
    }

    const handleCrosshair = (param: MouseEventParams<Time>) => {
      if (!param.point || param.time === undefined || param.point.x < 0 || param.point.y < 0) {
        setTooltip(null)
        return
      }
      const current = latestPropsRef.current
      const colors = readChartTheme(wrap)
      const rows: TooltipRow[] = []

      for (const s of current.series) {
        const api = seriesMapRef.current.get(s.id)
        if (!api) continue
        const val = extractNumericValue(param.seriesData.get(api))
        if (val === null) continue
        rows.push({
          label: s.name,
          value: current.fmtValue(val),
          color: resolveColorToken(colors, s.colorToken),
        })
      }

      if (rows.length === 0) {
        setTooltip(null)
        return
      }

      setTooltip({
        left: clampTooltipLeft(param.point.x, wrap.clientWidth),
        top: 6,
        timeLabel: formatChartTime(param.time, current.timeMode, current.timeFormatter),
        rows,
      })
    }

    chart.subscribeCrosshairMove(handleCrosshair)

    let resizeRaf = 0
    let flushRaf = 0
    let lastW = initW
    let lastH = initH
    const doResize = () => {
      if (!chartRef.current) return
      pendingResizeRef.current = null
      const nextW = Math.floor(wrap.clientWidth)
      const nextH = Math.floor(wrap.clientHeight)
      if (nextW <= 0 || nextH <= 0) return
      if (nextW === lastW && nextH === lastH) return
      lastW = nextW
      lastH = nextH
      chart.resize(nextW, nextH)
      chart.timeScale().fitContent()
      recomputeEndLabels()
    }

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            cancelAnimationFrame(resizeRaf)
            resizeRaf = requestAnimationFrame(() => {
              if (!chartRef.current) return
              if (!isVisibleRef.current) {
                pendingResizeRef.current = doResize
                return
              }
              doResize()
            })
          })
        : null
    resizeObserver?.observe(wrap)

    const intersectionObserver =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            const visible = entries.some((entry) => entry.isIntersecting)
            isVisibleRef.current = visible
            if (visible && (pendingResizeRef.current || pendingDataSyncRef.current)) {
              if (flushRaf) cancelAnimationFrame(flushRaf)
              flushRaf = requestAnimationFrame(() => {
                flushRaf = 0
                if (!chartRef.current || !isVisibleRef.current) return
                const flushResize = pendingResizeRef.current
                const flushData = pendingDataSyncRef.current
                pendingResizeRef.current = null
                pendingDataSyncRef.current = null
                if (flushResize) {
                  flushResize()
                } else {
                  doResize()
                }
                flushData?.()
              })
            }
          })
        : null
    intersectionObserver?.observe(wrap)

    const themeObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            applyTheme()
          })
        : null
    themeObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })

    const mapRef = seriesMapRef
    return () => {
      cancelAnimationFrame(resizeRaf)
      if (flushRaf) cancelAnimationFrame(flushRaf)
      pendingResizeRef.current = null
      pendingDataSyncRef.current = null
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      themeObserver?.disconnect()
      chart.unsubscribeCrosshairMove(handleCrosshair)
      chart.remove()
      chartRef.current = null
      mapRef.current.clear()
    }
  }, [canvasSupported])

  // Sync line series definitions when series list/style changes.
  useEffect(() => {
    if (!canvasSupported) return
    const chart = chartRef.current
    const wrap = wrapRef.current
    if (!chart || !wrap) return

    for (const api of seriesMapRef.current.values()) {
      chart.removeSeries(api)
    }
    seriesMapRef.current.clear()

    const colors = readChartTheme(wrap)
    for (const s of latestPropsRef.current.series) {
      const api = chart.addSeries(LineSeries, {
        color: resolveColorToken(colors, s.colorToken),
        lineWidth: s.lineWidth ?? 2,
        lineStyle: s.dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: Boolean(s.showLastValueLabel && !latestPropsRef.current.showEndLabels),
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 3,
      })
      seriesMapRef.current.set(s.id, api)
    }
  }, [canvasSupported, seriesKey, showEndLabels])

  // Push series data incrementally.
  useEffect(() => {
    if (!canvasSupported) return
    const chart = chartRef.current
    const wrap = wrapRef.current
    if (!chart || !wrap) return

    let labelRaf = 0
    const syncData = () => {
      const colors = readChartTheme(wrap)
      chart.applyOptions(
        buildBaseChartOptions(colors, {
          width: Math.max(1, Math.floor(wrap.clientWidth)),
          height: Math.max(1, Math.floor(wrap.clientHeight)),
          timeMode,
          showPriceScale,
          showTimeScale,
          rightPriceScaleMinWidth,
          valueFormatter: fmtValue,
          timeFormatter,
        }),
      )

      for (const s of series) {
        const api = seriesMapRef.current.get(s.id)
        if (api) {
          const safeSeries = sanitizeSeriesData(s.data, timeMode)
          api.setData(safeSeries as (LineData<Time> | WhitespaceData<Time>)[])
        }
      }
      chart.timeScale().fitContent()

      cancelAnimationFrame(labelRaf)
      labelRaf = requestAnimationFrame(() => {
        if (!chartRef.current) return
        if (!showEndLabels) {
          setEndLabels([])
          return
        }
        const h = wrap.clientHeight
        if (h <= 0) return
        const nextColors = readChartTheme(wrap)
        const entries: Array<{ id: string; text: string; color: string; y: number }> = []
        for (const s of series) {
          const api = seriesMapRef.current.get(s.id)
          const lastVal = findLastNumericValue(s.data)
          if (!api || lastVal === null) continue
          const coord = api.priceToCoordinate(lastVal)
          if (coord === null || !Number.isFinite(coord)) continue
          entries.push({
            id: s.id,
            text: `${s.name} ${fmtValue(lastVal)}`,
            color: resolveColorToken(nextColors, s.colorToken),
            y: coord,
          })
        }
        setEndLabels(computeEndLabelPositions(entries, h))
      })
    }

    if (!isVisibleRef.current) {
      pendingDataSyncRef.current = syncData
      return () => cancelAnimationFrame(labelRaf)
    }
    pendingDataSyncRef.current = null
    syncData()
    return () => cancelAnimationFrame(labelRaf)
  }, [
    canvasSupported,
    series,
    seriesKey,
    timeMode,
    showPriceScale,
    showTimeScale,
    rightPriceScaleMinWidth,
    showEndLabels,
    fmtValue,
    timeFormatter,
  ])

  const wrapperClass = className
    ? `relative h-full w-full min-h-0 overflow-hidden ${className}`
    : "relative h-full w-full min-h-0 overflow-hidden"

  if (!canvasSupported) {
    return (
      <div
        className={wrapperClass}
        data-chart-fallback="true"
        role="img"
        aria-label={ariaLabel ?? "Biểu đồ đường"}
      >
        <span className="sr-only">{ariaLabel ?? "Biểu đồ đường"}</span>
      </div>
    )
  }

  return (
    <div
      ref={wrapRef}
      className={wrapperClass}
      role="img"
      aria-label={ariaLabel ?? "Biểu đồ đường"}
    >
      <div ref={surfaceRef} className="absolute inset-0" />
      {showEndLabels &&
        endLabels.map((badge) => (
          <div
            key={badge.id}
            className="pointer-events-none absolute right-[64px] z-[3] rounded px-1 text-[11px] font-bold leading-tight whitespace-nowrap"
            style={{
              top: `${badge.top}px`,
              color: badge.color,
              backgroundColor: "color-mix(in srgb, var(--mo-panel) 84%, transparent)",
            }}
          >
            {badge.text}
          </div>
        ))}
      {tooltip && (
        <div
          className="mo-tip"
          style={{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }}
        >
          {tooltip.timeLabel && <b>{tooltip.timeLabel}</b>}
          {tooltip.rows.map((row) => (
            <div key={row.label}>
              <span style={{ color: row.color }}>●</span> {row.label}: {row.value}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================================
 * 3. LwcHistogramChart (foreign_flow 20-session bars, index volume, basis bars)
 * ============================================================================ */

export function LwcHistogramChart({
  data,
  seriesName,
  colorBySign = true,
  barOpacity = 1,
  showZeroLine = true,
  timeMode = "daily",
  timeLabelMap,
  valueFormatter,
  timeFormatter,
  showPriceScale = true,
  showTimeScale = true,
  rightPriceScaleMinWidth,
  ariaLabel,
  className,
}: LwcHistogramChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const histSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const zeroLineRef = useRef<IPriceLine | null>(null)
  const isVisibleRef = useRef(true)
  const pendingResizeRef = useRef<(() => void) | null>(null)
  const pendingDataSyncRef = useRef<(() => void) | null>(null)

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const canvasSupported = useMemo(() => canRenderCanvas(), [])

  const fmtValue = useMemo(
    () => valueFormatter ?? ((v: number) => formatNum(v, 1)),
    [valueFormatter],
  )

  const latestPropsRef = useRef({
    data,
    seriesName,
    colorBySign,
    barOpacity,
    showZeroLine,
    timeMode,
    timeLabelMap,
    fmtValue,
    timeFormatter,
    showPriceScale,
    showTimeScale,
    rightPriceScaleMinWidth,
  })
  useEffect(() => {
    latestPropsRef.current = {
      data,
      seriesName,
      colorBySign,
      barOpacity,
      showZeroLine,
      timeMode,
      timeLabelMap,
      fmtValue,
      timeFormatter,
      showPriceScale,
      showTimeScale,
      rightPriceScaleMinWidth,
    }
  })

  useEffect(() => {
    if (!canvasSupported) return
    const wrap = wrapRef.current
    const surface = surfaceRef.current
    if (!wrap || !surface) return

    const palette = readChartTheme(wrap)
    const initW = Math.max(1, Math.floor(wrap.clientWidth))
    const initH = Math.max(1, Math.floor(wrap.clientHeight))

    const chart = createChart(
      surface,
      buildBaseChartOptions(palette, {
        width: initW,
        height: initH,
        timeMode: latestPropsRef.current.timeMode,
        showPriceScale: latestPropsRef.current.showPriceScale,
        showTimeScale: latestPropsRef.current.showTimeScale,
        rightPriceScaleMinWidth: latestPropsRef.current.rightPriceScaleMinWidth,
        valueFormatter: latestPropsRef.current.fmtValue,
        timeFormatter: latestPropsRef.current.timeFormatter,
        timeLabelMap: latestPropsRef.current.timeLabelMap,
      }),
    )
    chartRef.current = chart

    const hist = chart.addSeries(HistogramSeries, {
      color: palette.up,
      priceLineVisible: false,
      lastValueVisible: false,
      base: 0,
    })
    histSeriesRef.current = hist

    const applyThemedBars = () => {
      const current = latestPropsRef.current
      const colors = readChartTheme(wrap)
      chart.applyOptions(
        buildBaseChartOptions(colors, {
          width: Math.max(1, Math.floor(wrap.clientWidth)),
          height: Math.max(1, Math.floor(wrap.clientHeight)),
          timeMode: current.timeMode,
          showPriceScale: current.showPriceScale,
          showTimeScale: current.showTimeScale,
          rightPriceScaleMinWidth: current.rightPriceScaleMinWidth,
          valueFormatter: current.fmtValue,
          timeFormatter: current.timeFormatter,
          timeLabelMap: current.timeLabelMap,
        }),
      )

      const upColor =
        current.barOpacity < 1 ? colorWithAlpha(colors.up, current.barOpacity) : colors.up
      const dnColor =
        current.barOpacity < 1 ? colorWithAlpha(colors.dn, current.barOpacity) : colors.dn
      const accColor =
        current.barOpacity < 1 ? colorWithAlpha(colors.acc2, current.barOpacity) : colors.acc2

      const safeBars = sanitizeSeriesData(current.data, current.timeMode)
      const colored = safeBars.map((pt) => {
        if (!("value" in pt)) return pt
        if (pt.color) return pt
        const color = current.colorBySign ? (pt.value >= 0 ? upColor : dnColor) : accColor
        return { ...pt, color }
      })

      hist.setData(colored as (HistogramData<Time> | WhitespaceData<Time>)[])

      if (current.showZeroLine) {
        if (!zeroLineRef.current) {
          zeroLineRef.current = hist.createPriceLine({
            price: 0,
            color: colors.line2,
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: false,
            title: "",
          })
        } else {
          zeroLineRef.current.applyOptions({ color: colors.line2 })
        }
      } else if (zeroLineRef.current) {
        hist.removePriceLine(zeroLineRef.current)
        zeroLineRef.current = null
      }

      chart.timeScale().fitContent()
    }

    const handleCrosshair = (param: MouseEventParams<Time>) => {
      if (!param.point || param.time === undefined || param.point.x < 0 || param.point.y < 0) {
        setTooltip(null)
        return
      }
      const current = latestPropsRef.current
      const val = extractNumericValue(param.seriesData.get(hist))
      if (val === null) {
        setTooltip(null)
        return
      }
      const colors = readChartTheme(wrap)
      const valColor = current.colorBySign
        ? val >= 0
          ? colors.up
          : colors.dn
        : colors.acc2
      setTooltip({
        left: clampTooltipLeft(param.point.x, wrap.clientWidth),
        top: 6,
        timeLabel: formatChartTime(
          param.time,
          current.timeMode,
          current.timeFormatter,
          current.timeLabelMap,
        ),
        rows: [
          {
            label: current.seriesName,
            value: current.fmtValue(val),
            color: valColor,
          },
        ],
      })
    }

    chart.subscribeCrosshairMove(handleCrosshair)

    let resizeRaf = 0
    let flushRaf = 0
    let lastW = initW
    let lastH = initH
    const doResize = () => {
      if (!chartRef.current) return
      pendingResizeRef.current = null
      const nextW = Math.floor(wrap.clientWidth)
      const nextH = Math.floor(wrap.clientHeight)
      if (nextW <= 0 || nextH <= 0) return
      if (nextW === lastW && nextH === lastH) return
      lastW = nextW
      lastH = nextH
      chart.resize(nextW, nextH)
      chart.timeScale().fitContent()
    }

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            cancelAnimationFrame(resizeRaf)
            resizeRaf = requestAnimationFrame(() => {
              if (!chartRef.current) return
              if (!isVisibleRef.current) {
                pendingResizeRef.current = doResize
                return
              }
              doResize()
            })
          })
        : null
    resizeObserver?.observe(wrap)

    const intersectionObserver =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            const visible = entries.some((entry) => entry.isIntersecting)
            isVisibleRef.current = visible
            if (visible && (pendingResizeRef.current || pendingDataSyncRef.current)) {
              if (flushRaf) cancelAnimationFrame(flushRaf)
              flushRaf = requestAnimationFrame(() => {
                flushRaf = 0
                if (!chartRef.current || !isVisibleRef.current) return
                const flushResize = pendingResizeRef.current
                const flushData = pendingDataSyncRef.current
                pendingResizeRef.current = null
                pendingDataSyncRef.current = null
                if (flushResize) {
                  flushResize()
                } else {
                  doResize()
                }
                flushData?.()
              })
            }
          })
        : null
    intersectionObserver?.observe(wrap)

    const themeObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            applyThemedBars()
          })
        : null
    themeObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })

    return () => {
      cancelAnimationFrame(resizeRaf)
      if (flushRaf) cancelAnimationFrame(flushRaf)
      pendingResizeRef.current = null
      pendingDataSyncRef.current = null
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      themeObserver?.disconnect()
      chart.unsubscribeCrosshairMove(handleCrosshair)
      chart.remove()
      chartRef.current = null
      histSeriesRef.current = null
      zeroLineRef.current = null
    }
  }, [canvasSupported])

  useEffect(() => {
    if (!canvasSupported) return
    const chart = chartRef.current
    const hist = histSeriesRef.current
    const wrap = wrapRef.current
    if (!chart || !hist || !wrap) return

    const syncData = () => {
      const colors = readChartTheme(wrap)
      chart.applyOptions(
        buildBaseChartOptions(colors, {
          width: Math.max(1, Math.floor(wrap.clientWidth)),
          height: Math.max(1, Math.floor(wrap.clientHeight)),
          timeMode,
          showPriceScale,
          showTimeScale,
          rightPriceScaleMinWidth,
          valueFormatter: fmtValue,
          timeFormatter,
          timeLabelMap,
        }),
      )

      const upColor = barOpacity < 1 ? colorWithAlpha(colors.up, barOpacity) : colors.up
      const dnColor = barOpacity < 1 ? colorWithAlpha(colors.dn, barOpacity) : colors.dn
      const accColor = barOpacity < 1 ? colorWithAlpha(colors.acc2, barOpacity) : colors.acc2

      const safeBars = sanitizeSeriesData(data, timeMode)
      const colored = safeBars.map((pt) => {
        if (!("value" in pt)) return pt
        if (pt.color) return pt
        const color = colorBySign ? (pt.value >= 0 ? upColor : dnColor) : accColor
        return { ...pt, color }
      })

      hist.setData(colored as (HistogramData<Time> | WhitespaceData<Time>)[])

      if (showZeroLine) {
        if (!zeroLineRef.current) {
          zeroLineRef.current = hist.createPriceLine({
            price: 0,
            color: colors.line2,
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: false,
            title: "",
          })
        } else {
          zeroLineRef.current.applyOptions({ color: colors.line2 })
        }
      } else if (zeroLineRef.current) {
        hist.removePriceLine(zeroLineRef.current)
        zeroLineRef.current = null
      }

      chart.timeScale().fitContent()
    }

    if (!isVisibleRef.current) {
      pendingDataSyncRef.current = syncData
      return
    }
    pendingDataSyncRef.current = null
    syncData()
  }, [
    canvasSupported,
    data,
    colorBySign,
    barOpacity,
    showZeroLine,
    timeMode,
    timeLabelMap,
    showPriceScale,
    showTimeScale,
    rightPriceScaleMinWidth,
    fmtValue,
    timeFormatter,
  ])

  const wrapperClass = className
    ? `relative h-full w-full min-h-0 overflow-hidden ${className}`
    : "relative h-full w-full min-h-0 overflow-hidden"

  if (!canvasSupported) {
    return (
      <div
        className={wrapperClass}
        data-chart-fallback="true"
        role="img"
        aria-label={ariaLabel ?? seriesName}
      >
        <span className="sr-only">{ariaLabel ?? seriesName}</span>
      </div>
    )
  }

  return (
    <div
      ref={wrapRef}
      className={wrapperClass}
      role="img"
      aria-label={ariaLabel ?? seriesName}
    >
      <div ref={surfaceRef} className="absolute inset-0" />
      {tooltip && (
        <div
          className="mo-tip"
          style={{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }}
        >
          {tooltip.timeLabel && <b>{tooltip.timeLabel}</b>}
          {tooltip.rows.map((row) => (
            <div key={row.label}>
              <span style={{ color: row.color }}>●</span> {row.label}: {row.value}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
