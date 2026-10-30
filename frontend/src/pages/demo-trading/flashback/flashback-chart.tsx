/**
 * Biểu đồ nến của Flashback v2 (spec v2 §6.2, §6.4).
 *
 * Trục ngang đủ số phiên xem + số phiên chơi do chủ phòng chọn; phần chưa chơi được tôi tối và
 * đánh dấu "?", vạch đứt ngăn giữa phần xem và phần chơi. Ô khối lượng luôn hiện ngay dưới ô giá,
 * các chỉ báo có ô riêng nằm dưới. Không có ngày thật, không có tên mã.
 *
 * Mỗi khung có dải đầu riêng cho dòng chú giải (tên, thông số, giá trị, nút Ẩn / Cài đặt / Xóa);
 * đường vẽ nằm bên dưới dải này nên không đè lên chữ. Chiều cao các khung cố định, thêm chỉ báo
 * thì biểu đồ dài thêm (xem `flashback-chart-layout.ts`).
 */
import { memo, useMemo, useState } from "react"
import { Eye, EyeOff, Settings2, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { useChartWidth } from "@/pages/academy/charts/use-chart-width"
import type { FlashbackBar, FlashbackOrder } from "./flashback-api"
import { LEGEND_ROW, NARROW_WIDTH, PANE_GAP, axisTicks, chartLayout, type PaneBox } from "./flashback-chart-layout"
import type { ChartIndicator } from "./flashback-context"
import { formatNumber, formatPercent, formatSignedPercent, sessionLabel } from "./flashback-model"

export type { ChartIndicator }

type Props = {
  bars: readonly FlashbackBar[]
  indicators: readonly ChartIndicator[]
  orders: readonly FlashbackOrder[]
  viewBars: number
  playBars: number
  onToggle: (key: string) => void
  onSettings: (key: string) => void
  onRemove: (key: string) => void
}

const PAD_LEFT = 6
const PAD_RIGHT = 62
/** Chỗ cho nhãn trục ngang dưới các vạch dọc. */
const AXIS_PAD = 16

const TONE_UP = "var(--price-up)"
const TONE_DOWN = "var(--price-down)"
const GRID = "var(--border)"
const AXIS_TEXT = "var(--academy-label)"
const FUTURE_FILL = "color-mix(in oklch, var(--muted) 55%, transparent)"

function linePath(
  values: readonly (number | null)[],
  from: number,
  to: number,
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  let path = ""
  let pen = false
  for (let index = from; index <= to; index += 1) {
    const value = values[index]
    if (value == null) {
      pen = false
      continue
    }
    path += `${pen ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`
    pen = true
  }
  return path
}

export const FlashbackChart = memo(function FlashbackChart({
  bars,
  indicators,
  orders,
  viewBars,
  playBars,
  onToggle,
  onSettings,
  onRemove,
}: Props) {
  const [measure, width] = useChartWidth()
  const [hover, setHover] = useState<number | null>(null)
  const narrow = width < NARROW_WIDTH
  const totalSlots = viewBars + playBars

  const overlays = useMemo(() => indicators.filter((indicator) => indicator.plot.kind === "over"), [indicators])
  const volumeIndicators = useMemo(() => indicators.filter((indicator) => indicator.plot.kind === "vol"), [indicators])
  const ownPanes = useMemo(() => indicators.filter((indicator) => indicator.plot.kind === "pane"), [indicators])

  const layout = useMemo(
    () =>
      chartLayout({
        narrow,
        overlayCount: overlays.length,
        volumeCount: volumeIndicators.length,
        indicatorKeys: ownPanes.map((indicator) => indicator.key),
      }),
    [narrow, overlays.length, volumeIndicators.length, ownPanes],
  )
  const height = layout.height
  const pricePane = layout.panes[0]
  const volumePane = layout.panes[1]

  const current = bars.length - 1
  const shown = hover != null && hover <= current ? hover : current
  const plotWidth = width - PAD_LEFT - PAD_RIGHT
  const slot = plotWidth / totalSlots
  const candleWidth = Math.max(1.5, Math.min(9, slot * 0.62))
  const x = (index: number) => PAD_LEFT + slot * (index + 0.5)

  const priceScale = useMemo(() => {
    let low = Number.POSITIVE_INFINITY
    let high = Number.NEGATIVE_INFINITY
    for (let index = 0; index <= current; index += 1) {
      low = Math.min(low, bars[index].low)
      high = Math.max(high, bars[index].high)
    }
    overlays
      .filter((indicator) => !indicator.hidden)
      .forEach((indicator) => {
        indicator.plot.series.forEach((line) => {
          for (let index = 0; index <= current; index += 1) {
            const value = line.values[index]
            if (value == null) continue
            low = Math.min(low, value)
            high = Math.max(high, value)
          }
        })
      })
    if (!Number.isFinite(low) || !Number.isFinite(high)) return { low: 0, high: 1 }
    const padding = (high - low) * 0.07 || high * 0.01 || 1
    return { low: low - padding, high: high + padding }
  }, [bars, current, overlays])

  const priceY = (value: number) => pricePane.top + ((priceScale.high - value) / (priceScale.high - priceScale.low)) * pricePane.height

  const volumeMax = useMemo(() => {
    let max = 0
    for (let index = 0; index <= current; index += 1) max = Math.max(max, bars[index].volume)
    volumeIndicators
      .filter((indicator) => !indicator.hidden)
      .forEach((indicator) => {
        indicator.plot.series.forEach((line) => {
          for (let index = 0; index <= current; index += 1) {
            const value = line.values[index]
            if (value == null) continue
            max = Math.max(max, value)
          }
        })
      })
    return max || 1
  }, [bars, current, volumeIndicators])

  const volumeY = (value: number) => volumePane.top + volumePane.height - (value / volumeMax) * volumePane.height

  if (current < 0) return <div className="w-full" style={{ minHeight: height }} ref={measure} />

  const plotBottom = height - AXIS_PAD
  const startX = PAD_LEFT + slot * viewBars
  const futureX = PAD_LEFT + slot * (current + 1)
  const last = bars[shown]
  const previous = shown > 0 ? bars[shown - 1] : null
  const changePct = previous && previous.close > 0 ? ((last.close - previous.close) / previous.close) * 100 : 0
  const tone = last.close >= last.open ? TONE_UP : TONE_DOWN
  const toneClass = tone === TONE_UP ? "text-price-up" : "text-price-down"

  const orderMarkers = orders
    .map((order) => {
      const index = viewBars - 1 + order.step
      if (index < 0 || index > current) return null
      return { order, index }
    })
    .filter((marker): marker is { order: FlashbackOrder; index: number } => marker !== null)

  function updateHover(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect()
    const widthUsed = rect.width || width
    const offset = ((clientX - rect.left) / widthUsed) * width
    const index = Math.floor((offset - PAD_LEFT) / slot)
    setHover(index >= 0 && index <= current ? index : null)
  }

  const changeClass = changePct > 0 ? "text-price-up" : changePct < 0 ? "text-price-down" : "text-foreground"
  const ohlc = (
    <span className="text-academy-label">
      O<b className={toneClass}>{formatNumber(last.open)}</b> H<b className={toneClass}>{formatNumber(last.high)}</b> L
      <b className={toneClass}>{formatNumber(last.low)}</b> C<b className={toneClass}>{formatNumber(last.close)}</b>
    </span>
  )

  return (
    <div className="relative w-full" ref={measure} style={{ height, minHeight: height }} data-chart-height={height} data-narrow={narrow}>
      <svg
        role="img"
        aria-label="Biểu đồ nến Flashback"
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full touch-pan-y"
        style={{ height }}
        onMouseMove={(event) => updateHover(event.clientX, event.currentTarget)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(event) => {
          const touch = event.touches[0]
          if (touch) updateHover(touch.clientX, event.currentTarget)
        }}
        onTouchMove={(event) => {
          const touch = event.touches[0]
          if (touch) updateHover(touch.clientX, event.currentTarget)
        }}
      >
        {/* Phần chưa chơi: tôi tối và đánh dấu "?" */}
        {current < totalSlots - 1 && (
          <>
            <rect x={futureX} y={0} width={PAD_LEFT + plotWidth - futureX} height={plotBottom} fill={FUTURE_FILL} />
            <text
              x={(futureX + PAD_LEFT + plotWidth) / 2}
              y={pricePane.top + pricePane.height / 2}
              textAnchor="middle"
              className="fill-foreground text-[34px] font-extrabold opacity-20"
            >
              ?
            </text>
          </>
        )}

        {/* Vạch đứt ngăn giữa phần xem và phần chơi */}
        <line x1={startX} x2={startX} y1={0} y2={plotBottom} stroke={GRID} strokeDasharray="4 4" />

        {/* Vạch dọc khi rê chuột hoặc chạm trên biểu đồ */}
        {hover !== null && hover <= current && (
          <line
            data-testid="flashback-crosshair"
            x1={x(hover)}
            x2={x(hover)}
            y1={0}
            y2={plotBottom}
            stroke={AXIS_TEXT}
            strokeDasharray="3 3"
            opacity={0.75}
          />
        )}
        {layout.panes.slice(1).map((pane) => (
          <line key={pane.key} x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={pane.legendTop - PANE_GAP / 2} y2={pane.legendTop - PANE_GAP / 2} stroke={GRID} />
        ))}

        {/* Lưới giá và nhãn ở trục phải */}
        {[0, 1, 2, 3, 4].map((step) => {
          const value = priceScale.low + ((priceScale.high - priceScale.low) * step) / 4
          const y = priceY(value)
          return (
            <g key={step}>
              <line x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={y} y2={y} stroke={GRID} />
              <text x={width - PAD_RIGHT + 6} y={y + 4} className="fill-academy-label text-[10.5px] tabular-nums">
                {formatNumber(value)}
              </text>
            </g>
          )
        })}

        {/* Chỉ báo vẽ trên ô giá */}
        {overlays
          .filter((indicator) => !indicator.hidden)
          .map((indicator) => (
            <g key={indicator.key}>
              <IndicatorLines indicator={indicator} from={0} to={current} x={x} y={priceY} color={indicator.color} />
              <CrossPoints indicator={indicator} from={0} to={current} x={x} y={priceY} />
            </g>
          ))}

        {/* Nến */}
        {bars.slice(0, current + 1).map((bar, index) => {
          const color = bar.close >= bar.open ? TONE_UP : TONE_DOWN
          const top = priceY(Math.max(bar.open, bar.close))
          const bottom = priceY(Math.min(bar.open, bar.close))
          return (
            <g key={bar.session} opacity={index < viewBars ? 0.75 : 1}>
              <line x1={x(index)} x2={x(index)} y1={priceY(bar.high)} y2={priceY(bar.low)} stroke={color} strokeWidth={1.2} />
              <rect x={x(index) - candleWidth / 2} y={top} width={candleWidth} height={Math.max(1.2, bottom - top)} fill={color} />
            </g>
          )
        })}

        {/* Điểm mua bán */}
        {orderMarkers.map(({ order, index }) => {
          const bar = bars[index]
          if (!bar) return null
          if (order.side === "buy") {
            const y = priceY(bar.low) + 6
            return <path key={order.id} d={`M${x(index)},${y} l6,10 h-12z`} fill={TONE_UP} stroke="var(--background)" strokeWidth={1} />
          }
          const y = priceY(bar.high) - 6
          return <path key={order.id} d={`M${x(index)},${y} l6,-10 h-12z`} fill={TONE_DOWN} stroke="var(--background)" strokeWidth={1} />
        })}

        {/* Giá đóng cửa hiện tại */}
        <line x1={PAD_LEFT} x2={PAD_LEFT + plotWidth} y1={priceY(bars[current].close)} y2={priceY(bars[current].close)} stroke="var(--chart-1)" strokeDasharray="2 3" />
        <PriceTag x={width - PAD_RIGHT + 2} y={priceY(bars[current].close)} text={formatNumber(bars[current].close)} />

        {/* Ô khối lượng */}
        {bars.slice(0, current + 1).map((bar, index) => {
          const color = bar.close >= bar.open ? TONE_UP : TONE_DOWN
          const y = volumeY(bar.volume)
          return (
            <rect
              key={bar.session}
              x={x(index) - candleWidth / 2}
              y={y}
              width={candleWidth}
              height={volumePane.top + volumePane.height - y}
              fill={color}
              opacity={index < viewBars ? 0.45 : 0.7}
            />
          )
        })}
        {volumeIndicators
          .filter((indicator) => !indicator.hidden)
          .map((indicator) => (
            <IndicatorLines key={indicator.key} indicator={indicator} from={0} to={current} x={x} y={volumeY} color={indicator.color} />
          ))}

        {/* Ô riêng của từng chỉ báo */}
        {ownPanes.map((indicator) => {
          const pane = layout.panes.find((candidate) => candidate.key === `i${indicator.key}`)
          if (!pane) return null
          return (
            <IndicatorPane
              key={indicator.key}
              indicator={indicator}
              pane={pane}
              from={0}
              to={current}
              x={x}
              right={width - PAD_RIGHT}
              hidden={indicator.hidden}
            />
          )
        })}

        {/* Nhãn trục ngang: không có ngày thật */}
        {axisTicks(viewBars, playBars, narrow).map((tick) => (
          <text
            key={tick.index}
            x={x(tick.index)}
            y={height - 3}
            textAnchor={tick.anchor}
            className="fill-academy-label text-[10.5px]"
          >
            {tick.label}
          </text>
        ))}
      </svg>

      {/* Chú giải kiểu TradingView: mỗi khung một dải đầu riêng, nằm trên phần vẽ */}
      <div className="pointer-events-none absolute inset-0">
        <Legend pane={pricePane} name="price">
          {narrow ? (
            <>
              <LegendLine>
                <span className="font-bold text-foreground" data-testid="flashback-session">
                  {sessionLabel(shown, viewBars)}
                </span>
                <b className={changeClass}>{formatSignedPercent(changePct)}</b>
              </LegendLine>
              <LegendLine>{ohlc}</LegendLine>
            </>
          ) : (
            <LegendLine>
              <span className="font-bold text-foreground" data-testid="flashback-session">
                {sessionLabel(shown, viewBars)}
              </span>
              {ohlc}
              <b className={changeClass}>{formatSignedPercent(changePct)}</b>
            </LegendLine>
          )}
          {overlays.map((indicator) => (
            <LegendRow
              key={indicator.key}
              indicator={indicator}
              values={legendValues(indicator, shown)}
              onToggle={onToggle}
              onSettings={onSettings}
              onRemove={onRemove}
            />
          ))}
        </Legend>

        <Legend pane={volumePane} name="volume">
          <LegendLine>
            <span className="font-bold text-foreground">Khối lượng</span>
            <span className={cn("font-semibold", toneClass)}>{formatNumber(last.volume)}</span>
          </LegendLine>
          {volumeIndicators.map((indicator) => (
            <LegendRow
              key={indicator.key}
              indicator={indicator}
              values={legendValues(indicator, shown)}
              onToggle={onToggle}
              onSettings={onSettings}
              onRemove={onRemove}
            />
          ))}
        </Legend>

        {ownPanes.map((indicator) => {
          const pane = layout.panes.find((candidate) => candidate.key === `i${indicator.key}`)
          if (!pane) return null
          return (
            <Legend key={indicator.key} pane={pane} name="indicator">
              <LegendRow
                indicator={indicator}
                values={legendValues(indicator, shown)}
                onToggle={onToggle}
                onSettings={onSettings}
                onRemove={onRemove}
              />
            </Legend>
          )
        })}
      </div>
    </div>
  )
})

/** Dải đầu của một khung: đúng bằng chiều cao đã chừa trong bố cục. */
function Legend({ pane, name, children }: { pane: PaneBox; name: string; children: React.ReactNode }) {
  return (
    <div
      className="absolute right-16 left-2 flex flex-col items-start overflow-hidden"
      style={{ top: pane.legendTop, height: pane.legendHeight }}
      data-pane={name}
      data-legend-height={pane.legendHeight}
      data-plot-height={pane.height}
    >
      {children}
    </div>
  )
}

function LegendLine({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-auto flex max-w-full items-center gap-x-2 overflow-hidden rounded-sm px-1.5 text-[12.5px] leading-6 whitespace-nowrap tabular-nums"
      style={{ height: LEGEND_ROW }}
    >
      {children}
    </div>
  )
}

function PriceTag({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <g>
      <rect x={x} y={y - 10} width={PAD_RIGHT - 4} height={20} rx={4} fill="var(--chart-1)" />
      <text x={x + 4} y={y + 4} className="fill-primary-foreground text-[10.5px] font-bold tabular-nums">
        {text}
      </text>
    </g>
  )
}

function IndicatorLines({
  indicator,
  from,
  to,
  x,
  y,
  color,
}: {
  indicator: ChartIndicator
  from: number
  to: number
  x: (index: number) => number
  y: (value: number) => number
  color: string
}) {
  return (
    <g>
      {indicator.plot.series.map((line) => {
        if (line.band) {
          const upper = indicator.plot.series.find((candidate) => candidate.key === line.band!.upper)
          const lower = indicator.plot.series.find((candidate) => candidate.key === line.band!.lower)
          if (!upper || !lower) return null
          let up = ""
          let down = ""
          for (let index = from; index <= to; index += 1) {
            const value = upper.values[index]
            if (value == null) continue
            up += `${up ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`
          }
          for (let index = to; index >= from; index -= 1) {
            const value = lower.values[index]
            if (value == null) continue
            down += `L${x(index).toFixed(1)},${y(value).toFixed(1)}`
          }
          if (!up) return null
          return <path key={`band-${line.key}`} d={`${up}${down}Z`} fill={color} opacity={0.08} />
        }
        return (
          <path
            key={line.key}
            d={linePath(line.values, from, to, x, y)}
            fill="none"
            stroke={line.color ?? color}
            strokeWidth={line.width ?? 1.4}
          />
        )
      })}
    </g>
  )
}

/** Khoanh tròn điểm giao cắt của hai đường (MA Cross): xanh khi cắt lên, đỏ khi cắt xuống. */
function CrossPoints({
  indicator,
  from,
  to,
  x,
  y,
}: {
  indicator: ChartIndicator
  from: number
  to: number
  x: (index: number) => number
  y: (value: number) => number
}) {
  const cross = indicator.plot.cross
  if (!cross) return null
  const fast = indicator.plot.series.find((line) => line.key === cross[0])
  const slow = indicator.plot.series.find((line) => line.key === cross[1])
  if (!fast || !slow) return null
  const points: { x: number; y: number; up: boolean }[] = []
  for (let index = Math.max(1, from); index <= to; index += 1) {
    const fastNow = fast.values[index]
    const fastBefore = fast.values[index - 1]
    const slowNow = slow.values[index]
    const slowBefore = slow.values[index - 1]
    if (fastNow == null || fastBefore == null || slowNow == null || slowBefore == null) continue
    const up = fastBefore <= slowBefore && fastNow > slowNow
    const down = fastBefore >= slowBefore && fastNow < slowNow
    if (!up && !down) continue
    points.push({ x: x(index), y: y(fastNow), up })
  }
  return (
    <g>
      {points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={4}
          fill="none"
          stroke={point.up ? TONE_UP : TONE_DOWN}
          strokeWidth={2}
        />
      ))}
    </g>
  )
}

function IndicatorPane({
  indicator,
  pane,
  from,
  to,
  x,
  right,
  hidden,
}: {
  indicator: ChartIndicator
  pane: PaneBox
  from: number
  to: number
  x: (index: number) => number
  right: number
  hidden: boolean
}) {
  const scale = useMemo(() => {
    if (indicator.plot.range) return { low: indicator.plot.range[0], high: indicator.plot.range[1] }
    let low = Number.POSITIVE_INFINITY
    let high = Number.NEGATIVE_INFINITY
    indicator.plot.series.forEach((line) => {
      for (let index = from; index <= to; index += 1) {
        const value = line.values[index]
        if (value == null) continue
        low = Math.min(low, value)
        high = Math.max(high, value)
      }
    })
    indicator.plot.levels?.forEach((level) => {
      low = Math.min(low, level.value)
      high = Math.max(high, level.value)
    })
    if (indicator.plot.zero) {
      low = Math.min(low, 0)
      high = Math.max(high, 0)
    }
    if (!Number.isFinite(low) || !Number.isFinite(high) || low > high) return { low: -1, high: 1 }
    const padding = (high - low) * 0.08 || 1
    return { low: low - padding, high: high + padding }
  }, [indicator, from, to])

  const y = (value: number) => pane.top + ((scale.high - value) / (scale.high - scale.low)) * pane.height

  const band = indicator.plot.levelBand
  const lowerValue = Array.isArray(band)
    ? indicator.plot.levels?.find((level) => level.key === band[0])?.value
    : band?.lower
  const upperValue = Array.isArray(band)
    ? indicator.plot.levels?.find((level) => level.key === band[1])?.value
    : band?.upper

  return (
    <g>
      {lowerValue !== undefined && upperValue !== undefined && (
        <rect x={PAD_LEFT} y={y(upperValue)} width={right - PAD_LEFT} height={Math.max(0, y(lowerValue) - y(upperValue))} fill={indicator.color} opacity={0.07} />
      )}
      {indicator.plot.levels?.map((level) => (
        <g key={level.key}>
          <line x1={PAD_LEFT} x2={right} y1={y(level.value)} y2={y(level.value)} stroke={AXIS_TEXT} strokeDasharray="3 3" opacity={0.6} />
          <text x={right + 6} y={y(level.value) + 4} className="fill-academy-label text-[10px] tabular-nums">
            {formatNumber(level.value)}
          </text>
        </g>
      ))}
      {indicator.plot.zero && !indicator.plot.levels?.some((level) => level.value === 0) && (
        <line x1={PAD_LEFT} x2={right} y1={y(0)} y2={y(0)} stroke={GRID} />
      )}
      {hidden ? null : (
        <>
          {indicator.plot.series
            .filter((line) => line.histogram)
            .map((line) =>
              line.values.slice(from, to + 1).map((value, offset) => {
                if (value == null) return null
                const index = from + offset
                const zero = y(0)
                const top = y(value)
                return (
                  <rect
                    key={`${line.key}-${index}`}
                    x={x(index) - 2}
                    y={Math.min(zero, top)}
                    width={4}
                    height={Math.abs(top - zero)}
                    fill={value >= 0 ? TONE_UP : TONE_DOWN}
                    opacity={0.6}
                  />
                )
              }),
            )}
          <IndicatorLines indicator={indicator} from={from} to={to} x={x} y={y} color={indicator.color} />
        </>
      )}
    </g>
  )
}

type LegendValue = { key: string; value: number | null; color?: string; tone?: "up" | "down" }

/** Giá trị của các đường của một chỉ báo tại phiên đang xem, cho dòng chú giải. */
function legendValues(indicator: ChartIndicator, index: number): LegendValue[] {
  return indicator.plot.series.map((line) => {
    const value = line.values[index] ?? null
    return {
      key: line.key,
      value,
      color: line.histogram ? undefined : (line.color ?? indicator.color),
      tone: line.histogram ? (value != null && value < 0 ? "down" : "up") : undefined,
    }
  })
}

/** Số của một giá trị chỉ báo: lớn thì làm tròn, nhỏ thì hai chữ số thập phân. */
function indicatorValue(value: number | null): string {
  if (value == null) return "—"
  return Math.abs(value) >= 1000 ? formatNumber(value) : formatPercent(value)
}

const LEGEND_BUTTON =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-academy-label hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"

function LegendRow({
  indicator,
  values,
  onToggle,
  onSettings,
  onRemove,
}: {
  indicator: ChartIndicator
  values: LegendValue[]
  onToggle: (key: string) => void
  onSettings: (key: string) => void
  onRemove: (key: string) => void
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-full items-center gap-x-2 overflow-hidden rounded-sm px-1.5 text-[12.5px] whitespace-nowrap tabular-nums hover:bg-muted/60",
        indicator.hidden && "opacity-45",
      )}
      style={{ height: LEGEND_ROW }}
      data-legend-row={indicator.key}
    >
      {/* Tên chỉ báo giữ nguyên chỗ để nhận ra được trên điện thoại; các giá trị co lại (có dấu ba chấm) trước, 3 nút luôn còn đủ. */}
      <span className="max-w-[calc(100%-5.5rem)] min-w-0 shrink-0 truncate font-bold text-foreground">{indicator.label}</span>
      <span className="min-w-0 truncate">
        {values.map((value, idx) => {
          const line = indicator.plot.series[idx]
          const color = value.color ?? line?.color
          return (
            <span
              key={value.key}
              style={color ? { color } : undefined}
              className={cn(
                "font-semibold",
                idx > 0 && "ml-2",
                value.tone === "up" ? "text-price-up" : value.tone === "down" ? "text-price-down" : "text-academy-label",
              )}
            >
              {indicatorValue(value.value)}
            </span>
          )
        })}
      </span>
      <span className="flex shrink-0 items-center">
        <button
          type="button"
          className={LEGEND_BUTTON}
          aria-label={indicator.hidden ? `Hiện ${indicator.label}` : `Ẩn ${indicator.label}`}
          title={indicator.hidden ? "Hiện" : "Ẩn"}
          onClick={() => onToggle(indicator.key)}
        >
          {indicator.hidden ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className={LEGEND_BUTTON}
          aria-label={`Cài đặt ${indicator.label}`}
          title="Cài đặt"
          onClick={() => onSettings(indicator.key)}
        >
          <Settings2 className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={LEGEND_BUTTON}
          aria-label={`Xóa ${indicator.label}`}
          title="Xóa"
          onClick={() => onRemove(indicator.key)}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </span>
    </div>
  )
}
