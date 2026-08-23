import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import { ModeBadge } from "@/features/cap0/ModeBadge"
// Trần cấp — file riêng, KHÔNG import gì (xem docstring ở đó).
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"
import { useCap6Events } from "./Cap6Context"
import { useCap6Progress } from "./hooks"
import { datCongCap6, mucTieuNhatQuan, mucTieuVeto } from "./nhanDinhCap6"
import type { Cap6Progress } from "./types"
import "./cap6-journey.css"

/**
 * Cấp 7 đã mở chưa — quyết định câu hứa trong ô mục tiêu.
 *
 * ★ HÀM chứ không phải `const` module-scope (xem `capFlags.ts`): `const` chốt giá
 * trị lúc import nên test mock-getter chỉ thấy giá trị đầu → nửa số bài xanh giả.
 */
function isCap7Open(): boolean {
  return CAP_MAX_ENABLED >= 7
}

/** Tên nhiệm vụ duy nhất của Cấp 6 — mockup `iqx-cap6-hanhtrinh.html` `.task .nm`. */
function taskName(progress: Cap6Progress | null | undefined): string {
  return `Xử lý mâu thuẫn nhất quán ${fmtInt(mucTieuNhatQuan(progress))} lần`
}

/** Mô tả nhiệm vụ — VERBATIM mockup `.task .ds`. */
const TASK_DESC =
  'Đọc "nghiêm trọng" thì mua nhỏ hoặc không mua, đọc "nhẹ" thì có thể vào — nhận định khớp hành động.'

/** Bài học một câu — VERBATIM spec §1. */
const BAI_HOC =
  '"Các lớp hiếm khi cùng chiều. Biết lớp nào có quyền phủ quyết, lớp nào chỉ là điểm trừ — và để hành động khớp với nhận định."'

/** `9` → `"9"` — số en-US, không phần thập phân (§E). */
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
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
 * ★★ **BỎ HẲN hai widget nổi bật của bản «Đối chiếu» cũ** ("Đối chiếu theo kiểu"
 * + "Thách thức Đối chiếu"): mockup Cấp 6 KHÔNG vẽ widget nào giữa thẻ cấp và
 * checklist, và cả hai widget đó đọc `GET /cap6/thach-thuc` — một endpoint của
 * nhiệm vụ ③ cũ không còn tồn tại ở Cấp 6 mới.
 *
 * ★ **Hai con số, không phải một.** Mockup chỉ vẽ một dòng `1/3 lần`, nhưng cổng
 * thật có HAI mốc (`so_lan_xu_ly_nhat_quan` ≥ mục tiêu VÀ
 * `so_lan_xu_ly_veto_nhat_quan` ≥ mục tiêu). Chỉ hiện một dòng sẽ để user đủ
 * 3/3 mà vẫn không tốt nghiệp và không hiểu vì sao (§C12c). Dòng thứ hai vì thế
 * được thêm, ngay dưới dòng của mockup.
 *
 * ★ Mọi mốc ĐỌC SERVER (`muc_tieu_nhat_quan`/`muc_tieu_veto`), không hard-code
 * 3/2 — kể cả trong tên nhiệm vụ.
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

  const openPortfolioAnalysis = () => setActivePanel("cap6-analysis")
  const goToTrading = () => setActivePanel("trading")

  // §C12c — chip bài học kèm con số thật, không phải khẩu hiệu trơ.
  const chipText = progress
    ? `● Đọc mâu thuẫn đúng, hành động tương xứng · ${fmtInt(
        progress.so_lan_xu_ly_nhat_quan,
      )} lần nhất quán · ${fmtInt(progress.so_lan_xu_ly_veto_nhat_quan)} lần có phủ quyết`
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
            ring={done}
            glow
          />
          <div className="cap0-level-card-body">
            <div className="cap0-level-card-tag">CẤP 6</div>
            <div className="cap0-level-card-name cap0-display">BẬC THẦY</div>
            <div className="cap0-level-card-lesson">{BAI_HOC}</div>
            <div className="cap6-journey-tag" data-testid="cap6-journey-tag">
              {chipText}
            </div>
          </div>
          <ModeBadge mode="thuc_chien" />
        </div>

        <div className="cap0-journey-checklist-header" data-testid="cap6-journey-header">{`TRƯỚC KHI LÊN CẤP 7 · ${done}/1`}</div>

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
            <div className="cap0-checklist-desc">{TASK_DESC}</div>
            {/* Dòng của mockup: số lần xử lý nhất quán. */}
            <div className="cap6-journey-prog" data-testid="cap6-journey-prog-nhatquan">
              {`${fmtInt(progress?.so_lan_xu_ly_nhat_quan ?? 0)}/${fmtInt(
                mucTieuNhatQuan(progress),
              )} lần xử lý nhất quán`}
            </div>
            {/* ★ Dòng THÊM: mốc thứ hai của cổng — không hiện là để user đủ mốc
                thứ nhất mà vẫn không tốt nghiệp và không hiểu vì sao. */}
            <div className="cap6-journey-prog" data-testid="cap6-journey-prog-veto">
              {`${fmtInt(progress?.so_lan_xu_ly_veto_nhat_quan ?? 0)}/${fmtInt(
                mucTieuVeto(progress),
              )} lần trong đó có lớp phủ quyết rất xấu`}
            </div>
            <p className="cap6-journey-why" data-testid="cap6-journey-why">
              {
                "Cả hai mốc phải đạt cùng lúc. «Xử lý nhất quán» = mức mâu thuẫn bạn tự đọc khớp với hành động thật: đọc nghiêm trọng thì mua nhỏ hoặc đứng ngoài, đọc nhẹ thì vào bình thường. Hai con số này do hệ thống chốt từ chính các lệnh của bạn — Cấp 6 KHÔNG đo lãi."
              }
            </p>
            {state === "active" && (
              <button type="button" className="cap0-checklist-golink" onClick={goToTrading}>
                Làm ngay →
              </button>
            )}
          </div>
        </div>

        {/* Mockup không vẽ nút này, nhưng nó là ĐƯỜNG DUY NHẤT tới màn Phân tích
            danh mục trong shell cấp (tour bước 7 cũng chỉ về đó) — giữ lại, đúng
            như Cấp 1-5 đang làm. */}
        <button type="button" className="cap0-checklist-golink mt-2" onClick={openPortfolioAnalysis}>
          Xem Phân tích danh mục →
        </button>

        <div className="cap0-journey-goal" data-testid="cap6-journey-goal">
          {isCap7Open() ? (
            <>
              Đạt → tốt nghiệp <strong>Cấp 6 «Bậc thầy»</strong>, mở <strong>Cấp 7</strong>. Chủ
              đề của Cấp 7 sẽ hé lộ khi bạn tới gần.
            </>
          ) : (
            <>
              Đạt → tốt nghiệp <strong>Cấp 6 «Bậc thầy»</strong>. <strong>Cấp 7 chưa ra mắt</strong>{" "}
              — Cấp 6 là chặng cuối của chương trình hiện tại.
            </>
          )}
        </div>
      </div>
    </div>
  )
}
