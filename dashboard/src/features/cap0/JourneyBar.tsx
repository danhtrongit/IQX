import "./cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { cn } from "@/shared/lib/cn"
import { useCap0Progress } from "./hooks"
import { countTasksDone } from "./types"

/**
 * Journey-bar centre copy per progress (spec §7 "Copy journey bar theo tiến
 * độ" — 0/6, 1/6 and 6/6 are verbatim; the tasks-2..5 branch isn't spec'd
 * verbatim (Chặng 2's tour is out of scope this delivery — see
 * `JourneyPanel`'s `taskState`), so it falls back to naming the next real
 * (reachable) task.
 */
function nextTaskCopy(tasksDone: number) {
  if (tasksDone <= 0) {
    return (
      <>
        Chặng 1 «Vào sân» — <b>Lệnh đầu tiên của bạn</b>
      </>
    )
  }
  if (tasksDone >= 6) {
    return "🎓 Hoàn thành Cấp 0!"
  }
  if (tasksDone === 1) {
    return "✓ Chặng 1 hoàn thành! Tiếp: Chặng 2 — tour sản phẩm IQX"
  }
  const nextNo = tasksDone < 5 ? 5 : 6
  const nextName =
    nextNo === 5 ? "Lệnh thứ hai — tự đặt ngưỡng cắt lỗ" : "Bán một lệnh — kết sổ đầu tiên"
  return (
    <>
      Tiếp: <b>{nextName}</b>
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
      <span className="cap0-jbar-day">CẤP 0 · {tasksDone}/6</span>
      <span className="cap0-jbar-task">{nextTaskCopy(tasksDone)}</span>
      <div className="cap0-jbar-dots">
        {Array.from({ length: 6 }, (_, i) => (
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
