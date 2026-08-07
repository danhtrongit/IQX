import "./cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { usePremiumStatus } from "@/features/premium"
import { cn } from "@/shared/lib/cn"
import { Badge, LEVELS } from "./Badge"
import { ModeBadge } from "./ModeBadge"
import { useCap0Events } from "./Cap0Context"
import { useCap0Progress } from "./hooks"
import { countTasksDone, tradingModeFor, type Cap0Progress } from "./types"

/**
 * The 5 Cấp 0 tasks — names verbatim spec v3.0 §7. Task numbers are the spec's
 * circled numerals ①..⑤, kept here as plain `no` (1..5) to key off
 * `Cap0Progress.task_N_done_at`.
 *
 * v2.2 had six: its ⑤ was "Lệnh thứ hai — tự đặt ngưỡng cắt lỗ", which v3.0
 * deletes with cắt lỗ/chốt lời themselves; its ⑥ (bán + Kết sổ) is now ⑤.
 */
const TASK_NAMES: Record<number, string> = {
  1: "Lệnh đầu tiên + Nắm giữ + Theo dõi",
  2: "Tour bảng điện — 8 điểm",
  3: "Tour bản tin thị trường",
  4: 'Tour "6 người chơi" trên mã của bạn',
  5: "Bán một lệnh — kết sổ đầu tiên",
}

/**
 * Descriptions shown under an ACTIVE task (spec §7 "có dòng mô tả"). Only
 * task ① has a verbatim description in the mockup (`#hd1`) — ②③④/⑤
 * descriptions here are reasonable paraphrases of their spec behaviour (not a
 * verbatim requirement per the task brief, which only calls out level card /
 * checklist headers / 5 task names / journey-bar copy as verbatim).
 */
const TASK_DESCRIPTIONS: Partial<Record<number, string>> = {
  1: "Mua công ty bạn biết · chọn lý do trong Kế hoạch · xem tiền nằm đâu · gắn sao ★. Làm thiếu bước nào, hệ thống sẽ nhắc.",
  2: "Tour ngắn ~2-3 phút, 8 điểm: nhận mặt các khu vực trên sân chơi bạn vừa dùng ở nhiệm vụ ①.",
  3: "Tour giới thiệu bản tin thị trường IQX — nơi tổng hợp diễn biến phiên.",
  4: 'Tour "6 người chơi" — ai đang mua/bán ảnh hưởng tới giá mã bạn chọn.',
  5: "Bán một lệnh đang có để khép vòng đời lệnh đầu tiên. Xong sẽ mở màn Kết sổ.",
}

const STAGES: { label: string; tasks: number[] }[] = [
  { label: "CHẶNG 1 — VÀO SÂN", tasks: [1] },
  { label: "CHẶNG 2 — HIỂU SÂN CHƠI · TOUR SẢN PHẨM IQX", tasks: [2, 3, 4] },
  { label: "CHẶNG 3 — KHÉP VÒNG", tasks: [5] },
]

/** Spec v3.0 §4 "3 CHẶNG · 5 NHIỆM VỤ" — the denominator of every counter here. */
const TOTAL_TASKS = 5

type TaskState = "done" | "active" | "locked"

/**
 * State of one checklist task (spec §7 "Trạng thái mỗi mục checklist").
 *
 * - ①: the entry task — active until `task_1_done_at`, then done.
 * - ②③④: the 3 Chặng 2 product tours (T2/T3/T4,
 *   `docs/superpowers/plans/2026-07-27-cap0-tours.md`) — done once their own
 *   `task_N_done_at` is set, else active once ① is done. INDEPENDENT of each
 *   other within Chặng 2 (any order — do NOT hard-sequence ②→③→④; a user can
 *   run them in whatever order they click "Làm ngay →").
 * - ⑤: spec §4 Chặng 3 "Điều kiện mở: có ≥1 lệnh đang mở (sau khi xong ①)" —
 *   active once ① is done (does NOT wait on ②③④ — Chặng 2 and Chặng 3 gate off
 *   the SAME ① flag). This panel only has `useCap0Progress`, not live position
 *   data, so "xong ①" is the approximation of "có lệnh đang mở"; the gbar,
 *   which does read the portfolio, applies the real condition.
 *   `task_5_done_at` is set by the Kết sổ gate and nothing else.
 */
function taskState(no: number, progress: Cap0Progress | null | undefined): TaskState {
  if (no === 2 || no === 3 || no === 4) {
    const doneAt =
      no === 2 ? progress?.task_2_done_at : no === 3 ? progress?.task_3_done_at : progress?.task_4_done_at
    if (doneAt) return "done"
    return progress?.task_1_done_at ? "active" : "locked"
  }
  if (no === 1) return progress?.task_1_done_at ? "done" : "active"
  // no === 5
  if (progress?.task_5_done_at) return "done"
  return progress?.task_1_done_at ? "active" : "locked"
}

function ChecklistItem({
  no,
  state,
  onGo,
}: {
  no: number
  state: TaskState
  onGo: () => void
}) {
  const desc = TASK_DESCRIPTIONS[no]
  return (
    <div
      data-testid={`cap0-task-${no}`}
      className={cn(
        "cap0-checklist-item",
        state === "done" && "cap0-checklist-item--done",
        state === "active" && "cap0-checklist-item--active",
        state === "locked" && "cap0-checklist-item--locked",
      )}
    >
      <span className="cap0-checklist-num">{state === "done" ? "✓" : no}</span>
      <div className="cap0-checklist-body">
        <span className="cap0-checklist-name">{TASK_NAMES[no]}</span>
        {state === "active" && desc && (
          <div className="cap0-checklist-desc">
            {desc}
            <button type="button" className="cap0-checklist-golink" onClick={onGo}>
              Làm ngay →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 🎯 Tab "Hành trình" (spec §7) — first sidebar-right panel while in Cấp 0.
 * Level card + `TRƯỚC KHI LÊN CẤP 1 · x/5` header + 3-stage/5-task checklist +
 * graduation goal box. Driven by `useCap0Progress` + `usePremiumStatus` (the
 * level card's `ModeBadge` needs both — see `tradingModeFor`'s doc) — no props.
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
  const { isCap0Active, onLaunchTour } = useCap0Events()
  const { data: progress } = useCap0Progress(isCap0Active)
  const { isPremium } = usePremiumStatus()
  const { setActivePanel } = useSidebar()
  const tasksDone = countTasksDone(progress)
  const level = LEVELS[0]

  // ②③④ (Chặng 2) launch their product tour instead of switching to the
  // trading panel (T2) — `Cap0TradingPage` registers the real dispatch via
  // the Cap0 event bus; ①⑤ still just switch to the "Đặt lệnh" tab.
  const handleGo = (no: number) => {
    if (no === 2 || no === 3 || no === 4) {
      onLaunchTour?.(no)
      return
    }
    setActivePanel("trading")
  }

  const stageDone = (tasks: number[]) => tasks.every((no) => taskState(no, progress) === "done")

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap0-level-card">
          <Badge n={level.n} color={level.color} fill={level.fill} size={64} ring={tasksDone / TOTAL_TASKS} glow />
          <div className="cap0-level-card-body">
            <div className="cap0-level-card-tag">CẤP 0</div>
            <div className="cap0-level-card-name cap0-display">NHẬP MÔN</div>
            <div className="cap0-level-card-lesson">
              "Hiểu sân chơi, và đi trọn vòng đời một lệnh."
            </div>
          </div>
          <ModeBadge mode={tradingModeFor(progress, isPremium)} />
        </div>

        <div className="cap0-journey-checklist-header">
          TRƯỚC KHI LÊN CẤP 1 · {tasksDone}/{TOTAL_TASKS}
        </div>

        {STAGES.map((stage) => (
          <div key={stage.label}>
            <div
              className={cn(
                "cap0-stage-label",
                stageDone(stage.tasks) && "cap0-stage-label--done",
              )}
            >
              {stage.label}
            </div>
            {stage.tasks.map((no) => (
              <ChecklistItem
                key={no}
                no={no}
                state={taskState(no, progress)}
                onGo={() => handleGo(no)}
              />
            ))}
          </div>
        ))}

        <div className="cap0-journey-goal">
          Xong cả {TOTAL_TASKS} → tốt nghiệp <strong>Cấp 0 «Nhập môn»</strong>, chuyển chế độ{" "}
          <strong>Thực chiến</strong> (T+2,5 · biên độ · hồ sơ bắt đầu tính).
        </div>
      </div>
    </div>
  )
}
