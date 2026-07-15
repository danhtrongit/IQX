import type { ReactNode } from "react"

export interface DuoPanelProps {
  /** left column — typically "thay đổi 5 năm" */
  left: ReactNode
  /** right column — typically "so ngành" */
  right: ReactNode
}

/**
 * 2 cột cân nhau: (trái) thay đổi 5 năm | (phải) so ngành. Desktop 2 cột,
 * mobile 1 cột (xem bctc-dashboard.css). Nhãn từng cột do nội dung truyền vào
 * (dùng `.bctc-panel-lbl`).
 */
export function DuoPanel({ left, right }: DuoPanelProps) {
  return (
    <div className="bctc-duo">
      <div className="bctc-panel">{left}</div>
      <div className="bctc-panel">{right}</div>
    </div>
  )
}
