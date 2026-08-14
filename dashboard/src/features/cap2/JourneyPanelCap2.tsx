import "@/features/cap0/cap0.css"
import "./cap2-journey.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { JourneyFocus } from "@/features/cap0/JourneyFocus"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"
import { useCap2Events } from "./Cap2Context"
import { useCap2Progress } from "./hooks"
import { CAP2_TOTAL_TASKS, countCap2TasksDone, type Cap2Progress } from "./types"

/**
 * 2 nhiệm vụ Cấp 2 — nhãn NGUYÊN VĂN mockup `iqx-cap2-hanhtrinh.html`.
 *
 * ★ Đây là bản thay thế cho 5 nhiệm vụ cũ (chuỗi lệnh kỷ luật · cắt lỗ đúng
 * phiên 5 lần · không nhồi lệnh · chốt lời đúng 3 lần · cửa sổ 20 lệnh). Mô hình
 * mới đo đúng hai việc, và chúng chạy SONG SONG — ② có thể xong trước ①.
 */
const TASK_NAMES: Record<number, string> = {
  1: "10 lệnh Thực chiến có đặt cắt lỗ / chốt lời",
  2: "Thực hiện đúng khi giá chạm mốc",
}

/**
 * Mô tả hiện trên ô "NHIỆM VỤ ĐANG LÀM" (`JourneyFocus`).
 *
 * ② là copy NGUYÊN VĂN mockup (`.task .ds`). ① mockup không cho câu chữ, nên
 * câu ở đây chỉ diễn đạt lại đúng điều kiện của chính nhiệm vụ đó — không hứa
 * thêm gì sản phẩm không làm.
 */
const TASK_DESCRIPTIONS: Record<number, string> = {
  1: "Mỗi lệnh Thực chiến ở Cấp 2 đều phải kèm cắt lỗ và chốt lời — chọn 1 trong 2 cách có cơ sở ngay trong Form Kế hoạch. Đủ 10 lệnh như vậy là xong.",
  2: "Giá chạm cắt lỗ thì cắt, chạm chốt lời thì bán theo kế hoạch — 2 lần (cắt lỗ hoặc chốt lời đều tính). Làm song song với nhiệm vụ trên, không cần xong 10 lệnh trước.",
}

const TASK_NOS = [1, 2] as const
const NUMERALS = "①②"

const TASK1_TARGET = 10
const TASK2_TARGET = 2

/**
 * 3 trạng thái. KHÔNG có `locked`: hai nhiệm vụ Cấp 2 mở CÙNG LÚC ngay khi vào
 * cấp và không cái nào chặn cái nào (mockup vẽ cả hai ở `.task active`).
 * `active` = nhiệm vụ đang nằm trên ô tập trung; `open` = nhiệm vụ còn lại,
 * vẫn làm được ngay (có lối tắt "Làm ngay →"), chỉ khác cách vẽ.
 */
type TaskState = "done" | "active" | "open"

const STATE_GLYPH: Record<TaskState, string> = {
  done: "✅",
  active: "🎯",
  open: "🔲",
}

const TASK_DONE_AT: Record<number, (p: Cap2Progress) => string | null> = {
  1: (p) => p.task_1_done_at,
  2: (p) => p.task_2_done_at,
}

function isDone(no: number, progress: Cap2Progress | null | undefined): boolean {
  return progress ? TASK_DONE_AT[no](progress) != null : false
}

/**
 * Trạng thái của cả hai dòng checklist. Đúng MỘT nhiệm vụ là `active`: nhiệm vụ
 * CHƯA XONG có số nhỏ nhất — vẫn là cách dẫn "từng nhiệm vụ một" dùng chung với
 * Cấp 0/1, nhưng ở đây nó chỉ là thứ tự ƯU TIÊN chứ không phải điều kiện mở:
 * nhiệm vụ còn lại vẫn `open` và vẫn làm được ngay.
 */
export function taskStatesCap2(
  progress: Cap2Progress | null | undefined,
): Record<number, TaskState> {
  const focus = TASK_NOS.find((no) => !isDone(no, progress))
  return Object.fromEntries(
    TASK_NOS.map((no) => [
      no,
      isDone(no, progress) ? "done" : no === focus ? "active" : "open",
    ]),
  ) as Record<number, TaskState>
}

/**
 * Một dòng checklist THU GỌN (mirrors `cap1/JourneyPanelCap1.tsx#ChecklistItem`)
 * — mô tả + nút to đã dọn lên ô tập trung; dòng ở đây giữ tên và con số tiến độ,
 * trừ chính dòng đang được tập trung, vốn đã có con số đó ngay trên đầu.
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
      data-testid={`cap2-task-${no}`}
      className={
        // `cap1-checklist-item` là móc dùng chung của khung checklist ở các cấp
        // Thực chiến (xem `cap1.css` — dòng done KHÔNG gạch ngang).
        "cap0-checklist-item cap1-checklist-item" +
        (state === "done" ? " cap0-checklist-item--done" : "") +
        (state === "active" ? " cap0-checklist-item--current" : "") +
        (state === "open" ? " cap1-checklist-item--open" : "")
      }
    >
      <span className="cap1-checklist-glyph">{STATE_GLYPH[state]}</span>
      <div className="cap0-checklist-body">
        {/* Nhãn NGUYÊN VĂN mockup: KHÔNG số khoanh tròn dẫn trước. */}
        <span className="cap0-checklist-name">{TASK_NAMES[no]}</span>
        {state !== "active" && progressText && (
          <div className="cap0-checklist-desc">{progressText}</div>
        )}
      </div>
      {/* ★ Lối tắt của nhiệm vụ SONG SONG chưa tới lượt tập trung. Hai nhiệm vụ
          Cấp 2 không cái nào khoá cái nào, nên dòng còn lại phải bấm được. */}
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
 * Câu giữa thanh hành trình (mockup `.jbar .nx`).
 *
 * ★ Ở 0/2 nó KHÔNG được nói "Tiếp: …" như Cấp 0/1: hai nhiệm vụ chạy song song
 * nên không có cái nào "tiếp" cái nào — câu của mockup nói thẳng điều đó.
 */
function jbarNextCopy(tasksDone: number, focus: number | null) {
  if (focus == null) return "🎓 Hoàn thành Cấp 2!"
  if (tasksDone === 0) return "Hai nhiệm vụ làm song song — chưa xong cái nào"
  return (
    <>
      Còn lại: <b>{TASK_NAMES[focus]}</b>
    </>
  )
}

/**
 * Tab "Hành trình" Cấp 2 (mockup `iqx-cap2-hanhtrinh.html`) — thanh hành trình
 * + thẻ cấp + ô "NHIỆM VỤ ĐANG LÀM" (dùng chung `cap0/JourneyFocus.tsx`) +
 * checklist 2 nhiệm vụ PHẲNG + hàng 2 công cụ + ô mục tiêu.
 *
 * ★ **KHÔNG còn khối chỉ số nào.** Bản trước có 🔥 Chuỗi lệnh kỷ luật, Điểm kỷ
 * luật hôm nay và Cẩm nang cắt lỗ/chốt lời; mô hình 2 nhiệm vụ bỏ cả chuỗi lẫn
 * điểm kỷ luật, và mockup mới vẽ một panel phẳng. `ChuoiWidget.tsx`/
 * `DiemKyLuat.tsx` vẫn còn nguyên file (Cấp 3 còn dùng `DiemKyLuatCard`) — chỉ
 * là không còn được mount ở đây.
 *
 * Self-contained: calls `useCap2Progress` itself — the consumer
 * (`Cap2TradingPage`/`RightSidebar`) just mounts `<JourneyPanelCap2 />`.
 * `useCap2Progress(isCap2Active)` only queries inside a real `Cap2Provider`
 * (mirrors `JourneyPanelCap1`'s own doc on why this guard matters — the
 * sidebar's `SidebarProvider` is an app-root singleton shared with /bieu-do &
 * /co-phieu).
 */
export function JourneyPanelCap2() {
  const { isCap2Active } = useCap2Events()
  const { data: progress } = useCap2Progress(isCap2Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap2TasksDone(progress)
  const level = LEVELS[2]

  const openPortfolioAnalysis = () => setActivePanel("cap2-analysis")
  const goToTrading = () => setActivePanel("trading")

  const soLenhCoSlTp = progress?.so_lenh_co_cl_tp ?? 0
  const soLanDung = progress?.so_lan_thuc_hien_dung ?? 0
  const states = taskStatesCap2(progress)
  /** Nhiệm vụ được đưa lên ô tập trung. `null` = xong cả 2 → ô đổi sang lời sẵn
   *  sàng tốt nghiệp. Không có luật mở khoá nào ở đây — xem `taskStatesCap2`. */
  const focus = TASK_NOS.find((no) => states[no] === "active") ?? null

  /** Con số tiến độ của cả hai nhiệm vụ (mockup `.task .prog`). Một nguồn duy
   *  nhất cho cả ô tập trung lẫn dòng checklist. */
  const PROGRESS_TEXT: Record<number, string> = {
    1: `${Math.min(soLenhCoSlTp, TASK1_TARGET)}/${TASK1_TARGET} lệnh`,
    2: `${Math.min(soLanDung, TASK2_TARGET)}/${TASK2_TARGET} lần`,
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
          <span className="cap2-jbar-next">{jbarNextCopy(tasksDone, focus)}</span>
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
            <div className="cap0-level-card-tag">CẤP 2</div>
            <div className="cap0-level-card-name cap0-display">KỶ LUẬT</div>
            <div className="cap0-level-card-lesson">
              "Kế hoạch chỉ có giá trị khi được thực hiện."
            </div>
            <div className="cap0-level-card-mode">
              <ModeBadge mode="thuc_chien" />
            </div>
          </div>
        </div>

        {/* Ô "NHIỆM VỤ ĐANG LÀM" — dùng chung `cap0/JourneyFocus.tsx` với Cấp
            0/1 (một khối, một bộ CSS: các cấp không thể lệch nhau). */}
        {focus == null ? (
          <JourneyFocus
            testId="cap2-focus"
            ready
            tag={`ĐÃ XONG CẢ ${CAP2_TOTAL_TASKS} NHIỆM VỤ`}
            name="Sẵn sàng tốt nghiệp Cấp 2"
            desc="Bạn đã đặt cắt lỗ / chốt lời cho 10 lệnh Thực chiến, và 2 lần giá chạm mốc bạn đã thực hiện đúng kế hoạch của chính mình. Màn tốt nghiệp Cấp 2 «Kỷ luật» mở ra ngay tại đây."
          />
        ) : (
          <JourneyFocus
            testId="cap2-focus"
            tag="NHIỆM VỤ ĐANG LÀM"
            numeral={NUMERALS[focus - 1]}
            name={TASK_NAMES[focus]}
            desc={TASK_DESCRIPTIONS[focus]}
            progressText={PROGRESS_TEXT[focus]}
            /* Cả hai nhiệm vụ đều làm ở tab Đặt lệnh. */
            onGo={goToTrading}
          />
        )}

        {/* Mockup `.ck-head`: tiêu đề xám bên trái + bộ đếm mang MÀU CỦA CẤP bên
            phải — hai phần tử, không phải một chuỗi "… · x/2". */}
        <div className="cap0-journey-checklist-header">
          <span className="cap0-journey-checklist-title">TRƯỚC KHI LÊN CẤP 3</span>
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

        {/* ★★ TRẠNG THÁI CUỐI của một người đã tốt nghiệp Cấp 2 ★★ — modal tốt
            nghiệp unmount xong là về đúng màn này, checklist 2/2, và ô này là
            câu cuối cùng họ đọc. Khi trần cấp còn dưới 3 nó KHÔNG được hứa một
            cấp chưa tồn tại; khi trần được nâng, câu của mockup tự quay về.
            (Cùng luật `cap1/JourneyPanelCap1.tsx` đang giữ cho ô mục tiêu của
            nó — xem docstring trần ở `cap1/capFlags.ts`.) */}
        <div className="cap0-journey-goal" data-testid="cap2-journey-goal">
          {CAP_MAX_ENABLED >= 3 ? (
            <>
              Xong 2/2 → tốt nghiệp <strong>Cấp 2</strong>, lên{" "}
              <strong>Cấp 3 «Bản lĩnh»</strong> (quản lý vốn: khẩu vị · tự tin · khối
              lượng).
            </>
          ) : (
            <>
              Xong 2/2 → tốt nghiệp <strong>Cấp 2 «Kỷ luật»</strong> — chặng cuối của
              chương trình hiện tại. <strong>Cấp 3 «Bản lĩnh» chưa ra mắt</strong>; khi
              mở, nó sẽ dạy quản lý vốn: khẩu vị · tự tin · khối lượng.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
