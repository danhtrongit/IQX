import { Message, Modal } from "@arco-design/web-react"
import { trackJourneyEvent } from "@/shared/analytics/journey"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap4-graduation.css"
import { lopLabelCap4 } from "./coachTemplateCap4"
import { useCap4Progress, useGraduateCap4 } from "./hooks"
import { CAP4_TOTAL_TASKS, countCap4TasksDone, type Cap4Progress, type Lop } from "./types"
import { useEnterCap5 } from "@/features/cap5/hooks"
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"

function isCap5Open(): boolean {
  return CAP_MAX_ENABLED >= 5
}

export function isGraduationReadyCap4(progress: Cap4Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap4TasksDone(progress) >= CAP4_TOTAL_TASKS
}

function lopText(lop: Lop | null): string {
  return lop ? lopLabelCap4(lop) : "chưa xác định"
}

export function GraduationModalCap4() {
  const { data: progress } = useCap4Progress()
  const graduate = useGraduateCap4()
  const enterCap5 = useEnterCap5()
  const level = LEVELS[4]
  const visible = isGraduationReadyCap4(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        trackJourneyEvent("cap4_graduate")
        if (isCap5Open()) {
          enterCap5.mutate()
          return
        }
        Message.info("Cấp 5 «Lão luyện» sắp ra mắt — đã ghi nhận tốt nghiệp Cấp 4")
      },
    })
  }
  const sub = progress
    ? `${Math.round(progress.so_lenh_doc_du_5lop).toLocaleString(
        "vi-VN",
      )} lệnh đọc đủ 5 lớp · vũ khí: ${lopText(
        progress.vu_khi_lop,
      )} · điểm mù: ${lopText(progress.diem_mu_lop)}`
    : ""

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
        <h2 className="cap0-display cap0-grad-title">CẤP 4 · THUẦN THỤC</h2>
        <div className="cap0-grad-sub">{sub}</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={4} size={120} glow />
        </div>
      </div>

      <button
        type="button"
        className="cap0-grad-cta cap4-grad-cta--cap5"
        data-testid="cap4-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào cấp 5: Lão luyện

        {!isCap5Open() && (
          <span
            className="cap4-grad-cta-soon"
            style={{
              display: "block",
              marginTop: 2,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.3px",
              opacity: 0.85,
            }}
          >
            Cấp 5 sắp ra mắt — bấm để ghi nhận tốt nghiệp Cấp 4
          </span>
        )}
      </button>
    </Modal>
  )
}
