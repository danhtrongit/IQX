import { Message, Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap1.css"
import { CAP_MAX_ENABLED } from "./capFlags"
import { useCap1Progress, useGraduateCap1 } from "./hooks"
import { countCap1TasksDone, type Cap1Progress } from "./types"
import { useEnterCap2 } from "@/features/cap2/hooks"

function isCap2Open(): boolean {
  return CAP_MAX_ENABLED >= 2
}

export function isGraduationReadyCap1(progress: Cap1Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap1TasksDone(progress) >= 5
}

export function GraduationModalCap1() {
  const { data: progress } = useCap1Progress()
  const graduate = useGraduateCap1()
  const enterCap2 = useEnterCap2()
  const level = LEVELS[1]
  const visible = isGraduationReadyCap1(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        if (isCap2Open()) {
          enterCap2.mutate()
          return
        }
        Message.info("Cấp 2 «Kỷ luật» sắp ra mắt — đã ghi nhận tốt nghiệp Cấp 1")
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
        <div className="cap0-grad-sub">5/5 nhiệm vụ · 10 lệnh Thực chiến</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={1} size={120} glow />
        </div>
      </div>

      <button
        type="button"
        className="cap0-grad-cta cap1-grad-cta--cap2"
        data-testid="cap1-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào cấp 2: Kỷ luật

        {!isCap2Open() && (
          <span
            className="cap1-grad-cta-soon"
            style={{
              display: "block",
              marginTop: 2,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.3px",
              opacity: 0.85,
            }}
          >
            Cấp 2 sắp ra mắt — bấm để ghi nhận tốt nghiệp Cấp 1
          </span>
        )}
      </button>
    </Modal>
  )
}
