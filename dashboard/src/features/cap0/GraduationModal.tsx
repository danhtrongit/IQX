import { Message, Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "./Badge"
import { useCap0Progress, useGraduate } from "./hooks"
import { countTasksDone, type Cap0Progress } from "./types"
import "./cap0.css"

/**
 * Điều kiện mở màn tốt nghiệp (spec §9): 6/6 nhiệm vụ + 2 cổng hành vi (⑤
 * keydown ô cắt lỗ, ⑥ đóng màn kết sổ). Once `graduated_at` is set
 * server-side (the mutation below succeeded), the modal never re-opens even
 * though the 6/6+2-gate condition still technically holds — graduating is a
 * one-way trip.
 */
export function isGraduationReady(progress: Cap0Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countTasksDone(progress) >= 6 && progress.task5_sl_typed && progress.task6_debrief_done
}

// Verbatim spec §9 copy, `**bold**` markers kept for the inline-bold renderer
// below (same convention as `coachTemplate.ts` — the outer *"…"* italic-quote
// wrapper is markdown emphasis, not literal quote characters to render).
const BLOCK_1 =
  "Bạn đã đi trọn Cấp 0 «Nhập môn»: hiểu bảng điện, đọc được bản tin, biết 6 người chơi trên thị trường — và quan trọng nhất: đi trọn 2 vòng lệnh có kế hoạch, tự tay đặt ngưỡng cắt lỗ của mình. **Phần lớn người mua cổ phiếu ngoài kia chưa từng làm điều cuối cùng.**"

const BLOCK_2 =
  "Nói thẳng: bạn đã biết **CÁCH CHƠI**, chưa biết **CHƠI GIỎI** — và đó là chủ đích. Cấp 1 «Học việc» dạy bạn lập kế hoạch thật sự cho từng lệnh. Câu hỏi 'chọn mã nào' sẽ được trả lời dần từ chính dữ liệu 6 lớp bạn vừa làm quen."

const BLOCK_3 =
  "**Từ giờ: chế độ THỰC CHIẾN.** Luật thật 100% — mua xong chờ T+2,5 ngày cổ phiếu mới về, biên độ, phí, thuế đầy đủ. Vì hồ sơ nhà đầu tư của bạn bắt đầu được tính từ đây."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 0 (spec §9) — self-contained (calls `useCap0Progress` +
 * `useGraduate` itself, same pattern as `DebriefModal` owning
 * `useCompleteTask`): the consumer (`Cap0TradingPage`) just mounts
 * `<GraduationModal />` unconditionally, this component decides its own
 * visibility via `isGraduationReady`. 3 khối (Ghi nhận / Định vị trung thực /
 * Chuyển chế độ, viền xanh) + huy hiệu "vừa đúc xong" (n=0, fill=1, size=120,
 * glow — spec §12) + `Vào Cấp 1 «Học việc» →`.
 *
 * On success, `useGraduate`'s `onSuccess` already invalidates every Cấp 0
 * query (see `hooks.ts`), so `ModeBadge` (`Cap0TradingPage`/`JourneyPanel`,
 * both driven by `tradingModeFor(progress)`) flips SÂN TẬP → THỰC CHIẾN the
 * instant `graduated_at` comes back — no extra prop wiring needed here. No
 * Cấp 1 flow exists yet, so this delivery just toasts a placeholder and lets
 * `isGraduationReady` close the modal (its own `graduated_at` guard).
 */
export function GraduationModal() {
  const { data: progress } = useCap0Progress()
  const graduate = useGraduate()
  const level = LEVELS[0]
  const visible = isGraduationReady(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        Message.info("Cấp 1 sắp ra mắt")
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
        <h2 className="cap0-display cap0-grad-title">CẤP 0 · NHẬP MÔN</h2>
        <div className="cap0-grad-sub">6/6 nhiệm vụ · 2/2 cổng hành vi</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={1} size={120} glow />
        </div>
      </div>

      <div className="cap0-grad-block">{renderInlineBold(BLOCK_1)}</div>
      <div className="cap0-grad-block">{renderInlineBold(BLOCK_2)}</div>
      <div className="cap0-grad-block cap0-grad-block--mode">{renderInlineBold(BLOCK_3)}</div>

      <button
        type="button"
        className="cap0-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 1 «Học việc» →
      </button>
    </Modal>
  )
}
