import "@/features/cap0/cap0.css"
import "./cap1.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { useCap1Events } from "./Cap1Context"
import { useCap1Progress, useCap1Trades } from "./hooks"
import { cap1TradeFromHistory, useCap1TradeLog } from "./tradeLog"
import { reasonCoverage } from "./portfolioAnalysis"
import { countCap1TasksDone, type Cap1Progress } from "./types"

/**
 * 5 nhiệm vụ Cấp 1 — nhãn NGUYÊN VĂN mockup `iqx-cap1-hanhtrinh.html` (ngắn,
 * KHÔNG số khoanh tròn).
 *
 * ★ Đây là bản thay thế cho tiêu đề dài của spec §2 mà bản trước dùng: file
 * mockup mới ("Hành trình cấp 1: Chỉnh lại") đến SAU và là bản chốt. Cùng lúc
 * đó nhiệm vụ ⑤ cũ «Xem lại danh mục — mở Phân tích danh mục 3 lần khác ngày»
 * bị bỏ hẳn, và «10 lệnh Thực chiến» dời từ ⑥ về ⑤.
 */
const TASK_NAMES: Record<number, string> = {
  1: "Lệnh đầu có kế hoạch",
  2: "Kết sổ đầu tiên",
  3: "Làm quen 5 lý do mua",
  4: "3 lệnh có lý do ✅ Ủng hộ",
  5: "10 lệnh Thực chiến",
}

const TASK_NOS = [1, 2, 3, 4, 5] as const
const TOTAL_TASKS = 5

const TASK3_TARGET = 5
const TASK4_TARGET = 3
const TASK5_TARGET = 10

/**
 * 4 trạng thái (mockup `iqx-cap1-hanhtrinh.html`): `done` ✅ · `active` 🎯 (ô
 * đang tập trung — highlight) · `open` 🔲 (đã mở nhưng chưa tới lượt) ·
 * `locked` 🔒 (chưa mở). `open` là trạng thái mockup thêm so với Cấp 0 — nó
 * KHÔNG đổi hành vi: `open` và `active` mở như nhau (đều bấm "Làm ngay →"
 * được), chỉ khác cách vẽ.
 */
type TaskState = "done" | "active" | "open" | "locked"

const STATE_GLYPH: Record<TaskState, string> = {
  done: "✅",
  active: "🎯",
  open: "🔲",
  locked: "🔒",
}

const TASK_DONE_AT: Record<number, (p: Cap1Progress) => string | null> = {
  1: (p) => p.task_1_done_at,
  2: (p) => p.task_2_done_at,
  3: (p) => p.task_3_done_at,
  4: (p) => p.task_4_done_at,
  5: (p) => p.task_5_done_at,
}

function isDone(no: number, progress: Cap1Progress | null | undefined): boolean {
  return progress ? TASK_DONE_AT[no](progress) != null : false
}

/**
 * "Điều kiện mở" (spec §2). Cấp 1 has no chặng grouping (unlike Cấp 0) — a
 * flat 5-task list. ①⑤ open the instant the user enters Cấp 1 (⑤ «10 lệnh Thực
 * chiến» is the old ⑥, which always opened at entry); ②③④ open once ① is done
 * (this panel only has aggregate progress, not live order data, so "≥1 lệnh
 * mở"/"≥3 lệnh đã đóng" are approximated the same way `cap0/JourneyPanel.tsx`
 * approximates its own last task — reasonable, not exact).
 */
function isUnlocked(no: number, progress: Cap1Progress | null | undefined): boolean {
  if (no === 1 || no === 5) return true
  return progress?.task_1_done_at != null
}

/**
 * State of every checklist task. Exactly ONE task is `active`: the
 * lowest-numbered task that is open and not done — the mockup's single 🎯.
 * Everything else that is open reads 🔲.
 */
export function taskStates(progress: Cap1Progress | null | undefined): Record<number, TaskState> {
  const focus = TASK_NOS.find((no) => isUnlocked(no, progress) && !isDone(no, progress))
  return Object.fromEntries(
    TASK_NOS.map((no) => [
      no,
      isDone(no, progress)
        ? "done"
        : !isUnlocked(no, progress)
          ? "locked"
          : no === focus
            ? "active"
            : "open",
    ]),
  ) as Record<number, TaskState>
}

/**
 * Một dòng checklist THU GỌN. Mô tả + dải độ phủ + nút to đã dọn lên ô tập
 * trung; dòng ở đây giữ tên, và giữ con số tiến độ (`progressText`) vì Cấp 1 là
 * cấp ĐẾM — trừ chính dòng đang được tập trung, vốn đã có con số đó ngay trên
 * đầu và không cần nhắc lại hai lần.
 */
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
        // `cap1-checklist-item` là móc riêng của Cấp 1 lên cùng bộ khung
        // `.cap0-checklist-*` — xem `cap1.css` (dòng done KHÔNG gạch ngang).
        "cap0-checklist-item cap1-checklist-item" +
        (state === "done" ? " cap0-checklist-item--done" : "") +
        // Đánh dấu nhiệm vụ đang làm.
        (state === "active" ? " cap0-checklist-item--current" : "") +
        (state === "open" ? " cap1-checklist-item--open" : "") +
        (state === "locked" ? " cap0-checklist-item--locked" : "")
      }
    >
      <span className="cap1-checklist-glyph">{STATE_GLYPH[state]}</span>
      <div className="cap0-checklist-body">
        {/* Nhãn NGUYÊN VĂN mockup: ngắn, KHÔNG số khoanh tròn dẫn trước. */}
        <span className="cap0-checklist-name">{TASK_NAMES[no]}</span>
        {progressText && (
          <div className="cap0-checklist-desc">{progressText}</div>
        )}
      </div>
      {/* ★ Lối tắt của nhiệm vụ ĐÃ MỞ nhưng chưa tới lượt (⑤ mở ngay từ lúc vào
          Cấp 1, ②③④ mở cùng lúc sau ①). Dẫn từng nhiệm vụ một không được KHOÁ
          thứ user có quyền làm ngay bây giờ. */}
      {(state === "open" || state === "active") && (
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

export function JourneyPanelCap1() {
  const { isCap1Active } = useCap1Events()
  const { data: progress } = useCap1Progress(isCap1Active)
  const { trades: localTrades } = useCap1TradeLog()
  const { data: tradeHistory } = useCap1Trades(isCap1Active)
  const trades = tradeHistory?.trades.map(cap1TradeFromHistory) ?? localTrades
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap1TasksDone(progress)
  const level = LEVELS[1]

  const openPortfolioAnalysis = () => setActivePanel("cap1-analysis")
  const goToTrading = () => setActivePanel("trading")

  const soUngHo = progress?.so_lenh_ly_do_ung_ho ?? 0
  const soLenh = progress?.so_lenh_thuc_chien ?? 0
  const coverage = reasonCoverage(trades)
  const states = taskStates(progress)
  // Dải emoji lấy từ sổ lệnh cục bộ (chỉ nó biết ĐÃ DÙNG lý do NÀO), còn con
  // số lấy max với `so_ly_do_da_dung` của server — sổ cục bộ có thể trống trên
  // máy khác nên chỉ được phép báo THIẾU hơn, không được báo thấp hơn sự thật
  // (đúng quy ước `KetsoModalCap1` đang dùng cho dòng "Bạn đã dùng x/5").
  const daDungLyDo = Math.max(
    progress?.so_ly_do_da_dung ?? 0,
    Object.values(coverage).filter(Boolean).length,
  )

  /** Con số tiến độ của 3 nhiệm vụ ĐẾM (mockup). Một nguồn duy nhất cho cả ô
   *  tập trung lẫn dòng checklist — không được phép hai chỗ đếm hai kiểu. */
  const PROGRESS_TEXT: Record<number, string | undefined> = {
    3: `Đã dùng ${Math.min(daDungLyDo, TASK3_TARGET)}/${TASK3_TARGET} lý do`,
    4: `Lý do có cơ sở (✅): ${Math.min(soUngHo, TASK4_TARGET)}/${TASK4_TARGET}`,
    // Mockup dòng 84: "7/10 lệnh".
    5: `${Math.min(soLenh, TASK5_TARGET)}/${TASK5_TARGET} lệnh`,
  }

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap0-level-card">
          <Badge
            n={level.n}
            color={level.color}
            fill={level.fill}
            size={64}
            ring={tasksDone / TOTAL_TASKS}
            glow
          />
          <div className="cap0-level-card-body">

            <div className="cap0-level-card-name cap0-display">HỌC VIỆC</div>

            {/* Mockup `.lvcard .info .mode` (dòng 24) — viên pill thuộc cột
                info, dưới tên cấp, KHÔNG phải phần tử flex thứ ba cạnh huy
                hiệu. Giống hệt `cap0/JourneyPanel.tsx`; CSS
                (`.cap0-level-card-mode`) là của chung hai cấp. */}
            <div className="cap0-level-card-mode">
              <ModeBadge mode="thuc_chien" />
            </div>
          </div>
        </div>

        {/* Mockup `.ck-head` (dòng 25-27): `.t` tiêu đề xám bên trái + `.c` bộ
            đếm 14px mang MÀU CỦA CẤP bên phải — hai phần tử, không phải một
            chuỗi "… · x/5". Màu lấy từ `LEVELS[1].color` (đồng `#c97b4a`) thay
            vì hard-code trong CSS dùng chung: cùng một luật phục vụ cả Cấp 0
            (xám `#8a90a5`) lẫn Cấp 1, đúng `var(--lvl)` của từng mockup. */}
        <div className="cap0-journey-checklist-header">
          <span className="cap0-journey-checklist-title">TRƯỚC KHI LÊN CẤP 2</span>
          <span className="cap0-journey-checklist-count cap0-display" style={{ color: level.color }}>
            {tasksDone}/{TOTAL_TASKS}
          </span>
        </div>

        {/* Checklist ĐẦY ĐỦ 5 nhiệm vụ của mockup, hạ cấp: vẫn thấy cả cung
            đường + con số tiến độ, nhưng thu gọn và mờ hơn ô tập trung. */}
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

        {/* Hàng 2 công cụ (mockup). 📓 Kết sổ KHÔNG bấm được: nó tự mở khi bán
            lệnh (spec §6) và Cấp 1 không có màn lịch sử kết sổ để mở tay — làm
            nó thành nút sẽ là một nút chết. */}
        <div className="cap1-tools" data-testid="cap1-tools">
          <div className="cap1-tool cap1-tool--static">📓 Kết sổ</div>
          <button type="button" className="cap1-tool" onClick={openPortfolioAnalysis}>
            📊 Phân tích danh mục
          </button>
        </div>

      </div>
    </div>
  )
}
