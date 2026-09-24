import type { ReactNode } from "react"

export interface DrilldownProps {
  /** the "Xem chi tiết — …" summary line */
  summary: string
  /** collapsed content (table / waterfall / sensitivity) */
  children?: ReactNode
  /** start expanded */
  open?: boolean
}

/**
 * "Xem chi tiết" — lớp analyst gập/mở, dùng `<details>` gốc (không JS). Chevron
 * xoay khi mở. Nội dung sống trong DOM ngay cả khi đang gập.
 */
export function Drilldown({ summary, children, open }: DrilldownProps) {
  return (
    <details className="group border-t border-border pt-4" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-primary select-none [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-xs transition-transform group-open:rotate-90">
          ▶
        </span>
        {summary}
      </summary>
      <div className="pt-5">{children}</div>
    </details>
  )
}
