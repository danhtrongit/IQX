import { Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap5-graduation.css"
// Concrete-file import (NOT the `@/features/cap6` barrel) — that barrel
// re-exports `Cap6TradingPage`, which imports `CenterPanel`/`RightSidebar`/
// `RightToolbar` from `@/features/dashboard`; going through it here would create
// a module-graph cycle (same rationale `GraduationModalCap4` documents for Cấp 5).
import { useEnterCap6 } from "@/features/cap6/hooks"
import { useCap5Progress, useGraduateCap5 } from "./hooks"
import { countCap5TasksDone, type Cap5Progress } from "./types"

/**
 * Điều kiện mở màn tốt nghiệp Cấp 5 (spec §3): 3/3 nhiệm vụ, chưa từng tốt
 * nghiệp (một chiều — không mở lại một khi `graduated_at` đã có, mirrors
 * `cap4/GraduationModalCap4.tsx#isGraduationReadyCap4`). Vì nhiệm vụ ③ (Thách
 * thức Lão luyện) bao hàm cả 3 điều kiện số lệnh phân loại + số nước đứng ngoài
 * đã chấm + tỷ lệ quyết định đúng, xong ③ = xong Cấp 5.
 */
export function isGraduationReadyCap5(progress: Cap5Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap5TasksDone(progress) >= 3
}

/** `72` → `"72"` — số en-US, không phần thập phân (§E). */
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

// Verbatim spec §3 copy — `**bold**` markers kept for the inline-bold renderer
// below (same convention as `cap0/GraduationModal.tsx` → `cap4/
// GraduationModalCap4.tsx`).
//
// Khối 1 có 3 chỗ trống `{N}`/`{M}`/`{X}` trong spec → điền bằng SỐ THẬT của
// user (§C12c: không hiện template rỗng). Câu cuối là mốc riêng của cấp này:
// Cấp 5 ĐÓNG mạch nền tảng 0-5 (spec §"ĐỌC TRƯỚC": "Đây là cấp đỉnh của mạch
// nền tảng 0-5").
function block1(progress: Cap5Progress | null | undefined): string {
  const n = fmtInt(progress?.so_lenh_phan_loai ?? 0)
  const m = fmtInt(progress?.so_lan_dung_ngoai_da_cham ?? 0)
  const x = fmtInt(progress?.ty_le_quyet_dinh_dung ?? 0)
  return (
    `Bạn đã nhìn lại ${n} lệnh qua 4 ô, và ${m} lần chủ động đứng ngoài. Quan trọng nhất: ` +
    `**${x}% quyết định của bạn là ĐÚNG — bất kể thắng hay thua.** Bạn không còn nhầm may mắn ` +
    "với năng lực, và biết rằng đôi khi không mua mới là nước đi khôn ngoan. Bạn đã đi trọn " +
    "mạch nền tảng Nhập môn → Lão luyện."
  )
}

const BLOCK_2 =
  "Nhưng đến giờ bạn đọc từng lớp riêng lẻ. Khi các lớp nói ngược nhau — khối ngoại mua ròng nhưng kỹ thuật xấu — bạn tin lớp nào? Và với mỗi loại cổ phiếu, lớp nào quan trọng hơn? Đó là **Cấp 6 «Đối chiếu»**."

const BLOCK_3 =
  "**Từ giờ: Cấp 6 «Đối chiếu».** Bạn sẽ học: xử lý mâu thuẫn giữa các lớp, và lớp nào quan trọng cho loại cổ phiếu nào."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 5 (spec §3) — self-contained (gọi `useCap5Progress` +
 * `useGraduateCap5` bên trong, cùng pattern `GraduationModalCap4`): consumer
 * (`Cap5TradingPage`) chỉ cần mount `<GraduationModalCap5 />`, component tự
 * quyết định hiển thị qua `isGraduationReadyCap5`. Header (tag/tên/dòng phụ
 * `3/3 · {X}% quyết định đúng` với SỐ THẬT của user/huy hiệu 120px phát sáng,
 * vàng kim Cấp 5 `#e0b64d`) + 3 khối VERBATIM (Ghi nhận / Định vị / Chuyển cấp
 * viền **đỏ son `#d64550`** — màu Cấp 6 tạm theo spec) + CTA đỏ son.
 *
 * Cấp 6 is live (Cấp 6 Task FE3) — mirrors how `GraduationModalCap4` enters Cấp
 * 5 (which itself mirrors Cấp 2 → Cấp 3 → …): record the graduation server-side,
 * then fire the idempotent `POST /cap6/enter` right here too (not just relying on
 * `DauTruongPage`'s own effect) so Cấp 6 progress is ready the instant
 * `DauTruongPage` swaps this Cấp 5 shell out for `Cap6TradingPage` — driven by
 * the SAME `useCap5Progress` query this mutation's `graduated_at` just
 * invalidated. No navigation call needed: this modal only ever renders while
 * already on `/dau-truong`. (Replaces the honest "Cấp 6 sắp ra mắt" placeholder
 * used before Cấp 6 shipped.)
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
        enterCap6.mutate()
      },
    })
  }

  // Dòng phụ spec §3 `3/3 · {X}% quyết định đúng` — số THẬT của user (§C12c).
  const sub = progress
    ? `${countCap5TasksDone(progress)}/3 · ${fmtInt(progress.ty_le_quyet_dinh_dung)}% quyết định đúng`
    : ""

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
        <div className="cap0-grad-sub">{sub}</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={5} size={120} glow />
        </div>
      </div>

      <div className="cap0-grad-block" data-testid="cap5-grad-khoi1">
        {renderInlineBold(block1(progress))}
      </div>
      <div className="cap0-grad-block" data-testid="cap5-grad-khoi2">
        {renderInlineBold(BLOCK_2)}
      </div>
      <div className="cap0-grad-block cap5-grad-block--cap6" data-testid="cap5-grad-khoi3">
        {renderInlineBold(BLOCK_3)}
      </div>

      <button
        type="button"
        className="cap0-grad-cta cap5-grad-cta--cap6"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 6 «Đối chiếu» →
      </button>
    </Modal>
  )
}
