import "@/features/cap0/cap0.css"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { JourneyFocus } from "@/features/cap0/JourneyFocus"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { useCap3Events } from "./Cap3Context"
import { useCap3Progress } from "./hooks"
import { KHAU_VI_PCT } from "./khoiLuong"
import { countCap3TasksDone, type Cap3Progress, type KhauViLoai, type MucTuTin } from "./types"
import "./cap3-journey.css"

const TASK_NAMES = {
  1: "10 lệnh có chấm mức tự tin và đặt khối lượng theo khẩu vị",
  2: "Đặt lệnh ở cả 3 mức tự tin",
} as const

const TASK_DESCRIPTIONS = {
  1: "Đặt 10 lệnh Thực chiến có khẩu vị, mức tự tin và cách khối lượng đã lưu.",
  2: "Trải nghiệm đặt lệnh ở mức tự tin thấp, vừa và cao để khối lượng đi theo tự tin.",
} as const

const KHAU_VI_LABEL: Record<KhauViLoai, string> = {
  than_trong: "Thận trọng",
  can_bang: "Cân bằng",
  tan_cong: "Tấn công",
}

const CONFIDENCE_LEVELS: readonly [MucTuTin, string][] = [
  [1, "⭐ Thấp"],
  [2, "⭐⭐ Vừa"],
  [3, "⭐⭐⭐ Cao"],
]

type TaskState = "done" | "active"

export function taskStateCap3(
  taskNo: 1 | 2,
  progress: Cap3Progress | null | undefined,
): TaskState {
  const doneAt = taskNo === 1 ? progress?.task_1_done_at : progress?.task_2_done_at
  return doneAt ? "done" : "active"
}

interface ChecklistItemProps {
  taskNo: 1 | 2
  state: TaskState
  progress: Cap3Progress | null | undefined
  onGo: () => void
}

function ChecklistItem({ taskNo, state, progress, onGo }: ChecklistItemProps) {
  const isSizingTask = taskNo === 1
  const counter = isSizingTask
    ? `${progress?.so_lenh_quan_ly_von ?? 0}/10 lệnh`
    : `${progress?.so_muc_tu_tin_da_dung ?? 0}/3 mức`

  return (
    <div
      className={`cap0-checklist-item cap0-checklist-item--${state}`}
      data-testid={`cap3-task-${taskNo}`}
    >
      <span className="cap0-checklist-icon">{state === "done" ? "✅" : "🎯"}</span>
      <div className="min-w-0 flex-1">
        <div className="cap0-checklist-name">{TASK_NAMES[taskNo]}</div>
        {taskNo === 2 && (
          <p className="cap0-checklist-desc">
            Trải nghiệm để khối lượng đi theo mức tự tin: tự tin cao mua nhiều hơn, tự tin thấp mua ít hơn.
          </p>
        )}
        {taskNo === 2 && (
          <div className="cap3-confidence-levels">
            {CONFIDENCE_LEVELS.map(([level, label]) => {
              const used = progress?.muc_tu_tin_da_dung.includes(level) ?? false
              return (
                <span className="cap3-confidence-level" data-used={used} key={level}>
                  {used ? `${label} ✓` : label}
                </span>
              )
            })}
          </div>
        )}
        <div className="cap0-checklist-progress">{counter}</div>
      </div>
      {state === "active" && (
        <button className="cap0-checklist-go" onClick={onGo} type="button">
          Làm ngay →
        </button>
      )}
    </div>
  )
}

export function JourneyPanelCap3() {
  const { isCap3Active } = useCap3Events()
  const { data: progress } = useCap3Progress(isCap3Active)
  const { setActivePanel } = useSidebar()
  const tasksDone = countCap3TasksDone(progress)
  const level = LEVELS[3]
  const taskOneState = taskStateCap3(1, progress)
  const taskTwoState = taskStateCap3(2, progress)
  const focusTask: 1 | 2 | null =
    taskOneState === "active" ? 1 : taskTwoState === "active" ? 2 : null
  const graduated = progress?.graduated_at != null
  const displayedTasksDone = graduated ? 2 : tasksDone
  const khauVi = progress?.khau_vi ?? null
  const khauViText = khauVi
    ? `● Khẩu vị: ${KHAU_VI_LABEL[khauVi]} · trần ${KHAU_VI_PCT[khauVi]}% vốn/lệnh`
    : "● Chưa đặt khẩu vị rủi ro"

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap0-level-card">
          <Badge
            n={level.n}
            color={level.color}
            fill={level.fill}
            glow
            ring={displayedTasksDone / 2}
            size={64}
          />
          <div className="cap0-level-card-body">
            <div className="cap0-level-card-tag">CẤP 3</div>
            <div className="cap0-level-card-name cap0-display">BẢN LĨNH</div>
            <div className="cap0-level-card-lesson">"Mua bao nhiêu quan trọng như mua gì."</div>
            <div className="cap3-journey-khauvi" data-testid="cap3-journey-khauvi">
              {khauViText}
            </div>
          </div>
          <ModeBadge mode="thuc_chien" />
        </div>

        {graduated ? (
          <JourneyFocus
            desc="Bạn đã vận hành cơ chế khẩu vị × tự tin qua đủ 10 lệnh và cả ba mức tự tin."
            name="Đã tốt nghiệp Cấp 3 «Bản lĩnh»"
            ready
            tag="HOÀN THÀNH"
            testId="cap3-focus"
          />
        ) : focusTask == null ? (
          <JourneyFocus
            desc="Bạn đã hoàn thành 10 lệnh có chấm tự tin và dùng đủ ba mức tự tin."
            name="Sẵn sàng tốt nghiệp Cấp 3"
            ready
            tag="ĐÃ XONG CẢ 2 NHIỆM VỤ"
            testId="cap3-focus"
          />
        ) : (
          <JourneyFocus
            desc={TASK_DESCRIPTIONS[focusTask]}
            name={TASK_NAMES[focusTask]}
            numeral={focusTask === 1 ? "①" : "②"}
            onGo={() => setActivePanel("trading")}
            progressText={
              focusTask === 1
                ? `${progress?.so_lenh_quan_ly_von ?? 0}/10 lệnh`
                : `${progress?.so_muc_tu_tin_da_dung ?? 0}/3 mức`
            }
            tag="NHIỆM VỤ ĐANG LÀM"
            testId="cap3-focus"
          />
        )}

        <div className="cap0-journey-checklist-header mt-3">
          <span className="cap0-journey-checklist-title">TRƯỚC KHI LÊN CẤP 4</span>
          <span className="cap0-journey-checklist-count cap0-display" style={{ color: level.color }}>
            {displayedTasksDone}/2
          </span>
        </div>
        <div className="cap0-journey-parallel-note">Hai nhiệm vụ làm song song</div>
        {graduated ? (
          <div className="cap0-journey-rest" data-testid="cap3-graduated-checklist">
            Tốt nghiệp Cấp 3 đã được ghi nhận. Tiến trình nhiệm vụ trước đó không được diễn giải
            lại theo tiêu chí mới.
          </div>
        ) : (
          <div className="cap0-journey-rest">
            <ChecklistItem
              onGo={() => setActivePanel("trading")}
              progress={progress}
              state={taskOneState}
              taskNo={1}
            />
            <ChecklistItem
              onGo={() => setActivePanel("trading")}
              progress={progress}
              state={taskTwoState}
              taskNo={2}
            />
          </div>
        )}

        <button className="cap0-checklist-golink mt-2" onClick={() => setActivePanel("cap3-analysis")} type="button">
          Xem Phân tích danh mục →
        </button>
        <div className="cap0-journey-goal" data-testid="cap3-journey-goal">
          {graduated ? (
            CAP_MAX_ENABLED >= 4 ? (
              <>Bạn đã tốt nghiệp <strong>Cấp 3 «Bản lĩnh»</strong>. Chặng tiếp theo: <strong>Cấp 4 «Thuần thục»</strong>.</>
            ) : (
              <>Bạn đã tốt nghiệp <strong>Cấp 3 «Bản lĩnh»</strong> — chặng cuối của chương trình hiện tại.</>
            )
          ) : (
            <>Xong 2/2 → tốt nghiệp <strong>Cấp 3</strong>, lên <strong>Cấp 4 «Thuần thục»</strong>.</>
          )}
        </div>
      </div>
    </div>
  )
}
