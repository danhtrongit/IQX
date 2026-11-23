import { useMemo } from "react"
import type { HistogramData, LineData, Time, UTCTimestamp, WhitespaceData } from "lightweight-charts"
import {
  VN_AFTERNOON_END_MIN,
  VN_FUTURES_START_MIN,
  VN_MORNING_SLOTS,
  buildIntradayHistogramData,
  buildIntradaySeriesData,
  timeToCompressedSlot,
  type IntradayBounds,
} from "../../charts/intraday-axis"
import {
  LwcHistogramChart,
  LwcMultiLineChart,
  type LwcMultiLineSeriesInput,
} from "../../charts/lwc-host"
import {
  MISSING_VALUE,
  formatNum,
  formatSessionLabel,
  formatSigned,
  signedTone,
} from "../../format"
import type { Vn30fComparisonPoint, Vn30fRange } from "../../types"
import {
  MoEmptyData,
  MoSegmentedControl,
  toneToMoClass,
  type MoSegmentOption,
  type WidgetBodyProps,
  type WidgetControlsProps,
} from "../shared"

export type Vn30fVsVn30HeaderControlsProps = WidgetControlsProps<"vn30f_vs_vn30">
export type Vn30fVsVn30WidgetProps = WidgetBodyProps<"vn30f_vs_vn30">

const RANGE_OPTIONS: readonly MoSegmentOption<Vn30fRange>[] = [
  { value: "intraday", label: "Trong phiên" },
  { value: "1m", label: "1 tháng" },
  { value: "3m", label: "3 tháng" },
]

const FUTURES_INTRADAY_BOUNDS: IntradayBounds = {
  startMin: VN_FUTURES_START_MIN,
  endMin: VN_AFTERNOON_END_MIN,
}

const PRICE_AXIS_MIN_WIDTH_PX = 64
const BARE_HM_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/

function inferIntradayStepMinutes(points: readonly Vn30fComparisonPoint[]): number {
  const slots: number[] = []
  for (const pt of points) {
    const slot = timeToCompressedSlot(pt.time || pt.timestamp || "", FUTURES_INTRADAY_BOUNDS)
    if (slot !== null) slots.push(slot)
  }
  if (slots.length < 2) return 1
  slots.sort((a, b) => a - b)

  const morningEndSlot = VN_MORNING_SLOTS - 1
  const afternoonOpenSlot = VN_MORNING_SLOTS
  let minDiff = Number.POSITIVE_INFINITY
  for (let i = 1; i < slots.length; i += 1) {
    // Skip the compressed 1-slot lunch transition (11:30 -> 13:00) so 5m/15m series
    // do not falsely infer a 1-minute cadence.
    if (slots[i - 1] === morningEndSlot && slots[i] === afternoonOpenSlot) {
      continue
    }
    const diff = slots[i] - slots[i - 1]
    if (diff > 0 && diff < minDiff) {
      minDiff = diff
    }
  }
  if (!Number.isFinite(minDiff)) return 1
  return Math.max(1, Math.min(15, minDiff))
}

function parseDailyPointKey(pt: Vn30fComparisonPoint): { sortMs: number; time: Time } | null {
  const trimmed = pt.time.trim()
  if (BARE_HM_RE.test(trimmed)) return null

  const isoDay = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed)
  if (isoDay) {
    const ms = Date.parse(`${isoDay[1]}T00:00:00Z`)
    if (Number.isFinite(ms)) {
      return { sortMs: ms, time: isoDay[1] }
    }
  }
  if (pt.timestamp != null && Number.isFinite(pt.timestamp)) {
    const sec =
      Math.abs(pt.timestamp) >= 1e12
        ? Math.floor(pt.timestamp / 1000)
        : Math.floor(pt.timestamp)
    return { sortMs: sec * 1000, time: sec as UTCTimestamp }
  }
  const parsed = Date.parse(trimmed)
  if (Number.isFinite(parsed)) {
    return { sortMs: parsed, time: Math.floor(parsed / 1000) as UTCTimestamp }
  }
  return null
}

function formatAxisPrice(value: number): string {
  return formatNum(value, 1)
}

function formatBasisValue(value: number): string {
  return formatSigned(value, 2)
}

export function Vn30fVsVn30HeaderControls({
  state,
  onStateChange,
}: Vn30fVsVn30HeaderControlsProps) {
  const activeRange: Vn30fRange = state.range ?? "intraday"

  return (
    <MoSegmentedControl
      options={RANGE_OPTIONS}
      value={activeRange}
      onChange={(range) => onStateChange({ range })}
      ariaLabel="Khoảng thời gian"
    />
  )
}

export function Vn30fVsVn30Widget({ state, data, meta }: Vn30fVsVn30WidgetProps) {
  const points = useMemo(() => data?.points ?? [], [data?.points])
  const pointsAreIntraday =
    points.length > 0 && points.every((pt) => BARE_HM_RE.test(pt.time.trim()))
  const effectiveRange: Vn30fRange = data?.range ?? state.range ?? "intraday"
  const isIntraday = effectiveRange === "intraday" || pointsAreIntraday

  const { lineSeries, basisSeries } = useMemo<{
    lineSeries: LwcMultiLineSeriesInput[]
    basisSeries: (HistogramData<Time> | WhitespaceData<Time>)[]
  }>(() => {
    if (points.length === 0) {
      return { lineSeries: [], basisSeries: [] }
    }

    if (isIntraday) {
      const stepMinutes = inferIntradayStepMinutes(points)
      const intradayOpts = { ...FUTURES_INTRADAY_BOUNDS, stepMinutes }
      const vn30Data = buildIntradaySeriesData(
        points.map((pt) => ({ time: pt.time || pt.timestamp || "", value: pt.vn30 })),
        intradayOpts,
      )
      const vn30fData = buildIntradaySeriesData(
        points.map((pt) => ({ time: pt.time || pt.timestamp || "", value: pt.vn30f })),
        intradayOpts,
      )
      const basisData = buildIntradayHistogramData(
        points.map((pt) => ({ time: pt.time || pt.timestamp || "", value: pt.basis })),
        intradayOpts,
      )

      return {
        lineSeries: [
          { id: "vn30", name: "VN30", data: vn30Data, colorToken: "acc2", lineWidth: 2 },
          { id: "vn30f1m", name: "VN30F1M", data: vn30fData, colorToken: "l2", lineWidth: 2 },
        ],
        basisSeries: basisData,
      }
    }

    const deduped = new Map<
      string,
      { sortMs: number; time: Time; vn30: number | null; vn30f: number | null; basis: number | null }
    >()
    for (const pt of points) {
      const parsed = parseDailyPointKey(pt)
      if (!parsed) continue
      const key = String(parsed.time)
      deduped.set(key, {
        sortMs: parsed.sortMs,
        time: parsed.time,
        vn30: pt.vn30 != null && Number.isFinite(pt.vn30) ? pt.vn30 : null,
        vn30f: pt.vn30f != null && Number.isFinite(pt.vn30f) ? pt.vn30f : null,
        basis: pt.basis != null && Number.isFinite(pt.basis) ? pt.basis : null,
      })
    }

    const ordered = Array.from(deduped.values()).sort((a, b) => a.sortMs - b.sortMs)
    const vn30Data: (LineData<Time> | WhitespaceData<Time>)[] = ordered.map((row) =>
      row.vn30 !== null ? { time: row.time, value: row.vn30 } : { time: row.time },
    )
    const vn30fData: (LineData<Time> | WhitespaceData<Time>)[] = ordered.map((row) =>
      row.vn30f !== null ? { time: row.time, value: row.vn30f } : { time: row.time },
    )
    const basisData: (HistogramData<Time> | WhitespaceData<Time>)[] = ordered.map((row) =>
      row.basis !== null ? { time: row.time, value: row.basis } : { time: row.time },
    )

    return {
      lineSeries: [
        { id: "vn30", name: "VN30", data: vn30Data, colorToken: "acc2", lineWidth: 2 },
        { id: "vn30f1m", name: "VN30F1M", data: vn30fData, colorToken: "l2", lineWidth: 2 },
      ],
      basisSeries: basisData,
    }
  }, [points, isIntraday])

  if (!data || points.length === 0) {
    return <MoEmptyData />
  }

  const latestBasis = data.latestBasis
  const basisTone = toneToMoClass(signedTone(latestBasis))
  const showOffHours = isIntraday && meta !== undefined && !meta.isMarketOpen
  const sessionLabel = formatSessionLabel(data.sessionDate || meta?.sessionDate || "")

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1 px-1 pt-1">
        {showOffHours && sessionLabel !== MISSING_VALUE && (
          <span className="mo-note pointer-events-none absolute top-1.5 left-3 z-[3]">
            {sessionLabel}
          </span>
        )}
        <LwcMultiLineChart
          series={lineSeries}
          timeMode={isIntraday ? "intraday" : "daily"}
          valueFormatter={formatAxisPrice}
          showEndLabels={true}
          showPriceScale={true}
          showTimeScale={true}
          rightPriceScaleMinWidth={PRICE_AXIS_MIN_WIDTH_PX}
          ariaLabel="So sánh VN30F1M và VN30"
        />
      </div>

      <div className="mo-fvb flex h-[64px] shrink-0 flex-col border-t border-[var(--mo-line)] px-1 pt-1 pb-0.5">
        <div className="flex items-center justify-between gap-2 px-2 pb-0.5 leading-none">
          <span className="mo-note font-semibold">Basis</span>
          <span className={`mo-note mo-b ${basisTone}`}>{formatSigned(latestBasis, 2)}</span>
        </div>
        <div className="relative min-h-0 flex-1">
          <LwcHistogramChart
            data={basisSeries}
            seriesName="Basis"
            colorBySign={true}
            showZeroLine={true}
            showPriceScale={true}
            showTimeScale={false}
            rightPriceScaleMinWidth={PRICE_AXIS_MIN_WIDTH_PX}
            timeMode={isIntraday ? "intraday" : "daily"}
            valueFormatter={formatBasisValue}
            ariaLabel="Biểu đồ Basis VN30F1M so với VN30"
          />
        </div>
      </div>
    </div>
  )
}
