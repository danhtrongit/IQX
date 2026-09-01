import { Message, Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"
import { useEnterCap4 } from "@/features/cap4/hooks"
import "./cap3-graduation.css"
import { useCap3Progress, useGraduateCap3 } from "./hooks"
import { countCap3TasksDone, type Cap3Progress } from "./types"

const BLOCK_1 =
  "Quan trọng hơn con số lãi: bạn biết **mua bao nhiêu cho mỗi lệnh**. Tự tin cao thì mua nhiều, tự tin thấp thì phòng thủ. Bạn không còn mua theo cảm hứng hay tất tay một mã."
const BLOCK_2 =
  "Nhưng có một câu hỏi bạn chưa trả lời được: lệnh thắng của bạn là do **phán đoán đúng** hay do **may mắn**? Cấp 4 dạy điều khó nhất: tách quyết định khỏi kết quả. Một quyết định tốt vẫn có thể thua, một quyết định ẩu vẫn có thể thắng — và biết phân biệt hai điều đó mới là bản lĩnh thật."
const BLOCK_3 =
  "**Từ giờ: Cấp 4 «Thuần thục».** Bạn sẽ học nhìn lại mỗi lệnh qua 4 ô: quyết định đúng-thắng, đúng-thua, sai-thắng, sai-thua — và hiểu vũ khí lẫn điểm mù của chính mình."

function isCap4Open(): boolean {
  return CAP_MAX_ENABLED >= 4
}

export function isGraduationReadyCap3(progress: Cap3Progress | null | undefined): boolean {
  return Boolean(progress && !progress.graduated_at && countCap3TasksDone(progress) === 2)
}

function renderInlineBold(text: string) {
  return text.split("**").map((part, index) =>
    index % 2 === 1 ? <strong key={index}>{part}</strong> : part,
  )
}

export function GraduationModalCap3() {
  const { data: progress } = useCap3Progress()
  const graduate = useGraduateCap3()
  const enterCap4 = useEnterCap4()
  const visible = isGraduationReadyCap3(progress)
  const level = LEVELS[3]

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        if (isCap4Open()) {
          enterCap4.mutate()
          return
        }
        Message.info("Cấp 4 «Thuần thục» sắp ra mắt — đã ghi nhận tốt nghiệp Cấp 3")
      },
    })
  }

  return (
    <Modal
      autoFocus={false}
      className="cap0"
      closable={false}
      escToExit={false}
      footer={null}
      maskClosable={false}
      style={{
        width: 480,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 16,
      }}
      title={null}
      visible={visible}
    >
      <div className="cap0-grad-header">
        <div className="cap0-grad-tag">HOÀN THÀNH</div>
        <h2 className="cap0-display cap0-grad-title">CẤP 3 · BẢN LĨNH</h2>
        <div className="cap0-grad-sub">10 lệnh có chấm tự tin · đủ 3 mức tự tin</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={3} glow size={120} />
        </div>
      </div>
      <div className="cap0-grad-block">{renderInlineBold(BLOCK_1)}</div>
      <div className="cap0-grad-block">{renderInlineBold(BLOCK_2)}</div>
      <div className="cap0-grad-block cap3-grad-block--cap4" data-testid="cap3-grad-khoi3">
        {renderInlineBold(BLOCK_3)}
      </div>
      <button
        className="cap0-grad-cta cap3-grad-cta--cap4"
        data-testid="cap3-grad-cta"
        disabled={graduate.isPending}
        onClick={handleGraduate}
        type="button"
      >
        Vào Cấp 4 «Thuần thục» →
        {!isCap4Open() && <span className="cap3-grad-cta-soon">Cấp 4 sắp ra mắt — bấm để ghi nhận tốt nghiệp Cấp 3</span>}
      </button>
    </Modal>
  )
}
