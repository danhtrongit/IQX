import { Message, Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap4-graduation.css"
import { lopLabelCap4 } from "./coachTemplateCap4"
import { useCap4Progress, useGraduateCap4 } from "./hooks"
import { countCap4TasksDone, type Cap4Progress, type Lop } from "./types"

/**
 * Điều kiện mở màn tốt nghiệp Cấp 4 (spec §3): 3/3 nhiệm vụ, chưa từng tốt
 * nghiệp (một chiều — không mở lại một khi `graduated_at` đã có, mirrors
 * `cap3/GraduationModalCap3.tsx#isGraduationReadyCap3`). Vì nhiệm vụ ③ (Thách
 * thức Thuần thục) bao hàm cả 3 điều kiện số lệnh + vũ khí/điểm mù + % thắng
 * đồng thuận cao, xong ③ = xong Cấp 4.
 */
export function isGraduationReadyCap4(progress: Cap4Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap4TasksDone(progress) >= 3
}

/** Nhãn lớp cho 2 chỗ trống `[X]`/`[Y]` của Khối 1 — trung thực khi chưa chốt. */
function lopText(lop: Lop | null): string {
  return lop ? lopLabelCap4(lop) : "chưa xác định"
}

// Verbatim spec §3 copy — `**bold**` markers kept for the inline-bold renderer
// below (same convention as `cap0/GraduationModal.tsx` /
// `cap1/GraduationModalCap1.tsx` / `cap2/GraduationModalCap2.tsx` /
// `cap3/GraduationModalCap3.tsx`).
//
// Khối 1 có 2 chỗ trống `[X]`/`[Y]` trong spec → điền bằng vũ khí/điểm mù THẬT
// của user (§C12c: không hiện template rỗng).
function block1(progress: Cap4Progress | null | undefined): string {
  return (
    "Bạn đã đọc trọn 5 lớp qua hơn 20 lệnh — không còn mua chỉ vì một tín hiệu. Bạn biết vũ khí " +
    `của mình là đọc lớp **${lopText(progress?.vu_khi_lop ?? null)}**, và điểm mù cần cải thiện ` +
    `là lớp **${lopText(progress?.diem_mu_lop ?? null)}**. Bạn đọc phân tích như một nhà đầu tư ` +
    "thực thụ, không phụ thuộc hoàn toàn vào AI."
  )
}

const BLOCK_2 =
  "Nhưng đọc giỏi vẫn chưa đủ. Lệnh thắng của bạn là do quyết định đúng, hay do may mắn? Một quyết định tốt vẫn có thể thua, một quyết định ẩu vẫn có thể thắng. Phân biệt được hai điều đó — và biết khi nào nên đứng ngoài — mới là bản lĩnh của người lão luyện."

const BLOCK_3 =
  "**Từ giờ: Cấp 5 «Lão luyện».** Bạn sẽ học tách quyết định khỏi kết quả — nhìn mỗi lệnh qua 4 ô đúng-thắng / đúng-thua / sai-thắng / sai-thua — và rằng đứng ngoài cũng là một quyết định."

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/**
 * Màn tốt nghiệp Cấp 4 (spec §3) — self-contained (gọi `useCap4Progress` +
 * `useGraduateCap4` bên trong, cùng pattern `GraduationModalCap3`): consumer
 * (`Cap4TradingPage`) chỉ cần mount `<GraduationModalCap4 />`, component tự
 * quyết định hiển thị qua `isGraduationReadyCap4`. Header (tag/tên/dòng phụ với
 * SỐ THẬT của user/huy hiệu 120px phát sáng, tím Cấp 4 `#a78bfa`) + 3 khối
 * VERBATIM (Ghi nhận / Định vị / Chuyển cấp viền **vàng kim `#e0b64d`** — màu
 * Cấp 5) + CTA vàng kim.
 *
 * Cấp 5 CHƯA được xây — dùng đúng pattern trung thực mà `GraduationModalCap1`
 * (trước Cấp 2), `GraduationModalCap2` (trước Cấp 3) và `GraduationModalCap3`
 * (trước Cấp 4) đã dùng: ghi tốt nghiệp về server (để tiến trình thật sự đi
 * tiếp / modal không mở lại), rồi báo "Cấp 5 sắp ra mắt" thay vì điều hướng đi
 * đâu. Khi Cấp 5 lên sóng, đổi `onSuccess` thành `enterCap5.mutate()` đúng như
 * `GraduationModalCap3` vừa được sửa trong delivery này.
 */
export function GraduationModalCap4() {
  const { data: progress } = useCap4Progress()
  const graduate = useGraduateCap4()
  const level = LEVELS[4]
  const visible = isGraduationReadyCap4(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      onSuccess: () => {
        Message.info("Cấp 5 «Lão luyện» sắp ra mắt")
      },
    })
  }

  // Dòng phụ spec §3 `20+ lệnh đọc đủ 5 lớp · vũ khí: [lớp] · đồng thuận cao
  // thắng XX%` — số THẬT của user (§C12c).
  const sub = progress
    ? `${Math.round(progress.so_lenh_doc_du_5lop).toLocaleString(
        "en-US",
      )} lệnh đọc đủ 5 lớp · vũ khí: ${lopText(
        progress.vu_khi_lop,
      )} · đồng thuận cao thắng ${Math.round(progress.ty_le_thang_dong_thuan_cao)}%`
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
        <h2 className="cap0-display cap0-grad-title">CẤP 4 · THUẦN THỤC</h2>
        <div className="cap0-grad-sub">{sub}</div>
        <div className="cap0-grad-badge-wrap">
          <Badge n={level.n} color={level.color} fill={4} size={120} glow />
        </div>
      </div>

      <div className="cap0-grad-block" data-testid="cap4-grad-khoi1">
        {renderInlineBold(block1(progress))}
      </div>
      <div className="cap0-grad-block" data-testid="cap4-grad-khoi2">
        {renderInlineBold(BLOCK_2)}
      </div>
      <div className="cap0-grad-block cap4-grad-block--cap5" data-testid="cap4-grad-khoi3">
        {renderInlineBold(BLOCK_3)}
      </div>

      <button
        type="button"
        className="cap0-grad-cta cap4-grad-cta--cap5"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 5 «Lão luyện» →
      </button>
    </Modal>
  )
}
