import { Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
// Concrete-file import (NOT the `@/features/cap8` barrel) — that barrel
// re-exports `Cap8TradingPage`, which imports `CenterPanel`/`RightSidebar`/
// `RightToolbar` from `@/features/dashboard`; the same anti-cycle rationale
// `GraduationModalCap6` documents for its own Cấp 7 import.
import { useEnterCap8 } from "@/features/cap8/hooks"
import "@/features/cap0/cap0.css"
import "./cap7-graduation.css"
import { useCap7Progress, useGraduateCap7 } from "./hooks"
import { countCap7TasksDone, type Cap7Progress } from "./types"

/**
 * Điều kiện mở màn tốt nghiệp Cấp 7 (spec §3): 3/3 nhiệm vụ, chưa từng tốt
 * nghiệp (một chiều — không mở lại một khi `graduated_at` đã có, mirrors
 * `cap6/GraduationModalCap6.tsx#isGraduationReadyCap6`). Vì nhiệm vụ ③ (Thách
 * thức Đọc sổ lệnh) bao hàm cả 3 điều kiện số lệnh đọc lực + số cờ không đuổi
 * theo + tỷ lệ đọc lực đúng, xong ③ = xong Cấp 7.
 */
export function isGraduationReadyCap7(progress: Cap7Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap7TasksDone(progress) >= 3
}

/** `21` → `"21"` — số en-US, không phần thập phân (§E). */
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

// Verbatim spec §3 copy — `**bold**` markers kept for the inline-bold renderer
// below (same convention as `cap0/GraduationModal.tsx` → `cap6/
// GraduationModalCap6.tsx`).
//
// Khối 1 có 2 chỗ trống `{N}`/`{M}` trong spec → điền bằng SỐ THẬT của user
// (§C12c: không hiện template rỗng).
function block1(progress: Cap7Progress | null | undefined): string {
  const n = fmtInt(progress?.so_lenh_doc_luc ?? 0)
  const m = fmtInt(progress?.so_lan_khong_duoi_theo_co ?? 0)
  return (
    `Bạn đã đọc lực sổ lệnh qua ${n} lệnh, và ${m} lần tỉnh táo không đuổi theo lệnh treo đáng ` +
    "ngờ. Bạn đọc được bên nào đang áp đảo ngay lúc đặt — và biết lệnh treo to chưa chắc là cầu " +
    "thật."
  )
}

/**
 * §C12c — Khối 1 là lời GHI NHẬN (copy spec), nên con số đứng ngay sau nó.
 *
 * ★ Phải nói CẢ "đã chấm" lẫn "chưa tới hạn chấm": `ty_le_doc_luc_dung` tính
 * TRÊN LỆNH ĐÃ CHẤM mà thôi. In mỗi tỷ lệ cạnh tổng số lệnh đọc lực sẽ khiến
 * người dùng tưởng những lệnh chưa tới hạn đang bị tính là đọc sai — chúng
 * không, và câu này nói thẳng ra.
 */
function block1Provenance(progress: Cap7Progress | null | undefined): string {
  const x = fmtInt(progress?.ty_le_doc_luc_dung ?? 0)
  const daCham = fmtInt(progress?.so_lenh_da_cham ?? 0)
  const chuaCham = progress?.so_lenh_chua_cham ?? 0
  const duoi =
    chuaCham > 0
      ? ` ${fmtInt(chuaCham)} lệnh chưa tới hạn chấm nằm ngoài mẫu số — chúng không bị tính là đọc sai.`
      : ""
  return `(Số của bạn: đọc lực đúng ${x}% trên ${daCham} lệnh đã chấm bằng giá đóng cửa thật.${duoi})`
}

// Khối 2 — Định vị. VERBATIM spec §3.
const BLOCK_2 =
  "Giờ bạn đọc giỏi từng lệnh. Nhưng rủi ro lớn nhất không nằm ở một lệnh — mà ở cả danh mục: dồn quá nhiều vào một ngành, các mã cùng lên cùng xuống. Quản trị rủi ro toàn danh mục là **Cấp 8**."

// Khối 3 — Chuyển cấp. Câu của spec §3, với ba thứ Cấp 8 thật sự làm được viết
// rõ ra thay vì để danh từ trần ("tương quan", "tổng rủi ro" — hai cụm đó một
// mình thì mơ hồ và dễ bị đọc thành một lời hứa to hơn thực tế). KHÔNG hứa gì
// ngoài ba thứ này: không tự động phân bổ, không tối ưu hoá, không lợi nhuận.
const BLOCK_3 =
  "**Từ giờ: Cấp 8 «Quản trị rủi ro danh mục».** Bạn sẽ học nhìn rủi ro ở tầm cả danh mục: **phân bổ ngành**, **tương quan** giữa các mã bạn đang giữ, và **tổng vốn đang ở rủi ro**."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 7 (spec §3) — self-contained (gọi `useCap7Progress` +
 * `useGraduateCap7` bên trong, cùng pattern `GraduationModalCap6`): consumer
 * (`Cap7TradingPage`) chỉ cần mount `<GraduationModalCap7 />`, component tự
 * quyết định hiển thị qua `isGraduationReadyCap7`. Header (tag/tên/dòng phụ
 * `3/3 · đọc lực đúng {X}%` với SỐ THẬT của user / huy hiệu 120px phát sáng,
 * hồng magenta Cấp 7 `#c65cae`) + 3 khối (Ghi nhận / Định vị / Chuyển cấp viền
 * **xanh lá `#3f9b5a`** — màu Cấp 8) + CTA xanh lá.
 *
 * ★ **Cấp 8 ĐÃ SHIP (Cấp 8 Task FE3)** — nút này giờ vào Cấp 8 THẬT, mirror đúng
 * cách `GraduationModalCap6` vào Cấp 6 → 7 (và Cấp 2 → 3 → …): ghi tốt nghiệp
 * server-side, rồi bắn luôn `POST /cap8/enter` (idempotent) NGAY tại đây chứ
 * không chỉ trông vào effect của `DauTruongPage`, để hồ sơ Cấp 8 sẵn sàng đúng
 * lúc `DauTruongPage` thay vỏ Cấp 7 bằng `Cap8TradingPage` — do CHÍNH query
 * `useCap7Progress` mà `graduated_at` của mutation này vừa invalidate. Không cần
 * `navigate`: modal này chỉ render khi đã ở `/dau-truong`. (Thay cho placeholder
 * trung thực "Cấp 8 sắp ra mắt" dùng trước khi Cấp 8 lên sóng.)
 *
 * ★ Nút vẫn PHẢI bấm được: modal này `closable={false}` +
 * `visible = isGraduationReadyCap7(...)`, nên một nút `disabled` vĩnh viễn sẽ
 * nhốt mọi user đã xong 3/3 trong một màn không có lối ra.
 */
export function GraduationModalCap7() {
  const { data: progress } = useCap7Progress()
  const graduate = useGraduateCap7()
  const enterCap8 = useEnterCap8()
  const level = LEVELS[7]
  const visible = isGraduationReadyCap7(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        enterCap8.mutate()
      },
    })
  }

  // Dòng phụ spec §3 `3/3 · đọc lực đúng {X}%` — số THẬT của user (§C12c).
  const sub = progress
    ? `${countCap7TasksDone(progress)}/3 · đọc lực đúng ${fmtInt(progress.ty_le_doc_luc_dung)}%`
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
        <h2 className="cap0-display cap0-grad-title">CẤP 7 · ĐỌC SỔ LỆNH</h2>
        <div className="cap0-grad-sub">{sub}</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={7} size={120} glow />
        </div>
      </div>

      <div className="cap0-grad-block" data-testid="cap7-grad-khoi1">
        {renderInlineBold(block1(progress))}
      </div>
      <p className="cap7-grad-provenance" data-testid="cap7-grad-khoi1-provenance">
        {block1Provenance(progress)}
      </p>
      <div className="cap0-grad-block" data-testid="cap7-grad-khoi2">
        {renderInlineBold(BLOCK_2)}
      </div>
      <div className="cap0-grad-block cap7-grad-block--cap8" data-testid="cap7-grad-khoi3">
        {renderInlineBold(BLOCK_3)}
      </div>

      <button
        type="button"
        className="cap0-grad-cta cap7-grad-cta--cap8"
        data-testid="cap7-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 8 «Quản trị rủi ro danh mục» →
      </button>
    </Modal>
  )
}
