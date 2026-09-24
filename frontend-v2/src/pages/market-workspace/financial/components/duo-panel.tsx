import type { ReactNode } from "react"

export interface DuoPanelProps {
  /** left column — typically "thay đổi 5 năm" */
  left: ReactNode
  /** right column — typically "so ngành" */
  right: ReactNode
}

/**
 * 2 cột cân nhau: (trái) thay đổi 5 năm | (phải) so ngành. Desktop 2 cột,
 * mobile 1 cột. Nhãn từng cột do nội dung truyền vào (PanelLabel).
 */
export function DuoPanel({ left, right }: DuoPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div>{left}</div>
      <div>{right}</div>
    </div>
  )
}
