import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { useCap4Events } from "./Cap4Context"
import { useCap4Progress } from "./hooks"
import {
  CAP4_SO_LENH_TARGET,
  CAP4_TOTAL_TASKS,
  countCap4TasksDone,
  type Cap4Progress,
} from "./types"
import "./cap4-journey.css"

/**
 * Nhiệm vụ DUY NHẤT của Cấp 4 — tên VERBATIM theo mockup
 * `iqx-cap4-hanhtrinh.html` (`.task .nm`).
 */
const TASK_NAME = "Đọc và chấm đủ 5 lớp qua 10 lệnh"

type TaskState = "done" | "active"

/**
 * State của nhiệm vụ duy nhất. Không còn luật mở khoá nào: nó mở ngay khi vào
 * Cấp 4 và chỉ có hai trạng thái.
 */
export function taskStateCap4(
  no: number,
  progress: Cap4Progress | null | undefined,
): TaskState {
  if (no !== 1) return "active"
  return progress?.task_1_done_at ? "done" : "active"
}

function ChecklistItem({
  state,
  progressText,
  onGo,
}: {
  state: TaskState
  progressText?: string
  onGo: () => void
}) {
  return (
    <div
      data-testid="cap4-task-1"
      className={
        "cap0-checklist-item cap1-checklist-item" +
        (state === "done" ? " cap0-checklist-item--done" : " cap0-checklist-item--active")
      }
    >
      <span className="cap0-checklist-num">{state === "done" ? "✓" : "①"}</span>
      <div className="cap0-checklist-body">
        <span className="cap0-checklist-name">{TASK_NAME}</span>
        {progressText && <div className="cap0-checklist-desc">{progressText}</div>}
      </div>
      {state === "active" && (
        <button type="button" className="cap0-checklist-golink" onClick={onGo}>Làm ngay →</button>
      )}
    </div>
  )
}

export function JourneyPanelCap4() {
  const { isCap4Active } = useCap4Events()
  const { data: progress } = useCap4Progress(isCap4Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap4TasksDone(progress)
  const level = LEVELS[4]

  const openPortfolioAnalysis = () => setActivePanel("cap4-analysis")
  const goToTrading = () => setActivePanel("trading")
  const state = taskStateCap4(1, progress)

  const soLenhText = progress
    ? `${Math.min(progress.so_lenh_doc_du_5lop, CAP4_SO_LENH_TARGET).toLocaleString(
        "vi-VN",
      )}/${CAP4_SO_LENH_TARGET.toLocaleString("vi-VN")} lệnh`
    : undefined

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap0-level-card">
          <Badge
            n={level.n}
            color={level.color}
            fill={level.fill}
            size={64}
            ring={tasksDone / CAP4_TOTAL_TASKS}
            glow
          />
          <div className="cap0-level-card-body">

            <div className="cap0-level-card-name cap0-display">THUẦN THỤC</div>

            <div className="cap0-level-card-mode">
              {/* Mockup `.lvcard .info .mode`: "● Đọc trọn 5 lớp mỗi lệnh". */}
              <ModeBadge mode="thuc_chien" />
            </div>
          </div>
        </div>

        {/* Mockup `.ck-head`: tiêu đề xám bên trái + bộ đếm mang MÀU CỦA CẤP
            bên phải — hai phần tử, không phải một chuỗi "… · x/1". */}
        <div className="cap0-journey-checklist-header mt-3">
          <span className="cap0-journey-checklist-title">TRƯỚC KHI LÊN CẤP 5</span>
          <span
            className="cap0-journey-checklist-count cap0-display"
            style={{ color: level.color }}
          >
            {tasksDone}/{CAP4_TOTAL_TASKS}
          </span>
        </div>

        <div className="cap0-journey-rest">
          <ChecklistItem state={state} progressText={soLenhText} onGo={goToTrading} />
        </div>

        {/* Mockup `.tools` — hai ô. "Kết sổ" là ô TĨNH (màn Kết sổ tự mở khi
            bán xong, không phải một panel bấm vào được), đúng như Cấp 1. */}
        <div className="cap4-tools" data-testid="cap4-tools">
          <div className="cap4-tool cap4-tool--static">📓 Kết sổ</div>
          <button type="button" className="cap4-tool" onClick={openPortfolioAnalysis}>
            📊 Phân tích danh mục
          </button>
        </div>

      </div>
    </div>
  )
}
