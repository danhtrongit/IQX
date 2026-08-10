import "./cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { cn } from "@/shared/lib/cn"
import { useCap0Progress } from "./hooks"
import { focusTaskNo, TASK_NAMES, TOTAL_TASKS } from "./journeyTasks"
import { countTasksDone, type Cap0Progress } from "./types"

/**
 * Journey-bar centre copy per progress (spec v3.0 §7 "Copy journey bar theo
 * tiến độ" — 0/5, 1/5 and 5/5 are verbatim).
 *
 * ★ Nhánh giữa (2..4 xong) KHÔNG spec nguyên văn, nên nó gọi tên đúng nhiệm vụ
 * mà tab Hành trình đang dẫn (`focusTaskNo` — cùng một phép chọn, cùng một
 * module). Trước đây nhánh này hard-code ⑤ «Bán một lệnh», nên ở 3/5 thanh bar
 * rao ⑤ trong khi ô tập trung dẫn ④: hai chỗ nói hai nhiệm vụ khác nhau.
 * Ở 1/5 nhiệm vụ được dẫn luôn là ② — tour Chặng 2 đầu tiên — nên câu nguyên
 * văn "Tiếp: Chặng 2 — tour sản phẩm IQX" vẫn đúng sự thật.
 */
function nextTaskCopy(progress: Cap0Progress | null | undefined) {
  const tasksDone = countTasksDone(progress)
  const focus = focusTaskNo(progress)
  // Hết nhiệm vụ mở = xong cả 5 (① chưa xong thì ① luôn active).
  if (focus == null) {
    return "🎓 Hoàn thành Cấp 0!"
  }
  if (tasksDone <= 0) {
    return (
      <>
        Chặng 1 «Vào sân» — <b>Lệnh đầu tiên của bạn</b>
      </>
    )
  }
  if (tasksDone === 1) {
    return "✓ Chặng 1 hoàn thành! Tiếp: Chặng 2 — tour sản phẩm IQX"
  }
  return (
    <>
      Tiếp: <b>{TASK_NAMES[focus]}</b>
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
      <span className="cap0-jbar-task">{nextTaskCopy(progress)}</span>
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
