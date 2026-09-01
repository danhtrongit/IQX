import "@/features/cap0/cap0.css"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { useCap7Progress } from "./hooks"
import type { Cap7Progress } from "./types"
import "./cap7-journey.css"

export function taskStateCap7(progress: Cap7Progress | null | undefined): "done" | "active" {
  return progress?.can_doi_ok ? "done" : "active"
}

function pct(value: number | null): string {
  return value == null ? "Chưa xác định" : `${value.toFixed(1)}%`
}

export function JourneyPanelCap7() {
  const { data: progress } = useCap7Progress()
  const { setActivePanel } = useSidebar()
  const done = progress?.can_doi_ok === true
  const current = done ? 1 : 0

  return (
    <section className="cap7-journey" data-testid="cap7-journey">
      <header className="journey-header">
        <span>CẤP 7 · {current}/1</span>
        <strong>Quản trị danh mục — cân đối, đa dạng, bền vững</strong>
      </header>
      <article className={`journey-task ${done ? "is-done" : "is-active"}`}>
        <div className="journey-task-title">
          <span>{done ? "✓" : "①"}</span>
          <strong>Quản trị danh mục cân đối &amp; bền</strong>
        </div>
        <p>Rổ được xem là cân đối khi cả 3 điều sau cùng đúng:</p>
        <ul className="cap7-balance-conditions">
          <li data-testid="cap7-symbol-condition">
            <span>Không mã nào &gt; {progress?.nguong_ty_trong_ma_pct ?? 30}% vốn</span>
            <b>{progress?.ma_ty_trong_cao_nhat ?? "—"} {pct(progress?.ty_trong_ma_cao_nhat_pct ?? null)}</b>
          </li>
          <li data-testid="cap7-sector-condition">
            <span>Không ngành nào &gt; {progress?.nguong_ty_trong_nganh_pct ?? 40}% vốn</span>
            <b>{progress?.nganh_ty_trong_cao_nhat ?? "—"} {pct(progress?.ty_trong_nganh_cao_nhat_pct ?? null)}</b>
          </li>
          <li data-testid="cap7-diversification-condition">
            <span>Đa dạng: ≥{progress?.toi_thieu_ma ?? 4} mã / ≥{progress?.toi_thieu_nganh ?? 3} ngành</span>
            <b>{progress?.so_ma_dang_giu ?? 0} mã · {progress?.so_nganh_dang_giu ?? 0} ngành</b>
          </li>
        </ul>
        {!progress?.du_lieu_day_du && <p className="cap7-warning">Thiếu giá hoặc ngành nên danh mục chưa thể được xác nhận cân đối.</p>}
        <button type="button" onClick={() => setActivePanel("cap7-analysis")}>Xem phân bổ trong Nắm giữ</button>
      </article>
    </section>
  )
}
