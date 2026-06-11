import { useId, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  fetchIndexIntraday,
  marketDataKeys,
  useIndices,
  type IndexData,
} from "@/features/market-data"
import { cn } from "@/shared/lib/cn"
import { fmtBil, fmtChange, fmtIndex, fmtPct, fmtTrieu, signTone } from "./format"

const INTRADAY_REFRESH_MS = 60_000

/** 4 thẻ chỉ số chính; quoteSymbol là mã gửi lên endpoint OHLCV. */
const CARDS: { code: string; name: string; quoteSymbol: string }[] = [
  { code: "VNINDEX", name: "VN-Index", quoteSymbol: "VNINDEX" },
  { code: "VN30", name: "VN30", quoteSymbol: "VN30" },
  // OHLCV upstream chỉ nhận "HNX" (HNXIndex/HNXINDEX → 502)
  { code: "HNX", name: "HNX-Index", quoteSymbol: "HNX" },
  { code: "HNX30", name: "HNX30", quoteSymbol: "HNX30" },
]

const TONE_HEX: Record<string, string> = {
  up: "#10b981",
  down: "#ef4444",
  flat: "#eab308",
}

/** Hand-rolled SVG area chart (same approach as the watchlist Sparkline). */
function IndexAreaChart({
  closes,
  refValue,
  color,
}: {
  closes: number[]
  refValue: number | null
  color: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const W = 240
  const H = 56

  if (closes.length < 2) {
    return (
      <div className="flex h-14 w-full items-center justify-center text-[10px] text-[var(--color-text-4)]">
        Chưa có dữ liệu phiên
      </div>
    )
  }

  const all = refValue != null ? [...closes, refValue] : closes
  const min = Math.min(...all)
  const max = Math.max(...all)
  const range = max - min || 1
  const pad = 4
  const x = (i: number) => (i / (closes.length - 1)) * W
  const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad)

  const line = closes
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ")
  const area = `${line} L${W},${H} L0,${H} Z`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block h-14 w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${uid}-fill)`} />
      {refValue != null && (
        <line
          x1="0"
          x2={W}
          y1={y(refValue)}
          y2={y(refValue)}
          stroke="#eab308"
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity="0.7"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Breadth "↑x —y ↓z" with domain colors. */
function Breadth({ index }: { index: IndexData | null }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] tabular-nums">
      <span className="text-up">↑{index?.advances ?? "—"}</span>
      <span className="text-reference">—{index?.noChange ?? "—"}</span>
      <span className="text-down">↓{index?.declines ?? "—"}</span>
    </span>
  )
}

function IndexCard({
  name,
  quoteSymbol,
  live,
}: {
  name: string
  quoteSymbol: string
  live: IndexData | null
}) {
  const intraday = useQuery({
    queryKey: marketDataKeys.indexIntraday(quoteSymbol),
    queryFn: () => fetchIndexIntraday(quoteSymbol),
    refetchInterval: INTRADAY_REFRESH_MS,
    refetchIntervalInBackground: false,
    staleTime: INTRADAY_REFRESH_MS - 5_000,
  })

  // Điểm live mới nhất nối thêm vào cuối chuỗi 5m giữa hai lần refetch.
  const closes = useMemo(() => {
    const base = intraday.data?.closes ?? []
    if (live && live.value > 0 && base[base.length - 1] !== live.value) {
      return [...base, live.value]
    }
    return base
  }, [intraday.data, live])

  const refValue =
    intraday.data?.refValue ??
    (live && live.value > 0 ? live.value - live.change : null)
  const lastValue = closes.length > 0 ? closes[closes.length - 1] : live?.value ?? 0
  const trend: "up" | "down" | "flat" =
    refValue != null && lastValue > 0
      ? lastValue > refValue
        ? "up"
        : lastValue < refValue
          ? "down"
          : "flat"
      : live?.trend ?? "flat"
  const toneClass =
    trend === "up" ? "text-up" : trend === "down" ? "text-down" : "text-reference"

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-[var(--color-text-2)]">{name}</span>
        <Breadth index={live} />
      </div>
      <IndexAreaChart closes={closes} refValue={refValue} color={TONE_HEX[trend]} />
      <div className="flex items-baseline justify-between">
        <span className={cn("text-base font-bold tabular-nums", toneClass)}>
          {fmtIndex(live?.value ?? lastValue)}
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums",
            live ? signTone(live.change) : "text-[var(--color-text-3)]",
          )}
        >
          {live ? `${fmtChange(live.change)} (${fmtPct(live.changePercent)})` : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-[var(--color-text-3)]">
        <span className="tabular-nums">KLGD {fmtTrieu(live?.volume)} triệu CP</span>
        <span className="tabular-nums">GTGD {fmtBil(live?.totalValue)} tỷ</span>
      </div>
    </div>
  )
}

/** Dải 4 thẻ chỉ số (VN-Index, VN30, HNX-Index, HNX30) với chart trong phiên. */
export function IndexStrip() {
  const { indices } = useIndices()
  return (
    <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 lg:grid-cols-4">
      {CARDS.map((card) => (
        <IndexCard
          key={card.code}
          name={card.name}
          quoteSymbol={card.quoteSymbol}
          live={indices.find((i) => i.name === card.name) ?? null}
        />
      ))}
    </div>
  )
}
