import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { JourneyFocus } from "@/features/cap0/JourneyFocus"
// Trần cấp — file riêng, KHÔNG import gì (xem docstring ở đó).
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"
import { useCap4Events } from "./Cap4Context"
import { LOP_DEFS } from "./doc5Lop"
import { useCap4Progress } from "./hooks"
import {
  CAP4_SO_LENH_TARGET,
  CAP4_TOTAL_TASKS,
  countCap4TasksDone,
  type Cap4Progress,
} from "./types"
import "./cap4-journey.css"

/**
 * Cấp 5 đã mở chưa — quyết định câu cuối của ô mục tiêu.
 *
 * ★ HÀM chứ không phải `const` module-scope: trần phải được đọc lúc RENDER.
 * Một `const` chốt giá trị ngay lúc import và test (mock `capFlags` bằng
 * getter để thử cả hai phía của trần) sẽ chỉ thấy giá trị đầu tiên → một nửa
 * số test xanh giả. Cùng lý do `cap3/GraduationModalCap3.tsx#isCap4Open` ghi.
 */
function isCap5Open(): boolean {
  return CAP_MAX_ENABLED >= 5
}

/**
 * Nhiệm vụ DUY NHẤT của Cấp 4 — tên VERBATIM theo mockup
 * `iqx-cap4-hanhtrinh.html` (`.task .nm`).
 */
const TASK_NAME = "Đọc và chấm đủ 5 lớp qua 20 lệnh"

/** Mockup `.task .ds` — một dòng, VERBATIM. */
const TASK_DESC = "Mỗi lệnh tự đọc và chấm cả 5 lớp thay vì chỉ chọn 1 lý do."

/** Bài học một câu — VERBATIM spec §1. */
const BAI_HOC = '"Đọc trọn bức tranh, không chỉ một lý do — và biết mình đọc giỏi ở đâu."'

type TaskState = "done" | "active"

/**
 * State của nhiệm vụ duy nhất. Không còn luật mở khoá nào: nó mở ngay khi vào
 * Cấp 4 và chỉ có hai trạng thái.
 */
export function taskStateCap4(
  no: number,
  progress: Cap4Progress | null | undefined,
): TaskState {
  if (no !== 1) return "active"
  return progress?.task_1_done_at ? "done" : "active"
}

/**
 * Dòng checklist THU GỌN (mirrors `cap1`/`cap2`/`cap3`) — mô tả dài + nút to
 * đã dọn lên ô tập trung `JourneyFocus`, dòng ở đây chỉ giữ tên + tiến độ.
 * Cấp 4 chỉ còn MỘT nhiệm vụ nên nó luôn là nhiệm vụ đang được tập trung ⇒
 * không bao giờ có lối tắt "Làm ngay →" nhân bản ở đây.
 */
function ChecklistItem({
  state,
  progressText,
}: {
  state: TaskState
  progressText?: string
}) {
  return (
    <div
      data-testid="cap4-task-1"
      className={
        "cap0-checklist-item cap1-checklist-item" +
        (state === "done" ? " cap0-checklist-item--done" : " cap0-checklist-item--active")
      }
    >
      <span className="cap0-checklist-num">{state === "done" ? "✓" : "①"}</span>
      <div className="cap0-checklist-body">
        <span className="cap0-checklist-name">{TASK_NAME}</span>
        {progressText && <div className="cap0-checklist-desc">{progressText}</div>}
      </div>
    </div>
  )
}

/**
 * Tab "Hành trình" Cấp 4 — panel đầu của sidebar-phải khi đang ở Cấp 4
 * (mockup `iqx-cap4-hanhtrinh.html`).
 *
 * ★ **MỘT nhiệm vụ.** Mockup mới: `.ck-head` "Trước khi lên Cấp 5 · 0/1", đúng
 * một `.task.active` («Đọc và chấm đủ 5 lớp qua 20 lệnh», `14/20 lệnh`), dải 5
 * icon độ phủ, rồi `.tools` + `.goal`. Khối `.challenge` (Thách thức Thuần
 * thục — 3 điều kiện + thanh tiến độ) và hộp "Vũ khí & điểm mù" KHÔNG còn ở
 * đây: khối ⑨ vũ khí/điểm mù vẫn sống nguyên vẹn trong **Phân tích danh mục**
 * (`Cap4PortfolioAnalysis`), chỗ mockup đặt nó.
 *
 * ★ Dùng chung `cap0/JourneyFocus.tsx` như Cấp 0/1/2/3 — một khối, một bộ CSS.
 *
 * Self-contained: gọi `useCap4Progress` với `isCap4Active` nên KHÔNG query gì
 * khi ở ngoài `Cap4Provider` (`SidebarProvider` là singleton app-root, dùng
 * chung với /bieu-do & /co-phieu — cùng lý do đã ghi ở `JourneyPanelCap3`).
 */
export function JourneyPanelCap4() {
  const { isCap4Active } = useCap4Events()
  const { data: progress } = useCap4Progress(isCap4Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap4TasksDone(progress)
  const level = LEVELS[4]

  const openPortfolioAnalysis = () => setActivePanel("cap4-analysis")
  const goToTrading = () => setActivePanel("trading")

  const graduated = progress?.graduated_at != null
  const state = taskStateCap4(1, progress)

  /**
   * Mockup `.prog` "14/20 lệnh". Một nguồn duy nhất cho cả ô tập trung lẫn
   * dòng checklist — hai chỗ không được phép đếm hai kiểu. `undefined` khi
   * chưa tải xong progress: "chưa biết" thì im lặng, KHÔNG in "0/20".
   */
  const soLenhText = progress
    ? `${Math.min(progress.so_lenh_doc_du_5lop, CAP4_SO_LENH_TARGET).toLocaleString(
        "en-US",
      )}/${CAP4_SO_LENH_TARGET.toLocaleString("en-US")} lệnh`
    : undefined

  /**
   * Dải 5 icon độ phủ (mockup `.coverage`, class `.off` cho lớp chưa phủ).
   *
   * ★ Nguồn dữ liệu THẬT, không phải trang trí: một lệnh chỉ được đếm vào
   * `so_lenh_doc_du_5lop` khi user chấm ĐỦ CẢ 5 lớp, nên "đã từng chấm lớp
   * này" đúng bằng "đã có ≥1 lệnh đọc đủ". Vì thế 5 icon bật/tắt cùng nhau —
   * mờ hết khi chưa lệnh nào đọc đủ, sáng hết từ lệnh đầu tiên. Đó chính là
   * điều khác biệt Cấp 4 dạy (đọc TRỌN bức tranh, không nhặt vài lớp), và nó
   * không bịa ra một độ phủ từng-lớp mà dữ liệu không hề có.
   */
  const daPhu = (progress?.so_lenh_doc_du_5lop ?? 0) >= 1
  const coverageStrip = (
    <div className="cap4-coverage" data-testid="cap4-coverage">
      {LOP_DEFS.map((def) => (
        <span
          key={def.lop}
          data-testid={`cap4-coverage-${def.lop}`}
          className={daPhu ? "" : "cap4-coverage-off"}
          title={def.label}
        >
          {def.icon}
        </span>
      ))}
    </div>
  )

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap0-level-card">
          <Badge
            n={level.n}
            color={level.color}
            fill={level.fill}
            size={64}
            ring={tasksDone / CAP4_TOTAL_TASKS}
            glow
          />
          <div className="cap0-level-card-body">
            <div className="cap0-level-card-tag">CẤP 4</div>
            <div className="cap0-level-card-name cap0-display">THUẦN THỤC</div>
            <div className="cap0-level-card-lesson">{BAI_HOC}</div>
            <div className="cap0-level-card-mode">
              {/* Mockup `.lvcard .info .mode`: "● Đọc trọn 5 lớp mỗi lệnh". */}
              <ModeBadge mode="thuc_chien" />
            </div>
          </div>
        </div>

        {/* ★ Ô "NHIỆM VỤ ĐANG LÀM" — dùng chung với Cấp 0/1/2/3. */}
        {graduated ? (
          <JourneyFocus
            testId="cap4-focus"
            ready
            tag="HOÀN THÀNH"
            name="Đã tốt nghiệp Cấp 4 «Thuần thục»"
            desc={
              isCap5Open()
                ? "Bạn đã đọc và tự chấm đủ 5 lớp qua 20 lệnh — đọc trọn bức tranh đã thành thói quen. Cấp 5 «Lão luyện» đang chờ bạn."
                : "Bạn đã đọc và tự chấm đủ 5 lớp qua 20 lệnh — đọc trọn bức tranh đã thành thói quen. Đây là chặng cuối của chương trình hiện tại; tài khoản vẫn giữ nguyên để bạn tiếp tục giao dịch."
            }
          />
        ) : state === "done" ? (
          <JourneyFocus
            testId="cap4-focus"
            ready
            tag={`ĐÃ XONG ${CAP4_TOTAL_TASKS}/${CAP4_TOTAL_TASKS} NHIỆM VỤ`}
            name="Sẵn sàng tốt nghiệp Cấp 4"
            desc="Bạn đã đọc và tự chấm đủ 5 lớp qua 20 lệnh. Màn tốt nghiệp Cấp 4 «Thuần thục» mở ra ngay tại đây."
          />
        ) : (
          <JourneyFocus
            testId="cap4-focus"
            tag="NHIỆM VỤ ĐANG LÀM"
            numeral="①"
            name={TASK_NAME}
            desc={TASK_DESC}
            extra={coverageStrip}
            progressText={soLenhText}
            onGo={goToTrading}
          />
        )}

        {/* Mockup `.ck-head`: tiêu đề xám bên trái + bộ đếm mang MÀU CỦA CẤP
            bên phải — hai phần tử, không phải một chuỗi "… · x/1". */}
        <div className="cap0-journey-checklist-header mt-3">
          <span className="cap0-journey-checklist-title">TRƯỚC KHI LÊN CẤP 5</span>
          <span
            className="cap0-journey-checklist-count cap0-display"
            style={{ color: level.color }}
          >
            {tasksDone}/{CAP4_TOTAL_TASKS}
          </span>
        </div>

        <div className="cap0-journey-rest">
          <ChecklistItem state={state} progressText={soLenhText} />
        </div>

        {/* §C12c — con số `n/20` đến từ đâu, và vì sao một lệnh có thể KHÔNG
            được tính. Đây là chỗ duy nhất nói luật đếm bằng lời. */}
        <div className="cap4-explain" data-testid="cap4-journey-explain">
          <b>Lệnh nào được tính?</b> Một lệnh MUA chỉ vào bộ đếm khi bạn đã tự chấm{" "}
          <b>đủ cả 5 lớp</b> trước lúc đặt — chấm thiếu một lớp thì lệnh đó không tính.
          Không cần lệnh phải đóng, cũng không cần lệnh phải thắng: đây là thói quen{" "}
          <b>đọc</b>, không phải điểm đúng/sai.
        </div>

        {/* Mockup `.tools` — hai ô. "Kết sổ" là ô TĨNH (màn Kết sổ tự mở khi
            bán xong, không phải một panel bấm vào được), đúng như Cấp 1. */}
        <div className="cap4-tools" data-testid="cap4-tools">
          <div className="cap4-tool cap4-tool--static">📓 Kết sổ</div>
          <button type="button" className="cap4-tool" onClick={openPortfolioAnalysis}>
            📊 Phân tích danh mục
          </button>
        </div>

        {/* ★★ TRẠNG THÁI CUỐI của một người đã tốt nghiệp Cấp 4 ★★ — modal tốt
            nghiệp unmount xong là về đúng màn này, và ô này là câu cuối cùng họ
            đọc. Khi trần cấp còn dưới 5 nó KHÔNG được hứa một cấp chưa tồn tại;
            khi trần được nâng, câu của mockup tự quay về.

            ★ Cấp 5 «Lão luyện» = CHỦ ĐỘNG SĂN MÃ (bộ lọc → watchlist → chờ mã
            chín). Bản cũ ở đây hứa "tách quyết định khỏi kết quả — và đứng
            ngoài cũng là một quyết định", tức bản Cấp 5 CŨ đã bị thay; nội dung
            đó nay thuộc Cấp 6. Chính mockup Hành trình Cấp 4 viết "(chủ động
            săn mã)". */}
        <div className="cap0-journey-goal" data-testid="cap4-journey-goal">
          {graduated ? (
            isCap5Open() ? (
              <>
                Bạn đã tốt nghiệp <strong>Cấp 4 «Thuần thục»</strong>. Chặng tiếp theo:{" "}
                <strong>Cấp 5 «Lão luyện»</strong> (chủ động săn mã).
              </>
            ) : (
              <>
                Bạn đã tốt nghiệp <strong>Cấp 4 «Thuần thục»</strong> — chặng cuối của
                chương trình hiện tại. <strong>Cấp 5 «Lão luyện» chưa ra mắt</strong>; khi
                mở, nó sẽ dạy chủ động săn mã.
              </>
            )
          ) : isCap5Open() ? (
            <>
              Xong → tốt nghiệp <strong>Cấp 4</strong>, lên{" "}
              <strong>Cấp 5 «Lão luyện»</strong> (chủ động săn mã).
            </>
          ) : (
            <>
              Xong → tốt nghiệp <strong>Cấp 4 «Thuần thục»</strong> — chặng cuối của
              chương trình hiện tại. <strong>Cấp 5 «Lão luyện» chưa ra mắt</strong>; khi
              mở, nó sẽ dạy chủ động săn mã.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
