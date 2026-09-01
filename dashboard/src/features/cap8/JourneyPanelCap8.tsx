import "@/features/cap0/cap0.css"
import { useCap8Progress } from "./hooks"
import { taskStateCap8 } from "./journeyState"
import "./cap8-journey.css"

export function JourneyPanelCap8() {
  const { data: progress } = useCap8Progress()
  const done = taskStateCap8(progress) === "done"
  const count = progress?.so_lenh_thoat_dung_ke_hoach ?? 0
  const target = progress?.muc_tieu_thoat_dung_ke_hoach ?? 5
  const preservedGraduate = progress?.graduated_at != null && count < target
  return (
    <section className="cap8-journey" data-testid="cap8-journey">
      <header className="journey-header"><span>CẤP 8 · {done ? 1 : 0}/1</span><strong>Thoát lệnh theo kế hoạch</strong></header>
      <article className={`journey-task ${done ? "is-done" : "is-active"}`} data-testid="cap8-task-1">
        <div className="journey-task-title"><span>{done ? "✓" : "①"}</span><strong>Thoát lệnh đúng kế hoạch</strong></div>
        <p>Hoàn thành 5 lần bán chạm chốt lời, cắt lỗ gốc hoặc cắt lỗ động đúng thời hạn.</p>
        {preservedGraduate ? (
          <b data-testid="cap8-preserved-graduate">Đã hoàn thành chương trình ở lộ trình trước.</b>
        ) : (
          <b data-testid="cap8-exit-counter">{count}/{target} lệnh</b>
        )}
        <p className="cap8-warning">Hệ thống tự đối chiếu kế hoạch, giá khớp và lịch sử giá; lãi/lỗ không quyết định nhiệm vụ.</p>
      </article>
    </section>
  )
}
