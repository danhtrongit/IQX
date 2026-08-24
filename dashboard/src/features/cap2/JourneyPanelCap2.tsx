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
 * Nhiệm vụ DUY NHẤT của Cấp 2 — nhãn NGUYÊN VĂN mockup
 * `iqx-cap2-hanhtrinh.html` (`.task .nm`).
 *
 * ★ Đây là bản thay thế cho 2 nhiệm vụ trước đó, vốn thay cho 5 nhiệm vụ trước
 * nữa. Nhiệm vụ ② «Thực hiện đúng khi giá chạm mốc» ĐÃ BỎ HẲN: nó khoá việc
 * tốt nghiệp vào chuyện thị trường có chạm mốc hay không — điều user không
 * điều khiển được. Cấp 2 giờ dạy đúng một việc: ĐẶT hai mốc, mọi lệnh.
 */
const TASK_NAMES: Record<number, string> = {
  1: "10 lệnh Thực chiến có đặt cắt lỗ / chốt lời",
}

/**
 * Mô tả hiện trên ô "NHIỆM VỤ ĐANG LÀM" (`JourneyFocus`).
 *
 * Mockup không cho câu chữ cho ô này, nên câu ở đây chỉ diễn đạt lại đúng điều
 * kiện của chính nhiệm vụ đó — không hứa thêm gì sản phẩm không làm.
 */
const TASK_DESCRIPTIONS: Record<number, string> = {
  1: "Mỗi lệnh Thực chiến ở Cấp 2 đều phải kèm cắt lỗ và chốt lời — chọn 1 trong 2 cách có cơ sở ngay trong Form Kế hoạch. Đủ 10 lệnh như vậy là xong.",
}

const TASK_NOS = [1] as const
const NUMERALS = "①"

const TASK1_TARGET = 10

/**
 * 2 trạng thái. KHÔNG có `locked` và KHÔNG có `open`: Cấp 2 chỉ có MỘT nhiệm
 * vụ, nó mở ngay khi vào cấp, nên nó chỉ có thể đang làm (`active`) hoặc đã
 * xong (`done`). Không có nhiệm vụ song song nào cần lối tắt "Làm ngay →" trên
 * dòng checklist — ô tập trung ngay trên đã có nút đó.
 */
type TaskState = "done" | "active"

const STATE_GLYPH: Record<TaskState, string> = {
  done: "✅",
  active: "🎯",
}

const TASK_DONE_AT: Record<number, (p: Cap2Progress) => string | null> = {
  1: (p) => p.task_1_done_at,
}

function isDone(no: number, progress: Cap2Progress | null | undefined): boolean {
  return progress ? TASK_DONE_AT[no](progress) != null : false
}

/** Trạng thái dòng checklist duy nhất của Cấp 2. */
export function taskStatesCap2(
  progress: Cap2Progress | null | undefined,
): Record<number, TaskState> {
  return Object.fromEntries(
    TASK_NOS.map((no) => [no, isDone(no, progress) ? "done" : "active"]),
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
}: {
  no: number
  state: TaskState
  progressText?: string
}) {
  return (
    <div
      data-testid={`cap2-task-${no}`}
      className={
        // `cap1-checklist-item` là móc dùng chung của khung checklist ở các cấp
        // Thực chiến (xem `cap1.css` — dòng done KHÔNG gạch ngang).
        "cap0-checklist-item cap1-checklist-item" +
        (state === "done" ? " cap0-checklist-item--done" : "") +
        (state === "active" ? " cap0-checklist-item--current" : "")
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
    </div>
  )
}

/**
 * Câu giữa thanh hành trình (mockup `.jbar .nx`) — nguyên văn "Đặt 10 lệnh có
 * cắt lỗ / chốt lời" khi chưa xong.
 *
 * ★ KHÔNG nói "Tiếp: …": Cấp 2 chỉ có một nhiệm vụ, không có gì "tiếp" nó.
 */
function jbarNextCopy(focus: number | null) {
  if (focus == null) return "🎓 Hoàn thành Cấp 2!"
  return "Đặt 10 lệnh có cắt lỗ / chốt lời"
}

/**
 * Tab "Hành trình" Cấp 2 (mockup `iqx-cap2-hanhtrinh.html`) — thanh hành trình
 * + thẻ cấp + ô "NHIỆM VỤ ĐANG LÀM" (dùng chung `cap0/JourneyFocus.tsx`) +
 * checklist MỘT nhiệm vụ + hàng 2 công cụ + ô mục tiêu.
 *
 * ★ **KHÔNG còn khối chỉ số nào.** Bản 5 nhiệm vụ có 🔥 Chuỗi lệnh kỷ luật,
 * Điểm kỷ luật hôm nay và Cẩm nang cắt lỗ/chốt lời; mockup vẽ một panel phẳng.
 * `ChuoiWidget.tsx`/`DiemKyLuat.tsx` vẫn còn nguyên file (Cấp 3 còn dùng
 * `DiemKyLuatCard`) — chỉ là không còn được mount ở đây.
 *
 * ★ **KHÔNG có ô nào đo «thực hiện đúng khi giá chạm mốc».** Nhiệm vụ ② đã bỏ;
 * ba con số 🛑/🎯/✅ chỉ còn sống ở «Phân tích danh mục» khối ④ như số MÔ TẢ.
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
  const states = taskStatesCap2(progress)
  /** Nhiệm vụ được đưa lên ô tập trung. `null` = đã xong → ô đổi sang lời sẵn
   *  sàng tốt nghiệp. */
  const focus = TASK_NOS.find((no) => states[no] === "active") ?? null

  /** Con số tiến độ của nhiệm vụ (mockup `.task .prog` — "6/10 lệnh"). Một
   *  nguồn duy nhất cho cả ô tập trung lẫn dòng checklist. */
  const PROGRESS_TEXT: Record<number, string> = {
    1: `${Math.min(soLenhCoSlTp, TASK1_TARGET)}/${TASK1_TARGET} lệnh`,
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
          <span className="cap2-jbar-next">{jbarNextCopy(focus)}</span>
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
            tag="ĐÃ XONG NHIỆM VỤ CẤP 2"
            name="Sẵn sàng tốt nghiệp Cấp 2"
            desc="Bạn đã đặt cắt lỗ / chốt lời cho 10 lệnh Thực chiến — mọi lệnh bạn vào đều có sẵn hai mốc do chính bạn định. Màn tốt nghiệp Cấp 2 «Kỷ luật» mở ra ngay tại đây."
          />
        ) : (
          <JourneyFocus
            testId="cap2-focus"
            tag="NHIỆM VỤ ĐANG LÀM"
            numeral={NUMERALS[focus - 1]}
            name={TASK_NAMES[focus]}
            desc={TASK_DESCRIPTIONS[focus]}
            progressText={PROGRESS_TEXT[focus]}
            onGo={goToTrading}
          />
        )}

        {/* Mockup `.ck-head`: tiêu đề xám bên trái + bộ đếm mang MÀU CỦA CẤP bên
            phải — hai phần tử, không phải một chuỗi "… · x/1". */}
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
            nghiệp unmount xong là về đúng màn này, checklist 1/1, và ô này là
            câu cuối cùng họ đọc. Khi trần cấp còn dưới 3 nó KHÔNG được hứa một
            cấp chưa tồn tại; khi trần được nâng, câu của mockup tự quay về.
            (Cùng luật `cap1/JourneyPanelCap1.tsx` đang giữ cho ô mục tiêu của
            nó — xem docstring trần ở `cap1/capFlags.ts`.) */}
        <div className="cap0-journey-goal" data-testid="cap2-journey-goal">
          {CAP_MAX_ENABLED >= 3 ? (
            <>
              Xong 1/1 → tốt nghiệp <strong>Cấp 2</strong>, lên{" "}
              <strong>Cấp 3 «Bản lĩnh»</strong> (quản lý vốn: khẩu vị · tự tin · khối
              lượng).
            </>
          ) : (
            <>
              Xong 1/1 → tốt nghiệp <strong>Cấp 2 «Kỷ luật»</strong> — chặng cuối của
              chương trình hiện tại. <strong>Cấp 3 «Bản lĩnh» chưa ra mắt</strong>; khi
              mở, nó sẽ dạy quản lý vốn: khẩu vị · tự tin · khối lượng.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
