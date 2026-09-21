import { useEffect } from "react"
import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { trackJourneyEvent } from "@/shared/analytics/journey"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
import { useCap6Events } from "./Cap6Context"
import { useCap6Progress } from "./hooks"
import { datCongCap6, mucTieuNhatQuan } from "./nhanDinhCap6"
import type { Cap6Progress } from "./types"
import "./cap6-journey.css"

/** Tên nhiệm vụ duy nhất của Cấp 6 — mockup `iqx-cap6-hanhtrinh.html` `.task .nm`. */
function taskName(progress: Cap6Progress | null | undefined): string {
  return `Xử lý mâu thuẫn nhất quán ${fmtInt(mucTieuNhatQuan(progress))} lần`
}

/** `9` → `"9"` — số Việt Nam, không phần thập phân. */
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("vi-VN")
}

type TaskState = "done" | "active" | "locked"

/**
 * State của nhiệm vụ duy nhất. Mở ngay khi vào Cấp 6 (không có cấp con nào phải
 * khoá), nên chỉ `done` hoặc `active`; giữ nhánh `"locked"` trong kiểu để cùng
 * khuôn với Cấp 1-5.
 */
export function taskStateCap6(no: number, progress: Cap6Progress | null | undefined): TaskState {
  if (no !== 1) return "locked"
  return datCongCap6(progress) ? "done" : "active"
}

/**
 * Tab "Hành trình" Cấp 6 «Bậc thầy» — panel đầu của sidebar-phải khi đang ở Cấp
 * 6 (mockup `iqx-cap6-hanhtrinh.html`): thẻ cấp + checklist header + ĐÚNG MỘT
 * nhiệm vụ + hộp mục tiêu.
 *
 * Mục tiêu duy nhất là ba lần xử lý mâu thuẫn nhất quán. `so_lan_xu_ly_veto_nhat_quan`
 * thuộc Phân tích danh mục, không hiện như một cổng hoặc bộ đếm tiến độ.
 *
 * Self-contained: gọi `useCap6Progress` với `isCap6Active` nên KHÔNG query gì khi
 * ở ngoài `Cap6Provider` (`SidebarProvider` là singleton app-root, dùng chung với
 * /bieu-do & /co-phieu — cùng lý do đã ghi ở `JourneyPanelCap5`).
 */
export function JourneyPanelCap6() {
  const { isCap6Active } = useCap6Events()
  const { data: progress } = useCap6Progress(isCap6Active)
  const { setActivePanel } = useSidebar()
  const level = LEVELS[6]

  const state = taskStateCap6(1, progress)
  const done = state === "done" ? 1 : 0
  const graduated = !!progress?.graduated_at

  const openPortfolioAnalysis = () => setActivePanel("cap6-analysis")
  const goToTrading = () => setActivePanel("trading")
  const openBot = () => setActivePanel("bot")

  useEffect(() => {
    if (isCap6Active) trackJourneyEvent("cap6_journey_view")
  }, [isCap6Active])

  // §C12c — chip bài học kèm con số thật, không phải khẩu hiệu trơ.
  const chipText = progress
    ? `● Đọc mâu thuẫn đúng, hành động tương xứng · ${fmtInt(
        progress.so_lan_xu_ly_nhat_quan,
      )} lần nhất quán`
    : "● Đọc mâu thuẫn đúng, hành động tương xứng"

  return (
    <div className="cap0 flex h-full min-h-0 flex-col bg-[var(--bg1)] text-[var(--t1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap0-level-card">
          <Badge
            n={level.n}
            color={level.color}
            fill={level.fill}
            size={64}
            ring={graduated ? 1 : done}
            glow
          />
          <div className="cap0-level-card-body">

            <div className="cap0-level-card-name cap0-display">BẬC THẦY</div>

            <div className="cap6-journey-tag" data-testid="cap6-journey-tag">
              {chipText}
            </div>
          </div>
          <ModeBadge mode="thuc_chien" />
        </div>

        <div className="cap0-journey-checklist-header" data-testid="cap6-journey-header">{graduated ? "ĐÃ HOÀN THÀNH LỘ TRÌNH" : `HOÀN THÀNH CẤP 6 · ${done}/1`}</div>

        {graduated ? (
          <div
            data-testid="cap6-journey-complete"
            className="cap0-checklist-item cap0-checklist-item--done"
          >
            <span className="cap0-checklist-num">✓</span>
            <div className="cap0-checklist-body">
              <span className="cap0-checklist-name">Bạn đã hoàn thành Cấp 6</span>
              <div className="cap6-journey-prog">
                Lộ trình Demo Trading đã hoàn tất. Bạn có thể xem trạng thái Linh thú và Bot của mình.
              </div>
              <button type="button" className="cap0-checklist-golink" onClick={openBot}>
                Bot của tôi →
              </button>
            </div>
          </div>
        ) : (
          <div
            data-testid="cap6-task-1"
            className={
              "cap0-checklist-item" +
              (state === "done" ? " cap0-checklist-item--done" : " cap0-checklist-item--active")
            }
          >
            <span className="cap0-checklist-num">{state === "done" ? "✓" : "🎯"}</span>
            <div className="cap0-checklist-body">
              <span className="cap0-checklist-name">{taskName(progress)}</span>

              <div className="cap6-journey-prog" data-testid="cap6-journey-prog-nhatquan">
                {`${fmtInt(progress?.so_lan_xu_ly_nhat_quan ?? 0)}/${fmtInt(
                  mucTieuNhatQuan(progress),
                )} lần xử lý nhất quán`}
              </div>

              {state === "active" && (
                <button type="button" className="cap0-checklist-golink" onClick={goToTrading}>
                  Làm ngay →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mockup không vẽ nút này, nhưng nó là ĐƯỜNG DUY NHẤT tới màn Phân tích
            danh mục trong shell cấp (tour bước 7 cũng chỉ về đó) — giữ lại, đúng
            như Cấp 1-5 đang làm. */}
        <button type="button" className="cap0-checklist-golink mt-2" onClick={openPortfolioAnalysis}>
          <span data-tour-id="tour-cap6-analysis-link">Xem Phân tích danh mục →</span>
        </button>

      </div>
    </div>
  )
}
