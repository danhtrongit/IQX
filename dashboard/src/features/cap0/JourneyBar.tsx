import "./cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { cn } from "@/shared/lib/cn"
import { useCap0Progress } from "./hooks"
import { focusTaskNo, TASK_NAMES, TOTAL_TASKS } from "./journeyTasks"
import { countTasksDone, type Cap0Progress } from "./types"

/**
 * Journey-bar centre copy per progress — mockup `.jbar .nx`
 * «Tiếp: Bán một lệnh, kết sổ đầu tiên».
 *
 * ★ MỘT nhánh duy nhất cho mọi tiến độ đang chạy: nó gọi tên đúng nhiệm vụ mà
 * tab Hành trình đang dẫn (`focusTaskNo` — cùng một phép chọn, cùng một
 * module). Các nhánh cũ nói "Chặng 1 «Vào sân»" / "Tiếp: Chặng 2 — tour sản
 * phẩm IQX"; không còn chặng nào, cũng không còn tour nào, nên chúng chỉ có thể
 * nói sai.
 */
function nextTaskCopy(progress: Cap0Progress | null | undefined) {
  const focus = focusTaskNo(progress)
  // Hết nhiệm vụ mở = xong cả 4 (① chưa xong thì ① luôn active).
  if (focus == null) {
    return "🎓 Hoàn thành Cấp 0!"
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
