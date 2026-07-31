import { useState } from "react"
import { Button, Message } from "@arco-design/web-react"
import { getErrorMessage } from "@/shared/http/client"
import { cn } from "@/shared/lib/cn"
import { useCap5Events } from "./Cap5Context"
import { useDungNgoai } from "./hooks"
import { LY_DO_DUNG_NGOAI_OPTIONS, type LyDoDungNgoai } from "./types"
import "./cap5.css"

/**
 * Nút "Đứng ngoài có chủ đích" (spec §5, 🟢 THÊM MỚI).
 *
 * Cấp 5 KHÔNG đổi gì trong panel mua (Cấp 1-4 giữ nguyên 100%) — nó chỉ THÊM
 * lối ghi lại một quyết định **không-mua**: user mở một mã, đọc, rồi chủ động
 * ghi "tôi đứng ngoài mã này hôm nay" kèm lý do. Sau 5 phiên hệ chấm nước đó là
 * **né đúng** / **né hụt** / trung tính (server lo, xem `services/cap5`).
 *
 * ★ KHÔNG thưởng số lượng (spec §5 dòng cuối): đứng ngoài tràn lan không tốt
 * hơn — mục tiêu là *biết vì sao* mình không mua. Form nói thẳng điều đó.
 */
export interface DungNgoaiButtonProps {
  symbol: string
}

const OPEN_LABEL = "🚫 Tôi đứng ngoài mã này hôm nay"
const SUBMIT_LABEL = "Ghi quyết định đứng ngoài"

export function DungNgoaiButton({ symbol }: DungNgoaiButtonProps) {
  const cap5Events = useCap5Events()
  const dungNgoai = useDungNgoai()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<LyDoDungNgoai | null>(null)

  const handleSubmit = async () => {
    if (!reason) return
    try {
      await dungNgoai.mutateAsync({ symbol, reason })
    } catch (err) {
      // Lỗi server → giữ form mở để user thử lại, KHÔNG bắn event (chưa ghi được).
      Message.error(await getErrorMessage(err, "Không ghi được quyết định đứng ngoài."))
      return
    }
    Message.success(
      `Đã ghi. Sau 5 phiên hệ thống sẽ cho bạn biết nước đứng ngoài này là né đúng hay né hụt.`,
    )
    cap5Events.onDungNgoai?.(symbol, reason)
    setOpen(false)
    setReason(null)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="cap5-dungngoai-open"
        onClick={() => setOpen(true)}
        data-testid="cap5-dungngoai-open"
      >
        {OPEN_LABEL}
      </button>
    )
  }

  return (
    <div className="cap5-dungngoai" data-testid="cap5-dungngoai-form">
      <div className="cap5-dungngoai-q">{`Vì sao bạn KHÔNG mua ${symbol} lúc này?`}</div>

      <div className="cap5-dungngoai-options">
        {LY_DO_DUNG_NGOAI_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={cn(
              "cap5-dungngoai-option",
              reason === opt.value && "cap5-dungngoai-option--on",
            )}
            aria-pressed={reason === opt.value}
            onClick={() => setReason(opt.value)}
            data-testid={`cap5-dungngoai-ly-do-${opt.value}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <p className="cap5-dungngoai-note" data-testid="cap5-dungngoai-note">
        Đứng ngoài không phải càng nhiều càng tốt — điều đáng giá là bạn biết vì sao mình không mua.
      </p>

      <div className="cap5-dungngoai-actions">
        <Button
          type="primary"
          size="small"
          disabled={!reason}
          loading={dungNgoai.isPending}
          onClick={handleSubmit}
        >
          {SUBMIT_LABEL}
        </Button>
        <Button
          size="small"
          onClick={() => {
            setOpen(false)
            setReason(null)
          }}
        >
          Thôi
        </Button>
      </div>
    </div>
  )
}
