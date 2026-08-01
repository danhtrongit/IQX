import { Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap6-graduation.css"
// Concrete-file import (NOT the `@/features/cap7` barrel) — that barrel
// re-exports `Cap7TradingPage`, which imports `CenterPanel`/`RightSidebar`/
// `RightToolbar` from `@/features/dashboard`; going through it here would create
// a module-graph cycle (same rationale `GraduationModalCap5` documents for Cấp 6).
import { useEnterCap7 } from "@/features/cap7/hooks"
import { useCap6Progress, useGraduateCap6 } from "./hooks"
import { countCap6TasksDone, type Cap6Progress } from "./types"

/**
 * Điều kiện mở màn tốt nghiệp Cấp 6 (spec §3): 3/3 nhiệm vụ, chưa từng tốt
 * nghiệp (một chiều — không mở lại một khi `graduated_at` đã có, mirrors
 * `cap5/GraduationModalCap5.tsx#isGraduationReadyCap5`). Vì nhiệm vụ ③ (Thách
 * thức Đối chiếu) bao hàm cả 3 điều kiện số lệnh đối chiếu + số kiểu đã gặp +
 * khớp ≥ lệch, xong ③ = xong Cấp 6.
 */
export function isGraduationReadyCap6(progress: Cap6Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap6TasksDone(progress) >= 3
}

/** `18` → `"18"` — số en-US, không phần thập phân (§E). */
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

// Verbatim spec §3 copy — `**bold**` markers kept for the inline-bold renderer
// below (same convention as `cap0/GraduationModal.tsx` → `cap5/
// GraduationModalCap5.tsx`).
//
// Khối 1 có 2 chỗ trống `{N}`/`{K}` trong spec → điền bằng SỐ THẬT của user
// (§C12c: không hiện template rỗng).
function block1(progress: Cap6Progress | null | undefined): string {
  const n = fmtInt(progress?.so_lenh_doi_chieu ?? 0)
  const k = fmtInt(progress?.so_kieu_da_gap ?? 0)
  return (
    `Bạn đã đối chiếu ${n} lệnh khi các lớp mâu thuẫn, qua ${k} loại cổ phiếu. Bạn biết với ` +
    "mỗi loại thì lớp nào đáng tin hơn — và lệnh chọn đúng lớp quyết định cho kết quả tốt hơn " +
    "rõ rệt. Bạn không còn bối rối khi các tín hiệu trái nhau."
  )
}

/**
 * `64` → `"64%"`, `0` → `"0%"`, `null` → `"chưa đủ dữ liệu"`.
 *
 * ★★ **`null` ≠ `0`** (hợp đồng `Cap6Progress.ty_le_thang_*`, backend `4b01918`):
 * `null` = nhóm chưa có lệnh đã đóng nào · `0%` = có lệnh đã đóng và không lệnh
 * nào thắng. `?? 0` ở màn tốt nghiệp sẽ chúc mừng người dùng bằng một con số nói
 * rằng họ thua sạch một nhóm mà họ chưa từng có lệnh nào trong đó.
 */
function pctHoacChuaDu(pct: number | null | undefined): string {
  return pct == null ? "chưa đủ dữ liệu" : `${Math.round(pct)}%`
}

/**
 * §C12c — Khối 1 là lời GHI NHẬN (copy spec), nên con số đứng sau nó ngay lập
 * tức: hai tỷ lệ thắng thật của user để câu "kết quả tốt hơn rõ rệt" kiểm chứng
 * được, không phải một lời khen suông.
 */
function block1Provenance(progress: Cap6Progress | null | undefined): string {
  const khop = pctHoacChuaDu(progress?.ty_le_thang_khop)
  const lech = pctHoacChuaDu(progress?.ty_le_thang_lech)
  // ★ Câu giải nghĩa CHỈ xuất hiện khi thật sự có một nhóm chưa đủ dữ liệu —
  // dán nó vào mọi lần render sẽ nhắc tới một trạng thái không tồn tại trên màn
  // hình (và làm chính test "0% là kết quả thật" không kiểm được gì).
  const coChuaDu =
    progress?.ty_le_thang_khop == null || progress?.ty_le_thang_lech == null
  const chuThich = coChuaDu
    ? " «Chưa đủ dữ liệu» = nhóm đó chưa có lệnh đã đóng nào, không phải bằng không."
    : ""
  return (
    `(Số của bạn: khớp gợi ý thắng ${khop} vs lệch gợi ý ${lech} — hai nhóm lệnh đã đóng, ` +
    `mỗi nhóm ≥ 3 lệnh.${chuThich})`
  )
}

// Khối 2 — Định vị. Bám spec §3 nhưng chỉ hứa ĐÚNG những gì Cấp 7 làm: đọc lực
// mua/bán trong sổ dư mua-bán. Cấp 7 KHÔNG phát hiện lệnh giả ở mức tick (spec
// Cấp 7 §9 loại trừ hẳn), nên câu này không được ám chỉ điều đó.
const BLOCK_2 =
  "Nhưng mọi lớp tới giờ đọc từ dữ liệu ngày. Còn ngay trong phiên — lực mua/bán đang xếp trong sổ dư mua-bán, và những lệnh lớn đang treo ở một mức giá — kể một câu chuyện khác. Đọc được sổ lệnh là **Cấp 7**."

// Khối 3 — Chuyển cấp. Mô tả ĐÚNG phạm vi Cấp 7: chỉ số Lực (chênh dư mua/dư
// bán) + cờ cảnh giác lệnh treo lớn. Tuyệt đối KHÔNG hứa "phân biệt cầu thật
// với lệnh giả" — Cấp 7 chỉ dạy hoài nghi, không tuyên bố phát hiện.
const BLOCK_3 =
  "**Từ giờ: Cấp 7 «Đọc sổ lệnh».** Bạn sẽ học: đọc **chỉ số Lực** — chênh lệch giữa dư mua và dư bán ngay trong phiên — và giữ cảnh giác với **lệnh treo lớn**: một lệnh to treo đó chưa chắc là cầu/cung thật, chờ nó khớp thật rồi hãy tin."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 6 (spec §3) — self-contained (gọi `useCap6Progress` +
 * `useGraduateCap6` bên trong, cùng pattern `GraduationModalCap5`): consumer
 * (`Cap6TradingPage`) chỉ cần mount `<GraduationModalCap6 />`, component tự
 * quyết định hiển thị qua `isGraduationReadyCap6`. Header (tag/tên/dòng phụ
 * `3/3 · {N} lệnh đối chiếu · {K} kiểu` với SỐ THẬT của user / huy hiệu 120px
 * phát sáng, đỏ son Cấp 6 `#d64550`) + 3 khối (Ghi nhận / Định vị / Chuyển cấp
 * viền **hồng magenta `#c65cae`** — màu Cấp 7) + CTA hồng magenta.
 *
 * Cấp 7 is live (Cấp 7 Task FE3) — mirrors how `GraduationModalCap5` enters Cấp
 * 6 (which itself mirrors Cấp 2 → Cấp 3 → …): record the graduation server-side,
 * then fire the idempotent `POST /cap7/enter` right here too (not just relying on
 * `DauTruongPage`'s own effect) so Cấp 7 progress is ready the instant
 * `DauTruongPage` swaps this Cấp 6 shell out for `Cap7TradingPage` — driven by
 * the SAME `useCap6Progress` query this mutation's `graduated_at` just
 * invalidated. No navigation call needed: this modal only ever renders while
 * already on `/dau-truong`. (Replaces the honest "Cấp 7 sắp ra mắt" placeholder
 * used before Cấp 7 shipped.)
 */
export function GraduationModalCap6() {
  const { data: progress } = useCap6Progress()
  const graduate = useGraduateCap6()
  const enterCap7 = useEnterCap7()
  const level = LEVELS[6]
  const visible = isGraduationReadyCap6(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        enterCap7.mutate()
      },
    })
  }

  // Dòng phụ spec §3 `3/3 · {N} lệnh đối chiếu · {K} kiểu` — số THẬT (§C12c).
  const sub = progress
    ? `${countCap6TasksDone(progress)}/3 · ${fmtInt(progress.so_lenh_doi_chieu)} lệnh đối chiếu · ${fmtInt(
        progress.so_kieu_da_gap,
      )} kiểu`
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
        <h2 className="cap0-display cap0-grad-title">CẤP 6 · ĐỐI CHIẾU</h2>
        <div className="cap0-grad-sub">{sub}</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={6} size={120} glow />
        </div>
      </div>

      <div className="cap0-grad-block" data-testid="cap6-grad-khoi1">
        {renderInlineBold(block1(progress))}
      </div>
      <p className="cap6-grad-provenance" data-testid="cap6-grad-khoi1-provenance">
        {block1Provenance(progress)}
      </p>
      <div className="cap0-grad-block" data-testid="cap6-grad-khoi2">
        {renderInlineBold(BLOCK_2)}
      </div>
      <div className="cap0-grad-block cap6-grad-block--cap7" data-testid="cap6-grad-khoi3">
        {renderInlineBold(BLOCK_3)}
      </div>

      <button
        type="button"
        className="cap0-grad-cta cap6-grad-cta--cap7"
        data-testid="cap6-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 7 «Đọc sổ lệnh» →
      </button>
    </Modal>
  )
}
