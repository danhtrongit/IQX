import "./cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { cn } from "@/shared/lib/cn"
import { trackJourneyEvent } from "@/shared/analytics/journey"
import { Badge, LEVELS } from "./Badge"
import { ModeBadge } from "./ModeBadge"
import { useCap0Events } from "./Cap0Context"
import { useCap0Progress } from "./hooks"
import {
  focusTaskNo,
  NUMERALS,
  TASK_NOS,
  TASK_NAMES,
  TOTAL_TASKS,
  taskState,
} from "./journeyTasks"
import { countTasksDone, tradingModeFor, type Cap0Progress } from "./types"

type RowState = "done" | "current" | "open" | "locked"

const ROW_GLYPH: Record<RowState, string> = {
  done: "✅",
  current: "🎯",
  open: "🔲",
  locked: "🔒",
}

function rowState(
  no: number,
  progress: Cap0Progress | null | undefined,
  focus: number | null,
): RowState {
  const state = taskState(no, progress)
  if (state !== "active") return state
  return no === focus ? "current" : "open"
}

function ChecklistItem({
  no,
  ordinal,
  state,
  onGo,
}: {
  no: number
  ordinal: number
  state: RowState
  onGo: () => void
}) {
  return (
    <div
      data-testid={`cap0-task-${no}`}
      className={cn(
        "cap0-checklist-item",
        state === "done" && "cap0-checklist-item--done",
        state === "current" && "cap0-checklist-item--current",
        state === "locked" && "cap0-checklist-item--locked",
      )}
    >
      <span className="cap0-checklist-glyph">{ROW_GLYPH[state]}</span>
      <div className="cap0-checklist-body">
        <span className="cap0-checklist-name">
          <span className="cap0-checklist-no">{NUMERALS[ordinal - 1]}</span>
          <span>{TASK_NAMES[no]}</span>
        </span>
      </div>
      {/* Nhiệm vụ đang mở giữ nút thao tác ngay trên dòng checklist. */}
      {(state === "open" || state === "current") && (
        <button
          type="button"
          className="cap0-checklist-golink cap0-checklist-golink--quiet"
          onClick={onGo}
        >
          Làm ngay →
        </button>
      )}
    </div>
  )
}

/**
 * Cấp 0: thẻ cấp và hai nhiệm vụ giao dịch, với nút thao tác trên mỗi dòng.
 * Tour sản phẩm không còn nằm trong checklist hay điều kiện lên cấp.
 *
 * `RightSidebar` normally only ever resolves to this panel while
 * `isCap0Active` (either `activePanel === "journey"` set by
 * `Cap0TradingPage`, or as its hide-by-level fallback) — but the sidebar's
 * `SidebarProvider` is a single app-root singleton shared by `/bieu-do` &
 * `/co-phieu`, and a race in `useCompleteTask`'s `onSuccess` can leak
 * `activePanel="journey"` onto those routes too (see that hook's comment).
 * Mirror the `isCap0Active`-gated `useCap0Progress(enabled)` pattern already
 * used by `RightSidebar`/`RightToolbar`/`TradingPanel` so THIS panel never
 * fires `GET /cap0/progress` when rendered outside a real `Cap0Provider`.
 */
export function JourneyPanel() {
  const { isCap0Active } = useCap0Events()
  const { data: progress } = useCap0Progress(isCap0Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countTasksDone(progress)
  const level = LEVELS[0]
  const focus = focusTaskNo(progress)

  const handleGo = (no: number) => {
    trackJourneyEvent("cap0_task_start", { task_id: no })
    setActivePanel("trading")
  }

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap0-level-card">
          <Badge n={level.n} color={level.color} fill={level.fill} size={64} ring={tasksDone / TOTAL_TASKS} glow />
          <div className="cap0-level-card-body">

            <div className="cap0-level-card-name cap0-display">NHẬP MÔN</div>

            {/* Mockup `.lvcard .info .mode` — the pill belongs to the info
                column, under the name, not beside the badge. */}
            <div className="cap0-level-card-mode">
              <ModeBadge mode={tradingModeFor(progress)} />
            </div>
          </div>
        </div>

        {/* Mockup `.ck-head`: tiêu đề trái, bộ đếm phải. `.c` mang MÀU CỦA CẤP
            (`var(--lvl)` — Cấp 0 là xám `#8a90a5`), là thứ duy nhất được tô
            trong một `.ck-head` có tiêu đề cố tình xám `--t3`. Màu lấy từ
            `LEVELS[n].color` thay vì hard-code trong CSS dùng chung, để cùng
            một luật phục vụ đúng cả Cấp 0 lẫn Cấp 1 (đồng `#c97b4a`). */}
        <div className="cap0-journey-checklist-header">
          <span className="cap0-journey-checklist-title">TRƯỚC KHI LÊN CẤP 1</span>
          <span className="cap0-journey-checklist-count cap0-display" style={{ color: level.color }}>
            {tasksDone}/{TOTAL_TASKS}
          </span>
        </div>

        <div className="cap0-journey-rest">
          {TASK_NOS.map((no, index) => (
            <ChecklistItem
              key={no}
              no={no}
              ordinal={index + 1}
              state={rowState(no, progress, focus)}
              onGo={() => handleGo(no)}
            />
          ))}
        </div>

      </div>
    </div>
  )
}
