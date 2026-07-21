import { Modal } from "@arco-design/web-react"
import "./cap0.css"

interface PlacementModalProps {
  visible: boolean
  /** "Chưa từng" — never traded before → stays in Cấp 0. */
  onNeverTraded: () => void
  /** "Đã từng" — experienced → placement quiz (not built this delivery). */
  onTradedBefore: () => void
}

/**
 * Cửa vào — câu hỏi xếp lớp (spec §3). Shown at most once (the consumer,
 * `Cap0TradingPage`, guards `visible` on progress/placement state). Modal is
 * intentionally non-dismissable (`closable=false`, `maskClosable=false`,
 * `escToExit=false`, no footer) — the user must pick an option to proceed.
 */
export function PlacementModal({ visible, onNeverTraded, onTradedBefore }: PlacementModalProps) {
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
        width: 460,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 16,
      }}
    >
      <div className="cap0-placement-tag">CẤP 0 · NHẬP MÔN</div>
      <h2 className="cap0-display cap0-placement-title">
        Chào mừng đến Demo Trading của IQX.
      </h2>
      <p className="cap0-placement-question">Bạn đã từng mua cổ phiếu chưa?</p>
      <div className="cap0-placement-opts">
        <button type="button" className="cap0-placement-opt" onClick={onNeverTraded}>
          <span className="cap0-placement-opt-label">Chưa từng</span>
          <span className="cap0-placement-opt-sub">Bắt đầu từ Cấp 0 «Nhập môn»</span>
        </button>
        <button type="button" className="cap0-placement-opt" onClick={onTradedBefore}>
          <span className="cap0-placement-opt-label">Đã từng</span>
          <span className="cap0-placement-opt-sub">Làm bài xếp lớp 5 phút</span>
        </button>
      </div>
    </Modal>
  )
}
