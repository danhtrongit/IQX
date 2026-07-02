// ─── ChartCard ─────────────────────────────────────────────────────────────
// Card shell matching terminal `.card` + `.card-head` + `.card-body`.
// Usage: <ChartCard title="Độ rộng thị trường HOSE">...</ChartCard>
//
// Optional frozen-variant props (additive; omitting them → identical render):
//   tag?       — small pill label in the header  { label, tone?: "am" | "frozen" }
//   frozen?    — dims body + adds frozenNote banner
//   frozenNote — text shown in the bottom banner when frozen=true

import type { ReactNode } from "react"

interface ChartCardTag {
  label: string
  tone?: "am" | "frozen"
}

interface ChartCardProps {
  title: string
  children: ReactNode
  tag?: ChartCardTag
  frozen?: boolean
  frozenNote?: string
}

export function ChartCard({ title, children, tag, frozen, frozenNote }: ChartCardProps) {
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

        {/* Optional tag pill */}
        {tag && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.03em",
              padding: "2px 7px",
              borderRadius: 20,
              border: "1px solid var(--color-border-2)",
              color: tag.tone === "frozen"
                ? "var(--color-text-3)"
                : "var(--color-text-2)",
              background: "var(--color-fill-2)",
              whiteSpace: "nowrap",
            }}
          >
            {tag.label}
          </span>
        )}
      </div>

      {/* Card body — dimmed when frozen */}
      <div
        className="p-4 flex-1"
        style={frozen ? { opacity: 0.55, pointerEvents: "none" } : undefined}
      >
        {children}
      </div>

      {/* Frozen banner */}
      {frozen && frozenNote && (
        <div
          style={{
            fontSize: 10.5,
            padding: "6px 16px",
            borderTop: "1px solid var(--color-border-1)",
            color: "var(--color-text-3)",
            background: "var(--color-fill-1)",
            textAlign: "center",
            letterSpacing: "0.01em",
          }}
        >
          {frozenNote}
        </div>
      )}
    </div>
  )
}
