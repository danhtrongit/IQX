import type { PointerEvent as ReactPointerEvent } from "react"

import { linePath } from "@/pages/academy/charts/chart-math"

import { axisIndexes, barPath, niceScale } from "./geometry"

/** Một đường của tấm vẽ. */
export type PanelLine = {
  name: string
  values: (number | null)[]
  /** Màu chuỗi (token `--chart-*`). */
  color: string
  /** Nét đứt, dùng cho đường tham chiếu. */
  dash?: string
  /** Vẽ điểm tròn tại mỗi giá trị. */
  markers?: boolean
}

/** Các cột của tấm vẽ: nhóm cạnh nhau hoặc chồng lên nhau. */
export type PanelBars = {
  type: "grouped" | "stacked"
  series: { name: string; values: (number | null)[] }[]
  /** Màu cột theo dấu của giá trị (khuôn E2). */
  signed?: boolean
  /** Cột nằm ngoài chuỗi dương liên tục thì vẽ nhạt hơn (khuôn E2). */
  faded?: (index: number) => boolean
}

export type PanelProps = {
  width: number
  height: number
  labels: string[]
  lines?: PanelLine[]
  bars?: PanelBars
  /** Dải trung vị ± độ lệch chuẩn của giai đoạn đang hiện. */
  band?: [number, number]
  /** Đường tham chiếu cố định (khuôn F2: PEG = 1). */
  reference?: number
  /** Trục có mốc 0. */
  zero?: boolean
  /** Đường đi qua các điểm ngày thay vì theo ô kỳ (khuôn F). */
  xLine?: boolean
  /** Cách viết nhãn trục ngang. */
  formatLabel?: (label: string) => string
  /** Vị trí được ghi nhãn; mặc định tính theo độ rộng (spec §5.4). */
  labelIndexes?: number[]
  /** Tấng trên của một biểu đồ hai tầng không ghi nhãn trục ngang. */
  axis?: boolean
  ariaLabel: string
  hoverIndex: number | null
  onHover: (index: number | null, x: number) => void
}

const PADDING_LEFT = 44
const PADDING_RIGHT = 8
const PADDING_TOP = 8
const PADDING_BOTTOM = 20

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * Tấm vẽ của một biểu đồ dashboard: lưới, trục giá trị, đường, cột, dải và
 * đường tham chiếu trên cùng một hệ toạ độ. Kỳ không tính được để trống:
 * đường đứt đoạn, không vẽ số 0 thay (spec §10).
 */
export function Panel({
  width,
  height,
  labels,
  lines = [],
  bars,
  band,
  reference,
  zero = false,
  xLine = false,
  formatLabel,
  labelIndexes,
  axis = true,
  ariaLabel,
  hoverIndex,
  onHover,
}: PanelProps) {
  const count = labels.length
  const showX = axis && count > 0
  const innerWidth = Math.max(1, width - PADDING_LEFT - PADDING_RIGHT)
  const innerHeight = Math.max(1, height - PADDING_TOP - (showX ? PADDING_BOTTOM : 6))

  const values: number[] = []
  for (const line of lines) for (const value of line.values) if (isNumber(value)) values.push(value)
  if (bars) {
    if (bars.type === "stacked") {
      for (let index = 0; index < count; index += 1) {
        let total = 0
        for (const series of bars.series) {
          const value = series.values[index]
          if (isNumber(value)) total += value
        }
        values.push(total)
      }
    } else {
      for (const series of bars.series) for (const value of series.values) if (isNumber(value)) values.push(value)
    }
  }
  if (band) values.push(band[0], band[1])
  if (reference !== undefined) values.push(reference)

  let min = values.length > 0 ? Math.min(...values) : 0
  let max = values.length > 0 ? Math.max(...values) : 1
  if (bars || zero) {
    min = Math.min(0, min)
    max = Math.max(0, max)
  } else {
    const padding = (max - min) * 0.15 || Math.abs(max) * 0.1 || 1
    min -= padding
    max += padding
  }
  const scale = niceScale(min, max, height < 110 ? 2 : 4)
  const y = (value: number) =>
    PADDING_TOP + innerHeight - ((value - scale.lo) / (scale.hi - scale.lo)) * innerHeight
  const slot = innerWidth / Math.max(count, 1)
  const x = (index: number) => PADDING_LEFT + slot * (index + 0.5)
  const xAt = xLine
    ? (index: number) => PADDING_LEFT + innerWidth * (count === 1 ? 0.5 : index / (count - 1))
    : x

  const tickStep = scale.ticks.length > 1 ? Math.abs(scale.ticks[1] - scale.ticks[0]) : 1
  const tickDigits = tickStep >= 1 ? 0 : Math.min(2, Math.ceil(-Math.log10(tickStep)))
  const tickFormat = new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: tickDigits,
    maximumFractionDigits: tickDigits,
  })

  const indexes = labelIndexes ?? axisIndexes(count, innerWidth)
  const barCount = bars ? (bars.type === "stacked" ? 1 : bars.series.length) : 0
  const barWidth = barCount > 0 ? Math.min(24, (slot * 0.72 - (barCount - 1) * 2) / barCount) : 0

  function handlePointerMove(event: ReactPointerEvent<SVGRectElement>) {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || count === 0) return
    const position = ((event.clientX - rect.left) / rect.width) * width
    let nearest = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < count; index += 1) {
      const distance = Math.abs(xAt(index) - position)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = index
      }
    }
    onHover(nearest, xAt(nearest))
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={ariaLabel}
      className="block h-auto w-full overflow-visible"
    >
      {scale.ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PADDING_LEFT}
            x2={width - PADDING_RIGHT}
            y1={y(tick)}
            y2={y(tick)}
            strokeWidth={1}
            className="stroke-border"
          />
          <text
            x={PADDING_LEFT - 6}
            y={y(tick) + 3}
            textAnchor="end"
            className="fill-academy-subtle text-[10.5px] tabular-nums"
          >
            {tickFormat.format(tick)}
          </text>
        </g>
      ))}

      {scale.lo < 0 && scale.hi > 0 && (
        <line
          x1={PADDING_LEFT}
          x2={width - PADDING_RIGHT}
          y1={y(0)}
          y2={y(0)}
          strokeWidth={1}
          className="stroke-chart-5"
        />
      )}

      {band && (
        <rect
          x={PADDING_LEFT}
          width={innerWidth}
          y={y(band[1])}
          height={Math.max(0, y(band[0]) - y(band[1]))}
          className="fill-chart-1/10"
        />
      )}

      {reference !== undefined && (
        <line
          x1={PADDING_LEFT}
          x2={width - PADDING_RIGHT}
          y1={y(reference)}
          y2={y(reference)}
          strokeWidth={1}
          strokeDasharray="4 4"
          className="stroke-chart-5"
        />
      )}

      {bars &&
        bars.series.map((series, seriesIndex) =>
          series.values.map((value, index) => {
            if (!isNumber(value)) return null
            const stacked = bars.type === "stacked"
            const running = stacked
              ? bars.series
                  .slice(0, seriesIndex)
                  .reduce((sum, item) => sum + (isNumber(item.values[index]) ? item.values[index] : 0), 0)
              : 0
            const base = stacked ? running : 0
            const top = stacked ? running + value : value
            const from = y(base)
            const to = y(top)
            const boxTop = Math.min(from, to)
            const boxHeight = Math.max(1, Math.abs(to - from) - (stacked && seriesIndex > 0 ? 2 : 0))
            const offset = stacked
              ? x(index) - barWidth / 2
              : x(index) - (bars.series.length * barWidth + (bars.series.length - 1) * 2) / 2 +
                seriesIndex * (barWidth + 2)
            const color = bars.signed
              ? value < 0
                ? "var(--price-down)"
                : "var(--chart-1)"
              : seriesIndex === 0
                ? "var(--chart-1)"
                : seriesIndex === 1
                  ? "#d95926"
                  : "#199e70"
            const faded = bars.faded?.(index) === true
            return (
              <path
                key={`${series.name}-${index}`}
                d={barPath(offset, boxTop, barWidth, boxHeight, value >= 0, !stacked || seriesIndex === bars.series.length - 1)}
                fill={color}
                opacity={faded ? 0.45 : 1}
              />
            )
          }),
        )}

      {lines.map((line) => (
        <g key={line.name}>
          <path
            d={linePath(line.values, xAt, y)}
            fill="none"
            stroke={line.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={line.dash}
          />
          {line.markers &&
            line.values.map((value, index) =>
              isNumber(value) ? (
                <circle
                  key={index}
                  cx={xAt(index)}
                  cy={y(value)}
                  r={4}
                  fill={line.color}
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              ) : null,
            )}
        </g>
      ))}

      {showX &&
        indexes.map((index) => (
          <text
            key={index}
            x={xAt(index)}
            y={height - 5}
            textAnchor="middle"
            className="fill-academy-subtle text-[10.5px] tabular-nums"
          >
            {formatLabel ? formatLabel(labels[index]) : labels[index]}
          </text>
        ))}

      {hoverIndex !== null && hoverIndex >= 0 && hoverIndex < count && (
        <line
          x1={xAt(hoverIndex)}
          x2={xAt(hoverIndex)}
          y1={PADDING_TOP}
          y2={PADDING_TOP + innerHeight}
          strokeWidth={1}
          className="stroke-chart-5"
        />
      )}

      <rect
        x={PADDING_LEFT}
        y={0}
        width={innerWidth}
        height={height}
        fill="transparent"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => onHover(null, 0)}
      />
    </svg>
  )
}
