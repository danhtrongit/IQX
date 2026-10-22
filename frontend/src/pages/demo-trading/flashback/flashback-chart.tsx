/**
 * Biểu đồ nến của Flashback (spec v1.1 §2.5).
 *
 * Trục ngang cố định đủ 120 phiên (60 lịch sử + 60 phiên chơi); phần chưa chơi được tôi tối và
 * đánh dấu "?", vạch "Bắt đầu" ngăn giữa lịch sử và phần chơi. Ô khối lượng luôn hiện ngay dưới
 * ô giá, các chỉ báo có ô riêng nằm dưới. Không có ngày thật, không có tên mã.
 *
 * Chú giải kiểu TradingView nằm chồng lên biểu đồ: dòng của phiên đang xem (hoặc phiên đang
 * rê chuột) và dòng của mỗi chỉ báo, kèm ba nút Ẩn / Cài đặt / Xóa.
 */
import { useMemo, useState } from "react"
import { Eye, EyeOff, Settings2, Trash2 } from "lucide-react"

import { useChartWidth } from "@/pages/academy/charts/use-chart-width"
import { cn } from "@/lib/utils"
import type { FlashbackBar, FlashbackOrder } from "./flashback-api"
import type { ChartIndicator } from "./flashback-context"
import { formatNumber, formatPercent, formatSignedPercent, sessionLabel } from "./flashback-model"

export type { ChartIndicator }

type Props = {
  bars: readonly FlashbackBar[]
  indicators: readonly ChartIndicator[]
  orders: readonly FlashbackOrder[]
  historySessions: number
  totalSlots: number
  onToggle: (key: string) => void
  onSettings: (key: string) => void
  onRemove: (key: string) => void
}

const PAD_LEFT = 6
const PAD_RIGHT = 62
const GAP = 10
const HEIGHT = 360
const PRICE_WEIGHT = 3.2
const VOLUME_WEIGHT = 1
const PANE_WEIGHT = 1.15

type Pane = { key: string; y: number; h: number }

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

export function FlashbackChart({
  bars,
  indicators,
  orders,
  historySessions,
  totalSlots,
  onToggle,
  onSettings,
  onRemove,
}: Props) {
  const [measure, width] = useChartWidth()
  const [hover, setHover] = useState<number | null>(null)

  const current = bars.length - 1
  const shown = hover != null && hover <= current ? hover : current
  const plotWidth = width - PAD_LEFT - PAD_RIGHT
  const slot = plotWidth / totalSlots
  const candleWidth = Math.max(1.5, Math.min(9, slot * 0.62))
  const x = (index: number) => PAD_LEFT + slot * (index + 0.5)

  const panes = useMemo(() => {
    const ownPanes = indicators.filter((indicator) => indicator.plot.kind === "pane")
    const list: { key: string; weight: number }[] = [
      { key: "p", weight: PRICE_WEIGHT },
      { key: "v", weight: VOLUME_WEIGHT },
      ...ownPanes.map((indicator) => ({ key: `i${indicator.key}`, weight: PANE_WEIGHT })),
    ]
    const total = list.reduce((sum, pane) => sum + pane.weight, 0)
    const available = HEIGHT - 18 - GAP * (list.length - 1)
    const boxes: Pane[] = []
    let top = 4
    list.forEach((pane) => {
      const height = (available * pane.weight) / total
      boxes.push({ key: pane.key, y: top, h: height })
      top += height + GAP
    })
    return boxes
  }, [indicators])

  const pricePane = panes.find((pane) => pane.key === "p") ?? { key: "p", y: 0, h: HEIGHT }
  const volumePane = panes.find((pane) => pane.key === "v") ?? { key: "v", y: 0, h: 0 }

  const priceScale = useMemo(() => {
    let low = Number.POSITIVE_INFINITY
    let high = Number.NEGATIVE_INFINITY
    for (let index = 0; index <= current; index += 1) {
      low = Math.min(low, bars[index].low)
      high = Math.max(high, bars[index].high)
    }
    indicators
      .filter((indicator) => indicator.plot.kind === "over" && !indicator.hidden)
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
  }, [bars, current, indicators])

  const priceY = (value: number) => pricePane.y + ((priceScale.high - value) / (priceScale.high - priceScale.low)) * pricePane.h

  const volumeMax = useMemo(() => {
    let max = 0
    for (let index = 0; index <= current; index += 1) max = Math.max(max, bars[index].volume)
    indicators
      .filter((indicator) => indicator.plot.kind === "vol" && !indicator.hidden)
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
  }, [bars, current, indicators])

  const volumeY = (value: number) => volumePane.y + volumePane.h - (value / volumeMax) * volumePane.h

  const startX = PAD_LEFT + slot * historySessions
  const futureX = PAD_LEFT + slot * (current + 1)
  const last = bars[shown]
  const previous = shown > 0 ? bars[shown - 1] : null
  const changePct = previous && previous.close > 0 ? ((last.close - previous.close) / previous.close) * 100 : 0
  const tone = last.close >= last.open ? TONE_UP : TONE_DOWN

  const orderMarkers = orders
    .map((order) => {
      const index = historySessions - 1 + order.step
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

  return (
    <div className="relative min-h-[360px] w-full" ref={measure}>
      <svg
        role="img"
        aria-label="Biểu đồ nến Flashback"
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="block w-full touch-pan-y"
        style={{ height: HEIGHT }}
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
            <rect x={futureX} y={0} width={PAD_LEFT + plotWidth - futureX} height={HEIGHT - 16} fill={FUTURE_FILL} />
            <text
              x={(futureX + PAD_LEFT + plotWidth) / 2}
              y={pricePane.y + pricePane.h / 2}
              textAnchor="middle"
              className="fill-muted-foreground text-[34px] font-extrabold"
            >
              ?
            </text>
          </>
        )}

        {/* Vạch "Bắt đầu" ngăn giữa lịch sử và phần chơi */}
        <line x1={startX} x2={startX} y1={0} y2={HEIGHT - 16} stroke={GRID} strokeDasharray="4 4" />

        {/* Vạch dọc khi rê chuột hoặc chạm trên biểu đồ */}
        {hover !== null && hover <= current && (
          <line
            data-testid="flashback-crosshair"
            x1={x(hover)}
            x2={x(hover)}
            y1={0}
            y2={HEIGHT - 16}
            stroke={AXIS_TEXT}
            strokeDasharray="3 3"
            opacity={0.75}
          />
        )}
        {panes.slice(1).map((pane) => (
          <line key={pane.key} x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={pane.y - GAP / 2} y2={pane.y - GAP / 2} stroke={GRID} />
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
        {indicators
          .filter((indicator) => indicator.plot.kind === "over" && !indicator.hidden)
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
            <g key={bar.session} opacity={index < historySessions ? 0.75 : 1}>
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
        {current >= 0 && (
          <>
            <line x1={PAD_LEFT} x2={PAD_LEFT + plotWidth} y1={priceY(bars[current].close)} y2={priceY(bars[current].close)} stroke="var(--chart-1)" strokeDasharray="2 3" />
            <PriceTag x={width - PAD_RIGHT + 2} y={priceY(bars[current].close)} text={formatNumber(bars[current].close)} />
          </>
        )}

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
              height={volumePane.y + volumePane.h - y}
              fill={color}
              opacity={index < historySessions ? 0.45 : 0.7}
            />
          )
        })}
        {indicators
          .filter((indicator) => indicator.plot.kind === "vol" && !indicator.hidden)
          .map((indicator) => (
            <IndicatorLines key={indicator.key} indicator={indicator} from={0} to={current} x={x} y={volumeY} color={indicator.color} />
          ))}

        {/* Ô riêng của từng chỉ báo */}
        {indicators
          .filter((indicator) => indicator.plot.kind === "pane")
          .map((indicator) => {
            const pane = panes.find((candidate) => candidate.key === `i${indicator.key}`)
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
        {axisTicks(historySessions, totalSlots, width < 600).map((tick) => (
          <text
            key={tick.index}
            x={x(tick.index)}
            y={HEIGHT - 3}
            textAnchor={tick.anchor}
            className="fill-academy-label text-[10.5px]"
          >
            {tick.label}
          </text>
        ))}
      </svg>

      {/* Chú giải kiểu TradingView */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-2 right-16 flex flex-col items-start gap-0.5" style={{ top: pricePane.y }}>
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-2 rounded-sm px-1.5 py-0.5 text-[12.5px] tabular-nums hover:border hover:border-border">
            <span className="font-bold text-foreground" data-testid="flashback-session">
              {sessionLabel(shown, historySessions)}
            </span>
            <span className="text-academy-label">
              O<b className={tone === TONE_UP ? "text-price-up" : "text-price-down"}>{formatNumber(last.open)}</b>{" "}
              H<b className={tone === TONE_UP ? "text-price-up" : "text-price-down"}>{formatNumber(last.high)}</b>{" "}
              L<b className={tone === TONE_UP ? "text-price-up" : "text-price-down"}>{formatNumber(last.low)}</b>{" "}
              C<b className={tone === TONE_UP ? "text-price-up" : "text-price-down"}>{formatNumber(last.close)}</b>{" "}
              <b className={changePct > 0 ? "text-price-up" : changePct < 0 ? "text-price-down" : "text-foreground"}>
                {formatSignedPercent(changePct)}
              </b>
            </span>
          </div>
          {indicators
            .filter((indicator) => indicator.plot.kind === "over")
            .map((indicator) => (
              <LegendRow
                key={indicator.key}
                indicator={indicator}
                values={legendValues(indicator, shown)}
                onToggle={onToggle}
                onSettings={onSettings}
                onRemove={onRemove}
              />
            ))}
        </div>

        <div className="absolute left-2 right-16 flex flex-col items-start gap-0.5" style={{ top: volumePane.y }}>
          <div className="flex items-center gap-2 px-1.5 py-0.5 text-[12.5px] tabular-nums">
            <span className="font-bold text-foreground">Khối lượng</span>
            <span className="font-semibold text-price-up">{formatNumber(last.volume)}</span>
          </div>
          {indicators
            .filter((indicator) => indicator.plot.kind === "vol")
            .map((indicator) => (
              <LegendRow
                key={indicator.key}
                indicator={indicator}
                values={legendValues(indicator, shown)}
                onToggle={onToggle}
                onSettings={onSettings}
                onRemove={onRemove}
              />
            ))}
        </div>

        {indicators
          .filter((indicator) => indicator.plot.kind === "pane")
          .map((indicator) => {
            const pane = panes.find((candidate) => candidate.key === `i${indicator.key}`)
            if (!pane) return null
            return (
              <div key={indicator.key} className="absolute left-2 right-16 flex flex-col items-start gap-0.5" style={{ top: pane.y }}>
                <LegendRow
                  indicator={indicator}
                  values={legendValues(indicator, shown)}
                  onToggle={onToggle}
                  onSettings={onSettings}
                  onRemove={onRemove}
                />
              </div>
            )
          })}
      </div>
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
  pane: Pane
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

  const y = (value: number) => pane.y + ((scale.high - value) / (scale.high - scale.low)) * pane.h

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
        "pointer-events-auto flex max-w-full items-center gap-2 rounded-sm border border-transparent px-1.5 py-0.5 text-[12.5px] tabular-nums hover:border-border hover:bg-background/90",
        indicator.hidden && "opacity-45",
      )}
    >
      <span className="truncate font-bold text-foreground">{indicator.label}</span>
      {values.map((value, idx) => {
        const line = indicator.plot.series[idx]
        const color = value.color ?? line?.color
        return (
          <span
            key={value.key}
            style={color ? { color } : undefined}
            className={cn(
              "font-semibold",
              value.tone === "up" ? "text-price-up" : value.tone === "down" ? "text-price-down" : "text-academy-label",
            )}
          >
            {indicatorValue(value.value)}
          </span>
        )
      })}
      <span className="flex items-center gap-0.5">
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-sm text-academy-label hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          aria-label={indicator.hidden ? `Hiện ${indicator.label}` : `Ẩn ${indicator.label}`}
          title={indicator.hidden ? "Hiện" : "Ẩn"}
          onClick={() => onToggle(indicator.key)}
        >
          {indicator.hidden ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-sm text-academy-label hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          aria-label={`Cài đặt ${indicator.label}`}
          title="Cài đặt"
          onClick={() => onSettings(indicator.key)}
        >
          <Settings2 className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-sm text-academy-label hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
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

/** Nhãn trục ngang: lịch sử, Phiên 1, Phiên 20, Phiên 40, Phiên 60. */
function axisTicks(historySessions: number, totalSlots: number, narrow: boolean): { index: number; label: string; anchor: "start" | "middle" | "end" }[] {
  const play = totalSlots - historySessions
  const marks = narrow
    ? [
        { index: 0, label: "Lịch sử", anchor: "start" as const },
        { index: historySessions, label: "Phiên 1", anchor: "middle" as const },
        { index: totalSlots - 1, label: `Phiên ${play}`, anchor: "end" as const },
      ]
    : [
        { index: 0, label: `Lịch sử ${historySessions} phiên`, anchor: "start" as const },
        { index: historySessions, label: "Phiên 1", anchor: "middle" as const },
        { index: historySessions + 19, label: "Phiên 20", anchor: "middle" as const },
        { index: historySessions + 39, label: "Phiên 40", anchor: "middle" as const },
        { index: totalSlots - 1, label: `Phiên ${play}`, anchor: "end" as const },
      ]
  return marks
}
