import { Message, Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap1.css"
import { useCap1Progress, useGraduateCap1 } from "./hooks"
import { countCap1TasksDone, type Cap1Progress } from "./types"

/**
 * Điều kiện mở màn tốt nghiệp Cấp 1 (spec §3): 6/6 nhiệm vụ, chưa từng tốt
 * nghiệp (một chiều — không mở lại một khi `graduated_at` đã có, mirrors
 * `cap0/GraduationModal.tsx#isGraduationReady`).
 */
export function isGraduationReadyCap1(progress: Cap1Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap1TasksDone(progress) >= 6
}

// Verbatim spec §3 copy — `**bold**` markers kept for the inline-bold renderer
// below (same convention as `cap0/GraduationModal.tsx`).
const BLOCK_1 =
  "Bạn đã đi qua 10 lệnh Thực chiến đầu tiên — mọi lệnh đều có kế hoạch: biết vì sao mua và mua vùng nào. Bạn đã thử cả 5 lý do, và có ít nhất 3 lần chọn được lý do đang được dữ liệu ủng hộ. **Bạn không còn vào lệnh cảm tính.**"

const BLOCK_2 =
  "Nhưng biết mua thôi chưa đủ. Vào lệnh dễ, thoát lệnh mới khó. Cấp 2 «Kỷ luật» dạy điều khó hơn: **đặt cắt lỗ / chốt lời có cơ sở, và thực hiện đúng cam kết của chính mình** — không cắt lỗ chậm vì hy vọng, không tham thêm khi đã tới đích."

const BLOCK_3 =
  "**Từ giờ: Cấp 2 «Kỷ luật».** Form Kế hoạch thêm 2 phần: Cắt lỗ và Chốt lời — với 2 cách đặt có cơ sở. Bạn sẽ có thêm: chuỗi lệnh kỷ luật · điểm kỷ luật hằng ngày · cảnh báo khi giá chạm cắt lỗ."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 1 (spec §3) — self-contained (calls `useCap1Progress` +
 * `useGraduateCap1` itself, same pattern as `cap0/GraduationModal.tsx`): the
 * consumer (`Cap1TradingPage`) just mounts `<GraduationModalCap1 />`
 * unconditionally, this component decides its own visibility via
 * `isGraduationReadyCap1`. Header (tag/tên/dòng phụ/huy hiệu 120px glow) + 3
 * khối VERBATIM (Ghi nhận / Định vị / Chuyển cấp viền ngọc lam `#7dd3c0`) +
 * CTA.
 *
 * Cấp 2 doesn't exist yet — same honest pattern `cap0/GraduationModal.tsx`
 * used for Cấp 1 before THIS delivery wired it up: record the graduation
 * server-side (so progress genuinely advances / this modal never re-opens),
 * then toast "Cấp 2 sắp ra mắt" instead of routing anywhere.
 */
export function GraduationModalCap1() {
  const { data: progress } = useCap1Progress()
  const graduate = useGraduateCap1()
  const level = LEVELS[1]
  const visible = isGraduationReadyCap1(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        Message.info("Cấp 2 sắp ra mắt")
      },
    })
  }

  return (
    <Modal
      visible={visible}
      footer={null}
      title={null}
      closable={false}
      maskClosable={false}
      escToExit={false}
      autoFocus={false}
      className="cap0"
      style={{
        width: 480,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 16,
      }}
    >
      <div className="cap0-grad-header">
        <div className="cap0-grad-tag">HOÀN THÀNH</div>
        <h2 className="cap0-display cap0-grad-title">CẤP 1 · HỌC VIỆC</h2>
        <div className="cap0-grad-sub">6/6 nhiệm vụ · 10 lệnh Thực chiến</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={1} size={120} glow />
        </div>
      </div>

      <div className="cap0-grad-block">{renderInlineBold(BLOCK_1)}</div>
      <div className="cap0-grad-block">{renderInlineBold(BLOCK_2)}</div>
      <div className="cap0-grad-block cap1-grad-block--cap2">{renderInlineBold(BLOCK_3)}</div>

      <button
        type="button"
        className="cap0-grad-cta cap1-grad-cta--cap2"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 2 «Kỷ luật» →
      </button>
    </Modal>
  )
}
