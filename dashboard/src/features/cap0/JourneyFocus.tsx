import type { ReactNode } from "react"
import "./cap0.css"
import { cn } from "@/shared/lib/cn"

/**
 * Ô "NHIỆM VỤ ĐANG LÀM" — khối chi phối của tab Hành trình.
 *
 * Người mới không đọc nổi cả checklist cùng lúc, nên đúng MỘT nhiệm vụ được
 * đưa lên đây với mô tả, tiến độ và nút "Làm ngay →"; checklist đầy đủ vẫn nằm
 * dưới nhưng thu gọn (chỉ tên) để họ vẫn thấy mình đang ở đâu trong cung đường.
 *
 * ★ Dùng CHUNG cho Cấp 0 và Cấp 1 (`cap1/JourneyPanelCap1.tsx` import thẳng
 * file này, đúng cách nó đã dùng chung `Badge`/`ModeBadge`). Một khối, một bộ
 * CSS `.cap0-focus-*` — cách duy nhất chắc chắn hai cấp không lệch nhau, vốn là
 * lỗi lặp lại của phần Hành trình dùng chung CSS này.
 *
 * `ready` = đã xong hết nhiệm vụ: ô đổi sang trạng thái sẵn sàng tốt nghiệp
 * (viền xanh lá, không nút) thay vì biến mất và để lại một khoảng trống.
 *
 * ★ Từng có một prop `stage` in nhãn chặng của nhiệm vụ. Cấp 0 là cấp duy nhất
 * chia chặng và mockup mới đã bỏ chặng hẳn, nên prop lẫn `.cap0-focus-stage`
 * đều đi theo — đừng dựng lại nếu không có mockup nào đòi.
 */
export function JourneyFocus({
  testId,
  tag,
  numeral,
  name,
  desc,
  extra,
  progressText,
  onGo,
  ctaLabel = "Làm ngay →",
  ready = false,
}: {
  /** `cap0-focus` / `cap1-focus` — mỗi cấp một id để test bám đúng panel. */
  testId: string
  tag: string
  /** ①..⑥ — bỏ trống ở trạng thái `ready` (không còn nhiệm vụ nào để đánh số). */
  numeral?: string
  name: string
  /** Mô tả — chỉ trạng thái `ready` còn dùng; ô nhiệm vụ đang làm đã bỏ theo yêu cầu. */
  desc?: string
  /** Khối phụ (dải emoji độ phủ 5 lý do của Cấp 1 ③). */
  extra?: ReactNode
  progressText?: string
  onGo?: () => void
  ctaLabel?: string
  ready?: boolean
}) {
  return (
    <div
      data-testid={testId}
      className={cn("cap0-focus", ready && "cap0-focus--ready")}
    >
      <div className="cap0-focus-tag">{tag}</div>
      <div className="cap0-focus-name cap0-display">
        {numeral && <span className="cap0-focus-no">{numeral}</span>}
        <span>{name}</span>
      </div>
      {desc && <div className="cap0-focus-desc">{desc}</div>}
      {extra}
      {progressText && <div className="cap0-focus-progress">{progressText}</div>}
      {onGo && (
        <button type="button" className="cap0-focus-cta" onClick={onGo}>
          {ctaLabel}
        </button>
      )}
    </div>
  )
}
