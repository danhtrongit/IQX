import { Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap3-graduation.css"
import { useCap3Progress, useGraduateCap3 } from "./hooks"
import { countCap3TasksDone, type Cap3Progress } from "./types"
// Cấp 4 is live (Cấp 4 Task FE3) — concrete-file import (NOT the
// `@/features/cap4` barrel), same anti-cycle rationale
// `cap2/GraduationModalCap2.tsx` documents for its own `@/features/cap3/hooks`
// import (that barrel re-exports `Cap4TradingPage`, which imports
// `CenterPanel`/`RightSidebar`/`RightToolbar` from `@/features/dashboard`).
import { useEnterCap4 } from "@/features/cap4/hooks"

/**
 * Điều kiện mở màn tốt nghiệp Cấp 3 (spec §3): 3/3 nhiệm vụ, chưa từng tốt
 * nghiệp (một chiều — không mở lại một khi `graduated_at` đã có, mirrors
 * `cap2/GraduationModalCap2.tsx#isGraduationReadyCap2`). Vì nhiệm vụ ③ (Thách
 * thức Bản lĩnh) bao hàm cả 3 điều kiện lãi + số lệnh + kỷ luật, xong ③ =
 * xong Cấp 3 ("thực chất là hoàn thành ③" — spec §3).
 */
export function isGraduationReadyCap3(progress: Cap3Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap3TasksDone(progress) >= 3
}

// Verbatim spec §3 copy — `**bold**` markers kept for the inline-bold renderer
// below (same convention as `cap0/GraduationModal.tsx` /
// `cap1/GraduationModalCap1.tsx` / `cap2/GraduationModalCap2.tsx`).
const BLOCK_1 =
  "Bạn đã đạt +5% với kỷ luật vững — và quan trọng hơn con số: bạn biết **mua bao nhiêu cho mỗi lệnh**. Tự tin cao thì mua nhiều, tự tin thấp thì phòng thủ. Bạn không còn mua theo cảm hứng hay tất tay một mã."

const BLOCK_2 =
  "Nhưng có một câu hỏi bạn chưa trả lời được: lệnh thắng của bạn là do **phán đoán đúng** hay do **may mắn**? Cấp 4 dạy điều khó nhất: tách quyết định khỏi kết quả. Một quyết định tốt vẫn có thể thua, một quyết định ẩu vẫn có thể thắng — và biết phân biệt hai điều đó mới là bản lĩnh thật."

const BLOCK_3 =
  "**Từ giờ: Cấp 4 «Thuần thục».** Bạn sẽ học nhìn lại mỗi lệnh qua 4 ô: quyết định đúng-thắng, đúng-thua, sai-thắng, sai-thua — và hiểu vũ khí lẫn điểm mù của chính mình."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/** `+6.4%` — số en-US, dấu trừ typographic (§E). */
function fmtPctSigned(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

/**
 * Màn tốt nghiệp Cấp 3 (spec §3) — self-contained (gọi `useCap3Progress` +
 * `useGraduateCap3` bên trong, cùng pattern `GraduationModalCap2`): consumer
 * (`Cap3TradingPage`) chỉ cần mount `<GraduationModalCap3 />`, component tự
 * quyết định hiển thị qua `isGraduationReadyCap3`. Header (tag/tên/dòng phụ
 * với SỐ THẬT của user/huy hiệu 120px phát sáng, xanh brand `#4f8ff7`) + 3
 * khối VERBATIM (Ghi nhận / Định vị / Chuyển cấp viền tím `#a78bfa` — màu Cấp
 * 4) + CTA tím.
 *
 * Cấp 4 is live (Cấp 4 Task FE3) — mirrors how `GraduationModalCap2` enters Cấp
 * 3 (which itself mirrors `cap1/GraduationModalCap1.tsx` → Cấp 2): record the
 * graduation server-side, then fire the idempotent `POST /cap4/enter` right here
 * too (not just relying on `DauTruongPage`'s own effect) so Cấp 4 progress is
 * ready the instant `DauTruongPage` swaps this Cấp 3 shell out for
 * `Cap4TradingPage` — driven by the SAME `useCap3Progress` query this mutation's
 * `graduated_at` just invalidated. No navigation call needed: this modal only
 * ever renders while already on `/dau-truong`. (Replaces the honest "Cấp 4 sắp
 * ra mắt" placeholder used before Cấp 4 shipped.)
 */
export function GraduationModalCap3() {
  const { data: progress } = useCap3Progress()
  const graduate = useGraduateCap3()
  const enterCap4 = useEnterCap4()
  const level = LEVELS[3]
  const visible = isGraduationReadyCap3(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        enterCap4.mutate()
      },
    })
  }

  // Dòng phụ spec §3 `Lãi +X% · 15+ lệnh · kỷ luật XX%` — số THẬT của user
  // (§C12c: không hiện template rỗng, luôn cho thấy con số đến từ đâu).
  const sub = progress
    ? `Lãi ${fmtPctSigned(progress.lai_pct_cap3)} · ${Math.round(
        progress.so_lenh_cap3,
      ).toLocaleString("en-US")} lệnh · kỷ luật ${Math.round(progress.diem_ky_luat_tb_cap3)}%`
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
        <h2 className="cap0-display cap0-grad-title">CẤP 3 · BẢN LĨNH</h2>
        <div className="cap0-grad-sub">{sub}</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={3} size={120} glow />
        </div>
      </div>

      <div className="cap0-grad-block">{renderInlineBold(BLOCK_1)}</div>
      <div className="cap0-grad-block">{renderInlineBold(BLOCK_2)}</div>
      <div className="cap0-grad-block cap3-grad-block--cap4">{renderInlineBold(BLOCK_3)}</div>

      <button
        type="button"
        className="cap0-grad-cta cap3-grad-cta--cap4"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 4 «Thuần thục» →
      </button>
    </Modal>
  )
}
