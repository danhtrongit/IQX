import { useEffect } from "react"
import "./cap2-alerts.css"

/**
 * "Ghi nhận nhỏ" (spec §11) — toast nhẹ ~2s khi user đạt một mốc kỷ luật.
 *
 * Đây là hình thức ghi nhận DUY NHẤT của hệ cấp: theo
 * `IQX-NguyenTac-Chung.md` §C10 **KHÔNG có huy chương nhiệm vụ, KHÔNG có Tủ
 * huân chương, KHÔNG confetti, KHÔNG âm thanh**. Chỉ một dòng chữ ngắn, tự
 * biến mất.
 */

/** Thời gian toast tự tắt (spec §11: "toast nhẹ 2s"). */
export const GHI_NHAN_NHO_MS = 2000

/** Các mốc chuỗi được ghi nhận (spec §11). Ngoài các mốc này → im lặng. */
export const CHUOI_MILESTONES = [10, 20, 30, 50] as const

export type GhiNhanNhoEvent =
  | { kind: "chuoi"; chuoi: number }
  | { kind: "tuan_xanh" }
  | { kind: "nhiem_vu"; taskNo: number }

/**
 * Câu ghi nhận cho một sự kiện — `null` nghĩa là KHÔNG ghi nhận (ví dụ chuỗi
 * chưa tới mốc), để tránh toast spam sau mỗi lệnh.
 */
export function ghiNhanNhoText(event: GhiNhanNhoEvent): string | null {
  switch (event.kind) {
    case "chuoi":
      return (CHUOI_MILESTONES as readonly number[]).includes(event.chuoi)
        ? `Chuỗi ${event.chuoi} lệnh liên tiếp không vi phạm. Kỷ luật đang thành thói quen.`
        : null
    case "tuan_xanh":
      return "Một tuần không vi phạm nào. Giữ nhịp này."
    case "nhiem_vu":
      return `Xong nhiệm vụ ${event.taskNo} của Cấp 2.`
  }
}

export interface GhiNhanNhoProps {
  event: GhiNhanNhoEvent
  /** Gọi khi toast hết hạn (caller bỏ toast khỏi cây). */
  onDone: () => void
}

export function GhiNhanNho({ event, onDone }: GhiNhanNhoProps) {
  const text = ghiNhanNhoText(event)

  useEffect(() => {
    if (!text) return
    const timer = setTimeout(onDone, GHI_NHAN_NHO_MS)
    return () => clearTimeout(timer)
    // `onDone` may be an inline lambda; re-arming on every render would reset
    // the 2s timer forever — key on the text instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  if (!text) return null

  return (
    <div className="cap2-ghinhan" data-testid="cap2-ghinhan" role="status" aria-live="polite">
      <span className="cap2-ghinhan-tick" aria-hidden="true">
        ✓
      </span>
      <span className="cap2-ghinhan-text">{text}</span>
    </div>
  )
}
