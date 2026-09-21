import { Modal } from "@arco-design/web-react"
import type { PlacementExperience } from "./types"
import "./cap0.css"

/**
 * Ba câu trả lời của câu hỏi xếp lớp (spec v3.0 §3).
 *
 *  - `never`   — "Chưa bao giờ"
 *  - `unsure`  — "Có, nhưng chưa tự tin"
 *  - `regular` — "Có, giao dịch thường xuyên"
 *
 * Ba giá trị được gửi nguyên vẹn qua `POST /cap0/placement`; backend trả cấp
 * xếp tương ứng và trạng thái ba tour bắt buộc.
 */
export type PlacementAnswer = PlacementExperience

interface PlacementModalProps {
  visible: boolean
  /** Người dùng chọn 1 trong 3 đáp án — không có nút huỷ, không có đường thoát. */
  onChoose: (answer: PlacementAnswer) => void
}

/**
 * Cửa vào — câu hỏi xếp lớp (spec v3.0 §3). Shown at most once (the consumer,
 * `Cap0TradingPage`, guards `visible` on progress/placement state). Modal is
 * intentionally non-dismissable (`closable=false`, `maskClosable=false`,
 * `escToExit=false`, no footer) — the user must pick an option to proceed.
 *
 * **v3.0 thay 2 nút cũ bằng 3 lựa chọn**, và bài xếp lớp 5 phút đã bị bỏ hẳn.
 *
 * Hai nhánh có kinh nghiệm phải xem đủ ba tour sản phẩm trước khi vào cấp đã
 * xếp; HomeWorkspace điều phối chuỗi đó.
 */
export function PlacementModal({ visible, onChoose }: PlacementModalProps) {
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
      <p className="cap0-placement-question">Bạn đã từng mua bán cổ phiếu thật bao giờ chưa?</p>
      <div className="cap0-placement-opts">
        <button
          type="button"
          className="cap0-placement-opt"
          data-testid="cap0-placement-never"
          onClick={() => onChoose("never")}
        >
          <span className="cap0-placement-opt-label">Chưa bao giờ</span>
          <span className="cap0-placement-opt-sub">Bắt đầu từ Cấp 0 «Nhập môn»</span>
        </button>
        <button
          type="button"
          className="cap0-placement-opt"
          data-testid="cap0-placement-unsure"
          onClick={() => onChoose("unsure")}
        >
          <span className="cap0-placement-opt-label">Có, nhưng chưa tự tin</span>
          <span className="cap0-placement-opt-sub">
            Vào thẳng Cấp 1 «Học việc» sau khi xem 3 tour sản phẩm
          </span>
        </button>
        <button
          type="button"
          className="cap0-placement-opt"
          data-testid="cap0-placement-regular"
          onClick={() => onChoose("regular")}
        >
          <span className="cap0-placement-opt-label">Có, giao dịch thường xuyên</span>
          <span className="cap0-placement-opt-sub">
            Vào thẳng Cấp 2 «Kỷ luật» sau khi xem 3 tour sản phẩm
          </span>
        </button>
      </div>
    </Modal>
  )
}
