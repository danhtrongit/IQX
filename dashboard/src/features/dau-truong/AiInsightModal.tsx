import { Suspense, lazy, useState } from "react"
import { Button, Input, Modal, Spin } from "@arco-design/web-react"
import { IconBrainCircuit } from "@/shared/icons"

/**
 * ★★ AI Insight MỞ TRONG TRANG CẤP, KHÔNG ĐỔI ROUTE.
 *
 * Nút «AI Phân tích» trên `RightToolbar` của cả chín shell cấp mở một ô nhập
 * mã rồi `navigate('/co-phieu/:sym')`. User bấm một nút của CHÍNH terminal,
 * nhập một mã, và bị chuyển trang — mất hành trình, mất form kế hoạch đang gõ
 * dở, không có đường quay lại. Đó là một lối ra nằm ngay trong code của trang
 * cấp, không phải của một component dùng chung.
 *
 * `AiInsightBriefing` vốn đã tự lo toàn bộ vòng đời của nó (tự gọi `analyze()`
 * một lần khi mount, tự có loading/error state) và chỉ cần một `symbol` — nên
 * đích đúng là chính nó, render trong một Modal của shell. `lazy` giữ nguyên
 * ranh giới chunk cũ: khối AI Insight (nặng, kèm `aiInsight.css` + charts)
 * không bị kéo vào bundle của mọi trang cấp lúc khởi động.
 */
const AiInsightBriefing = lazy(() =>
  import("@/features/stock/ai-insight").then((m) => ({ default: m.AiInsightBriefing })),
)

/** Chỉ số toàn thị trường — AI Insight cần một mã niêm yết cụ thể. */
const INDEX_CODES = new Set([
  "VNINDEX",
  "VN30",
  "HNX",
  "HNXINDEX",
  "UPCOM",
  "UPCOMINDEX",
  "HNX30",
])

export function isIndexSymbol(s: string): boolean {
  return INDEX_CODES.has(s.toUpperCase())
}

/** Mã hợp lệ để chạy AI Insight: 2–10 ký tự chữ/số và không phải chỉ số. */
export function isAnalyzableSymbol(s: string): boolean {
  const up = s.trim().toUpperCase()
  return /^[A-Z0-9]{2,10}$/.test(up) && !isIndexSymbol(up)
}

function BriefingFallback() {
  return (
    <div className="flex justify-center py-10">
      <Spin />
    </div>
  )
}

/**
 * Modal đọc AI Insight cho MỘT mã đã biết trước (không có bước nhập mã) —
 * dùng cho «Đọc chi tiết lớp này →» trong panel Đặt lệnh.
 */
export function AiInsightDetailModal({
  visible,
  symbol,
  onClose,
}: {
  visible: boolean
  symbol: string
  onClose: () => void
}) {
  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      footer={null}
      title={null}
      autoFocus={false}
      style={{ width: "min(1040px, 96vw)", top: 24 }}
    >
      <div className="max-h-[78vh] overflow-y-auto">
        {/* `visible` gác việc mount: đóng modal là unmount hẳn, nên lần mở sau
            chạy lại `analyze()` với dữ liệu mới thay vì giữ một bản đã cũ. */}
        {visible && (
          <Suspense fallback={<BriefingFallback />}>
            <AiInsightBriefing symbol={symbol} />
          </Suspense>
        )}
      </div>
    </Modal>
  )
}

/**
 * Modal «AI Phân tích» của `RightToolbar`: nhập mã → đọc kết quả NGAY TRONG
 * shell cấp. Trạng thái nằm hết bên trong, nên mỗi trang cấp chỉ cần
 * `visible` + `onClose`.
 */
export function AiInsightSymbolModal({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const [input, setInput] = useState("")
  const [target, setTarget] = useState<string | null>(null)

  const trimmed = input.trim().toUpperCase()
  const valid = isAnalyzableSymbol(trimmed)

  const submit = () => {
    if (!valid) return
    setTarget(trimmed)
  }

  /** Đóng = quên hết: lần mở sau bắt đầu lại từ ô nhập mã trống. */
  const close = () => {
    setTarget(null)
    setInput("")
    onClose()
  }

  if (target) {
    return <AiInsightDetailModal visible={visible} symbol={target} onClose={close} />
  }

  return (
    <Modal
      visible={visible}
      onCancel={close}
      footer={null}
      title={null}
      style={{ width: 420 }}
      autoFocus={false}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="size-9 rounded-xl bg-[var(--color-primary-light-1)] flex items-center justify-center">
          <IconBrainCircuit className="text-[rgb(var(--primary-6))] text-lg" />
        </div>
        <div>
          <div className="text-base font-semibold text-[var(--color-text-1)]">
            Phân tích AI cho 1 mã cổ phiếu
          </div>
          <div className="text-xs text-[var(--color-text-3)]">
            AI Insight cần 1 mã cụ thể. Nhập mã (vd. VCB, HPG, FPT) để chạy phân tích 6 lớp.
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(v) => setInput(v.toUpperCase())}
          onPressEnter={submit}
          placeholder="VD: VCB"
          maxLength={10}
          autoFocus
          className="flex-1 font-mono uppercase tracking-wide"
        />
        <Button type="primary" onClick={submit} disabled={!valid}>
          Phân tích
        </Button>
      </div>
    </Modal>
  )
}
