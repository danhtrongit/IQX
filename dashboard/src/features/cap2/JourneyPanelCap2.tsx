import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { useCap2Events } from "./Cap2Context"
import { useCap2Progress } from "./hooks"
import { ChuoiWidget } from "./ChuoiWidget"
import { DiemKyLuatCard } from "./DiemKyLuat"
import { countCap2TasksDone, type Cap2Progress } from "./types"
import "./cap2-discipline.css"

/** The 5 Cấp 2 nhiệm vụ — names verbatim spec §2 headers. */
const TASK_NAMES: Record<number, string> = {
  1: "Chuỗi lệnh kỷ luật đầu tiên — 5 lệnh liên tiếp không vi phạm",
  2: "Cắt lỗ đúng phiên — 5 lần",
  3: "Không nhồi lệnh khi lỗ — 0 lần trong 15 lệnh",
  4: "Chốt lời đúng — 3 lần chạm chốt lời không hụt",
  5: "Cửa sổ 20 lệnh — Vi phạm ≤2",
}

const CHUOI_TARGET = 5

type TaskState = "done" | "active" | "locked"

const TASK_DONE_AT: Record<number, (p: Cap2Progress) => string | null> = {
  1: (p) => p.task_1_done_at,
  2: (p) => p.task_2_done_at,
  3: (p) => p.task_3_done_at,
  4: (p) => p.task_4_done_at,
  5: (p) => p.task_5_done_at,
}

/**
 * State of one checklist task (spec §2 "Điều kiện mở"). ① opens the instant
 * the user enters Cấp 2; ②③④ open once ① (chuỗi 5) is done. ⑤'s real unlock
 * condition is "≥20 lệnh Thực chiến since entering Cấp 2" — this panel has no
 * client-side counter for that (Cấp 2's progress row carries no aggregate
 * lệnh count, unlike Cấp 1's), so it is approximated the same as ②③④
 * (reasonable, not exact — mirrors `cap1/JourneyPanelCap1.tsx`'s own
 * documented approximation for its task ⑥).
 */
function taskState(no: number, progress: Cap2Progress | null | undefined): TaskState {
  const doneAt = progress ? TASK_DONE_AT[no](progress) : null
  if (doneAt) return "done"
  if (no === 1) return "active"
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
      data-testid={`cap2-task-${no}`}
      className={
        "cap0-checklist-item" +
        (state === "done" ? " cap0-checklist-item--done" : "") +
        (state === "active" ? " cap0-checklist-item--active" : "") +
        (state === "locked" ? " cap0-checklist-item--locked" : "")
      }
    >
      <span className="cap0-checklist-num">{state === "done" ? "✓" : "①②③④⑤"[no - 1]}</span>
      <div className="cap0-checklist-body">
        <span className="cap0-checklist-name">{TASK_NAMES[no]}</span>
        {progressText && <div className="cap0-checklist-desc">{progressText}</div>}
        {state === "active" && (
          <button type="button" className="cap0-checklist-golink" onClick={onGo}>
            Làm ngay →
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Cẩm nang cắt lỗ / chốt lời (spec §5.5) — a short, always-visible static
 * explainer of the 2 cách (NOT an interactive expand/collapse — the task
 * brief asks for a static block). Definition + formula + "hợp với" for each,
 * one level shorter than the full tooltip text `SlTpBlock` shows at order
 * time (this is the "chủ động vào khi muốn" reference copy, not the order
 * form itself).
 */
function CamNangSlTp() {
  return (
    <div className="cap2-camnang" data-testid="cap2-camnang">
      <div className="cap0-journey-checklist-header">📖 CẨM NANG CẮT LỖ / CHỐT LỜI — 2 CÁCH ĐẶT</div>
      <div className="cap2-camnang-item">
        <div className="cap2-camnang-title">📈 Cách 1 — Theo Hỗ trợ / Kháng cự</div>
        <p className="cap2-camnang-body">
          Cắt lỗ = dưới mốc hỗ trợ gần nhất 1% · Chốt lời = dưới mốc kháng cự gần nhất 1% (mốc lấy
          từ phân tích L1). Hợp với người quen đọc chart, tin vào mốc kỹ thuật.
        </p>
      </div>
      <div className="cap2-camnang-item">
        <div className="cap2-camnang-title">📊 Cách 2 — Theo Biên độ dao động</div>
        <p className="cap2-camnang-body">
          Cắt lỗ = giá vào − 2× biên độ dao động (ATR) · Chốt lời = giá vào + 4× biên độ. Hợp với
          người muốn cách tự động, không cần đọc chart.
        </p>
      </div>
    </div>
  )
}

/**
 * Tab "Hành trình" Cấp 2 (spec §4) — first sidebar-right panel while in Cấp
 * 2. Mirrors `cap1/JourneyPanelCap1.tsx`'s structure (level card + checklist
 * header + task list + goal box), PLUS the 3 new blocks spec §4 adds
 * (Chuỗi lệnh kỷ luật, Điểm kỷ luật hôm nay, Cẩm nang cắt lỗ/chốt lời).
 * WITHOUT a Tủ huân chương (no cấp has one, spec §11).
 *
 * Self-contained: calls `useCap2Progress` itself — the consumer
 * (`Cap2TradingPage`/`RightSidebar`) just mounts `<JourneyPanelCap2 />`.
 * `useCap2Progress(isCap2Active)` only queries inside a real `Cap2Provider`
 * (mirrors `JourneyPanelCap1`'s own doc on why this guard matters — the
 * sidebar's `SidebarProvider` is an app-root singleton shared with /bieu-do &
 * /co-phieu). `<DiemKyLuatCard />` fetches its own điểm kỷ luật data.
 */
export function JourneyPanelCap2() {
  const { isCap2Active } = useCap2Events()
  const { data: progress } = useCap2Progress(isCap2Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap2TasksDone(progress)
  const level = LEVELS[2]

  const openPortfolioAnalysis = () => setActivePanel("cap2-analysis")
  const goToTrading = () => setActivePanel("trading")

  const chuoiCurrent = progress?.chuoi_current ?? 0
  const task1Done = progress?.task_1_done_at != null

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap0-level-card">
          <Badge n={level.n} color={level.color} fill={level.fill} size={64} ring={tasksDone / 5} glow />
          <div className="cap0-level-card-body">
            <div className="cap0-level-card-tag">CẤP 2</div>
            <div className="cap0-level-card-name cap0-display">KỶ LUẬT</div>
            <div className="cap0-level-card-lesson">
              "Kế hoạch chỉ có giá trị khi được thực hiện."
            </div>
          </div>
          <ModeBadge mode="thuc_chien" />
        </div>

        <ChuoiWidget />

        <div className="mt-3">
          <DiemKyLuatCard />
        </div>

        <div className="cap0-journey-checklist-header mt-3">
          TRƯỚC KHI LÊN CẤP 3 · {tasksDone}/5
        </div>

        <ChecklistItem
          no={1}
          state={taskState(1, progress)}
          progressText={
            task1Done
              ? undefined
              : `Còn ${Math.max(0, CHUOI_TARGET - chuoiCurrent)} lệnh nữa đạt chuỗi 5 lệnh kỷ luật`
          }
          onGo={goToTrading}
        />
        <ChecklistItem no={2} state={taskState(2, progress)} onGo={goToTrading} />
        <ChecklistItem no={3} state={taskState(3, progress)} onGo={goToTrading} />
        <ChecklistItem no={4} state={taskState(4, progress)} onGo={goToTrading} />
        <ChecklistItem no={5} state={taskState(5, progress)} onGo={goToTrading} />

        <div className="mt-3">
          <CamNangSlTp />
        </div>

        <button type="button" className="cap0-checklist-golink mt-2" onClick={openPortfolioAnalysis}>
          Xem Phân tích danh mục →
        </button>

        <div className="cap0-journey-goal">
          Xong 5/5 nhiệm vụ + cửa sổ 20 lệnh có ≤2 vi phạm → tốt nghiệp Cấp 2, lên{" "}
          <strong>Cấp 3 «Bản lĩnh»</strong> (viên lục giác xanh brand).
        </div>
      </div>
    </div>
  )
}
