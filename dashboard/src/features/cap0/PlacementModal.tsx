import { Modal } from "@arco-design/web-react"
import "./cap0.css"

/**
 * Ba câu trả lời của câu hỏi xếp lớp (spec v3.0 §3).
 *
 *  - `never`   — "Chưa bao giờ"
 *  - `unsure`  — "Có, nhưng chưa tự tin"
 *  - `regular` — "Có, giao dịch thường xuyên"
 *
 * `POST /cap0/placement` hiện chỉ nhận **boolean** `has_traded_before` (backend
 * map thành `placed_level` 0 hoặc 2), nên `unsure`/`regular` đều gửi `true`.
 * Union 3 nhánh này vẫn được giữ nguyên ở FE để khi backend mở contract 3 mức
 * thì chỉ cần đổi chỗ gọi API — xem `Cap0TradingPage#handlePlacement`.
 */
export type PlacementAnswer = "never" | "unsure" | "regular"

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
 * ★ **Trần xếp lớp bị kẹp xuống Cấp 1** trong lúc Cấp 2-8 tạm tắt (xem
 * `CAP_MAX_ENABLED` trong `features/cap1/capFlags.ts`). Spec §3 viết
 * nhánh thứ ba là "→ Cấp 2 «Kỷ luật»", nhưng Cấp 2 chưa mở, nên copy ở đây
 * **không được nhắc tới Cấp 2**: nói đúng nơi user thực sự tới. Khi bật lại Cấp
 * 2, đổi dòng phụ của nhánh `regular` về đúng câu spec.
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
            Qua nhanh Cấp 0 «Nhập môn», rồi vào Cấp 1 «Học việc»
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
            Cũng qua nhanh Cấp 0 — hiện chương trình mới mở tới Cấp 1 «Học việc»
          </span>
        </button>
      </div>
    </Modal>
  )
}
