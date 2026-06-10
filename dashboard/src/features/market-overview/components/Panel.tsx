import type { ReactNode } from "react"
import { Card, Tag, Tooltip } from "@arco-design/web-react"
import { cn } from "@/shared/lib/cn"

// ─── Panel shell ────────────────────────────────
// Arco Card wrapping each market-overview panel. Theme-aware via Arco tokens
// (follows light/dark). The page (MarketOverviewPage) owns the grid width via
// Arco Grid.Col, so this shell no longer sets a column span itself.

interface PanelProps {
  title: string
  subtitle?: string
  source?: "live" | "mock"
  children: ReactNode
  className?: string
  headerRight?: ReactNode
  icon?: ReactNode
}

export function Panel({
  title,
  subtitle,
  source,
  children,
  className = "",
  headerRight,
  icon,
}: PanelProps) {
  return (
    <Card
      className={cn(
        "h-full rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] overflow-hidden",
        className,
      )}
      bodyStyle={{ padding: 0 }}
    >
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2 min-h-9 border-b border-[var(--color-border-2)] bg-[var(--color-bg-2)]">
        <div className="flex items-baseline gap-1.5 min-w-0">
          {icon && <span className="self-center mr-0.5 shrink-0">{icon}</span>}
          <span className="text-[11px] font-bold tracking-wide uppercase text-[var(--color-text-1)] truncate">
            {title}
          </span>
          {subtitle && (
            <span className="text-[9px] text-[var(--color-text-3)] tracking-wide">{subtitle}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 self-center">
          {headerRight}
          {source && <SourceBadge source={source} />}
        </div>
      </div>
      <div className="flex-1 p-2 overflow-auto min-h-0">{children}</div>
    </Card>
  )
}

// ─── Source badge ───────────────────────────────────────

function SourceBadge({ source }: { source: "live" | "mock" }) {
  const isLive = source === "live"
  return (
    <Tooltip
      position="bottom"
      content={
        isLive
          ? "Dữ liệu thời gian thực từ API"
          : "Dữ liệu mẫu — API chưa sẵn sàng"
      }
    >
      <Tag
        size="small"
        color={isLive ? "green" : undefined}
        bordered
        className="!text-[9px] !leading-tight !font-semibold tracking-wider cursor-default"
      >
        {isLive ? "● LIVE" : "○ MOCK"}
      </Tag>
    </Tooltip>
  )
}

// ─── Mini SVG sparkline ─────────────────────────────────

export function MiniSparkline({
  data,
  color = "rgb(var(--primary-6))",
}: {
  data: number[]
  color?: string
}) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 60
  const h = 20
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ")
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block align-middle">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
