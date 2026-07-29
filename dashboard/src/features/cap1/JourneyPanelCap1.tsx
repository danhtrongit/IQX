import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { useCap1Events } from "./Cap1Context"
import { useCap1Progress } from "./hooks"
import { useCap1TradeLog } from "./tradeLog"
import { reasonCoverage } from "./portfolioAnalysis"
import { countCap1TasksDone, LY_DO_OPTIONS, type Cap1Progress } from "./types"

/** The 6 Cấp 1 tasks — names verbatim spec §2 headers. */
const TASK_NAMES: Record<number, string> = {
  1: "Lệnh Thực chiến đầu tiên có kế hoạch",
  2: "Bán lệnh đầu — Kết sổ đầu",
  3: "Làm quen 5 lý do — chọn đủ 5 lý do mua",
  4: "Chọn lý do có cơ sở — 3 lệnh có lý do được ✅ Ủng hộ",
  5: "Xem lại danh mục — mở trang Phân tích danh mục 3 lần",
  6: "Tổng số lệnh Thực chiến — 10 lệnh",
}

const TASK4_TARGET = 3
const TASK5_TARGET = 3
const TASK6_TARGET = 10

type TaskState = "done" | "active" | "locked"

const TASK_DONE_AT: Record<number, (p: Cap1Progress) => string | null> = {
  1: (p) => p.task_1_done_at,
  2: (p) => p.task_2_done_at,
  3: (p) => p.task_3_done_at,
  4: (p) => p.task_4_done_at,
  5: (p) => p.task_5_done_at,
  6: (p) => p.task_6_done_at,
}

/**
 * State of one checklist task (spec §2 "Điều kiện mở"). Cấp 1 has no chặng
 * grouping (unlike Cấp 0) — a flat 6-task list. ①⑥ open the instant the user
 * enters Cấp 1; ②③④⑤ open once ① is done (this panel only has aggregate
 * progress, not live order data, so "≥1 lệnh mở"/"≥3 lệnh đã đóng" are
 * approximated the same way `cap0/JourneyPanel.tsx` approximates its own
 * task ⑥ — reasonable, not exact).
 */
function taskState(no: number, progress: Cap1Progress | null | undefined): TaskState {
  const doneAt = progress ? TASK_DONE_AT[no](progress) : null
  if (doneAt) return "done"
  if (no === 1 || no === 6) return "active"
  return progress?.task_1_done_at ? "active" : "locked"
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
      data-testid={`cap1-task-${no}`}
      className={
        "cap0-checklist-item" +
        (state === "done" ? " cap0-checklist-item--done" : "") +
        (state === "active" ? " cap0-checklist-item--active" : "") +
        (state === "locked" ? " cap0-checklist-item--locked" : "")
      }
    >
      <span className="cap0-checklist-num">{state === "done" ? "✓" : "①②③④⑤⑥"[no - 1]}</span>
      <div className="cap0-checklist-body">
        <span className="cap0-checklist-name">{TASK_NAMES[no]}</span>
        {progressText && <div className="cap0-checklist-desc">{progressText}</div>}
        {state === "active" && no !== 1 && (
          <button type="button" className="cap0-checklist-golink" onClick={onGo}>
            Làm ngay →
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Tab "Hành trình" Cấp 1 (spec §8) — first sidebar-right panel while in Cấp 1.
 * Mirrors `cap0/JourneyPanel.tsx`'s structure (level card + checklist header +
 * 6-task list + goal box) but flat (no chặng grouping) and WITHOUT a Tủ huân
 * chương (spec §8 "Cấp 1 KHÔNG có Tủ huân chương").
 *
 * Self-contained: calls `useCap1Progress`/`useCap1TradeLog` itself — the
 * consumer (`Cap1TradingPage`/`RightSidebar`) just mounts `<JourneyPanelCap1 />`.
 * `useCap1Progress(isCap1Active)` only queries inside a real `Cap1Provider`
 * (mirrors `cap0/JourneyPanel.tsx`'s own doc on why this guard matters — the
 * sidebar's `SidebarProvider` is an app-root singleton shared with
 * /bieu-do & /co-phieu).
 */
export function JourneyPanelCap1() {
  const { isCap1Active } = useCap1Events()
  const { data: progress } = useCap1Progress(isCap1Active)
  const { trades } = useCap1TradeLog()
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap1TasksDone(progress)
  const level = LEVELS[1]

  const openPortfolioAnalysis = () => setActivePanel("cap1-analysis")
  const goToTrading = () => setActivePanel("trading")

  const soUngHo = progress?.so_lenh_ly_do_ung_ho ?? 0
  const soXem = progress?.so_lan_xem_danh_muc ?? 0
  const soLenh = progress?.so_lenh_thuc_chien ?? 0
  const coverage = reasonCoverage(trades)

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap0-level-card">
          <Badge n={level.n} color={level.color} fill={level.fill} size={64} ring={tasksDone / 6} glow />
          <div className="cap0-level-card-body">
            <div className="cap0-level-card-tag">CẤP 1</div>
            <div className="cap0-level-card-name cap0-display">HỌC VIỆC</div>
            <div className="cap0-level-card-lesson">
              "Vào lệnh phải biết VÌ SAO mua và mua vùng nào."
            </div>
          </div>
          <ModeBadge mode="thuc_chien" />
        </div>

        <div className="cap0-journey-checklist-header">
          TRƯỚC KHI LÊN CẤP 2 · {tasksDone}/6
        </div>

        <ChecklistItem no={1} state={taskState(1, progress)} onGo={goToTrading} />
        <ChecklistItem no={2} state={taskState(2, progress)} onGo={goToTrading} />
        <ChecklistItem
          no={3}
          state={taskState(3, progress)}
          progressText={LY_DO_OPTIONS.map((o) => `${o.icon}${coverage[o.value] ? "✓" : "✗"}`).join(
            "  ",
          )}
          onGo={goToTrading}
        />
        <ChecklistItem
          no={4}
          state={taskState(4, progress)}
          progressText={`Lý do có cơ sở (✅): ${Math.min(soUngHo, TASK4_TARGET)}/${TASK4_TARGET}`}
          onGo={goToTrading}
        />
        <ChecklistItem
          no={5}
          state={taskState(5, progress)}
          progressText={`Đã xem lại danh mục ${Math.min(soXem, TASK5_TARGET)}/${TASK5_TARGET} lần`}
          onGo={openPortfolioAnalysis}
        />
        <ChecklistItem
          no={6}
          state={taskState(6, progress)}
          progressText={`Lệnh Thực chiến ${Math.min(soLenh, TASK6_TARGET)}/${TASK6_TARGET}`}
          onGo={goToTrading}
        />

        <button type="button" className="cap0-checklist-golink mt-2" onClick={openPortfolioAnalysis}>
          Xem Phân tích danh mục →
        </button>

        <div className="cap0-journey-goal">
          Xong 6/6 → tốt nghiệp <strong>Cấp 1 «Học việc»</strong>, lên{" "}
          <strong>Cấp 2 «Kỷ luật»</strong> (viên lục giác ngọc lam). Cấp 2 thêm cắt
          lỗ/chốt lời + sổ lệnh.
        </div>
      </div>
    </div>
  )
}
