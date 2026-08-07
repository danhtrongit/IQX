import "./cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { cn } from "@/shared/lib/cn"
import { useCap0Progress } from "./hooks"
import { countTasksDone } from "./types"

/** Spec v3.0 §4 "3 CHẶNG · 5 NHIỆM VỤ" — the bar's counter and dot count. */
const TOTAL_TASKS = 5

/**
 * Journey-bar centre copy per progress (spec v3.0 §7 "Copy journey bar theo
 * tiến độ" — 0/5, 1/5 and 5/5 are verbatim). The middle branch (2..4 done)
 * isn't spec'd verbatim, so it names the next real task; under v3.0 that is
 * always ⑤ «Bán một lệnh — kết sổ đầu tiên», since ②③④ are the Chặng 2 tours
 * and ⑤ is the only thing left after them.
 */
function nextTaskCopy(tasksDone: number) {
  if (tasksDone <= 0) {
    return (
      <>
        Chặng 1 «Vào sân» — <b>Lệnh đầu tiên của bạn</b>
      </>
    )
  }
  if (tasksDone >= TOTAL_TASKS) {
    return "🎓 Hoàn thành Cấp 0!"
  }
  if (tasksDone === 1) {
    return "✓ Chặng 1 hoàn thành! Tiếp: Chặng 2 — tour sản phẩm IQX"
  }
  return (
    <>
      Tiếp: <b>Bán một lệnh — kết sổ đầu tiên</b>
    </>
  )
}

/**
 * Sticky journey bar (spec §7 THÊM MỚI) — mounted inside `Cap0TradingPage`'s
 * `.cap0-topbar` (which owns the `position: sticky`). Whole bar is one
 * clickable region → opens the Hành trình tab.
 */
export function JourneyBar() {
  const { data: progress } = useCap0Progress()
  const { setActivePanel } = useSidebar()
  const tasksDone = countTasksDone(progress)

  return (
    <button
      type="button"
      className="cap0-jbar"
      title="Bấm để mở Hành trình"
      onClick={() => setActivePanel("journey")}
    >
      <span className="cap0-jbar-day">CẤP 0 · {tasksDone}/{TOTAL_TASKS}</span>
      <span className="cap0-jbar-task">{nextTaskCopy(tasksDone)}</span>
      <div className="cap0-jbar-dots">
        {Array.from({ length: TOTAL_TASKS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "cap0-jd",
              i < tasksDone && "cap0-jd--done",
              i === tasksDone && "cap0-jd--now",
            )}
          />
        ))}
      </div>
    </button>
  )
}
