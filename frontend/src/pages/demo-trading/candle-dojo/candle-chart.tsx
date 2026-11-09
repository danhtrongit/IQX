import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react"

import type { CdBar } from "@/lib/candle-dojo/detector"
import { cn } from "@/lib/utils"
import { CD_CHART_COLORS, type CdBand, type CdChartScale, type CdTag } from "./candle-chart-model"

/**
 * Biểu đồ nến SVG của Candle Dojo (cổng từ `chart()` của bản mẫu `IQX-Candle-Dojo-MAU.html`): lưới mờ, nến xanh
 * tăng/đỏ giảm, vùng tô vàng quanh mẫu, đường EMA10, cột khối lượng, số thứ tự nến, nhãn tên. Giãn vừa bề rộng
 * khung chứa (vẽ lại khi đổi cỡ) và cao hơn 15% trên màn máy tính (spec §13). Một biểu đồ dùng cho bài học, thi
 * đai, luyện công; không phải biểu đồ giá của Flashback.
 */

export interface CandleChartProps {
  /** Nến cần vẽ; phần tử null là chỗ trống (nến chưa hình thành). */
  bars: readonly (CdBar | null)[]
  /** Số ô nến chừa sẵn (mặc định bằng số nến); dùng khi nến hiện dần để các nến không dãn ra. */
  slots?: number
  /** Chiều cao cơ bản (px), mặc định 220. */
  height?: number
  bands?: readonly CdBand[]
  tags?: readonly CdTag[]
  /** Chỉ số các nến đánh số 1, 2, 3... (mẫu nhiều nến). */
  nums?: readonly number[]
  ema?: boolean
  volume?: boolean
  /** Nến có chỉ số < dimTo vẽ mờ (nến bối cảnh). */
  dimTo?: number
  /** Nến có chỉ số >= fade hiện dần lần lượt (110 ms/nến). */
  fadeFrom?: number
  /** Cho phép chạm: trả chỉ số nến gần điểm chạm nhất. */
  onTapBar?: (index: number) => void
  /** Lớp phủ vẽ thêm trong SVG, dùng đúng thang toạ độ của biểu đồ. */
  overlay?: (scale: CdChartScale) => ReactNode
  className?: string
  style?: CSSProperties
  "aria-label"?: string
}

const SIDE = 8

/** Bề rộng khung chứa, theo dõi khi đổi cỡ cửa sổ. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const read = () => setWidth(Math.max(160, Math.round(node.clientWidth)))
    read()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(read)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

export function CandleChart({
  bars,
  slots,
  height = 220,
  bands = [],
  tags = [],
  nums = [],
  ema = false,
  volume = false,
  dimTo,
  fadeFrom,
  onTapBar,
  overlay,
  className,
  style,
  "aria-label": ariaLabel,
}: CandleChartProps) {
  const { ref, width: boxWidth } = useWidth()
  const count = slots ?? bars.length
  const width = boxWidth
  const H = height * (boxWidth > 500 ? 1.15 : 1)
  const volumeHeight = volume ? H * 0.22 : 0
  const plotHeight = H - volumeHeight - (volumeHeight ? 6 : 0)
  const visible = bars.filter((bar): bar is CdBar => !!bar)
  if (visible.length === 0 || count === 0) {
    return <div ref={ref} className={cn("w-full", className)} style={{ height: H, ...style }} />
  }
  const low = Math.min(...visible.map((bar) => bar.l))
  const high = Math.max(...visible.map((bar) => bar.h))
  const span = high - low || 1
  const top = 12
  const y = (price: number) => top + ((high + span * 0.04 - price) / (span * 1.08)) * (plotHeight - top - 8)
  const slot = (width - SIDE * 2) / count
  const x = (index: number) => SIDE + index * slot + slot / 2
  const maxVolume = volume ? Math.max(...visible.map((bar) => bar.v || 1)) : 1
  const scale: CdChartScale = { x, y, barWidth: slot * 0.64, width, height: H }

  let average = bars[0]?.c ?? 0
  const emaPoints: string[] = []
  if (ema) {
    bars.forEach((bar, index) => {
      if (!bar) return
      average = index ? average + ((bar.c - average) * 2) / 11 : bar.c
      emaPoints.push(`${x(index)},${y(average)}`)
    })
  }

  function handlePointer(event: PointerEvent<SVGSVGElement>) {
    if (!onTapBar) return
    const box = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - box.left) / box.width) * width
    const index = Math.floor((px - SIDE) / slot)
    if (index >= 0 && index < count) onTapBar(index)
  }

  return (
    <div ref={ref} className={cn("w-full", className)} style={style}>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={ariaLabel ?? "Biểu đồ nến"}
        style={{ display: "block", touchAction: onTapBar ? "manipulation" : undefined, cursor: onTapBar ? "pointer" : undefined }}
        onPointerDown={onTapBar ? handlePointer : undefined}
      >
        {[1, 2, 3].map((g) => (
          <line
            key={g}
            x1={0}
            x2={width}
            y1={(plotHeight * g) / 4}
            y2={(plotHeight * g) / 4}
            stroke={CD_CHART_COLORS.line}
            strokeDasharray="2 5"
          />
        ))}
        {bands.map((band, index) => {
          const color = band.color ?? CD_CHART_COLORS.gold
          // Giữ vùng tô trong khung vẽ để viền không bị cắt khi mẫu nằm sát mép (ít nến hoặc mẫu ở rìa).
          const left = Math.max(2, x(band.start) - slot * 0.7)
          const right = Math.min(width - 2, x(band.end) + slot * 0.7)
          return (
            <rect
              key={index}
              x={left}
              y={3}
              width={Math.max(0, right - left)}
              height={H - 6}
              rx={6}
              fill={color}
              fillOpacity={band.opacity ?? 0.15}
              stroke={color}
              strokeWidth={1.6}
            />
          )
        })}
        {ema && emaPoints.length > 1 ? (
          <polyline points={emaPoints.join(" ")} fill="none" stroke={CD_CHART_COLORS.ema} strokeWidth={1.8} />
        ) : null}
        {bars.map((bar, index) => {
          if (!bar) return null
          const color = bar.c >= bar.o ? CD_CHART_COLORS.up : CD_CHART_COLORS.down
          const dim = dimTo != null && index < dimTo
          const fading = fadeFrom != null && index >= fadeFrom
          const volumeBar = volume ? ((bar.v || 1) / maxVolume) * (volumeHeight - 4) : 0
          return (
            <g
              key={index}
              opacity={dim ? 0.35 : 1}
              style={fading ? { animation: "cd-pop .3s both", animationDelay: `${(index - fadeFrom) * 110}ms` } : undefined}
            >
              <line
                x1={x(index)}
                x2={x(index)}
                y1={y(bar.h)}
                y2={y(bar.l)}
                stroke={color}
                strokeWidth={Math.max(1.3, slot * 0.13)}
              />
              <rect
                x={x(index) - slot * 0.32}
                y={y(Math.max(bar.o, bar.c))}
                width={slot * 0.64}
                height={Math.max(1.6, Math.abs(y(bar.o) - y(bar.c)))}
                rx={1}
                fill={color}
              />
              {volume ? (
                <rect
                  x={x(index) - slot * 0.32}
                  y={H - volumeBar}
                  width={slot * 0.64}
                  height={volumeBar}
                  fill={color}
                  fillOpacity={0.45}
                />
              ) : null}
            </g>
          )
        })}
        {nums.map((index, order) => {
          const bar = bars[index]
          if (!bar) return null
          return (
            <text
              key={`n${index}`}
              x={x(index)}
              y={y(bar.h) - 6}
              textAnchor="middle"
              fontSize={11}
              fontWeight={800}
              fill={CD_CHART_COLORS.ink2}
            >
              {order + 1}
            </text>
          )
        })}
        {tags.map((tag, index) => {
          const slice = bars.slice(tag.start, tag.end + 1).filter((bar): bar is CdBar => !!bar)
          if (slice.length === 0) return null
          const cx = (x(tag.start) + x(tag.end)) / 2
          const peak = Math.min(...slice.map((bar) => y(bar.h)))
          const w = tag.text.length * 6.6 + 20
          const yy = Math.max(14, peak - 16)
          const left = Math.min(Math.max(cx - w / 2, 2), width - w - 2)
          return (
            <g key={`t${index}`} style={{ animation: "cd-fade .35s both" }}>
              <rect x={left} y={yy - 12} width={w} height={21} rx={10.5} fill="#fff" stroke={tag.color ?? CD_CHART_COLORS.up} strokeWidth={2} />
              <text
                x={Math.min(Math.max(cx, w / 2 + 2), width - w / 2 - 2)}
                y={yy + 3}
                textAnchor="middle"
                fontSize={11.5}
                fontWeight={800}
                fill={CD_CHART_COLORS.ink}
              >
                {tag.text}
              </text>
            </g>
          )
        })}
        {overlay ? overlay(scale) : null}
      </svg>
    </div>
  )
}
