import "./cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { usePremiumStatus } from "@/features/premium"
// Concrete-file import (NOT the `@/features/watchlist` barrel): `tabStorage`
// is a plain localStorage helper with no component behind it, so this cannot
// pull `WatchlistPanel` → `@/features/dashboard` → … back into cap0.
import { writeWatchlistTab } from "@/features/watchlist/tabStorage"
import { cn } from "@/shared/lib/cn"
import { Badge, LEVELS } from "./Badge"
import { JourneyFocus } from "./JourneyFocus"
import { ModeBadge } from "./ModeBadge"
import { useCap0Events } from "./Cap0Context"
import { useCap0Progress } from "./hooks"
import { focusTaskNo, NUMERALS, TASK_NAMES, TASK_NOS, TOTAL_TASKS, taskState } from "./journeyTasks"
import { countTasksDone, tradingModeFor, type Cap0Progress } from "./types"

/**
 * Trạng thái VẼ của một dòng checklist thu gọn — 4 trạng thái, trong khi việc
 * MỞ KHOÁ vẫn chỉ có 3 (`taskState`: done/active/locked, không đổi một dòng
 * nào). `current` là nhiệm vụ đang nằm trên ô tập trung; `open` là nhiệm vụ
 * cũng đang mở nhưng chưa tới lượt được dẫn — nó GIỮ lối tắt "Làm ngay →"
 * riêng, vì ②③④ là ba tour độc lập và ⑤ mở cùng lúc với chúng.
 */
type RowState = "done" | "current" | "open" | "locked"

/**
 * Mockup `iqx-cap0-hanhtrinh.html` `.task .st`. 🔲 là ô Cấp 1 đã dùng cho
 * "đã mở nhưng chưa tới lượt" — giờ Cấp 0 cũng có nghĩa cho nó, vì đúng MỘT
 * nhiệm vụ mang 🎯 (nhiệm vụ đang được ô tập trung dẫn).
 */
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

/**
 * Một dòng checklist THU GỌN: emoji trạng thái + số thứ tự + tên. Mô tả và nút
 * to đã dọn hết lên ô tập trung — dòng ở đây chỉ để người dùng thấy cung đường.
 */
function ChecklistItem({
  no,
  state,
  onGo,
}: {
  no: number
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
          <span className="cap0-checklist-no">{NUMERALS[no - 1]}</span>
          <span>{TASK_NAMES[no]}</span>
        </span>
      </div>
      {/* ★ Lối tắt cho nhiệm vụ ĐANG MỞ mà không được tập trung. Bỏ nó đi là
          khoá mất thứ user có quyền làm ngay bây giờ (②③④ mở cùng lúc, độc lập
          với nhau) — "một nhiệm vụ một lúc" chỉ được phép là cách DẪN. Dòng
          đang được tập trung không cần: nút to nằm sẵn trong ô trên. */}
      {state === "open" && (
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
 * 🎯 Tab "Hành trình" — first sidebar-right panel while in Cấp 0. Level card +
 * ô "NHIỆM VỤ ĐANG LÀM" (khối chi phối: mô tả + "Làm ngay →") +
 * `TRƯỚC KHI LÊN CẤP 1 · x/4` header + checklist 4 nhiệm vụ THU GỌN. Driven by
 * `useCap0Progress` + `usePremiumStatus` (the level card's `ModeBadge` needs
 * both — see `tradingModeFor`'s doc) — no props.
 *
 * ★ Mockup `iqx-cap0-hanhtrinh.html` vẽ cả checklist mở sẵn; bản này KHÔNG xoá
 * checklist đó, nó hạ cấp: nhiệm vụ đang làm được nâng thành khối riêng ở trên,
 * phần còn lại vẫn hiện đủ nhưng thu gọn và mờ đi.
 *
 * ★★ Mockup mới là một DANH SÁCH PHẲNG 4 dòng: không nhãn chặng (CHẶNG 1/2/3
 * biến mất cùng ba tour sản phẩm) và không ô "Xong cả n → tốt nghiệp" ở cuối.
 * Đừng thêm lại — cả hai đều đã bị bỏ có chủ đích.
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
  const { isPremium } = usePremiumStatus()
  const { setActivePanel } = useSidebar()
  const tasksDone = countTasksDone(progress)
  const level = LEVELS[0]
  const focus = focusTaskNo(progress)

  // ②③ ARE the two tabs of the "Danh mục" panel — send the user straight
  // there, since that is where the nhiệm vụ is actually performed (opening the
  // tab is what completes it, see `Gbar`'s `onPortfolioTabOpen` handler). ①④
  // are order actions → the "Đặt lệnh" panel.
  //
  // ★★ Phải chọn ĐÚNG tab, không chỉ đúng panel. `WatchlistPanel` mount lên với
  // tab nhớ trong localStorage (mặc định Theo dõi), nên "Làm ngay →" trên ②
  // từng mở ra Theo dõi: ③ tick nhầm, ② không, và user không hiểu vì sao tab
  // "Nắm giữ" vẫn chưa xong. Ai đi theo nút dẫn rồi bán luôn thì dừng ở 3/4 +
  // cổng — `isGraduationReady` không bao giờ mở màn tốt nghiệp, "không lên
  // được Cấp 1". `RightSidebar` chỉ render một panel một lúc nên lúc này
  // `WatchlistPanel` chưa mount; ghi tab trước rồi mới chuyển panel là đủ.
  //
  // ★ Không còn nhánh `onLaunchTour` nào: ba tour sản phẩm của Chặng 2 đã bị bỏ
  // khỏi Cấp 0, và dưới cách đánh số mới một cú `completeTask(2|3|4)` từ tour
  // sẽ đánh dấu nhầm "Xem tab Nắm giữ/Theo dõi" là đã xong.
  const handleGo = (no: number) => {
    if (no === 2 || no === 3) {
      writeWatchlistTab(no === 2 ? "holdings" : "watchlist")
      setActivePanel("watchlist")
      return
    }
    setActivePanel("trading")
  }

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap0-level-card">
          <Badge n={level.n} color={level.color} fill={level.fill} size={64} ring={tasksDone / TOTAL_TASKS} glow />
          <div className="cap0-level-card-body">
            {/* Nhãn "CẤP 0" và câu bài học đã bỏ theo yêu cầu điều chỉnh — chỉ còn tên cấp + pill chế độ. */}
            <div className="cap0-level-card-name cap0-display">NHẬP MÔN</div>
            {/* Mockup `.lvcard .info .mode` — the pill belongs to the info
                column, under the name, not beside the badge. */}
            <div className="cap0-level-card-mode">
              <ModeBadge mode={tradingModeFor(progress, isPremium)} />
            </div>
          </div>
        </div>

        {/* ★ Ô tập trung — đúng MỘT nhiệm vụ, là nhiệm vụ `active` đầu tiên.
            Hết nhiệm vụ thì nó KHÔNG rỗng đi mà đổi sang lời sẵn sàng tốt
            nghiệp (màn tốt nghiệp mở ngay trên chính trang này, xem
            `GraduationModal#isGraduationReady`). */}
        {focus == null ? (
          <JourneyFocus
            testId="cap0-focus"
            ready
            tag={`ĐÃ XONG CẢ ${TOTAL_TASKS} NHIỆM VỤ`}
            name="Sẵn sàng tốt nghiệp Cấp 0"
            desc="Bạn đã đi trọn vòng đời một lệnh: mua → nắm giữ → theo dõi → bán → kết sổ. Màn tốt nghiệp Cấp 0 «Nhập môn» mở ra ngay tại đây."
          />
        ) : (
          <JourneyFocus
            testId="cap0-focus"
            tag="NHIỆM VỤ ĐANG LÀM"
            numeral={NUMERALS[focus - 1]}
            name={TASK_NAMES[focus]}
            onGo={() => handleGo(focus)}
          />
        )}

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

        {/* Checklist ĐẦY ĐỦ của mockup, hạ cấp: vẫn đủ 4 nhiệm vụ để thấy cung
            đường, nhưng thu gọn còn tên + mờ hơn ô tập trung. Danh sách PHẲNG —
            mockup mới không còn nhãn chặng nào. */}
        <div className="cap0-journey-rest">
          {TASK_NOS.map((no) => (
            <ChecklistItem
              key={no}
              no={no}
              state={rowState(no, progress, focus)}
              onGo={() => handleGo(no)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
