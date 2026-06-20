// ─── ChartCard ─────────────────────────────────────────────────────────────
// Card shell matching terminal `.card` + `.card-head` + `.card-body`.
// Usage: <ChartCard title="Độ rộng thị trường HOSE">...</ChartCard>

import type { ReactNode } from "react"

interface ChartCardProps {
  title: string
  children: ReactNode
}

export function ChartCard({ title, children }: ChartCardProps) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border-2)]"
      style={{ background: "var(--color-bg-2)" }}
    >
      {/* Card header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border-1)]"
      >
        {/* Title accent bar — 3 px wide, 16 px tall, purple */}
        <span
          aria-hidden
          style={{
            width: 3,
            height: 16,
            background: "rgb(var(--primary-6))",
            borderRadius: 1,
            flexShrink: 0,
            display: "inline-block",
          }}
        />
        <span
          className="font-bold text-[var(--color-text-1)] text-[13px]"
          style={{ letterSpacing: "-0.01em" }}
        >
          {title}
        </span>
      </div>

      {/* Card body */}
      <div className="p-4 flex-1">
        {children}
      </div>
    </div>
  )
}
