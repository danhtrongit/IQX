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
 * xoay khi mở (CSS). Nội dung sống trong DOM ngay cả khi đang gập.
 */
export function Drilldown({ summary, children, open }: DrilldownProps) {
  return (
    <details className="bctc-drilldown" open={open}>
      <summary>
        <span className="bctc-chev" aria-hidden="true">
          ▶
        </span>
        {summary}
      </summary>
      <div className="bctc-drilldown-body">{children}</div>
    </details>
  )
}
