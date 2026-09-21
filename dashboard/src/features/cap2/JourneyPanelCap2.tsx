import "@/features/cap0/cap0.css"
import "./cap2-journey.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { useCap2Events } from "./Cap2Context"
import { useCap2Progress } from "./hooks"
import { CAP2_TOTAL_TASKS, countCap2TasksDone, type Cap2Progress } from "./types"

/**
 * Nhiệm vụ DUY NHẤT của Cấp 2 — nhãn NGUYÊN VĂN mockup
 * `iqx-cap2-hanhtrinh.html` (`.task .nm`).
 *
 * ★ Đây là bản thay thế cho 2 nhiệm vụ trước đó, vốn thay cho 5 nhiệm vụ trước
 * nữa. Nhiệm vụ ② «Thực hiện đúng khi giá chạm mốc» ĐÃ BỎ HẲN: nó khoá việc
 * tốt nghiệp vào chuyện thị trường có chạm mốc hay không — điều user không
 * điều khiển được. Cấp 2 giờ dạy đúng một việc: ĐẶT hai mốc, mọi lệnh.
 */
const TASK_NAMES: Record<number, string> = {
  1: "10 lệnh Thực chiến có đặt cắt lỗ / chốt lời",
}

const TASK_NOS = [1] as const

const TASK1_TARGET = 10

type TaskState = "done" | "active"

const STATE_GLYPH: Record<TaskState, string> = {
  done: "✅",
  active: "🎯",
}

const TASK_DONE_AT: Record<number, (p: Cap2Progress) => string | null> = {
  1: (p) => p.task_1_done_at,
}

function isDone(no: number, progress: Cap2Progress | null | undefined): boolean {
  return progress ? TASK_DONE_AT[no](progress) != null : false
}

/** Trạng thái dòng checklist duy nhất của Cấp 2. */
export function taskStatesCap2(
  progress: Cap2Progress | null | undefined,
): Record<number, TaskState> {
  return Object.fromEntries(
    TASK_NOS.map((no) => [no, isDone(no, progress) ? "done" : "active"]),
  ) as Record<number, TaskState>
}

function ChecklistItem({
  no,
  state,
  progressText,
  onGo,
}: {
  no: number
  state: TaskState
  progressText?: string
  onGo: () => void
}) {
  return (
    <div
      data-testid={`cap2-task-${no}`}
      className={
        // `cap1-checklist-item` là móc dùng chung của khung checklist ở các cấp
        // Thực chiến (xem `cap1.css` — dòng done KHÔNG gạch ngang).
        "cap0-checklist-item cap1-checklist-item" +
        (state === "done" ? " cap0-checklist-item--done" : "") +
        (state === "active" ? " cap0-checklist-item--current" : "")
      }
    >
      <span className="cap1-checklist-glyph">{STATE_GLYPH[state]}</span>
      <div className="cap0-checklist-body">
        {/* Nhãn NGUYÊN VĂN mockup: KHÔNG số khoanh tròn dẫn trước. */}
        <span className="cap0-checklist-name">{TASK_NAMES[no]}</span>
        {progressText && (
          <div className="cap0-checklist-desc">{progressText}</div>
        )}
      </div>
      {state === "active" && (
        <button type="button" className="cap0-checklist-golink" onClick={onGo}>Làm ngay →</button>
      )}
    </div>
  )
}

/**
 * Câu giữa thanh hành trình (mockup `.jbar .nx`) — nguyên văn "Đặt 10 lệnh có
 * cắt lỗ / chốt lời" khi chưa xong.
 *
 * ★ KHÔNG nói "Tiếp: …": Cấp 2 chỉ có một nhiệm vụ, không có gì "tiếp" nó.
 */
function jbarNextCopy(focus: number | null) {
  if (focus == null) return "🎓 Hoàn thành Cấp 2!"
  return "Đặt 10 lệnh có cắt lỗ / chốt lời"
}

export function JourneyPanelCap2() {
  const { isCap2Active } = useCap2Events()
  const { data: progress } = useCap2Progress(isCap2Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap2TasksDone(progress)
  const level = LEVELS[2]

  const openPortfolioAnalysis = () => setActivePanel("cap2-analysis")
  const goToTrading = () => setActivePanel("trading")

  const soLenhCoSlTp = progress?.so_lenh_co_cl_tp ?? 0
  const states = taskStatesCap2(progress)

  const focus = TASK_NOS.find((no) => states[no] === "active") ?? null

  const PROGRESS_TEXT: Record<number, string> = {
    1: `${Math.min(soLenhCoSlTp, TASK1_TARGET)}/${TASK1_TARGET} lệnh`,
  }

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* Thanh hành trình (mockup `.jbar`) — KHÔNG bấm được: người đọc nó đã
            đang đứng trong tab Hành trình. */}
        <div className="cap2-jbar" data-testid="cap2-jbar">
          <span className="cap2-jbar-lv">
            CẤP 2 · {tasksDone}/{CAP2_TOTAL_TASKS}
          </span>
          <span className="cap2-jbar-next">{jbarNextCopy(focus)}</span>
          <span className="cap2-jbar-dots">
            {TASK_NOS.map((no) => (
              <i
                key={no}
                data-testid={`cap2-jbar-dot-${no}`}
                className={
                  "cap2-jd " + (states[no] === "done" ? "cap2-jd--done" : "cap2-jd--now")
                }
              />
            ))}
          </span>
        </div>

        <div className="cap0-level-card">
          <Badge
            n={level.n}
            color={level.color}
            fill={level.fill}
            size={64}
            ring={tasksDone / CAP2_TOTAL_TASKS}
            glow
          />
          <div className="cap0-level-card-body">

            <div className="cap0-level-card-name cap0-display">KỶ LUẬT</div>

            <div className="cap0-level-card-mode">
              <ModeBadge mode="thuc_chien" />
            </div>
          </div>
        </div>

        {/* Mockup `.ck-head`: tiêu đề xám bên trái + bộ đếm mang MÀU CỦA CẤP bên
            phải — hai phần tử, không phải một chuỗi "… · x/1". */}
        <div className="cap0-journey-checklist-header">
          <span className="cap0-journey-checklist-title">NHIỆM VỤ</span>
          <span className="cap0-journey-checklist-count cap0-display" style={{ color: level.color }}>
            {tasksDone}/{CAP2_TOTAL_TASKS}
          </span>
        </div>

        <div className="cap0-journey-rest">
          {TASK_NOS.map((no) => (
            <ChecklistItem
              key={no}
              no={no}
              state={states[no]}
              progressText={PROGRESS_TEXT[no]}
              onGo={goToTrading}
            />
          ))}
        </div>

        {/* Hàng 2 công cụ (mockup `.tools`). 📓 Kết sổ KHÔNG bấm được — nó tự mở
            khi bán lệnh; làm nó thành nút sẽ là một nút chết. */}
        <div className="cap2-tools" data-testid="cap2-tools">
          <div className="cap2-tool cap2-tool--static">📓 Kết sổ</div>
          <button type="button" className="cap2-tool" onClick={openPortfolioAnalysis}>
            📊 Phân tích danh mục
          </button>
        </div>

      </div>
    </div>
  )
}
