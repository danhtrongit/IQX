import { Message, Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap2-graduation.css"
import { useCap2Progress, useGraduateCap2 } from "./hooks"
import { CAP2_TOTAL_TASKS, countCap2TasksDone, type Cap2Progress } from "./types"
import { useEnterCap3 } from "@/features/cap3/hooks"
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"

function isCap3Open(): boolean {
  return CAP_MAX_ENABLED >= 3
}

export function isGraduationReadyCap2(progress: Cap2Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap2TasksDone(progress) >= CAP2_TOTAL_TASKS
}

export function GraduationModalCap2() {
  const { data: progress } = useCap2Progress()
  const graduate = useGraduateCap2()
  const enterCap3 = useEnterCap3()
  const level = LEVELS[2]
  const visible = isGraduationReadyCap2(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        if (isCap3Open()) {
          enterCap3.mutate()
          return
        }
        Message.info("Cấp 3 «Bản lĩnh» sắp ra mắt — đã ghi nhận tốt nghiệp Cấp 2")
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
        <h2 className="cap0-display cap0-grad-title">CẤP 2 · KỶ LUẬT</h2>

        <div className="cap0-grad-sub">1/1 nhiệm vụ · 10 lệnh có cắt lỗ/chốt lời</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={2} size={120} glow />
        </div>
      </div>

      <button
        type="button"
        className="cap0-grad-cta"
        data-testid="cap2-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào cấp 3: Bản lĩnh

        {!isCap3Open() && (
          <span
            className="cap2-grad-cta-soon"
            style={{
              display: "block",
              marginTop: 2,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.3px",
              opacity: 0.85,
            }}
          >
            Cấp 3 sắp ra mắt — bấm để ghi nhận tốt nghiệp Cấp 2
          </span>
        )}
      </button>
    </Modal>
  )
}
