import { useEffect, useRef, useState } from "react"
import { cn } from "@/shared/lib/cn"

/** Price (in x1000 units) → raw VND display, or "—". */
export function fmtBoardPrice(n: number): string {
  if (!n || n <= 0) return "—"
  return (n * 1000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })
}

/** Round to a whole VND amount with locale separators. */
export function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("vi-VN")
}

/**
 * Semantic Tailwind text-color token for a price relative to its bands.
 * Mirrors the FOUNDATION semantic palette (ceiling/floor/up/down/reference).
 */
export function priceColorClass(
  price: number,
  ref: number,
  ceil: number,
  floor: number,
): string {
  if (!price || !ref) return "text-[var(--color-text-1)]"
  if (price >= ceil) return "text-ceiling"
  if (price <= floor) return "text-floor"
  if (price > ref) return "text-up"
  if (price < ref) return "text-down"
  return "text-reference"
}

/** Hex equivalent of `priceColorClass` so the sparkline stroke matches the price tone. */
export function priceColorHex(
  price: number,
  ref: number,
  ceil: number,
  floor: number,
): string {
  if (!price || !ref) return "#94a3b8"
  if (price >= ceil) return "#a855f7" // ceiling (purple)
  if (price <= floor) return "#06b6d4" // floor (cyan)
  if (price > ref) return "#10b981" // up (green)
  if (price < ref) return "#ef4444" // down (red)
  return "#f59e0b" // reference (yellow)
}

/** Mini area sparkline (single-tone gradient fill that matches the price color). */
export function Sparkline({
  data,
  color,
  width = 60,
  height = 22,
}: {
  data: number[]
  color: string
  width?: number
  height?: number
}) {
  if (!data || data.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = Math.max(2, Math.floor(height * 0.18))

  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * (height - 2 * pad) - pad,
  }))
  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ")
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`
  const uid = `sp${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block shrink-0"
    >
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${uid}-fill)`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Price text that briefly flashes green/red on tick changes. */
export function FlashingPrice({
  price,
  className,
}: {
  price: number
  className?: string
}) {
  const previous = useRef(price)
  const [flash, setFlash] = useState<"up" | "down" | null>(null)

  useEffect(() => {
    if (previous.current > 0 && price > 0 && previous.current !== price) {
      setFlash(price > previous.current ? "up" : "down")
      const timer = window.setTimeout(() => setFlash(null), 650)
      previous.current = price
      return () => window.clearTimeout(timer)
    }
    previous.current = price
  }, [price])

  return (
    <span
      className={cn(
        "text-sm font-black tabular-nums",
        className,
        flash === "up" && "price-flash-up",
        flash === "down" && "price-flash-down",
      )}
    >
      {fmtBoardPrice(price)}
    </span>
  )
}
