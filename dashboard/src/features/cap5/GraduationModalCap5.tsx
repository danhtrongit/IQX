import { Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap5-graduation.css"
// Concrete-file import (NOT the `@/features/cap6` barrel) — that barrel
// re-exports `Cap6TradingPage`, which imports `CenterPanel`/`RightSidebar`/
// `RightToolbar` from `@/features/dashboard`; going through it here would create
// a module-graph cycle (same rationale `GraduationModalCap4` documents for Cấp 5).
import { useEnterCap6 } from "@/features/cap6/hooks"
// Trần cấp — file riêng, KHÔNG import gì (xem docstring ở đó), nên đọc được từ
// đây mà không tạo vòng import nào.
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"
import { useCap5Progress, useGraduateCap5 } from "./hooks"
import {
  CAP5_TOTAL_TASKS,
  countCap5TasksDone,
  huntFilterTen,
  type Cap5Progress,
} from "./types"

/**
 * Cấp 6 đã mở chưa — quyết định dòng dưới CTA và việc bấm nút có vào thẳng Cấp 6
 * hay chỉ ghi nhận tốt nghiệp Cấp 5.
 *
 * ★ HÀM chứ không phải `const` module-scope: trần phải được đọc ở thời điểm
 * RENDER/CLICK (xem `capFlags.ts` — `const` chốt giá trị lúc import nên test
 * mock-getter chỉ thấy giá trị đầu tiên → một nửa số bài xanh giả).
 */
function isCap6Open(): boolean {
  return CAP_MAX_ENABLED >= 6
}

/**
 * Điều kiện mở màn tốt nghiệp Cấp 5 (spec §3): **2/2 nhiệm vụ**, chưa từng tốt
 * nghiệp (một chiều — không mở lại một khi `graduated_at` đã có, mirrors
 * `cap4/GraduationModalCap4.tsx#isGraduationReadyCap4`).
 */
export function isGraduationReadyCap5(progress: Cap5Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap5TasksDone(progress) >= CAP5_TOTAL_TASKS
}

/** Số nguyên theo quy ước Việt Nam của spec chung. */
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("vi-VN")
}

/**
 * Tỷ lệ SÀNG LỌC = phần mã đã săn mà user KHÔNG mua (spec §3 "sàng lọc Z%").
 *
 * ★ `null` khi chưa săn mã nào: `0%` ở đó không phải "không loại mã nào" mà là
 * phép chia cho 0 — in ra là bịa. Kẹp về [0,100] để một wire lệch (mua > săn)
 * không vẽ ra số âm.
 */
function tyLeSangLoc(progress: Cap5Progress | null | undefined): number | null {
  const san = progress?.so_ma_da_san ?? 0
  if (!progress || san <= 0) return null
  const mua = Math.min(Math.max(progress.so_ma_mua_tu_watchlist, 0), san)
  return Math.round(((san - mua) / san) * 100)
}

/** Bộ lọc mạnh nhất — `null` là "chưa đủ dữ liệu", KHÔNG phải một bộ lọc nào. */
function bestFilterText(progress: Cap5Progress | null | undefined): string {
  if (!progress || progress.best_filter == null) return "chưa đủ dữ liệu để kết luận"
  return progress.best_filter_ten ?? huntFilterTen(progress.best_filter) ?? "chưa đủ dữ liệu để kết luận"
}

/**
 * Màn tốt nghiệp Cấp 5 «Lão luyện — Săn mã» (spec §3) — self-contained (gọi
 * `useCap5Progress` + `useGraduateCap5` bên trong, cùng pattern
 * `GraduationModalCap4`): `Cap5TradingPage` chỉ cần mount `<GraduationModalCap5 />`.
 *
 * Header (tag / `CẤP 5 · LÃO LUYỆN` / dòng phụ `săn X mã · mua Y mã (sàng lọc
 * Z%) · bộ lọc mạnh nhất: …` / huy hiệu vàng kim 120px phát sáng) +
 * CTA đỏ son Cấp 6.
 *
 * ★★ LUẬT BẤT DI BẤT DỊCH (đã phải sửa 2 lần): modal `closable={false}` và chỉ
 * unmount khi `graduated_at` về ⇒ **CTA không bao giờ được `disabled` như trạng
 * thái "sắp ra mắt"** — làm vậy là nhốt vĩnh viễn mọi user đã xong nhiệm vụ.
 * `disabled={graduate.isPending}` thì được: TanStack đưa `isPending` về `false`
 * cả khi lỗi, nên nó chỉ chặn double-submit chứ không nhốt được ai. Khi trần còn
 * dưới 6, nút VẪN bấm được và VẪN ghi tốt nghiệp — chỉ `POST /cap6/enter` là
 * không gọi (tạo hàng progress cho một cấp user không vào được).
 */
export function GraduationModalCap5() {
  const { data: progress } = useCap5Progress()
  const graduate = useGraduateCap5()
  const enterCap6 = useEnterCap6()
  const level = LEVELS[5]
  const visible = isGraduationReadyCap5(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        if (isCap6Open()) enterCap6.mutate()
      },
    })
  }

  const sangLoc = tyLeSangLoc(progress)

  return (
    <Modal
      visible={visible}
      footer={null}
      title={null}
      closable={false}
      maskClosable={false}
      escToExit={false}
      autoFocus={false}
      className="cap0"
      style={{
        width: 480,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 16,
      }}
    >
      <div className="cap0-grad-header">
        <div className="cap0-grad-tag">HOÀN THÀNH</div>
        <h2 className="cap0-display cap0-grad-title">CẤP 5 · LÃO LUYỆN</h2>
        {/* Dòng phụ spec §3 — SỐ THẬT của user (§C12c), định dạng Việt Nam. */}
        <div className="cap0-grad-sub" data-testid="cap5-grad-sub">
          {`săn ${fmtInt(progress?.so_ma_da_san ?? 0)} mã · mua ${fmtInt(
            progress?.so_ma_mua_tu_watchlist ?? 0,
          )} mã`}
          {sangLoc != null && ` (sàng lọc ${fmtInt(sangLoc)}%)`}
          {` · bộ lọc mạnh nhất: ${bestFilterText(progress)}`}
        </div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={5} size={120} glow />
        </div>
      </div>

      <button
        type="button"
        className="cap0-grad-cta cap5-grad-cta--cap6"
        data-testid="cap5-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào cấp 6: Bậc thầy
        {/* Dòng "sắp ra mắt" — gắn theo trần nên khi Cấp 6 mở nó tự biến mất. */}
        {!isCap6Open() && (
          <span
            className="cap5-grad-cta-soon"
            style={{
              display: "block",
              marginTop: 2,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.3px",
              opacity: 0.85,
            }}
          >
            Cấp 6 sắp ra mắt — bấm để ghi nhận tốt nghiệp Cấp 5
          </span>
        )}
      </button>
    </Modal>
  )
}
