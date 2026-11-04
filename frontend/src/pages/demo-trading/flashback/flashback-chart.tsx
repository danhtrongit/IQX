/**
 * Biểu đồ nến của Flashback v2 (spec v2 §6.2, §6.4).
 *
 * Trục ngang đủ số phiên xem + số phiên chơi do chủ phòng chọn; phần chưa chơi được tôi tối và
 * đánh dấu "?", vạch đứt ngăn giữa phần xem và phần chơi. Ô khối lượng luôn hiện ngay dưới ô giá,
 * các chỉ báo có ô riêng nằm dưới. Không có ngày thật, không có tên mã.
 *
 * Chú giải nổi kiểu TradingView (spec v2.3 §1): mỗi khung có chú giải ở góc trên bên trái, đè lên phần
 * vẽ, không chiếm dòng nào. Ô giá tối thiểu 320px (điện thoại 240px), ô khối lượng và ô chỉ báo riêng
 * cao cố định; thêm ô chỉ báo thì biểu đồ dài thêm (v2.3 §2, xem `flashback-chart-layout.ts`). Trục giá
 * chỉ theo nến; đường MA ngoài khung có nhãn ở mép phải (v2.3 §3).
 */
import { memo, useCallback, useEffect, useId, useMemo, useState, type RefCallback } from "react"
import { Eye, EyeOff, Settings2, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { useChartWidth } from "@/pages/academy/charts/use-chart-width"
import type { FlashbackBar, FlashbackOrder } from "./flashback-api"
import { LEGEND_ROW, NARROW_WIDTH, PANE_GAP, axisTicks, chartLayout, offscaleLabels, priceRange, type PaneBox } from "./flashback-chart-layout"
import type { ChartIndicator } from "./flashback-context"
import { formatNumber, formatPercent, formatSignedPercent, sessionLabel } from "./flashback-model"
import { useChartFit } from "./use-chart-fit"

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
  const [measureWidth, width] = useChartWidth()
  const [fitRef, fit] = useChartFit()
  const measure = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      const stopWidth = measureWidth(element)
      const stopFit = fitRef(element)
      return () => {
        if (typeof stopWidth === "function") stopWidth()
        if (typeof stopFit === "function") stopFit()
      }
    },
    [measureWidth, fitRef],
  )
  const [hover, setHover] = useState<number | null>(null)
  // Điện thoại: chạm một dòng chú giải thì hiện 3 nút của dòng đó (v2.3 §1.3).
  const [activeRow, setActiveRow] = useState<string | null>(null)
  const clipId = useId()
  const narrow = width < NARROW_WIDTH
  const mobile = narrow || fit.pageNarrow
  const totalSlots = viewBars + playBars

  useEffect(() => {
    if (activeRow === null) return
    const close = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target?.closest?.("[data-legend-row]")) setActiveRow(null)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [activeRow])

  const overlays = useMemo(() => indicators.filter((indicator) => indicator.plot.kind === "over"), [indicators])
  const volumeIndicators = useMemo(() => indicators.filter((indicator) => indicator.plot.kind === "vol"), [indicators])
  const ownPanes = useMemo(() => indicators.filter((indicator) => indicator.plot.kind === "pane"), [indicators])

  const layout = useMemo(
    () =>
      chartLayout({
        narrow,
        mobile,
        overlayCount: overlays.length,
        volumeCount: volumeIndicators.length,
        indicatorKeys: ownPanes.map((indicator) => indicator.key),
        available: fit.available,
      }),
    [narrow, mobile, overlays.length, volumeIndicators.length, ownPanes, fit.available],
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

  // Trục giá chỉ theo nến đang hiện; đường chỉ báo không kéo giãn trục (v2.3 §3).
  const priceScale = useMemo(() => priceRange(bars, current), [bars, current])

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

  // Đường dạng MA (MA, EMA, MA Cross) ngoài khung ở phiên đang mở: nhãn ở mép phải (v2.3 §3).
  const offscale = offscaleLabels(
    overlays
      .filter((indicator) => !indicator.hidden && (indicator.id === "ma" || indicator.id === "ema" || indicator.id === "ma_cross"))
      .flatMap((indicator) =>
        indicator.plot.series.map((line) => ({
          key: `${indicator.key}-${line.key}`,
          name: maLineName(indicator, line.key),
          value: line.values[current] ?? null,
          color: line.color ?? indicator.color,
        })),
      ),
    priceScale,
    pricePane,
    formatNumber,
  )
  const closeY = priceY(bars[current].close)

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
          setActiveRow(null)
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

        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={pricePane.top} width={width - PAD_RIGHT} height={pricePane.height} />
          </clipPath>
        </defs>

        {/* Lưới giá và nhãn ở trục phải; vạch trùng chỗ nhãn giá đóng cửa thì bỏ số (v2.3 §3) */}
        {[0, 1, 2, 3, 4].map((step) => {
          const value = priceScale.low + ((priceScale.high - priceScale.low) * step) / 4
          const y = priceY(value)
          return (
            <g key={step}>
              <line x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={y} y2={y} stroke={GRID} />
              {Math.abs(y - closeY) >= 14 && (
                <text x={width - PAD_RIGHT + 6} y={y + 4} className="fill-academy-label text-[10.5px] tabular-nums">
                  {formatNumber(value)}
                </text>
              )}
            </g>
          )
        })}

        {/* Chỉ báo vẽ trên ô giá: cắt theo khung, không kéo giãn trục */}
        <g clipPath={`url(#${clipId})`} data-testid="flashback-price-overlays">
          {overlays
            .filter((indicator) => !indicator.hidden)
            .map((indicator) => (
              <g key={indicator.key}>
                <IndicatorLines indicator={indicator} from={0} to={current} x={x} y={priceY} color={indicator.color} />
                <CrossPoints indicator={indicator} from={0} to={current} x={x} y={priceY} />
              </g>
            ))}
        </g>
        {offscale.map((label) => (
          <text
            key={label.key}
            x={width - PAD_RIGHT - 4}
            y={label.y + 4}
            textAnchor="end"
            style={{ fill: label.color }}
            className="text-[10.5px] font-semibold tabular-nums"
            data-offscale={label.side}
          >
            {label.text}
          </text>
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
        <line x1={PAD_LEFT} x2={PAD_LEFT + plotWidth} y1={closeY} y2={closeY} stroke="var(--chart-1)" strokeDasharray="2 3" />
        <PriceTag x={width - PAD_RIGHT + 2} y={closeY} text={formatNumber(bars[current].close)} />

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

      {/* Chú giải nổi kiểu TradingView: góc trên bên trái mỗi khung, đè lên phần vẽ (v2.3 §1) */}
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
              touch={mobile}
              active={activeRow === indicator.key}
              onActivate={setActiveRow}
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
              touch={mobile}
              active={activeRow === indicator.key}
              onActivate={setActiveRow}
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
                touch={mobile}
                active={activeRow === indicator.key}
                onActivate={setActiveRow}
              />
            </Legend>
          )
        })}
      </div>
    </div>
  )
})

/** Khối chú giải của một khung: nổi ở góc trên bên trái, đè lên phần vẽ, không chiếm chiều cao khung. */
function Legend({ pane, name, children }: { pane: PaneBox; name: string; children: React.ReactNode }) {
  return (
    <div
      className="absolute right-16 left-2 flex flex-col items-start gap-px"
      style={{ top: pane.legendTop + 2, maxHeight: pane.height }}
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
      className="pointer-events-auto flex max-w-full items-center gap-x-2 overflow-hidden rounded-sm bg-black/40 px-1.5 text-[12.5px] leading-6 whitespace-nowrap tabular-nums"
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
  touch,
  active,
  onActivate,
}: {
  indicator: ChartIndicator
  values: LegendValue[]
  onToggle: (key: string) => void
  onSettings: (key: string) => void
  onRemove: (key: string) => void
  /** Điện thoại: nút chỉ hiện khi dòng được chạm (v2.3 §1.3). */
  touch: boolean
  active: boolean
  onActivate: (key: string) => void
}) {
  return (
    <div
      className={cn(
        "group pointer-events-auto flex max-w-full items-center gap-x-2 overflow-hidden rounded-sm bg-black/40 px-1.5 text-[12.5px] whitespace-nowrap tabular-nums",
        indicator.hidden && "opacity-45",
      )}
      style={{ height: LEGEND_ROW }}
      data-legend-row={indicator.key}
      data-active={active || undefined}
      onClick={touch ? () => onActivate(indicator.key) : undefined}
    >
      {/* Hẹp chỗ thì các giá trị co lại (có dấu ba chấm) trước tên chỉ báo; 3 nút luôn còn đủ. */}
      <span className="min-w-0 truncate font-bold text-foreground">{indicator.label}</span>
      <span className="min-w-0 shrink-[1000] truncate">
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
      <span
        className={cn(
          "shrink-0 items-center",
          touch ? (active ? "flex" : "hidden") : "hidden group-focus-within:flex group-hover:flex",
        )}
        data-legend-buttons
      >
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

/** Tên đường MA cho nhãn ngoài khung: "MA 200", "EMA 50"; MA Cross ghi chu kỳ của từng đường. */
function maLineName(indicator: ChartIndicator, lineKey: string): string {
  const period = (name: string, fallback: number) => {
    const value = indicator.params?.[name]
    return typeof value === "number" ? value : fallback
  }
  if (indicator.id === "ema") return `EMA ${period("period", 20)}`
  if (indicator.id === "ma_cross") return lineKey === "f" ? `MA ${period("fast", 20)}` : `MA ${period("slow", 50)}`
  return `MA ${period("period", 20)}`
}
