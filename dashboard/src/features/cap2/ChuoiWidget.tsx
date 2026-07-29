import { cn } from "@/shared/lib/cn"
import { useCap2Progress } from "./hooks"
import "./cap2-discipline.css"

/**
 * 🔥 Widget "Chuỗi lệnh kỷ luật" (spec §6).
 *
 * Chuỗi = số lệnh đã đóng LIÊN TIẾP không có vi phạm nào trong 4 hành vi Cấp 2
 * đo (cắt lỗ chậm · chốt lời hụt · bán sớm khi lỗ nhẹ · nhồi lệnh khi lỗ). Một
 * vi phạm là chuỗi về 0 — server là nguồn sự thật (`chuoi_current`/
 * `chuoi_record` được tính lại từ `order_ketso`, xem `services/cap2`).
 *
 * Ngôn ngữ theo `IQX-NguyenTac-Chung.md` §E: "Chuỗi" (KHÔNG "Streak").
 */
export interface ChuoiWidgetProps {
  /**
   * Số lệnh đã đặt trong 7 ngày gần nhất. Truyền vào (không tự fetch) để giữ
   * widget thuần trình bày. `< 1` → hiện nhắc "giao dịch quá thưa" (spec §6:
   * chuỗi chỉ có ý nghĩa khi còn giao dịch đều).
   */
  ordersLastWeek?: number
}

/** Ngưỡng "giao dịch quá thưa" (spec §6). */
const LOW_ACTIVITY_ORDERS_PER_WEEK = 1
/** Mốc chuỗi bắt đầu được nhấn mạnh về thị giác. */
const CHUOI_HOT = 5

export function ChuoiWidget({ ordersLastWeek }: ChuoiWidgetProps) {
  const { data: progress } = useCap2Progress()
  const current = progress?.chuoi_current ?? 0
  const record = progress?.chuoi_record ?? 0
  const justReset = current === 0 && progress?.last_chuoi_reset_at != null
  const isHot = current >= CHUOI_HOT
  const lowActivity = ordersLastWeek != null && ordersLastWeek < LOW_ACTIVITY_ORDERS_PER_WEEK

  return (
    <div className={cn("cap2-chuoi", isHot && "cap2-chuoi--hot")} data-testid="cap2-chuoi">
      <div className="cap2-chuoi-head">
        <span className="cap2-chuoi-flame" aria-hidden="true">
          🔥
        </span>
        <span className="cap2-chuoi-label">Chuỗi lệnh kỷ luật</span>
      </div>

      <div className="cap2-chuoi-body">
        <span className="cap2-chuoi-current tabular-nums" data-testid="cap2-chuoi-current">
          {current}
        </span>
        <span className="cap2-chuoi-unit">lệnh liên tiếp không vi phạm</span>
      </div>

      <div className="cap2-chuoi-record">{`Kỷ lục của bạn: ${record} lệnh`}</div>

      {justReset && (
        <div className="cap2-chuoi-note cap2-chuoi-note--reset" data-testid="cap2-chuoi-reset">
          Chuỗi vừa về 0 sau một vi phạm. Bắt đầu lại từ lệnh kế tiếp — làm đúng cam kết là chuỗi
          lên lại.
        </div>
      )}

      {lowActivity && (
        <div className="cap2-chuoi-note" data-testid="cap2-chuoi-lowactivity">
          Bạn giao dịch dưới 1 lệnh/tuần. Chuỗi chỉ nói lên kỷ luật khi bạn còn giao dịch đều —
          không cần nhiều lệnh, chỉ cần đều.
        </div>
      )}
    </div>
  )
}
