import { Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap2-graduation.css"
import { useCap2Progress, useGraduateCap2 } from "./hooks"
import { countCap2TasksDone, type Cap2Progress } from "./types"
// Cấp 3 is live (Cấp 3 Task FE3) — concrete-file import (NOT the
// `@/features/cap3` barrel), same anti-cycle rationale
// `cap1/GraduationModalCap1.tsx` documents for its own `@/features/cap2/hooks`
// import (that barrel re-exports `Cap3TradingPage`, which imports
// `CenterPanel`/`RightSidebar`/`RightToolbar` from `@/features/dashboard`).
import { useEnterCap3 } from "@/features/cap3/hooks"

/**
 * Điều kiện mở màn tốt nghiệp Cấp 2 (spec §3): 5/5 nhiệm vụ, chưa từng tốt
 * nghiệp (một chiều — không mở lại một khi `graduated_at` đã có, mirrors
 * `cap1/GraduationModalCap1.tsx#isGraduationReadyCap1`). Vì nhiệm vụ ⑤ bao
 * hàm mọi hành vi cần đo (cửa sổ 20 lệnh ≤2 vi phạm), xong ⑤ = xong Cấp 2.
 */
export function isGraduationReadyCap2(progress: Cap2Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap2TasksDone(progress) >= 5
}

// Verbatim spec §13 copy — `**bold**` markers kept for the inline-bold
// renderer below (same convention as `cap0/GraduationModal.tsx`/
// `cap1/GraduationModalCap1.tsx`).
const BLOCK_1 =
  "Bạn đã đi qua 20 lệnh Thực chiến với ≤2 vi phạm kỷ luật — điều rất khó với người mới. **Kế hoạch của bạn KHÔNG chỉ là kế hoạch — nó là hành động.** Trong 30 ngày qua trên IQX, chỉ 24% user Cấp 1 vượt được Cấp 2 trong 3 tháng đầu — bạn thuộc nhóm hiếm."

const BLOCK_2 =
  "Nhưng có kỷ luật vẫn chưa đủ. Cấp 3 «Bản lĩnh» dạy điều nghịch lý: **kết quả tốt không đồng nghĩa quyết định tốt.** Có lệnh bạn làm đúng mọi thứ nhưng vẫn lỗ (thị trường không thuận). Có lệnh bạn làm sai nhưng vẫn lãi (may mắn). Cấp 3 tách được 2 chuyện này — và bạn sẽ học cách điều chỉnh khối lượng mua theo khẩu vị rủi ro riêng."

const BLOCK_3 =
  "**Từ giờ: Cấp 3 «Bản lĩnh».** Bạn sẽ có công cụ mới: **khẩu vị rủi ro** (điều chỉnh cách đặt cắt lỗ/chốt lời theo phong cách riêng) · **khối lượng mua hợp lý** (mua bao nhiêu là đúng) · **mức độ tự tin của lệnh** · **tách quyết định khỏi kết quả**."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 2 (spec §13) — self-contained (calls `useCap2Progress` +
 * `useGraduateCap2` itself, same pattern as `GraduationModalCap1`): the
 * consumer (`Cap2TradingPage`) just mounts `<GraduationModalCap2 />`
 * unconditionally, this component decides its own visibility via
 * `isGraduationReadyCap2`. Header (tag/tên/dòng phụ/huy hiệu 120px glow,
 * Cấp 2's own ngọc lam) + 3 khối VERBATIM (Ghi nhận / Định vị / Chuyển cấp
 * viền xanh brand `#4f8ff7` — Cấp 3's colour) + CTA.
 *
 * Cấp 3 is live (Cấp 3 Task FE3) — mirrors how `GraduationModalCap1` enters
 * Cấp 2 on success (which itself mirrors `cap0/GraduationModal.tsx`): record
 * the graduation server-side, then fire the idempotent `POST /cap3/enter`
 * right here too (not just relying on `DauTruongPage`'s own effect) so Cấp 3
 * progress is ready the instant `DauTruongPage` swaps this Cấp 2 shell out for
 * `Cap3TradingPage` — driven by the SAME `useCap2Progress` query this
 * mutation's `graduated_at` just invalidated. No navigation call needed: this
 * modal only ever renders while already on `/dau-truong`.
 */
export function GraduationModalCap2() {
  const { data: progress } = useCap2Progress()
  const graduate = useGraduateCap2()
  const enterCap3 = useEnterCap3()
  const level = LEVELS[2]
  const visible = isGraduationReadyCap2(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        enterCap3.mutate()
      },
    })
  }

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
        <h2 className="cap0-display cap0-grad-title">CẤP 2 · KỶ LUẬT</h2>
        <div className="cap0-grad-sub">5/5 nhiệm vụ · Cửa sổ 20 lệnh với ≤2 vi phạm</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={2} size={120} glow />
        </div>
      </div>

      <div className="cap0-grad-block">{renderInlineBold(BLOCK_1)}</div>
      <div className="cap0-grad-block">{renderInlineBold(BLOCK_2)}</div>
      <div className="cap0-grad-block cap2-grad-block--cap3">{renderInlineBold(BLOCK_3)}</div>

      <button
        type="button"
        className="cap0-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 3 «Bản lĩnh» →
      </button>
    </Modal>
  )
}
