import { Message, Modal } from "@arco-design/web-react"
import { Badge, LEVELS } from "@/features/cap0/Badge"
import "@/features/cap0/cap0.css"
import "./cap4-graduation.css"
import { lopLabelCap4 } from "./coachTemplateCap4"
import { useCap4Progress, useGraduateCap4 } from "./hooks"
import { CAP4_TOTAL_TASKS, countCap4TasksDone, type Cap4Progress, type Lop } from "./types"
// Cấp 5 — concrete-file import (NOT the `@/features/cap5` barrel), same
// anti-cycle rationale `cap3/GraduationModalCap3.tsx` documents for its own
// `@/features/cap4/hooks` import (that barrel re-exports `Cap5TradingPage`,
// which imports `CenterPanel`/`RightSidebar`/`RightToolbar` from
// `@/features/dashboard`).
import { useEnterCap5 } from "@/features/cap5/hooks"
// Trần cấp — file riêng, KHÔNG import gì (xem docstring ở đó), nên đọc được từ
// đây mà không tạo vòng import nào.
import { CAP_MAX_ENABLED } from "@/features/cap1/capFlags"

/**
 * Cấp 5 đã mở chưa — quyết định Khối 3, dòng dưới CTA, nhãn nút, và việc bấm
 * nút có vào thẳng Cấp 5 hay chỉ ghi nhận tốt nghiệp Cấp 4.
 *
 * ★ HÀM chứ không phải `const` module-scope: trần phải được đọc ở thời điểm
 * RENDER/CLICK. Một `const` chốt giá trị ngay lúc import, và test (vốn mock
 * `capFlags` bằng getter để thử cả hai phía của trần) sẽ chỉ thấy giá trị đầu
 * tiên — nghĩa là một nửa số test xanh giả. Cùng lý do
 * `cap3/GraduationModalCap3.tsx#isCap4Open` đã ghi.
 */
function isCap5Open(): boolean {
  return CAP_MAX_ENABLED >= 5
}

/**
 * Điều kiện mở màn tốt nghiệp Cấp 4: xong nhiệm vụ DUY NHẤT («Đọc và chấm đủ 5
 * lớp qua 20 lệnh»), chưa từng tốt nghiệp (một chiều — không mở lại một khi
 * `graduated_at` đã có, mirrors
 * `cap3/GraduationModalCap3.tsx#isGraduationReadyCap3`).
 */
export function isGraduationReadyCap4(progress: Cap4Progress | null | undefined): boolean {
  if (!progress || progress.graduated_at) return false
  return countCap4TasksDone(progress) >= CAP4_TOTAL_TASKS
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

/**
 * ★★ KHỐI 2 + KHỐI 3 KHÔNG THEO SPEC `.md` CẤP 4 ★★
 *
 * `IQX-Cap4-Spec.md` §3 (và §9 dòng 209) nói Cấp 5 dạy "xử lý mâu thuẫn giữa
 * các lớp"; bản trước của file này lại nói Cấp 5 dạy "tách quyết định khỏi kết
 * quả — 4 ô đúng-thắng/đúng-thua/sai-thắng/sai-thua". **Cả hai đều KHÔNG phải
 * Cấp 5 có thật.** Đối chiếu 4 nguồn còn lại:
 *   · mockup Hành trình Cấp 4 (`iqx-cap4-hanhtrinh.html`): "(chủ động săn mã)";
 *   · `IQX-Cap5-Spec.md`: Cấp 5 = Săn mã + Watchlist, và §3/§11 ĐẨY "xử lý mâu
 *     thuẫn giữa các lớp" + "biết khi nào KHÔNG mua" sang **Cấp 6**;
 *   · mockup Hành trình Cấp 5: "mở Cấp 6 (xử lý khi 5 lớp mâu thuẫn)";
 *   · `IQX-NguyenTac-Chung.md` (tự xưng file DUY NHẤT): "5 | Lão luyện | Chủ
 *     động săn mã" · "6 | Bậc thầy | Xử lý khi 5 lớp mâu thuẫn".
 *
 * Màn tốt nghiệp KHÔNG được hứa một cấp sau khác với cấp sau có thật — nên hai
 * khối dưới đây nói SĂN MÃ. Cần báo founder sửa lại spec `.md` Cấp 4 §3 + §209.
 */
const BLOCK_2 =
  "Nhưng đọc giỏi vẫn chưa đủ. Tới giờ, mã vẫn tự tìm đến bạn — bạn phân tích thứ đã nằm sẵn trên màn hình, chứ chưa lần nào tự đi tìm giữa cả nghìn mã. Người lão luyện không chờ cơ hội gõ cửa: họ đi săn."

const BLOCK_3 =
  "**Từ giờ: Cấp 5 «Lão luyện».** Bạn sẽ học chủ động săn mã — dùng bộ lọc quét rộng cả thị trường, đưa mã vào Watchlist, rồi chờ mã chín mới vào lệnh: săn nhiều, chọn kỹ, không mua vội."

/**
 * Khối 3 khi Cấp 5 CHƯA mở (`CAP_MAX_ENABLED < 5`) — cùng cách xử lý trung
 * thực mà `cap1`/`cap2`/`cap3` dùng cho Khối 3 của chúng. Câu trên nói ở thì
 * HIỆN TẠI ("Từ giờ: Cấp 5 «Lão luyện».") trong khi `DauTruongPage` giữ user Ở
 * LẠI shell Cấp 4 ngay sau khi modal đóng — màn hình không được hứa một cấp
 * chưa tồn tại. Giữ NGUYÊN nội dung Cấp 5 sẽ mang lại, nhưng ở thì TƯƠNG LAI.
 */
const BLOCK_3_CAP5_CHUA_MO =
  "**Cấp 5 «Lão luyện» chưa ra mắt.** Cấp 4 là chặng cuối của chương trình hiện tại — bạn đã đi hết phần đang mở. Khi Cấp 5 mở, bạn sẽ học chủ động săn mã: dùng bộ lọc quét rộng cả thị trường, đưa mã vào Watchlist, rồi chờ mã chín mới vào lệnh — săn nhiều, chọn kỹ, không mua vội."

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
 * ★ **Cấp 5 ĐANG MỞ** (`CAP_MAX_ENABLED >= 5`) — mirrors how
 * `GraduationModalCap3` enters Cấp 4 (which itself mirrors Cấp 2 → Cấp 3 → …):
 * record the graduation server-side, then fire the idempotent `POST /cap5/enter`
 * right here too (not just relying on `DauTruongPage`'s own effect) so Cấp 5
 * progress is ready the instant `DauTruongPage` swaps this Cấp 4 shell out for
 * `Cap5TradingPage` — driven by the SAME `useCap4Progress` query this mutation's
 * `graduated_at` just invalidated. No navigation call needed: this modal only
 * ever renders while already on `/dau-truong`.
 *
 * ★ **Khi trần cấp còn dưới 5** thì nút KHÔNG gọi `POST /cap5/enter` (nếu gọi,
 * server sẽ có một hàng `cap5_progress` THẬT cho một cấp user không vào được —
 * router `/cap5` đã đăng ký ở backend nên request thành công thật) và nói thẳng
 * "sắp ra mắt" ngay trên nút — nhưng vẫn PHẢI bấm được và vẫn ghi tốt nghiệp về
 * server: modal này `closable={false}` + `visible = isGraduationReadyCap4(...)`,
 * nên một nút `disabled` sẽ **nhốt VĨNH VIỄN** mọi user đã xong nhiệm vụ trong
 * một màn không có lối ra — đúng lỗi đã phải sửa hai lần trên codebase này.
 * `graduate.isPending` thì VẪN chặn: TanStack đưa nó về `false` cả khi mutation
 * lỗi, nên nó chỉ khoá trong lúc request đang bay và không thể nhốt ai.
 */
export function GraduationModalCap4() {
  const { data: progress } = useCap4Progress()
  const graduate = useGraduateCap4()
  const enterCap5 = useEnterCap5()
  const level = LEVELS[4]
  const visible = isGraduationReadyCap4(progress)

  const handleGraduate = () => {
    graduate.mutate(undefined, {
      // Chỉ chạy sau khi server đã GHI NHẬN tốt nghiệp — hỏng mạng thì không
      // vào Cấp 5 lẫn không toast gì cả, để user bấm lại (modal vẫn còn đó vì
      // `graduated_at` chưa về).
      onSuccess: () => {
        if (isCap5Open()) {
          enterCap5.mutate()
          return
        }
        Message.info("Cấp 5 «Lão luyện» sắp ra mắt — đã ghi nhận tốt nghiệp Cấp 4")
      },
    })
  }

  // Dòng phụ — số THẬT của user (§C12c). `ty_le_thang_dong_thuan_cao` đã bị gỡ
  // khỏi wire cùng khối Thách thức, nên dòng này chỉ còn 2 vế; điểm mù thế chỗ
  // để vẫn có đủ hai nhãn mà Khối 1 nói tới. Cả hai vế đều trung thực khi
  // "chưa xác định".
  const sub = progress
    ? `${Math.round(progress.so_lenh_doc_du_5lop).toLocaleString(
        "en-US",
      )} lệnh đọc đủ 5 lớp · vũ khí: ${lopText(
        progress.vu_khi_lop,
      )} · điểm mù: ${lopText(progress.diem_mu_lop)}`
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
        {renderInlineBold(isCap5Open() ? BLOCK_3 : BLOCK_3_CAP5_CHUA_MO)}
      </div>

      {/* ★ KHÔNG bao giờ `disabled` như một trạng thái "sắp ra mắt" (xem
          doc-comment ở trên): modal này `closable={false}` và chỉ unmount khi
          có `graduated_at`, nên một nút tắt cứng sẽ NHỐT VĨNH VIỄN mọi user đã
          xong nhiệm vụ. `graduate.isPending` thì giữ — nó chỉ khoá lúc request
          đang bay, và bỏ nó đi thì double-click bắn hai lần `POST
          /cap4/graduate`. */}
      <button
        type="button"
        className="cap0-grad-cta cap4-grad-cta--cap5"
        data-testid="cap4-grad-cta"
        onClick={handleGraduate}
        disabled={graduate.isPending}
      >
        Vào Cấp 5 «Lão luyện» →
        {/* Dòng "sắp ra mắt" — gắn theo trần nên khi Cấp 5 mở nó tự biến mất
            cùng lúc với Khối 3 ở trên. */}
        {!isCap5Open() && (
          <span
            className="cap4-grad-cta-soon"
            style={{
              display: "block",
              marginTop: 2,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.3px",
              opacity: 0.85,
            }}
          >
            Cấp 5 sắp ra mắt — bấm để ghi nhận tốt nghiệp Cấp 4
          </span>
        )}
      </button>
    </Modal>
  )
}
