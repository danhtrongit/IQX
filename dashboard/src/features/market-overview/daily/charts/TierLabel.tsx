// ─── TierLabel ─────────────────────────────────────────────────────────────
// Section heading with left accent bar, matching terminal `.tier-label`.
// Usage: <TierLabel label="Cấu trúc phiên" />

interface TierLabelProps {
  label: string
}

export function TierLabel({ label }: TierLabelProps) {
  return (
    <div className="flex items-center gap-3 mt-8 mb-4">
      {/* Accent bar — 4 px wide, 24 px tall, purple */}
      <span
        aria-hidden
        style={{
          width: 4,
          height: 24,
          background: "rgb(var(--primary-6))",
          borderRadius: 2,
          flexShrink: 0,
          display: "inline-block",
        }}
      />
      <span
        className="font-bold text-[var(--color-text-1)] tracking-tight"
        style={{ fontSize: 18, letterSpacing: "-0.02em" }}
      >
        {label}
      </span>
    </div>
  )
}
